mod auth;
mod config;
mod crash_reports;
mod error;
mod handlers;
mod rate_limit;
mod sessions;
mod utils;

use anyhow::{Context, Result};
use axum::response::Redirect;
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderName, HeaderValue, Method, header},
    middleware,
    routing::{delete, get, post},
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;
use handlers::MaintenanceConfig;

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();

    tracing::info!("Loading configuration...");
    let config = Config::from_env().context("Failed to load configuration")?;
    let config = Arc::new(config);

    sessions::global_sessions(&config.storage.directory);

    log_startup_info(&config);
    tokio::fs::create_dir_all(&config.storage.directory)
        .await
        .context("Failed to create storage directory")?;
    tokio::fs::create_dir_all(config.storage.directory.join("crash-reports"))
        .await
        .context("Failed to create crash-reports directory")?;

    let app = build_app(&config);
    let addr = config.socket_addr()?;

    tracing::info!("🚀 Starting server on {addr}");
    tracing::info!("📦 Protected download endpoint: http://{addr}/api/download");
    tracing::info!("🔧 Admin panel: http://{addr}/admin/");
    tracing::info!("📊 API info: http://{addr}/api/info");
    tracing::info!("");
    tracing::info!("✓ Configuration loaded successfully");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind to address")?;

    tracing::info!("✅ Server is running and ready to accept connections");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .context("Server error")?;

    Ok(())
}

fn init_logging() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        let default_level = if cfg!(debug_assertions) {
            "mrpack_api=debug,tower_http=debug,axum=debug"
        } else {
            "mrpack_api=info,tower_http=info,axum=info"
        };
        default_level.into()
    });

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .with_file(true)
                .with_line_number(true),
        )
        .init();
}

fn build_app(config: &Arc<Config>) -> Router {
    let maintenance_tx: broadcast::Sender<MaintenanceConfig> = broadcast::channel(64).0;
    let static_service = ServeDir::new("static").append_index_html_on_directories(true);
    let max_body_size = config.storage.max_file_size_mb * 1024 * 1024;

    let mut app = Router::new()
        .route("/admin", get(|| async { Redirect::permanent("/admin/") }))
        .merge(build_public_routes())
        .merge(build_launcher_routes(config))
        .merge(build_maintenance_routes(config))
        .merge(build_admin_routes(config))
        .fallback_service(static_service)
        .layer(DefaultBodyLimit::max(max_body_size))
        .layer(axum::Extension(maintenance_tx))
        .layer(middleware::from_fn_with_state(
            Arc::clone(config),
            auth::https_middleware,
        ));

    app = add_response_layers(app);

    if config.security.require_https {
        app = app.layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("strict-transport-security"),
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ));
    }

    if let Some(cors_layer) = build_cors_layer(config) {
        app = app.layer(cors_layer);
    }

    tracing::info!(
        "Max upload size configured: {} MB",
        config.storage.max_file_size_mb
    );

    app.with_state(Arc::clone(config))
}

fn build_public_routes() -> Router<Arc<Config>> {
    Router::new()
        .route("/api/health", get(handlers::health_check))
        .route("/api/login", post(handlers::login))
        .route("/api/logout", post(handlers::logout))
        .route(
            "/api/media/instances/{instance_id}/{slot}",
            get(handlers::serve_instance_media),
        )
        .route(
            "/api/maintenance/status",
            get(handlers::get_maintenance_status),
        )
        .route("/api/maintenance/stream", get(handlers::maintenance_stream))
}

fn build_maintenance_routes(config: &Arc<Config>) -> Router<Arc<Config>> {
    Router::new()
        .route("/api/maintenance/check", post(handlers::check_maintenance))
        .layer(middleware::from_fn_with_state(
            Arc::clone(config),
            auth::maintenance_auth_middleware,
        ))
}

fn build_launcher_routes(config: &Arc<Config>) -> Router<Arc<Config>> {
    let crash_upload_limit = config.security.max_crash_report_bytes + 64 * 1024;
    Router::new()
        .route("/api/info", get(handlers::info_modpack))
        .route("/api/download", get(handlers::download_modpack))
        .route(
            "/api/instances/redeem",
            post(handlers::redeem_instance_code),
        )
        .route("/api/social/snapshot", get(handlers::social_snapshot))
        .route(
            "/api/social/presence",
            post(handlers::update_social_presence),
        )
        .route("/api/integrity/report", post(handlers::report_integrity))
        .route(
            "/api/crash-reports",
            post(crash_reports::upload_crash_report)
                .layer(DefaultBodyLimit::max(crash_upload_limit)),
        )
        .route(
            "/api/instances/{instance_id}/info",
            get(handlers::info_instance_modpack),
        )
        .route(
            "/api/instances/{instance_id}/download",
            get(handlers::download_instance_modpack),
        )
        .layer(middleware::from_fn_with_state(
            Arc::clone(config),
            auth::download_auth_middleware,
        ))
}

fn build_admin_routes(config: &Arc<Config>) -> Router<Arc<Config>> {
    let two_gb = 2 * 1024 * 1024 * 1024;
    Router::new()
        .route(
            "/api/upload",
            post(handlers::upload_modpack).layer(DefaultBodyLimit::max(two_gb)),
        )
        .route("/api/delete", delete(handlers::delete_modpack))
        .route(
            "/api/mods",
            post(handlers::add_mod).layer(DefaultBodyLimit::max(two_gb)),
        )
        .route("/api/mods", delete(handlers::remove_mod))
        .route("/api/admin/instances", get(handlers::list_instances))
        .route("/api/admin/instances", post(handlers::create_instance))
        .route(
            "/api/admin/instances/{instance_id}",
            delete(handlers::delete_instance).patch(handlers::update_instance),
        )
        .route(
            "/api/admin/instances/{instance_id}/codes",
            post(handlers::generate_instance_code),
        )
        .route(
            "/api/admin/instances/{instance_id}/upload",
            post(handlers::upload_instance_modpack).layer(DefaultBodyLimit::max(two_gb)),
        )
        .route(
            "/api/admin/instances/{instance_id}/modpack",
            delete(handlers::delete_instance_modpack),
        )
        .route(
            "/api/admin/instances/{instance_id}/media/{slot}",
            post(handlers::upload_instance_media),
        )
        .route(
            "/api/admin/instances/{instance_id}/mods",
            post(handlers::add_instance_mod).layer(DefaultBodyLimit::max(two_gb)),
        )
        .route(
            "/api/admin/instances/{instance_id}/mods",
            delete(handlers::remove_instance_mod),
        )
        .route(
            "/api/admin/maintenance/toggle",
            post(handlers::toggle_maintenance),
        )
        .route(
            "/api/admin/maintenance/config",
            post(handlers::update_maintenance_config),
        )
        .route(
            "/api/admin/maintenance/whitelist",
            get(handlers::list_whitelist),
        )
        .route(
            "/api/admin/maintenance/whitelist/{nick}",
            post(handlers::add_whitelist_entry),
        )
        .route(
            "/api/admin/maintenance/whitelist/{nick}",
            delete(handlers::remove_whitelist_entry),
        )
        .route(
            "/api/admin/main-pack",
            get(handlers::get_main_pack_config).post(handlers::update_main_pack_config),
        )
        .route(
            "/api/admin/crash-reports",
            get(crash_reports::list_crash_reports),
        )
        .route(
            "/api/admin/crash-reports/{id}",
            get(crash_reports::get_crash_report).delete(crash_reports::delete_crash_report),
        )
        .layer(middleware::from_fn_with_state(
            Arc::clone(config),
            auth::auth_middleware,
        ))
}

fn add_response_layers(router: Router<Arc<Config>>) -> Router<Arc<Config>> {
    router
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static(
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
            ),
        ))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
}

fn build_cors_layer(config: &Config) -> Option<CorsLayer> {
    let Some(origins) = &config.security.allowed_origins else {
        tracing::info!("CORS: disabled because ALLOWED_ORIGINS is not configured");
        return None;
    };

    let layer = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    if config.allow_all_origins() {
        tracing::warn!("⚠️  CORS: Allowing all origins (not recommended for production)");
        return Some(layer.allow_origin(Any));
    }

    tracing::info!("CORS: Allowing specific origins: {origins:?}");
    let allowed_origins: Vec<_> = origins
        .iter()
        .filter_map(|origin| origin.parse().ok())
        .collect();

    if allowed_origins.is_empty() {
        tracing::warn!("CORS: ALLOWED_ORIGINS is set but no valid origins were parsed");
        return None;
    }

    Some(layer.allow_origin(allowed_origins))
}

fn log_startup_info(config: &Config) {
    let separator = "=".repeat(60);
    tracing::info!("{separator}");
    tracing::info!("Mrpack API - Server Configuration");
    tracing::info!("{separator}");
    tracing::info!("Server:");
    tracing::info!("  Host: {}", config.server.host);
    tracing::info!("  Port: {}", config.server.port);
    tracing::info!("");
    tracing::info!("Storage:");
    tracing::info!("  Directory: {:?}", config.storage.directory);
    tracing::info!("  Max file size: {} MB", config.storage.max_file_size_mb);
    tracing::info!("");
    tracing::info!("Security:");
    tracing::info!("  Admin username: {}", config.auth.username);
    tracing::info!("  Password: [PROTECTED]");
    tracing::info!(
        "  Download token configured: {}",
        config.auth.download_token_hash.is_some()
    );
    tracing::info!("  Admin authentication: Bearer session");
    tracing::info!("  Require HTTPS: {}", config.security.require_https);
    tracing::info!(
        "  Max crash report: {} bytes",
        config.security.max_crash_report_bytes
    );
    tracing_allowed_origins(config);
    tracing::info!("");
    tracing::info!("Environment:");
    let rust_env = std::env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string());
    tracing::info!("  RUST_ENV: {rust_env}");
    tracing::info!("  Debug mode: {}", cfg!(debug_assertions));
    tracing::info!("{}", "=".repeat(60));
    tracing::info!("");

    if rust_env.to_lowercase() == "production" {
        if !config.security.require_https {
            tracing::warn!("⚠️  WARNING: HTTPS not enforced in production!");
        }

        if config.security.allowed_origins.is_none() {
            tracing::warn!("⚠️  WARNING: CORS is disabled because ALLOWED_ORIGINS is not set");
        }
    }
}

fn tracing_allowed_origins(config: &Config) {
    let Some(origins) = &config.security.allowed_origins else {
        return tracing::info!("  Allowed origins: none (same-origin only)");
    };

    tracing::info!("  Allowed origins: {:?}", origins);
}
