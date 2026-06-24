use crate::config::Config;
use crate::error::{AppError, ResponseResult};
use crate::utils::constant_time_compare;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path as AxumPath, State},
    http::{StatusCode, header},
    response::Response,
};
use bon::Builder;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

const MRPACK_EXTENSION: &str = ".mrpack";
const MRPACK_FILENAME: &str = "modpack.mrpack";
const JAR_EXTENSION: &str = ".jar";
const OVERRIDE_MODS_DIR: &str = "overrides/mods";
const MODRINTH_INDEX: &str = "modrinth.index.json";

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
    pub dependencies: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ModFile {
    pub path: String,
    pub hashes: HashMap<String, String>,
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
    pub path: String,
    pub file_size: u64,
    pub environment: String,
    pub source: String,
}
#[derive(Serialize, Deserialize, Debug, Default, Clone)]
struct InstanceStore {
    instances: HashMap<String, StoredInstance>,
    codes: HashMap<String, InstanceCode>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StoredInstance {
    id: String,
    name: String,
    whitelist: Vec<WhitelistEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct WhitelistEntry {
    code: String,
    username: Option<String>,
    uuid: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstanceCode {
    pub code: String,
    #[serde(alias = "instance_id")]
    pub instance_id: String,
    #[serde(alias = "max_uses")]
    pub max_uses: Option<u32>,
    pub uses: u32,
    pub active: bool,
}

#[derive(Serialize)]
pub struct InstanceAccess {
    pub id: String,
    pub name: String,
    pub code: String,
}

#[derive(Serialize)]
pub struct RedeemCodeResponse {
    pub success: bool,
    pub message: String,
    pub instance: InstanceAccess,
    pub modpack: ModpackDetails,
}

#[derive(Serialize)]
pub struct AdminInstanceView {
    pub id: String,
    pub name: String,
    pub whitelist_count: usize,
    pub codes: Vec<InstanceCode>,
    pub modpack: ModpackDetails,
}

#[derive(Serialize)]
pub struct AdminInstancesResponse {
    pub instances: Vec<AdminInstanceView>,
}

#[derive(Deserialize)]
pub struct CreateInstanceRequest {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCodeRequest {
    #[serde(alias = "max_uses")]
    pub max_uses: Option<u32>,
}

#[derive(Deserialize)]
pub struct RedeemCodeRequest {
    pub code: String,
    pub username: Option<String>,
    pub uuid: Option<String>,
}

async fn extract_modpack_info(
    file_path: &Path,
) -> Result<ModpackInfo, Box<dyn std::error::Error + Send + Sync>> {
    let file = std::fs::File::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;

    let index = read_modrinth_index(&mut archive)?;
    validate_modrinth_index(&index)?;

    let (loader, loader_version) = extract_loader_info(&index.dependencies);
    let manifest_paths: HashSet<String> =
        index.files.iter().map(|file| file.path.clone()).collect();

    let mut mods: Vec<ModInfo> = index
        .files
        .iter()
        .map(|file| {
            let name = Path::new(&file.path)
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
                }
                None => "both".to_string(),
            };

            return ModInfo::builder()
                .name(name)
                .path(file.path.clone())
                .file_size(file.file_size)
                .environment(environment)
                .source("manifest".to_string())
                .build();
        })
        .collect();

    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let path = file.name().to_string();
        if !is_override_mod_path(&path) || manifest_paths.contains(&path) {
            continue;
        }

        let name = Path::new(&path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        mods.push(
            ModInfo::builder()
                .name(name)
                .path(path)
                .file_size(file.size())
                .environment("both".to_string())
                .source("override".to_string())
                .build(),
        );
    }

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

fn extract_loader_info(dependencies: &HashMap<String, String>) -> (String, String) {
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

#[derive(Serialize, Deserialize, Builder)]
pub struct ModEditResponse {
    pub success: bool,
    pub message: String,
    pub path: String,
    pub modpack_info: Option<ModpackInfo>,
}

#[derive(Deserialize)]
pub struct RemoveModRequest {
    pub path: String,
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


pub async fn list_instances(
    State(config): State<Arc<Config>>,
) -> ResponseResult<Json<AdminInstancesResponse>> {
    let store = load_instance_store(&config).await?;
    let mut instances = Vec::new();

    for instance in store.instances.values() {
        let modpack = modpack_details_for_path(&get_instance_mrpack_path(&config, &instance.id)).await?;
        let mut codes: Vec<InstanceCode> = store
            .codes
            .values()
            .filter(|code| code.instance_id == instance.id)
            .cloned()
            .collect();
        codes.sort_by(|left, right| left.code.cmp(&right.code));
        instances.push(AdminInstanceView {
            id: instance.id.clone(),
            name: instance.name.clone(),
            whitelist_count: instance.whitelist.len(),
            codes,
            modpack,
        });
    }

    instances.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(Json(AdminInstancesResponse { instances }))
}

pub async fn create_instance(
    State(config): State<Arc<Config>>,
    Json(payload): Json<CreateInstanceRequest>,
) -> ResponseResult<Json<AdminInstanceView>> {
    let _guard = instance_store_lock().lock().await;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Instance name is required".to_string()));
    }

    let mut store = load_instance_store(&config).await?;
    let base_id = slugify(name);
    let mut id = base_id.clone();
    let mut suffix = 2;
    while store.instances.contains_key(&id) {
        id = format!("{base_id}-{suffix}");
        suffix += 1;
    }

    let instance = StoredInstance {
        id: id.clone(),
        name: name.to_string(),
        whitelist: Vec::new(),
    };
    fs::create_dir_all(get_instance_dir(&config, &id))
        .await
        .map_err(AppError::FileIo)?;
    store.instances.insert(id.clone(), instance.clone());
    save_instance_store(&config, &store).await?;

    Ok(Json(AdminInstanceView {
        id: instance.id,
        name: instance.name,
        whitelist_count: 0,
        codes: Vec::new(),
        modpack: unavailable_modpack_details(MRPACK_FILENAME),
    }))
}

pub async fn delete_instance(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
) -> ResponseResult<Json<ApiResponse>> {
    let _guard = instance_store_lock().lock().await;
    let mut store = load_instance_store(&config).await?;
    if store.instances.remove(&instance_id).is_none() {
        return Err(AppError::FileNotFound("Instance not found".to_string()));
    }
    store.codes.retain(|_, code| code.instance_id != instance_id);
    save_instance_store(&config, &store).await?;
    let dir = get_instance_dir(&config, &instance_id);
    if dir.exists() {
        fs::remove_dir_all(dir).await.map_err(AppError::FileIo)?;
    }
    Ok(Json(ApiResponse::success("Instance deleted successfully")))
}

pub async fn generate_instance_code(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    Json(payload): Json<GenerateCodeRequest>,
) -> ResponseResult<Json<InstanceCode>> {
    let _guard = instance_store_lock().lock().await;
    let mut store = load_instance_store(&config).await?;
    if !store.instances.contains_key(&instance_id) {
        return Err(AppError::FileNotFound("Instance not found".to_string()));
    }

    let mut code = generate_code();
    while store.codes.contains_key(&code) {
        code = generate_code();
    }

    let instance_code = InstanceCode {
        code: code.clone(),
        instance_id,
        max_uses: payload.max_uses,
        uses: 0,
        active: true,
    };
    store.codes.insert(code, instance_code.clone());
    save_instance_store(&config, &store).await?;
    Ok(Json(instance_code))
}

pub async fn redeem_instance_code(
    State(config): State<Arc<Config>>,
    Json(payload): Json<RedeemCodeRequest>,
) -> ResponseResult<Json<RedeemCodeResponse>> {
    let _guard = instance_store_lock().lock().await;
    let code_value = normalize_code(&payload.code)?;
    let mut store = load_instance_store(&config).await?;
    let instance_code = store
        .codes
        .get_mut(&code_value)
        .ok_or_else(|| AppError::Forbidden("Invalid instance code".to_string()))?;

    if !instance_code.active || instance_code.max_uses.is_some_and(|max| instance_code.uses >= max) {
        return Err(AppError::Forbidden("El código ya fue usado o está desactivado".to_string()));
    }

    let instance_id = instance_code.instance_id.clone();
    let modpack = modpack_details_for_path(&get_instance_mrpack_path(&config, &instance_id)).await?;
    if !modpack.available {
        return Err(AppError::BadRequest(
            "La instancia todavía no tiene un modpack cargado desde el panel admin".to_string(),
        ));
    }

    instance_code.uses += 1;
    let instance = store
        .instances
        .get_mut(&instance_id)
        .ok_or_else(|| AppError::FileNotFound("Instance not found".to_string()))?;

    let whitelist_entry = WhitelistEntry {
        code: code_value.clone(),
        username: payload.username.filter(|value| !value.trim().is_empty()),
        uuid: payload.uuid.filter(|value| !value.trim().is_empty()),
    };
    if !instance.whitelist.iter().any(|entry| {
        entry.code == whitelist_entry.code
            && entry.uuid == whitelist_entry.uuid
            && entry.username == whitelist_entry.username
    }) {
        instance.whitelist.push(whitelist_entry);
    }

    let access = InstanceAccess {
        id: instance.id.clone(),
        name: instance.name.clone(),
        code: code_value.clone(),
    };
    save_instance_store(&config, &store).await?;

    Ok(Json(RedeemCodeResponse {
        success: true,
        message: "Instance unlocked".to_string(),
        instance: access,
        modpack,
    }))
}

pub async fn info_instance_modpack(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    headers: axum::http::HeaderMap,
) -> ResponseResult<Json<ModpackDetails>> {
    require_instance_code(&config, &instance_id, &headers).await?;
    Ok(Json(modpack_details_for_path(&get_instance_mrpack_path(&config, &instance_id)).await?))
}

pub async fn download_instance_modpack(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    headers: axum::http::HeaderMap,
) -> ResponseResult<Response> {
    require_instance_code(&config, &instance_id, &headers).await?;
    download_modpack_file(get_instance_mrpack_path(&config, &instance_id)).await
}

pub async fn upload_instance_modpack(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    multipart: Multipart,
) -> ResponseResult<Json<UploadResponse>> {
    ensure_instance_exists(&config, &instance_id).await?;
    upload_modpack_to_path(&config, get_instance_mrpack_path(&config, &instance_id), multipart).await
}

pub async fn delete_instance_modpack(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
) -> ResponseResult<Json<ApiResponse>> {
    ensure_instance_exists(&config, &instance_id).await?;
    delete_modpack_at_path(get_instance_mrpack_path(&config, &instance_id)).await
}

pub async fn add_instance_mod(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    multipart: Multipart,
) -> ResponseResult<Json<ModEditResponse>> {
    ensure_instance_exists(&config, &instance_id).await?;
    add_mod_to_path(&config, get_instance_mrpack_path(&config, &instance_id), multipart).await
}

pub async fn remove_instance_mod(
    State(config): State<Arc<Config>>,
    AxumPath(instance_id): AxumPath<String>,
    Json(payload): Json<RemoveModRequest>,
) -> ResponseResult<Json<ModEditResponse>> {
    ensure_instance_exists(&config, &instance_id).await?;
    remove_mod_from_path(&config, &instance_id, payload).await
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

    let modpack_info = extract_modpack_info(&file_path).await.map_err(|why| {
        tracing::error!("Stored modpack is invalid: {why}");
        AppError::Internal("Stored modpack is invalid".to_string())
    })?;

    let modpack_details = ModpackDetails::builder()
        .available(true)
        .file_name(MRPACK_FILENAME.to_string())
        .file_size(file_size)
        .file_size_mb(file_size_mb)
        .modpack_info(modpack_info)
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
    let _guard = modpack_write_lock().lock().await;

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
        validate_mrpack_archive(&data)?;
        file_data = Some((sanitized_name, data));
        break;
    }

    let (original_name, data) =
        file_data.ok_or_else(|| AppError::BadRequest("No file provided in request".to_string()))?;

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

pub async fn add_mod(
    State(config): State<Arc<Config>>,
    mut multipart: Multipart,
) -> ResponseResult<Json<ModEditResponse>> {
    tracing::info!("Mod upload initiated");
    let _guard = modpack_write_lock().lock().await;

    let file_path = get_mrpack_path(&config);
    if !file_path.exists() {
        return Err(AppError::FileNotFound(
            "No modpack file to edit".to_string(),
        ));
    }

    let mut mod_data: Option<(String, Vec<u8>)> = None;
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

        validate_mod_file_extension(&file_name)?;
        let sanitized_name = sanitize_filename(&file_name)?;
        let data = field
            .bytes()
            .await
            .map_err(|why| AppError::MultipartError(format!("Failed to read mod data: {why}")))?
            .to_vec();

        validate_file_size(data.len(), &config)?;
        validate_jar_archive(&data)?;
        mod_data = Some((sanitized_name, data));
        break;
    }

    let (file_name, data) = mod_data
        .ok_or_else(|| AppError::BadRequest("No mod file provided in request".to_string()))?;
    let mod_path = add_override_mod_to_mrpack(file_path.clone(), file_name, data).await?;
    let modpack_info = extract_modpack_info(&file_path).await.ok();

    Ok(Json(
        ModEditResponse::builder()
            .success(true)
            .message("Mod added to modpack".to_string())
            .path(mod_path)
            .maybe_modpack_info(modpack_info)
            .build(),
    ))
}

pub async fn delete_modpack(
    State(config): State<Arc<Config>>,
) -> ResponseResult<Json<ApiResponse>> {
    let file_path = get_mrpack_path(&config);
    let _guard = modpack_write_lock().lock().await;

    tracing::info!("Modpack deletion requested");
    if !file_path.exists() {
        return Err(AppError::FileNotFound(
            "No modpack file to delete".to_string(),
        ));
    }

    fs::remove_file(&file_path).await.map_err(|why| {
        tracing::error!("Failed to delete modpack: {why}");
        AppError::FileIo(why)
    })?;

    tracing::info!("Modpack deleted successfully");

    Ok(Json(ApiResponse::success("Modpack deleted successfully")))
}

pub async fn remove_mod(
    State(config): State<Arc<Config>>,
    Json(payload): Json<RemoveModRequest>,
) -> ResponseResult<Json<ModEditResponse>> {
    let file_path = get_mrpack_path(&config);
    let _guard = modpack_write_lock().lock().await;

    if !file_path.exists() {
        return Err(AppError::FileNotFound(
            "No modpack file to edit".to_string(),
        ));
    }

    let target_path = normalize_archive_path(&payload.path)?;
    let removed_path = remove_mod_from_mrpack(file_path.clone(), target_path).await?;
    let modpack_info = extract_modpack_info(&file_path).await.ok();

    Ok(Json(
        ModEditResponse::builder()
            .success(true)
            .message("Mod removed from modpack".to_string())
            .path(removed_path)
            .maybe_modpack_info(modpack_info)
            .build(),
    ))
}

async fn modpack_details_for_path(file_path: &Path) -> ResponseResult<ModpackDetails> {
    if !file_path.exists() {
        return Ok(unavailable_modpack_details(MRPACK_FILENAME));
    }

    let metadata = tokio::fs::metadata(file_path).await.map_err(|e| {
        tracing::error!("Failed to get file metadata: {}", e);
        AppError::Internal("Failed to get file information".to_string())
    })?;

    let file_size = metadata.len();
    let file_size_mb = file_size as f64 / (1024.0 * 1024.0);
    let modpack_info = extract_modpack_info(file_path).await.map_err(|why| {
        tracing::error!("Stored modpack is invalid: {why}");
        AppError::Internal("Stored modpack is invalid".to_string())
    })?;

    Ok(ModpackDetails::builder()
        .available(true)
        .file_name(MRPACK_FILENAME.to_string())
        .file_size(file_size)
        .file_size_mb(file_size_mb)
        .modpack_info(modpack_info)
        .build())
}

fn unavailable_modpack_details(file_name: &str) -> ModpackDetails {
    ModpackDetails::builder()
        .available(false)
        .file_name(file_name.to_string())
        .build()
}

async fn download_modpack_file(file_path: PathBuf) -> ResponseResult<Response> {
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
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", MRPACK_FILENAME))
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .body(body)
        .map_err(|why| AppError::Internal(format!("Failed to build response: {why}")))
}

async fn upload_modpack_to_path(
    config: &Config,
    file_path: PathBuf,
    mut multipart: Multipart,
) -> ResponseResult<Json<UploadResponse>> {
    tracing::info!("Modpack upload initiated");
    let _guard = modpack_write_lock().lock().await;

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

        validate_file_extension(&file_name)?;
        let sanitized_name = sanitize_filename(&file_name)?;
        let data = field
            .bytes()
            .await
            .map_err(|why| AppError::MultipartError(format!("Failed to read file data: {}", why)))?
            .to_vec();

        validate_file_size(data.len(), config)?;
        validate_mrpack_archive(&data)?;
        file_data = Some((sanitized_name, data));
        break;
    }

    let (original_name, data) =
        file_data.ok_or_else(|| AppError::BadRequest("No file provided in request".to_string()))?;

    let file_size = data.len() as u64;
    let file_size_mb = file_size as f64 / 1024.0 / 1024.0;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).await.map_err(AppError::FileIo)?;
    }

    let temp_path = file_path.with_extension("tmp");
    let mut file = fs::File::create(&temp_path).await.map_err(AppError::FileIo)?;
    file.write_all(&data).await.map_err(AppError::FileIo)?;
    file.sync_all().await.map_err(AppError::FileIo)?;
    drop(file);
    fs::rename(&temp_path, &file_path).await.map_err(|why| {
        let _ = std::fs::remove_file(&temp_path);
        AppError::FileIo(why)
    })?;

    Ok(Json(UploadResponse::builder()
        .success(true)
        .message("File uploaded successfully".to_string())
        .file_name(original_name)
        .file_size(file_size)
        .file_size_mb(file_size_mb)
        .build()))
}

async fn add_mod_to_path(
    config: &Config,
    file_path: PathBuf,
    mut multipart: Multipart,
) -> ResponseResult<Json<ModEditResponse>> {
    tracing::info!("Mod upload initiated");
    let _guard = modpack_write_lock().lock().await;

    if !file_path.exists() {
        return Err(AppError::FileNotFound("No modpack file to edit".to_string()));
    }

    let mut mod_data: Option<(String, Vec<u8>)> = None;
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

        validate_mod_file_extension(&file_name)?;
        let sanitized_name = sanitize_filename(&file_name)?;
        let data = field
            .bytes()
            .await
            .map_err(|why| AppError::MultipartError(format!("Failed to read mod data: {why}")))?
            .to_vec();

        validate_file_size(data.len(), config)?;
        validate_jar_archive(&data)?;
        mod_data = Some((sanitized_name, data));
        break;
    }

    let (file_name, data) = mod_data
        .ok_or_else(|| AppError::BadRequest("No mod file provided in request".to_string()))?;
    let mod_path = add_override_mod_to_mrpack(file_path.clone(), file_name, data).await?;
    let modpack_info = extract_modpack_info(&file_path).await.ok();

    Ok(Json(ModEditResponse::builder()
        .success(true)
        .message("Mod added to modpack".to_string())
        .path(mod_path)
        .maybe_modpack_info(modpack_info)
        .build()))
}

async fn delete_modpack_at_path(file_path: PathBuf) -> ResponseResult<Json<ApiResponse>> {
    let _guard = modpack_write_lock().lock().await;
    if !file_path.exists() {
        return Err(AppError::FileNotFound("No modpack file to delete".to_string()));
    }
    fs::remove_file(&file_path).await.map_err(AppError::FileIo)?;
    Ok(Json(ApiResponse::success("Modpack deleted successfully")))
}

async fn remove_mod_from_path(
    config: &Config,
    instance_id: &str,
    payload: RemoveModRequest,
) -> ResponseResult<Json<ModEditResponse>> {
    let file_path = get_instance_mrpack_path(config, instance_id);
    let _guard = modpack_write_lock().lock().await;

    if !file_path.exists() {
        return Err(AppError::FileNotFound("No modpack file to edit".to_string()));
    }

    let target_path = normalize_archive_path(&payload.path)?;
    let removed_path = remove_mod_from_mrpack(file_path.clone(), target_path).await?;
    let modpack_info = extract_modpack_info(&file_path).await.ok();

    Ok(Json(ModEditResponse::builder()
        .success(true)
        .message("Mod removed from modpack".to_string())
        .path(removed_path)
        .maybe_modpack_info(modpack_info)
        .build()))
}

async fn ensure_instance_exists(config: &Config, instance_id: &str) -> ResponseResult<()> {
    let store = load_instance_store(config).await?;
    if store.instances.contains_key(instance_id) {
        Ok(())
    } else {
        Err(AppError::FileNotFound("Instance not found".to_string()))
    }
}

async fn require_instance_code(
    config: &Config,
    instance_id: &str,
    headers: &axum::http::HeaderMap,
) -> ResponseResult<()> {
    let code = headers
        .get("x-instance-code")
        .and_then(|value| value.to_str().ok())
        .map(normalize_code)
        .transpose()?
        .ok_or_else(|| AppError::Forbidden("Missing instance code".to_string()))?;

    let store = load_instance_store(config).await?;
    let Some(instance_code) = store.codes.get(&code) else {
        return Err(AppError::Forbidden("Invalid instance code".to_string()));
    };

    if instance_code.instance_id == instance_id && instance_code.active {
        Ok(())
    } else {
        Err(AppError::Forbidden("Invalid instance code".to_string()))
    }
}

fn instance_store_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

async fn load_instance_store(config: &Config) -> ResponseResult<InstanceStore> {
    let path = instance_store_path(config);
    if !path.exists() {
        return Ok(InstanceStore::default());
    }

    let contents = fs::read_to_string(path).await.map_err(AppError::FileIo)?;
    serde_json::from_str(&contents)
        .map_err(|why| AppError::Internal(format!("Invalid instance store: {why}")))
}

async fn save_instance_store(config: &Config, store: &InstanceStore) -> ResponseResult<()> {
    fs::create_dir_all(&config.storage.directory)
        .await
        .map_err(AppError::FileIo)?;
    let path = instance_store_path(config);
    let temp_path = path.with_extension("tmp");
    let data = serde_json::to_vec_pretty(store)
        .map_err(|why| AppError::Internal(format!("Failed to serialize instance store: {why}")))?;
    fs::write(&temp_path, data).await.map_err(AppError::FileIo)?;
    fs::rename(&temp_path, &path).await.map_err(AppError::FileIo)?;
    Ok(())
}

fn instance_store_path(config: &Config) -> PathBuf {
    config.storage.directory.join("instances.json")
}

fn get_instance_dir(config: &Config, instance_id: &str) -> PathBuf {
    config.storage.directory.join("instances").join(instance_id)
}

fn get_instance_mrpack_path(config: &Config, instance_id: &str) -> PathBuf {
    get_instance_dir(config, instance_id).join(MRPACK_FILENAME)
}

fn normalize_code(value: &str) -> ResponseResult<String> {
    let code = value.trim().replace('-', "").to_ascii_uppercase();
    if code.len() < 6 || !code.chars().all(|character| character.is_ascii_alphanumeric()) {
        return Err(AppError::BadRequest("Invalid code format".to_string()));
    }
    Ok(code)
}

fn generate_code() -> String {
    static COUNTER: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
    let counter = COUNTER
        .get_or_init(|| std::sync::atomic::AtomicU64::new(0))
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seed = nanos ^ ((std::process::id() as u128) << 32) ^ counter as u128;
    let alphabet = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut value = seed;
    let mut code = String::with_capacity(10);
    for _ in 0..10 {
        let index = (value % alphabet.len() as u128) as usize;
        code.push(alphabet[index] as char);
        value = value / alphabet.len() as u128 + 17;
    }
    code
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !output.is_empty() {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string().if_empty("instance")
}

trait EmptyStringFallback {
    fn if_empty(self, fallback: &str) -> String;
}

impl EmptyStringFallback for String {
    fn if_empty(self, fallback: &str) -> String {
        if self.is_empty() { fallback.to_string() } else { self }
    }
}
fn get_mrpack_path(config: &Config) -> PathBuf {
    config.storage.directory.join(MRPACK_FILENAME)
}

fn modpack_write_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
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

fn validate_mod_file_extension(filename: &str) -> ResponseResult<()> {
    if !filename.to_lowercase().ends_with(JAR_EXTENSION) {
        return Err(AppError::InvalidFileType {
            expected: JAR_EXTENSION.to_string(),
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
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(AppError::Validation(
            "Filename contains invalid characters".to_string(),
        ));
    }

    let name = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Validation("Invalid filename".to_string()))?;

    if name.len() > 255 {
        return Err(AppError::Validation("Filename too long".to_string()));
    }

    if name.is_empty() {
        return Err(AppError::Validation("Filename is empty".to_string()));
    }

    Ok(name.to_string())
}

fn validate_mrpack_archive(data: &[u8]) -> ResponseResult<()> {
    let reader = Cursor::new(data);
    let mut archive = ZipArchive::new(reader)
        .map_err(|why| AppError::Validation(format!("Invalid mrpack archive: {why}")))?;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|why| AppError::Validation(format!("Invalid archive entry: {why}")))?;
        validate_archive_path(entry.name())?;
    }

    let index = read_modrinth_index(&mut archive)
        .map_err(|why| AppError::Validation(format!("Invalid modrinth.index.json: {why}")))?;

    validate_modrinth_index(&index)
        .map_err(|why| AppError::Validation(format!("Invalid modrinth.index.json: {why}")))?;

    for file in &index.files {
        validate_archive_path(&file.path)?;
    }

    Ok(())
}

fn validate_modrinth_index(index: &ModrinthIndex) -> anyhow::Result<()> {
    if !index.game.eq_ignore_ascii_case("minecraft") {
        anyhow::bail!("game must be minecraft");
    }

    if index.name.trim().is_empty() || index.version_id.trim().is_empty() {
        anyhow::bail!("name and versionId must not be empty");
    }

    if index
        .dependencies
        .get("minecraft")
        .is_none_or(|version| version.trim().is_empty())
    {
        anyhow::bail!("minecraft dependency is missing");
    }

    for file in &index.files {
        if file.path.trim().is_empty() {
            anyhow::bail!("a mod entry has an empty path");
        }
        if file.downloads.iter().all(|url| url.trim().is_empty()) {
            anyhow::bail!("mod entry '{}' has no download URL", file.path);
        }
        if file
            .hashes
            .get("sha1")
            .is_none_or(|hash| hash.trim().is_empty())
        {
            anyhow::bail!("mod entry '{}' has no SHA-1 hash", file.path);
        }
    }

    Ok(())
}

fn validate_jar_archive(data: &[u8]) -> ResponseResult<()> {
    let reader = Cursor::new(data);
    ZipArchive::new(reader)
        .map_err(|why| AppError::Validation(format!("Invalid jar archive: {why}")))?;
    Ok(())
}

fn read_modrinth_index<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> anyhow::Result<ModrinthIndex> {
    let mut index_file = archive.by_name(MODRINTH_INDEX)?;
    let mut contents = String::new();
    index_file.read_to_string(&mut contents)?;
    Ok(serde_json::from_str(&contents)?)
}

fn normalize_archive_path(path: &str) -> ResponseResult<String> {
    let normalized = path.trim().replace('\\', "/");
    validate_archive_path(&normalized)?;
    Ok(normalized)
}

fn validate_archive_path(path: &str) -> ResponseResult<()> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::Validation(
            "Archive path is empty or invalid".to_string(),
        ));
    }

    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') || normalized.contains("//") {
        return Err(AppError::Validation("Archive path is unsafe".to_string()));
    }

    for part in normalized.trim_end_matches('/').split('/') {
        if part.is_empty() || part == "." || part == ".." || part.contains(':') {
            return Err(AppError::Validation(
                "Archive path contains unsafe segments".to_string(),
            ));
        }
    }

    Ok(())
}

fn is_override_mod_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    normalized.starts_with(&format!("{OVERRIDE_MODS_DIR}/"))
        && normalized.to_lowercase().ends_with(JAR_EXTENSION)
        && !normalized.ends_with('/')
}

async fn add_override_mod_to_mrpack(
    file_path: PathBuf,
    file_name: String,
    data: Vec<u8>,
) -> ResponseResult<String> {
    tokio::task::spawn_blocking(move || {
        let target_path = format!("{OVERRIDE_MODS_DIR}/{file_name}");
        rewrite_mrpack_archive(&file_path, Some((&target_path, &data)), None)?;
        Ok(target_path)
    })
    .await
    .map_err(|why| AppError::Internal(format!("Failed to edit modpack: {why}")))?
}

async fn remove_mod_from_mrpack(file_path: PathBuf, target_path: String) -> ResponseResult<String> {
    tokio::task::spawn_blocking(move || {
        rewrite_mrpack_archive(&file_path, None, Some(&target_path))?;
        Ok(target_path)
    })
    .await
    .map_err(|why| AppError::Internal(format!("Failed to edit modpack: {why}")))?
}

fn rewrite_mrpack_archive(
    file_path: &Path,
    add_file: Option<(&str, &[u8])>,
    remove_path: Option<&str>,
) -> ResponseResult<()> {
    let input = std::fs::File::open(file_path).map_err(AppError::FileIo)?;
    let mut archive = ZipArchive::new(input)
        .map_err(|why| AppError::Validation(format!("Invalid mrpack archive: {why}")))?;
    let mut modrinth_index = read_modrinth_index(&mut archive)
        .map_err(|why| AppError::Validation(format!("Invalid modrinth.index.json: {why}")))?;

    let temp_path = file_path.with_extension("tmp");
    let result = rewrite_mrpack_archive_inner(
        &mut archive,
        &mut modrinth_index,
        &temp_path,
        add_file,
        remove_path,
    );

    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }

    result?;
    std::fs::rename(&temp_path, file_path).map_err(AppError::FileIo)?;
    Ok(())
}

fn rewrite_mrpack_archive_inner<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    modrinth_index: &mut ModrinthIndex,
    temp_path: &Path,
    add_file: Option<(&str, &[u8])>,
    remove_path: Option<&str>,
) -> ResponseResult<()> {
    let remove_from_index = remove_path.is_some_and(|path| {
        let original_len = modrinth_index.files.len();
        modrinth_index.files.retain(|file| file.path != path);
        modrinth_index.files.len() != original_len
    });

    let temp_file = std::fs::File::create(temp_path).map_err(AppError::FileIo)?;
    let mut writer = ZipWriter::new(temp_file);
    let file_options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let directory_options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .unix_permissions(0o755);
    let mut removed_zip_entry = false;
    let mut replaced_added_file = false;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|why| AppError::Validation(format!("Invalid archive entry: {why}")))?;
        let entry_name = entry.name().to_string();
        validate_archive_path(&entry_name)?;

        if remove_path.is_some_and(|path| path == entry_name) {
            removed_zip_entry = true;
            continue;
        }

        if add_file.is_some_and(|(path, _)| path == entry_name) {
            replaced_added_file = true;
            continue;
        }

        if entry_name == MODRINTH_INDEX && remove_from_index {
            let index_json = serde_json::to_vec_pretty(modrinth_index).map_err(|why| {
                AppError::Internal(format!("Failed to serialize modrinth index: {why}"))
            })?;
            writer
                .start_file(MODRINTH_INDEX, file_options)
                .map_err(|why| {
                    AppError::FileIo(std::io::Error::new(std::io::ErrorKind::Other, why))
                })?;
            writer.write_all(&index_json).map_err(AppError::FileIo)?;
            continue;
        }

        if entry_name.ends_with('/') {
            writer
                .add_directory(entry_name, directory_options)
                .map_err(|why| {
                    AppError::FileIo(std::io::Error::new(std::io::ErrorKind::Other, why))
                })?;
            continue;
        }

        writer
            .start_file(entry_name, file_options)
            .map_err(|why| AppError::FileIo(std::io::Error::new(std::io::ErrorKind::Other, why)))?;
        std::io::copy(&mut entry, &mut writer).map_err(AppError::FileIo)?;
    }

    if let Some((path, data)) = add_file {
        validate_archive_path(path)?;
        writer
            .start_file(path, file_options)
            .map_err(|why| AppError::FileIo(std::io::Error::new(std::io::ErrorKind::Other, why)))?;
        writer.write_all(data).map_err(AppError::FileIo)?;
        tracing::info!(
            "Added mod override entry: {path}{}",
            if replaced_added_file {
                " (replaced existing entry)"
            } else {
                ""
            }
        );
    }

    if remove_path.is_some() && !remove_from_index && !removed_zip_entry {
        return Err(AppError::FileNotFound(
            "Mod path was not found in mrpack".to_string(),
        ));
    }

    writer
        .finish()
        .map_err(|why| AppError::FileIo(std::io::Error::new(std::io::ErrorKind::Other, why)))?;
    Ok(())
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
        assert_eq!(
            sanitize_filename("my-modpack.mrpack").unwrap(),
            "my-modpack.mrpack"
        );
    }

    #[test]
    fn test_sanitize_filename_path_traversal() {
        assert!(sanitize_filename("../test.mrpack").is_err());
        assert!(sanitize_filename("../../etc/passwd").is_err());
        assert!(sanitize_filename("/etc/passwd").is_err());
        assert!(sanitize_filename("test/../file.mrpack").is_err());
    }

    #[test]
    fn test_sanitize_filename_rejects_paths() {
        assert!(sanitize_filename("/path/to/file.mrpack").is_err());
        assert!(sanitize_filename("path/to/file.mrpack").is_err());
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
    fn test_validate_archive_path() {
        assert!(validate_archive_path("modrinth.index.json").is_ok());
        assert!(validate_archive_path("overrides/mods/example.jar").is_ok());
        assert!(validate_archive_path("../evil.jar").is_err());
        assert!(validate_archive_path("/absolute.jar").is_err());
        assert!(validate_archive_path("overrides//evil.jar").is_err());
        assert!(validate_archive_path("C:/evil.jar").is_err());
    }

    #[test]
    fn test_validate_modrinth_index_requires_minecraft() {
        let index = ModrinthIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "1.0.0".to_string(),
            name: "Pixel Client".to_string(),
            summary: None,
            files: Vec::new(),
            dependencies: HashMap::new(),
        };

        assert!(validate_modrinth_index(&index).is_err());
    }

    #[test]
    fn test_validate_modrinth_index_requires_sha1() {
        let index = ModrinthIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "1.0.0".to_string(),
            name: "Pixel Client".to_string(),
            summary: None,
            files: vec![ModFile {
                path: "mods/example.jar".to_string(),
                hashes: HashMap::new(),
                env: None,
                downloads: vec!["https://example.com/example.jar".to_string()],
                file_size: 1,
            }],
            dependencies: HashMap::from([("minecraft".to_string(), "1.21.1".to_string())]),
        };

        assert!(validate_modrinth_index(&index).is_err());
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
