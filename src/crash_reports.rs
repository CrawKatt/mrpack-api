use crate::auth::bearer_token;
use crate::config::Config;
use crate::error::{AppError, ResponseResult};
use crate::rate_limit::{client_ip_from_headers, crash_report_limiter};
use crate::sessions::atomic_write_json;
use axum::{
    Json,
    extract::{Path as AxumPath, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

const MAX_SUMMARY_LEN: usize = 240;
const MAX_FIELD_LEN: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportMeta {
    pub id: String,
    pub created_at: u64,
    pub username: Option<String>,
    pub launcher_version: Option<String>,
    pub os: Option<String>,
    pub instance_id: Option<String>,
    pub instance_name: Option<String>,
    pub kind: String,
    pub summary: String,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCrashReportRequest {
    pub log: String,
    pub username: Option<String>,
    pub launcher_version: Option<String>,
    pub os: Option<String>,
    pub instance_id: Option<String>,
    pub instance_name: Option<String>,
    pub kind: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportListResponse {
    pub reports: Vec<CrashReportMeta>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportDetail {
    #[serde(flatten)]
    pub meta: CrashReportMeta,
    pub log: String,
}

#[derive(Serialize)]
pub struct UploadCrashReportResponse {
    pub success: bool,
    pub message: String,
    pub id: String,
}

fn crash_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn crash_dir(config: &Config) -> PathBuf {
    config.storage.directory.join("crash-reports")
}

fn meta_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn log_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.log"))
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn clean_optional_field(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().chars().take(MAX_FIELD_LEN).collect::<String>())
        .filter(|v| !v.is_empty())
}

fn normalize_kind(kind: Option<String>) -> String {
    match kind
        .as_deref()
        .map(str::trim)
        .unwrap_or("manual")
        .to_ascii_lowercase()
        .as_str()
    {
        "minecraft_crash" | "minecraft" | "crash" => "minecraft_crash".to_string(),
        "launcher" => "launcher".to_string(),
        _ => "manual".to_string(),
    }
}

fn build_summary(log: &str) -> String {
    let line = log
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Empty crash report");
    line.chars().take(MAX_SUMMARY_LEN).collect()
}

fn sanitize_log(log: &str, max_bytes: usize) -> String {
    let mut out = String::with_capacity(log.len().min(max_bytes));
    for ch in log.chars() {
        if out.len() >= max_bytes {
            break;
        }
        if ch == '\n' || ch == '\r' || ch == '\t' || (!ch.is_control()) {
            out.push(ch);
        }
    }
    let redacted = out
        .lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.contains("accesstoken")
                || lower.contains("access_token")
                || lower.contains("refreshtoken")
                || lower.contains("refresh_token")
                || lower.contains("authorization:")
                || lower.contains("bearer ")
            {
                "[redacted sensitive line]"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    redacted
}

pub async fn upload_crash_report(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Json(payload): Json<UploadCrashReportRequest>,
) -> ResponseResult<Json<UploadCrashReportResponse>> {
    let _ = bearer_token(&headers);

    let ip = client_ip_from_headers(&headers, None);
    crash_report_limiter()
        .check(&ip)
        .map_err(AppError::TooManyRequests)?;

    let max = config.security.max_crash_report_bytes;
    if payload.log.is_empty() {
        return Err(AppError::BadRequest("Crash log is empty".to_string()));
    }
    if payload.log.len() > max {
        return Err(AppError::FileTooLarge {
            size: payload.log.len(),
            max,
        });
    }

    let log = sanitize_log(&payload.log, max);
    if log.trim().is_empty() {
        return Err(AppError::BadRequest("Crash log is empty after sanitization".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let meta = CrashReportMeta {
        id: id.clone(),
        created_at: now_unix(),
        username: clean_optional_field(payload.username),
        launcher_version: clean_optional_field(payload.launcher_version),
        os: clean_optional_field(payload.os),
        instance_id: clean_optional_field(payload.instance_id),
        instance_name: clean_optional_field(payload.instance_name),
        kind: normalize_kind(payload.kind),
        summary: build_summary(&log),
        size_bytes: log.len() as u64,
    };

    let _guard = crash_lock().lock().await;
    let dir = crash_dir(&config);
    fs::create_dir_all(&dir).await.map_err(AppError::FileIo)?;
    atomic_write_json(&meta_path(&dir, &id), &meta).await?;
    fs::write(log_path(&dir, &id), log.as_bytes())
        .await
        .map_err(AppError::FileIo)?;

    crash_report_limiter().record_hit(&ip);
    tracing::info!(
        "Crash report stored id={} kind={} size={}",
        id,
        meta.kind,
        meta.size_bytes
    );

    Ok(Json(UploadCrashReportResponse {
        success: true,
        message: "Crash report stored".to_string(),
        id,
    }))
}

pub async fn list_crash_reports(
    State(config): State<Arc<Config>>,
) -> ResponseResult<Json<CrashReportListResponse>> {
    let _guard = crash_lock().lock().await;
    let dir = crash_dir(&config);
    if !dir.exists() {
        return Ok(Json(CrashReportListResponse {
            reports: Vec::new(),
        }));
    }

    let mut reports = Vec::new();
    let mut entries = fs::read_dir(&dir).await.map_err(AppError::FileIo)?;
    while let Some(entry) = entries.next_entry().await.map_err(AppError::FileIo)? {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path).await.map_err(AppError::FileIo)?;
        if let Ok(meta) = serde_json::from_str::<CrashReportMeta>(&content) {
            reports.push(meta);
        }
    }

    reports.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(CrashReportListResponse { reports }))
}

pub async fn get_crash_report(
    State(config): State<Arc<Config>>,
    AxumPath(id): AxumPath<String>,
) -> ResponseResult<Json<CrashReportDetail>> {
    let id = sanitize_id(&id)?;
    let _guard = crash_lock().lock().await;
    let dir = crash_dir(&config);
    let meta_file = meta_path(&dir, &id);
    let log_file = log_path(&dir, &id);
    if !meta_file.exists() {
        return Err(AppError::FileNotFound("Crash report not found".to_string()));
    }

    let meta_content = fs::read_to_string(meta_file).await.map_err(AppError::FileIo)?;
    let meta: CrashReportMeta = serde_json::from_str(&meta_content)
        .map_err(|why| AppError::Internal(format!("Invalid crash report metadata: {why}")))?;
    let log = if log_file.exists() {
        fs::read_to_string(log_file).await.map_err(AppError::FileIo)?
    } else {
        String::new()
    };

    Ok(Json(CrashReportDetail { meta, log }))
}

pub async fn delete_crash_report(
    State(config): State<Arc<Config>>,
    AxumPath(id): AxumPath<String>,
) -> ResponseResult<Json<crate::handlers::ApiResponse>> {
    let id = sanitize_id(&id)?;
    let _guard = crash_lock().lock().await;
    let dir = crash_dir(&config);
    let meta_file = meta_path(&dir, &id);
    let log_file = log_path(&dir, &id);
    if !meta_file.exists() && !log_file.exists() {
        return Err(AppError::FileNotFound("Crash report not found".to_string()));
    }
    if meta_file.exists() {
        fs::remove_file(meta_file).await.map_err(AppError::FileIo)?;
    }
    if log_file.exists() {
        fs::remove_file(log_file).await.map_err(AppError::FileIo)?;
    }
    Ok(Json(crate::handlers::ApiResponse::success(
        "Crash report deleted",
    )))
}

fn sanitize_id(id: &str) -> Result<String, AppError> {
    let id = id.trim();
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::BadRequest("Invalid crash report id".to_string()));
    }
    Ok(id.to_string())
}
