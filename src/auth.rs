use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderName, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::config::Config;
use crate::error::AppError;
use crate::rate_limit::{client_ip_from_headers, login_limiter};
use crate::sessions::global_sessions;
use crate::utils::constant_time_compare;

const DOWNLOAD_TOKEN_HEADER: HeaderName = HeaderName::from_static("x-download-token");

pub async fn auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_admin_request(request.headers(), &state).await {
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
            AppError::Unauthorized("Maintenance authentication error".to_string())
                .into_response()
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

pub async fn verify_admin_request(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    if let Some(token) = bearer_token(headers) {
        let sessions = global_sessions(&config.storage.directory);
        if sessions.validate_session(token).await?.is_some() {
            return Ok(true);
        }
    }

    if config.security.allow_basic_admin {
        return verify_admin_auth(headers, config);
    }

    Ok(false)
}

pub fn verify_admin_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let Some(auth_value) = auth_header else {
        tracing::warn!("Authentication failed: missing Authorization header");
        return Ok(false);
    };

    let Some(credentials) = auth_value.strip_prefix("Basic ") else {
        return Ok(false);
    };

    verify_basic_auth(credentials, config)
}

pub async fn verify_download_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    if verify_admin_request(headers, config).await? {
        return Ok(true);
    }

    if matches!(verify_admin_auth(headers, config), Ok(true)) {
        return Ok(true);
    }

    let Some(token) = bearer_token(headers).or_else(|| custom_download_token(headers)) else {
        return Ok(false);
    };

    verify_download_token(token, config)
}

pub async fn verify_maintenance_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    if verify_admin_request(headers, config).await? {
        return Ok(true);
    }

    if matches!(verify_admin_auth(headers, config), Ok(true)) {
        return Ok(true);
    }

    let Some(token) = bearer_token(headers) else {
        return Ok(false);
    };

    verify_maintenance_token(token, config)
}

fn verify_basic_auth(encoded_credentials: &str, config: &Config) -> anyhow::Result<bool> {
    let decoded = base64_decode(encoded_credentials)?;
    let credentials_str = String::from_utf8(decoded)
        .map_err(|why| anyhow::anyhow!("Invalid UTF-8 in credentials: {why}"))?;

    let parts: Vec<&str> = credentials_str.splitn(2, ':').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid credentials format");
    }

    let username = parts[0];
    let password = parts[1];

    let username_matches =
        constant_time_compare(username.as_bytes(), config.auth.username.as_bytes());

    let password_hash = PasswordHash::new(&config.auth.password_hash)
        .map_err(|why| anyhow::anyhow!("Invalid password hash format: {why}"))?;

    let argon2 = Argon2::default();
    let password_ok = argon2
        .verify_password(password.as_bytes(), &password_hash)
        .is_ok();

    Ok(username_matches && password_ok)
}

fn verify_download_token(token: &str, config: &Config) -> anyhow::Result<bool> {
    let Some(token_hash) = &config.auth.download_token_hash else {
        tracing::warn!("Download token was provided, but DOWNLOAD_TOKEN_HASH is not configured");
        return Ok(false);
    };

    let password_hash = PasswordHash::new(token_hash)
        .map_err(|why| anyhow::anyhow!("Invalid download token hash format: {why}"))?;

    let argon2 = Argon2::default();

    match argon2.verify_password(token.as_bytes(), &password_hash) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
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

    match argon2.verify_password(token.as_bytes(), &password_hash) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
}

fn custom_download_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(DOWNLOAD_TOKEN_HEADER)
        .and_then(|header| header.to_str().ok())
        .map(str::trim)
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

fn base64_decode(input: &str) -> anyhow::Result<Vec<u8>> {
    use base64::{Engine as _, engine::general_purpose};

    general_purpose::STANDARD
        .decode(input)
        .map_err(|why| anyhow::anyhow!("Base64 decode error: {why}"))
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

    #[test]
    fn test_constant_time_compare() {
        assert!(constant_time_compare(b"hello", b"hello"));
        assert!(!constant_time_compare(b"hello", b"world"));
        assert!(!constant_time_compare(b"hello", b"hello world"));
    }

    #[test]
    fn test_base64_decode() {
        let encoded = "aGVsbG86d29ybGQ=";
        let decoded = base64_decode(encoded).unwrap();
        assert_eq!(decoded, b"hello:world");
    }

    #[test]
    fn test_base64_decode_invalid() {
        let invalid = "not-valid-base64!!!";
        assert!(base64_decode(invalid).is_err());
    }
}