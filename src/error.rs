use axum::http::header;
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::io;
use thiserror::Error;

pub type ResponseResult<T> = Result<T, AppError>;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("File I/O error: {0}")]
    FileIo(#[from] io::Error),

    #[error("Invalid file type: expected {expected}, got {got}")]
    InvalidFileType { expected: String, got: String },

    #[error("File too large: {size} bytes exceeds limit of {max} bytes")]
    FileTooLarge { size: usize, max: usize },

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Invalid configuration: {0}")]
    Configuration(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Multipart form error: {0}")]
    MultipartError(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Bad request: {0}")]
    BadRequest(String),
}

/// Error response body sent to clients
#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
}

impl ErrorResponse {
    fn new(error: impl Into<String>) -> Self {
        Self {
            success: false,
            error: error.into(),
            details: None,
        }
    }

    fn with_details(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            success: false,
            error: error.into(),
            details: Some(details.into()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message, should_log_details) = match &self {
            AppError::FileNotFound(_) => (
                StatusCode::NOT_FOUND,
                "The requested file was not found".to_string(),
                false,
            ),
            AppError::FileIo(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to process file".to_string(),
                true,
            ),
            AppError::InvalidFileType { expected, got } => (
                StatusCode::BAD_REQUEST,
                format!("Invalid file type: expected {expected}, got {got}"),
                false,
            ),
            AppError::FileTooLarge { size, max } => (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!(
                    "File size ({} MB) exceeds maximum allowed size ({} MB)",
                    size / 1024 / 1024,
                    max / 1024 / 1024
                ),
                false,
            ),
            AppError::AuthenticationFailed(_) => (
                StatusCode::UNAUTHORIZED,
                "Authentication failed".to_string(),
                true,
            ),
            AppError::Unauthorized(_) => {
                tracing::warn!("Unauthorized access attempt {self}");
                return (
                    StatusCode::UNAUTHORIZED,
                    [(header::WWW_AUTHENTICATE, "Basic realm=\"Admin Panel\", charset=\"UTF-8\"")],
                    Json(ErrorResponse::new("Unauthorized - Invalid or missing credentials"))
                ).into_response();
            },
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone(), true),
            AppError::Configuration(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Server configuration error".to_string(),
                true,
            ),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg.clone(), false),
            AppError::MultipartError(_) => (
                StatusCode::BAD_REQUEST,
                "Invalid multipart form data".to_string(),
                true,
            ),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone(), false),
            AppError::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "An internal server error occurred".to_string(),
                true,
            ),
        };

        // Log detailed error for internal/auth errors
        if should_log_details {
            tracing::error!("Error: {self}");
        } else {
            tracing::warn!("Client error: {self}");
        }

        (status, Json(ErrorResponse::new(error_message))).into_response()
    }
}

// Convenience conversions
impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_response_creation() {
        let resp = ErrorResponse::new("Test error");
        assert_eq!(resp.error, "Test error");
        assert!(resp.details.is_none());
    }

    #[test]
    fn test_error_response_with_details() {
        let resp = ErrorResponse::with_details("Test error", "More info");
        assert_eq!(resp.error, "Test error");
        assert_eq!(resp.details, Some("More info".to_string()));
    }

    #[test]
    fn test_file_not_found_error() {
        let why = AppError::FileNotFound("test.mrpack".to_string());
        let display = format!("{why}");
        assert!(display.contains("File not found"));
    }

    #[test]
    fn test_file_too_large_error() {
        let why = AppError::FileTooLarge {
            size: 1024 * 1024 * 600, // 600 MB
            max: 1024 * 1024 * 500,  // 500 MB
        };
        let display = format!("{why}");
        assert!(display.contains("exceeds limit"));
    }
}