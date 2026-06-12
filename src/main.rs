mod auth;
mod config;
mod error;
mod handlers;
mod utils;

use anyhow::{Context, Result};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderName, HeaderValue, Method, header},
    middleware,
    routing::{delete, get, post},
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;

#[tokio::main]
async fn main() -> Result<()> {
    init_logging()?;

    tracing::info!("Loading configuration...");
    let config = Config::from_env().context("Failed to load configuration")?;
    let config = Arc::new(config);

    log_startup_info(&config);
    tokio::fs::create_dir_all(&config.storage.directory)
        .await
        .context("Failed to create storage directory")?;

    let app = build_app(config.clone())?;
    let addr = config.socket_addr()?;

    tracing::info!("🚀 Starting server on {addr}");
    tracing::info!("📦 Protected download endpoint: http://{addr}/api/download");
    tracing::info!("🔧 Admin panel: http://{addr}/admin.html");
    tracing::info!("📊 API info: http://{addr}/api/info");
    tracing::info!("");
    tracing::info!("✓ Configuration loaded successfully");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind to address")?;

    tracing::info!("✅ Server is running and ready to accept connections");

    axum::serve(listener, app.clone())
        .await
        .context("Server error")?;

    Ok(())
}

fn init_logging() -> Result<()> {
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

    Ok(())
}

fn build_app(config: Arc<Config>) -> Result<Router> {
    let public_routes = Router::new()
        .route("/api/health", get(handlers::health_check))
        .route("/api/login", post(handlers::login));

    let protected_launcher_routes = Router::new()
        .route("/api/info", get(handlers::info_modpack))
        .route("/api/download", get(handlers::download_modpack))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            auth::download_auth_middleware,
        ));

    let admin_routes = Router::new()
        .route("/api/upload", post(handlers::upload_modpack))
        .route("/api/delete", delete(handlers::delete_modpack))
        .route("/api/mods", post(handlers::add_mod))
        .route("/api/mods", delete(handlers::remove_mod))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            auth::auth_middleware,
        ));

    let static_service = ServeDir::new("static").append_index_html_on_directories(true);

    let max_body_size = config.storage.max_file_size_mb * 1024 * 1024;
    let mut app = Router::new()
        .merge(public_routes)
        .merge(protected_launcher_routes)
        .merge(admin_routes)
        .fallback_service(static_service)
        .layer(DefaultBodyLimit::max(max_body_size))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            auth::https_middleware,
        ))
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
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(config.clone());

    if let Some(cors_layer) = build_cors_layer(&config) {
        app = app.layer(cors_layer);
    }

    tracing::info!(
        "Max upload size configured: {} MB",
        config.storage.max_file_size_mb
    );

    Ok(app)
}

fn build_cors_layer(config: &Config) -> Option<CorsLayer> {
    let Some(origins) = &config.security.allowed_origins else {
        tracing::info!("CORS: disabled because ALLOWED_ORIGINS is not configured");
        return None;
    };

    let layer = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
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
    tracing::info!("  Require HTTPS: {}", config.security.require_https);
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

        if config.auth.download_token_hash.is_none() {
            tracing::warn!(
                "⚠️  WARNING: DOWNLOAD_TOKEN_HASH is not set; launcher downloads must use admin Basic Auth"
            );
        }
    }
}

fn tracing_allowed_origins(config: &Config) {
    let Some(origins) = &config.security.allowed_origins else {
        return tracing::info!("  Allowed origins: none (same-origin only)");
    };

    tracing::info!("  Allowed origins: {:?}", origins);
}
