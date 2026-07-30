use crate::error::AppError;
use argon2::password_hash::rand_core::{OsRng, RngCore as _};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const SESSION_TTL_SHORT_SECS: u64 = 12 * 60 * 60;
const SESSION_TTL_REMEMBER_SECS: u64 = 7 * 24 * 60 * 60;
const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    username: String,
    created_at: u64,
    expires_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SessionStore {
    sessions: HashMap<String, StoredSession>,
}

#[derive(Clone)]
pub struct SessionManager {
    path: PathBuf,
    lock: Arc<Mutex<()>>,
}

impl SessionManager {
    pub fn new(storage_dir: impl Into<PathBuf>) -> Self {
        let storage_dir = storage_dir.into();
        Self {
            path: storage_dir.join("sessions.json"),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn create_session(
        &self,
        username: &str,
        remember: bool,
    ) -> Result<(String, u64), AppError> {
        let _guard = self.lock.lock().await;
        let mut store = self.load().await?;
        Self::purge_expired(&mut store);

        let raw_token = generate_token();
        let token_hash = hash_token(&raw_token);
        let now = now_unix();
        let ttl = if remember {
            SESSION_TTL_REMEMBER_SECS
        } else {
            SESSION_TTL_SHORT_SECS
        };
        let expires_at = now + ttl;

        store.sessions.insert(
            token_hash.clone(),
            StoredSession {
                username: username.to_string(),
                created_at: now,
                expires_at,
            },
        );
        self.save(&store).await?;
        Ok((raw_token, expires_at))
    }

    pub async fn validate_session(&self, token: &str) -> Result<Option<String>, AppError> {
        let token = token.trim();
        if token.is_empty() {
            return Ok(None);
        }

        let _guard = self.lock.lock().await;
        let mut store = self.load().await?;
        let token_hash = hash_token(token);
        let now = now_unix();

        let Some(session) = store.sessions.get(&token_hash) else {
            return Ok(None);
        };

        if session.expires_at <= now {
            store.sessions.remove(&token_hash);
            self.save(&store).await?;
            return Ok(None);
        }

        Ok(Some(session.username.clone()))
    }

    pub async fn revoke_session(&self, token: &str) -> Result<bool, AppError> {
        let token = token.trim();
        if token.is_empty() {
            return Ok(false);
        }

        let _guard = self.lock.lock().await;
        let mut store = self.load().await?;
        let removed = store.sessions.remove(&hash_token(token)).is_some();
        if removed {
            self.save(&store).await?;
        }
        Ok(removed)
    }

    async fn load(&self) -> Result<SessionStore, AppError> {
        if !self.path.exists() {
            return Ok(SessionStore::default());
        }
        let content = tokio::fs::read_to_string(&self.path)
            .await
            .map_err(AppError::FileIo)?;
        serde_json::from_str(&content)
            .map_err(|why| AppError::Internal(format!("Invalid session store: {why}")))
    }

    async fn save(&self, store: &SessionStore) -> Result<(), AppError> {
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::FileIo)?;
        }
        atomic_write_json(&self.path, store).await
    }

    fn purge_expired(store: &mut SessionStore) {
        let now = now_unix();
        store.sessions.retain(|_, session| session.expires_at > now);
    }
}

pub fn global_sessions(storage_dir: &Path) -> &'static SessionManager {
    static SESSIONS: OnceLock<SessionManager> = OnceLock::new();
    SESSIONS.get_or_init(|| SessionManager::new(storage_dir.to_path_buf()))
}

pub fn generate_token() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash_secret(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    hex::encode(digest)
}

fn hash_token(token: &str) -> String {
    hash_secret(token)
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

pub async fn atomic_write_json<T>(path: &Path, value: &T) -> Result<(), AppError>
where
    T: Serialize + Sync,
{
    let data = serde_json::to_vec_pretty(value)
        .map_err(|why| AppError::Internal(format!("Failed to serialize store: {why}")))?;
    let temp = path.with_extension("tmp");
    tokio::fs::write(&temp, &data)
        .await
        .map_err(AppError::FileIo)?;
    tokio::fs::rename(&temp, path)
        .await
        .map_err(AppError::FileIo)?;
    Ok(())
}
