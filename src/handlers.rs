use std::io::Read;
use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use bon::Builder;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use zip::ZipArchive;
use crate::config::Config;
use crate::error::{AppError, ResponseResult};
use crate::utils::constant_time_compare;

const MRPACK_EXTENSION: &str = ".mrpack";
const MRPACK_FILENAME: &str = "modpack.mrpack";

#[derive(Serialize, Deserialize, Debug)]
pub struct ModrinthIndex {
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub game: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<ModFile>,
    pub dependencies: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ModFile {
    pub path: String,
    pub hashes: std::collections::HashMap<String, String>,
    pub env: Option<Environment>,
    pub downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Environment {
    pub client: String,
    pub server: String,
}

#[derive(Serialize, Deserialize, Builder)]
pub struct ModpackDetails {
    pub available: bool,
    pub file_name: String,
    pub file_size: Option<u64>,
    pub file_size_mb: Option<f64>,
    pub modpack_info: Option<ModpackInfo>,
}

#[derive(Serialize, Deserialize, Builder)]
pub struct ModpackInfo {
    pub name: String,
    pub summary: Option<String>,
    pub version_id: String,
    pub format_version: u32,
    pub minecraft_version: String,
    pub loader: String,
    pub loader_version: String,
    pub mod_count: usize,
    pub mods: Vec<ModInfo>,
}

#[derive(Serialize, Deserialize, Builder)]
pub struct ModInfo {
    pub name: String,
    pub file_size: u64,
    pub environment: String,
}

async fn extract_modpack_info(file_path: &std::path::Path) -> Result<ModpackInfo, Box<dyn std::error::Error + Send + Sync>> {
    let file = std::fs::File::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;

    let mut index_file = archive.by_name("modrinth.index.json")?;
    let mut contents = String::new();
    index_file.read_to_string(&mut contents)?;

    let index: ModrinthIndex = serde_json::from_str(&contents)?;

    let (loader, loader_version) = extract_loader_info(&index.dependencies);

    let mods: Vec<ModInfo> = index.files.iter().map(|file| {
        let name = std::path::Path::new(&file.path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let environment = match &file.env {
            Some(env) => {
                if env.client == "required" && env.server == "required" {
                    "both".to_string()
                } else if env.client == "required" {
                    "client".to_string()
                } else if env.server == "required" {
                    "server".to_string()
                } else {
                    "optional".to_string()
                }
            },
            None => "both".to_string(),
        };

        return ModInfo::builder()
            .name(name)
            .file_size(file.file_size)
            .environment(environment)
            .build();

    }).collect();

    let modpack_info = ModpackInfo::builder()
        .name(index.name)
        .maybe_summary(index.summary)
        .version_id(index.version_id)
        .format_version(index.format_version)
        .minecraft_version(index.dependencies.get("minecraft").cloned().unwrap_or_default())
        .loader(loader)
        .loader_version(loader_version)
        .mod_count(mods.len())
        .mods(mods)
        .build();

    Ok(modpack_info)
}

fn extract_loader_info(dependencies: &std::collections::HashMap<String, String>) -> (String, String) {
    if let Some(version) = dependencies.get("fabric-loader") {
        return ("Fabric".to_string(), version.clone());
    }
    if let Some(version) = dependencies.get("forge") {
        return ("Forge".to_string(), version.clone());
    }
    if let Some(version) = dependencies.get("neoforge") {
        return ("NeoForge".to_string(), version.clone());
    }
    if let Some(version) = dependencies.get("quilt-loader") {
        return ("Quilt".to_string(), version.clone());
    }
    ("Unknown".to_string(), "Unknown".to_string())
}

#[derive(Serialize, Deserialize)]
pub struct ApiResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl ApiResponse {
    pub fn success(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: None,
        }
    }

    pub fn success_with_data(message: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: Some(data),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub available: bool,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_mb: Option<f64>,
}

#[derive(Serialize, Deserialize, Builder)]
pub struct UploadResponse {
    pub success: bool,
    pub message: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_size_mb: f64,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
}

pub async fn health_check() -> ResponseResult<Json<ApiResponse>> {
    tracing::debug!("Health check requested");

    Ok(Json(ApiResponse::success("API is healthy and running")))
}

pub async fn login(
    State(config): State<Arc<Config>>,
    Json(payload): Json<LoginRequest>,
) -> ResponseResult<Json<LoginResponse>> {
    tracing::info!("Login attempt for user: {}", payload.username);

    let username_matches = constant_time_compare(
        payload.username.as_bytes(),
        config.auth.username.as_bytes(),
    );

    if !username_matches {
        tracing::warn!("Login failed: invalid username");
        return Err(AppError::AuthenticationFailed("Credenciales incorrectas".to_string()));
    }

    let password_hash = PasswordHash::new(&config.auth.password_hash)
        .map_err(|why| AppError::Internal(format!("Invalid password hash format: {why}")))?;

    let argon2 = Argon2::default();
    let Ok(_) = argon2.verify_password(payload.password.as_bytes(), &password_hash) else {
        tracing::warn!("Login failed: invalid password for user: {}", payload.username);
        return Err(AppError::AuthenticationFailed("Credenciales incorrectas".to_string()))
    };

    Ok(Json(LoginResponse {
        success: true,
        message: "Autenticación exitosa".to_string(),
    }))
}

pub async fn info_modpack(State(config): State<Arc<Config>>) -> ResponseResult<Json<ModpackDetails>> {
    let file_path = get_mrpack_path(&config);
    if !file_path.exists() {
        let modpack_details = ModpackDetails::builder()
            .available(false)
            .file_name(MRPACK_FILENAME.to_string())
            .build();

        return Ok(Json(modpack_details));
    }

    let metadata = tokio::fs::metadata(&file_path).await.map_err(|e| {
        tracing::error!("Failed to get file metadata: {}", e);
        AppError::Internal("Failed to get file information".to_string())
    })?;

    let file_size = metadata.len();
    let file_size_mb = file_size as f64 / (1024.0 * 1024.0);

    let modpack_info = match extract_modpack_info(&file_path).await {
        Ok(info) => Some(info),
        Err(why) => {
            tracing::warn!("Failed to extract modpack info: {why}");
            None
        }
    };

    let modpack_details = ModpackDetails::builder()
        .available(true)
        .file_name(MRPACK_FILENAME.to_string())
        .file_size(file_size)
        .file_size_mb(file_size_mb)
        .maybe_modpack_info(modpack_info)
        .build();

    Ok(Json(modpack_details))
}

pub async fn download_modpack(State(config): State<Arc<Config>>) -> ResponseResult<Response> {
    let file_path = get_mrpack_path(&config);
    let metadata = fs::metadata(&file_path).await.map_err(|_| {
        AppError::FileNotFound("No modpack available for download".to_string())
    })?;

    let file_size = metadata.len();
    let file_size_mb = file_size as f64 / 1024.0 / 1024.0;

    tracing::info!(
        "Modpack download started: {} ({:.2} MB)",
        MRPACK_FILENAME,
        file_size_mb
    );

    let file = fs::File::open(&file_path).await.map_err(|why| {
        tracing::error!("Failed to open file for download: {}", why);
        AppError::FileIo(why)
    })?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", MRPACK_FILENAME))
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .body(body)
        .map_err(|why| AppError::Internal(format!("Failed to build response: {why}")))?;

    tracing::debug!("Modpack download response sent");

    Ok(response)
}

pub async fn upload_modpack(
    State(config): State<Arc<Config>>,
    mut multipart: Multipart,
) -> ResponseResult<Json<UploadResponse>> {
    tracing::info!("Modpack upload initiated");

    let mut file_data: Option<(String, Vec<u8>)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|why| AppError::MultipartError(why.to_string()))?
    {
        let field_name = field
            .name()
            .ok_or_else(|| AppError::BadRequest("Missing field name".to_string()))?
            .to_string();

        if field_name != "file" {
            tracing::warn!("Ignoring unexpected field: {}", field_name);
            continue;
        }

        let file_name = field
            .file_name()
            .ok_or_else(|| AppError::BadRequest("Missing filename".to_string()))?
            .to_string();

        tracing::debug!("Processing upload: {file_name}");
        validate_file_extension(&file_name)?;
        let sanitized_name = sanitize_filename(&file_name)?;
        tracing::debug!("Sanitized filename: {sanitized_name}");
        let data = field
            .bytes()
            .await
            .map_err(|why| AppError::MultipartError(format!("Failed to read file data: {}", why)))?
            .to_vec();

        validate_file_size(data.len(), &config)?;
        file_data = Some((sanitized_name, data));
        break;
    }

    let (original_name, data) = file_data
        .ok_or_else(|| AppError::BadRequest("No file provided in request".to_string()))?;

    let file_size = data.len() as u64;
    let file_size_mb = file_size as f64 / 1024.0 / 1024.0;
    tracing::info!("Uploading file: {original_name} ({:.2} MB)", file_size_mb);

    let storage_dir = &config.storage.directory;
    fs::create_dir_all(storage_dir).await.map_err(|e| {
        tracing::error!("Failed to create storage directory: {}", e);
        AppError::FileIo(e)
    })?;

    let file_path = get_mrpack_path(&config);
    let temp_path = file_path.with_extension("tmp");
    let mut file = fs::File::create(&temp_path).await.map_err(|e| {
        tracing::error!("Failed to create temporary file: {}", e);
        AppError::FileIo(e)
    })?;

    file.write_all(&data).await.map_err(|e| {
        tracing::error!("Failed to write file data: {}", e);
        AppError::FileIo(e)
    })?;

    file.sync_all().await.map_err(|e| {
        tracing::error!("Failed to sync file to disk: {}", e);
        AppError::FileIo(e)
    })?;

    drop(file);

    fs::rename(&temp_path, &file_path).await.map_err(|why| {
        tracing::error!("Failed to rename temporary file: {}", why);
        let _ = std::fs::remove_file(&temp_path);
        AppError::FileIo(why)
    })?;

    tracing::info!(
        "Modpack uploaded successfully: {} ({:.2} MB)",
        original_name,
        file_size_mb
    );
    
    let upload_response = UploadResponse::builder()
        .success(true)
        .message("File uploaded successfully".to_string())
        .file_name(original_name)
        .file_size(file_size)
        .file_size_mb(file_size_mb)
        .build();

    Ok(Json(upload_response))
}

pub async fn delete_modpack(State(config): State<Arc<Config>>) -> ResponseResult<Json<ApiResponse>> {
    let file_path = get_mrpack_path(&config);

    tracing::info!("Modpack deletion requested");
    if !file_path.exists() {
        return Err(AppError::FileNotFound("No modpack file to delete".to_string()));
    }

    fs::remove_file(&file_path).await.map_err(|why| {
        tracing::error!("Failed to delete modpack: {why}");
        AppError::FileIo(why)
    })?;

    tracing::info!("Modpack deleted successfully");

    Ok(Json(ApiResponse::success("Modpack deleted successfully")))
}

fn get_mrpack_path(config: &Config) -> PathBuf {
    config.storage.directory.join(MRPACK_FILENAME)
}

fn validate_file_extension(filename: &str) -> ResponseResult<()> {
    if !filename.to_lowercase().ends_with(MRPACK_EXTENSION) {
        return Err(AppError::InvalidFileType {
            expected: MRPACK_EXTENSION.to_string(),
            got: filename
                .rsplit('.')
                .next()
                .map(|s| format!(".{}", s))
                .unwrap_or_else(|| "no extension".to_string()),
        });
    }
    Ok(())
}

fn validate_file_size(size: usize, config: &Config) -> ResponseResult<()> {
    let max_size = config.storage.max_file_size_mb * 1024 * 1024;

    if size > max_size {
        return Err(AppError::FileTooLarge {
            size,
            max: max_size,
        });
    }

    if size == 0 {
        return Err(AppError::Validation("File is empty".to_string()));
    }

    Ok(())
}

fn sanitize_filename(filename: &str) -> ResponseResult<String> {
    let name = std::path::Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Validation("Invalid filename".to_string()))?;

    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::Validation("Filename contains invalid characters".to_string()));
    }

    if name.len() > 255 {
        return Err(AppError::Validation("Filename too long".to_string()));
    }

    if name.is_empty() {
        return Err(AppError::Validation("Filename is empty".to_string()));
    }

    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_file_extension_valid() {
        assert!(validate_file_extension("test.mrpack").is_ok());
        assert!(validate_file_extension("Test.MRPACK").is_ok());
        assert!(validate_file_extension("my-modpack.mrpack").is_ok());
    }

    #[test]
    fn test_validate_file_extension_invalid() {
        assert!(validate_file_extension("test.zip").is_err());
        assert!(validate_file_extension("test.txt").is_err());
        assert!(validate_file_extension("test").is_err());
    }

    #[test]
    fn test_sanitize_filename_valid() {
        assert_eq!(sanitize_filename("test.mrpack").unwrap(), "test.mrpack");
        assert_eq!(sanitize_filename("my-modpack.mrpack").unwrap(), "my-modpack.mrpack");
    }

    #[test]
    fn test_sanitize_filename_path_traversal() {
        assert!(sanitize_filename("../test.mrpack").is_err());
        assert!(sanitize_filename("../../etc/passwd").is_err());
        assert!(sanitize_filename("/etc/passwd").is_err());
        assert!(sanitize_filename("test/../file.mrpack").is_err());
    }

    #[test]
    fn test_sanitize_filename_removes_path() {
        assert_eq!(sanitize_filename("/path/to/file.mrpack").unwrap(), "file.mrpack");
        assert_eq!(sanitize_filename("path/to/file.mrpack").unwrap(), "file.mrpack");
    }

    #[test]
    fn test_sanitize_filename_empty() {
        assert!(sanitize_filename("").is_err());
    }

    #[test]
    fn test_sanitize_filename_too_long() {
        let long_name = "a".repeat(300) + ".mrpack";
        assert!(sanitize_filename(&long_name).is_err());
    }

    #[test]
    fn test_constant_time_compare() {
        assert!(constant_time_compare(b"hello", b"hello"));
        assert!(constant_time_compare(b"admin", b"admin"));
        assert!(constant_time_compare(b"", b""));

        assert!(!constant_time_compare(b"hello", b"world"));
        assert!(!constant_time_compare(b"admin", b"Admin"));
        assert!(!constant_time_compare(b"hello", b"hello world"));
        assert!(!constant_time_compare(b"hello world", b"hello"));
        assert!(!constant_time_compare(b"a", b""));
    }
}
