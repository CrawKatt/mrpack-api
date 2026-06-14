use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::config::Config;
use crate::error::AppError;
use crate::utils::constant_time_compare;

pub async fn download_auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let authorized = match auth_header {
        Some(value) if value.starts_with("Bearer ") => {
            let token = value.trim_start_matches("Bearer ");
            constant_time_compare(token.as_bytes(), state.auth.download_token.as_bytes())
        }
        Some(value) if value.starts_with("Basic ") => {
            verify_basic_auth(value.trim_start_matches("Basic "), &state).unwrap_or(false)
        }
        _ => false,
    };

    if authorized {
        next.run(request).await
    } else {
        tracing::warn!("Download API authentication failed");
        AppError::Unauthorized("Invalid or missing API credentials".to_string()).into_response()
    }
}

/// Middleware de autenticación HTTP Basic
pub async fn auth_middleware(
    State(state): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let Some(auth_value) = auth_header else {
        tracing::warn!("Authentication failed: missing Authorization header");
        return AppError::Unauthorized("Missing Authorization header".to_string()).into_response();
    };

    let Some(credentials) = auth_value.strip_prefix("Basic ") else {
        tracing::warn!("Authentication failed: invalid Authorization header format");
        return AppError::Unauthorized("Invalid Authorization header format".into())
            .into_response();
    };

    match verify_basic_auth(credentials, &state) {
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
    let username_matches =
        constant_time_compare(username.as_bytes(), config.auth.username.as_bytes());

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

    #[test]
    fn test_download_token_comparison() {
        let configured = b"0123456789abcdef0123456789abcdef";
        assert!(constant_time_compare(configured, configured));
        assert!(!constant_time_compare(
            b"0123456789abcdef0123456789abcdeg",
            configured
        ));
    }
}
