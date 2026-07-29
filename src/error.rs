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

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Multipart form error: {0}")]
    MultipartError(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Too many requests: try again in {0} seconds")]
    TooManyRequests(u64),
}

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
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message, should_log_details) = match &self {
            Self::FileNotFound(_) => (
                StatusCode::NOT_FOUND,
                "The requested file was not found".to_string(),
                false,
            ),
            Self::FileIo(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to process file".to_string(),
                true,
            ),
            Self::InvalidFileType { expected, got } => (
                StatusCode::BAD_REQUEST,
                format!("Invalid file type: expected {expected}, got {got}"),
                false,
            ),
            Self::FileTooLarge { size, max } => (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!(
                    "File size ({} MB) exceeds maximum allowed size ({} MB)",
                    size / 1024 / 1024,
                    max / 1024 / 1024
                ),
                false,
            ),
            Self::AuthenticationFailed(_) => (
                StatusCode::UNAUTHORIZED,
                "Authentication failed".to_string(),
                true,
            ),
            Self::Unauthorized(_) => {
                tracing::warn!("Unauthorized access attempt {self}");
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorResponse::new(
                        "Unauthorized - Invalid or missing credentials",
                    )),
                )
                    .into_response();
            }
            Self::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone(), true),
            Self::Validation(msg) | Self::BadRequest(msg) => {
                (StatusCode::BAD_REQUEST, msg.clone(), false)
            }
            Self::MultipartError(_) => (
                StatusCode::BAD_REQUEST,
                "Invalid multipart form data".to_string(),
                true,
            ),
            Self::TooManyRequests(secs) => (
                StatusCode::TOO_MANY_REQUESTS,
                format!("Too many requests. Try again in {secs} seconds"),
                true,
            ),
            Self::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "An internal server error occurred".to_string(),
                true,
            ),
        };

        if should_log_details {
            tracing::error!("Error: {self}");
        } else {
            tracing::warn!("Client error: {self}");
        }

        (status, Json(ErrorResponse::new(error_message))).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
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
    fn test_file_not_found_error() {
        let why = AppError::FileNotFound("test.mrpack".to_string());
        let display = format!("{why}");
        assert!(display.contains("File not found"));
    }

    #[test]
    fn test_file_too_large_error() {
        let why = AppError::FileTooLarge {
            size: 1024 * 1024 * 600,
            max: 1024 * 1024 * 500,
        };
        let display = format!("{why}");
        assert!(display.contains("exceeds limit"));
    }
}
