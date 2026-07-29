use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::config::Config;
use crate::error::AppError;
use crate::rate_limit::{client_ip_from_headers, login_limiter};
use crate::sessions::global_sessions;

pub async fn auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_admin_session(request.headers(), &state).await {
        Ok(true) => {
            tracing::debug!("Admin authentication successful");
            next.run(request).await
        }
        Ok(false) => {
            tracing::warn!("Admin authentication failed: invalid credentials");
            AppError::Unauthorized("Invalid credentials".to_string()).into_response()
        }
        Err(why) => {
            tracing::error!("Admin authentication error: {why}");
            AppError::Unauthorized("Authentication error".to_string()).into_response()
        }
    }
}

pub async fn download_auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_download_auth(request.headers(), &state).await {
        Ok(true) => next.run(request).await,
        Ok(false) => {
            tracing::warn!("Protected download endpoint rejected unauthorized request");
            AppError::Unauthorized("Missing or invalid download credentials".to_string())
                .into_response()
        }
        Err(why) => {
            tracing::error!("Download authentication error: {why}");
            AppError::Unauthorized("Download authentication error".to_string()).into_response()
        }
    }
}

pub async fn maintenance_auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_maintenance_auth(request.headers(), &state).await {
        Ok(true) => next.run(request).await,
        Ok(false) => {
            tracing::warn!("Maintenance check endpoint rejected unauthorized request");
            AppError::Unauthorized("Missing or invalid maintenance credentials".to_string())
                .into_response()
        }
        Err(why) => {
            tracing::error!("Maintenance authentication error: {why}");
            AppError::Unauthorized("Maintenance authentication error".to_string()).into_response()
        }
    }
}

pub async fn https_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    if !state.security.require_https || request_is_https(&request) {
        return next.run(request).await;
    }

    tracing::warn!("Rejected non-HTTPS request while REQUIRE_HTTPS is enabled");
    AppError::Forbidden("HTTPS is required".to_string()).into_response()
}

pub async fn verify_admin_session(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    let Some(token) = bearer_token(headers) else {
        return Ok(false);
    };

    validate_admin_session(token, config).await
}

pub async fn verify_download_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    let Some(token) = bearer_token(headers) else {
        return Ok(false);
    };

    if validate_admin_session(token, config).await? {
        return Ok(true);
    }

    verify_download_token(token, config)
}

pub async fn verify_maintenance_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    let Some(token) = bearer_token(headers) else {
        return Ok(false);
    };

    if validate_admin_session(token, config).await? {
        return Ok(true);
    }

    verify_maintenance_token(token, config)
}

async fn validate_admin_session(token: &str, config: &Config) -> anyhow::Result<bool> {
    let sessions = global_sessions(&config.storage.directory);
    Ok(sessions.validate_session(token).await?.is_some())
}

fn verify_download_token(token: &str, config: &Config) -> anyhow::Result<bool> {
    let Some(token_hash) = &config.auth.download_token_hash else {
        tracing::warn!("Download token was provided, but DOWNLOAD_TOKEN_HASH is not configured");
        return Ok(false);
    };

    let password_hash = PasswordHash::new(token_hash)
        .map_err(|why| anyhow::anyhow!("Invalid download token hash format: {why}"))?;

    let argon2 = Argon2::default();

    Ok(argon2
        .verify_password(token.as_bytes(), &password_hash)
        .is_ok())
}

fn verify_maintenance_token(token: &str, config: &Config) -> anyhow::Result<bool> {
    let Some(token_hash) = &config.auth.maintenance_token_hash else {
        tracing::warn!(
            "Maintenance token was provided, but MAINTENANCE_TOKEN_HASH is not configured"
        );
        return Ok(false);
    };

    let password_hash = PasswordHash::new(token_hash)
        .map_err(|why| anyhow::anyhow!("Invalid maintenance token hash format: {why}"))?;

    let argon2 = Argon2::default();

    Ok(argon2
        .verify_password(token.as_bytes(), &password_hash)
        .is_ok())
}

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|value| value.split_once(' '))
        .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("Bearer"))
        .map(|(_, token)| token.trim())
        .filter(|token| !token.is_empty())
}

fn request_is_https(request: &Request) -> bool {
    if request.uri().scheme_str() == Some("https") {
        return true;
    }

    let forwarded_proto = request
        .headers()
        .get("x-forwarded-proto")
        .and_then(|header| header.to_str().ok())
        .unwrap_or_default();

    if forwarded_proto
        .split(',')
        .any(|proto| proto.trim().eq_ignore_ascii_case("https"))
    {
        return true;
    }

    request
        .headers()
        .get("forwarded")
        .and_then(|header| header.to_str().ok())
        .is_some_and(|forwarded| {
            forwarded
                .split(';')
                .any(|part| part.trim().eq_ignore_ascii_case("proto=https"))
        })
}

pub fn check_login_rate_limit(headers: &HeaderMap) -> Result<(), AppError> {
    let ip = client_ip_from_headers(headers, None);
    login_limiter()
        .check(&ip)
        .map_err(AppError::TooManyRequests)
}

pub fn record_login_success(headers: &HeaderMap) {
    let ip = client_ip_from_headers(headers, None);
    login_limiter().record_success(&ip);
}

pub fn record_login_failure(headers: &HeaderMap) {
    let ip = client_ip_from_headers(headers, None);
    login_limiter().record_failure(&ip);
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn bearer_token_accepts_case_insensitive_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("bearer test-token"),
        );

        assert_eq!(bearer_token(&headers), Some("test-token"));
    }

    #[test]
    fn bearer_token_rejects_other_schemes() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Basic dGVzdDp0ZXN0"),
        );

        assert_eq!(bearer_token(&headers), None);
    }
}
