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
use crate::utils::constant_time_compare;

const DOWNLOAD_TOKEN_HEADER: HeaderName = HeaderName::from_static("x-download-token");

/// Middleware de autenticación HTTP Basic
pub async fn auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_admin_auth(request.headers(), &state) {
        Ok(true) => {
            tracing::debug!("Authentication successful");
            next.run(request).await
        }
        Ok(false) => {
            tracing::warn!("Authentication failed: invalid credentials");
            AppError::Unauthorized("Invalid credentials".to_string()).into_response()
        }
        Err(why) => {
            tracing::error!("Authentication error: {why}");
            AppError::Unauthorized("Authentication error".to_string()).into_response()
        }
    }
}

pub async fn download_auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    match verify_download_auth(request.headers(), &state) {
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

pub fn verify_admin_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let Some(auth_value) = auth_header else {
        tracing::warn!("Authentication failed: missing Authorization header");
        return Ok(false);
    };

    let Some(credentials) = auth_value.strip_prefix("Basic ") else {
        tracing::warn!("Authentication failed: invalid Authorization header format");
        return Ok(false);
    };

    verify_basic_auth(credentials, config)
}

pub fn verify_download_auth(headers: &HeaderMap, config: &Config) -> anyhow::Result<bool> {
    if verify_admin_auth(headers, config)? {
        return Ok(true);
    }

    let Some(token) = bearer_token(headers).or_else(|| custom_download_token(headers)) else {
        return Ok(false);
    };

    verify_download_token(token, config)
}

/// Verificar credenciales de Basic Auth
fn verify_basic_auth(encoded_credentials: &str, config: &Config) -> anyhow::Result<bool> {
    // Decodificar Base64
    let decoded = base64_decode(encoded_credentials)?;
    let credentials_str = String::from_utf8(decoded)
        .map_err(|why| anyhow::anyhow!("Invalid UTF-8 in credentials: {why}"))?;

    // Dividir en username:password
    let parts: Vec<&str> = credentials_str.splitn(2, ':').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid credentials format");
    }

    let username = parts[0];
    let password = parts[1];

    // Verificar username (comparación constant-time)
    let username_matches = constant_time_compare(username.as_bytes(), config.auth.username.as_bytes());

    if !username_matches {
        return Ok(false);
    }

    // Verificar password usando Argon2
    let password_hash = PasswordHash::new(&config.auth.password_hash)
        .map_err(|why| anyhow::anyhow!("Invalid password hash format: {why}"))?;

    let argon2 = Argon2::default();
    
    match argon2.verify_password(password.as_bytes(), &password_hash) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
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

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
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

/// Decodificar Base64 de forma segura
fn base64_decode(input: &str) -> anyhow::Result<Vec<u8>> {
    use base64::{engine::general_purpose, Engine as _};
    
    general_purpose::STANDARD
        .decode(input)
        .map_err(|why| anyhow::anyhow!("Base64 decode error: {why}"))
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
        let encoded = "aGVsbG86d29ybGQ="; // "hello:world"
        let decoded = base64_decode(encoded).unwrap();
        assert_eq!(decoded, b"hello:world");
    }

    #[test]
    fn test_base64_decode_invalid() {
        let invalid = "not-valid-base64!!!";
        assert!(base64_decode(invalid).is_err());
    }
}