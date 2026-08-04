use anyhow::{Context, Result};
use axum::http::Uri;
use cloudflare_r2_rs::r2::{R2Endpoint, R2Manager};
use std::fmt;
use std::sync::Arc;
use tokio::sync::OnceCell;

const REGION: &str = "auto";

/// Configuration and small adapter for the Cloudflare R2 client.
///
/// `R2Manager` is initialized lazily because its constructor is asynchronous,
/// while the rest of the application loads configuration synchronously.
#[derive(Clone)]
pub struct R2Store {
    endpoint: String,
    bucket: String,
    access_key_id: String,
    secret_access_key: String,
    prefix: String,
    manager: Arc<OnceCell<R2Manager>>,
}

impl fmt::Debug for R2Store {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("R2Store")
            .field("endpoint", &self.endpoint)
            .field("bucket", &self.bucket)
            .field("prefix", &self.prefix)
            .field("access_key_id", &"[REDACTED]")
            .field("secret_access_key", &"[REDACTED]")
            .field("manager", &"[lazy]")
            .finish()
    }
}

impl R2Store {
    pub fn from_env(enabled: bool) -> Result<Option<Self>> {
        if !enabled {
            return Ok(None);
        }

        let endpoint = optional_env("R2_ENDPOINT")
            .or_else(|| {
                optional_env("R2_ACCOUNT_ID")
                    .map(|id| format!("https://{id}.r2.cloudflarestorage.com"))
            })
            .context("R2_ENDPOINT or R2_ACCOUNT_ID is required when R2_ENABLED=true")?;
        let endpoint = endpoint.trim_end_matches('/');
        let endpoint_uri = Uri::try_from(endpoint).context("R2_ENDPOINT must be a valid URL")?;
        if endpoint_uri.scheme_str() != Some("https") {
            anyhow::bail!("R2_ENDPOINT must use HTTPS");
        }
        let has_unexpected_path = !matches!(endpoint_uri.path(), "" | "/");
        if endpoint_uri.authority().is_none() || has_unexpected_path {
            anyhow::bail!("R2_ENDPOINT must contain only the R2 host, without a path");
        }
        if endpoint_uri
            .path_and_query()
            .is_some_and(|path_and_query| path_and_query.query().is_some())
        {
            anyhow::bail!("R2_ENDPOINT must not contain a query string or fragment");
        }

        let bucket = required_env("R2_BUCKET")?;
        let access_key_id = required_env("R2_ACCESS_KEY_ID")?;
        let secret_access_key = required_env("R2_SECRET_ACCESS_KEY")?;
        let prefix = optional_env("R2_PREFIX").unwrap_or_default();
        validate_prefix(&prefix)?;

        Ok(Some(Self {
            endpoint: endpoint.to_owned(),
            bucket,
            access_key_id,
            secret_access_key,
            prefix: prefix.trim_matches('/').to_owned(),
            manager: Arc::new(OnceCell::new()),
        }))
    }

    pub async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let object_key = self.object_key(key)?;
        Ok(self.manager().await.get(&object_key).await)
    }

    pub async fn put(&self, key: &str, data: &[u8]) -> Result<()> {
        let object_key = self.object_key(key)?;
        self.manager()
            .await
            .upload(&object_key, data, None, Some("application/octet-stream"))
            .await;
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<()> {
        let object_key = self.object_key(key)?;
        self.manager().await.delete(&object_key).await;
        Ok(())
    }

    pub async fn exists(&self, key: &str) -> Result<bool> {
        Ok(self.get(key).await?.is_some())
    }

    async fn manager(&self) -> &R2Manager {
        self.manager
            .get_or_init(|| async {
                R2Manager::new(
                    &self.bucket,
                    R2Endpoint::Http(self.endpoint.clone()),
                    &self.access_key_id,
                    &self.secret_access_key,
                    Some(REGION.to_owned()),
                )
                .await
            })
            .await
    }

    fn object_key(&self, key: &str) -> Result<String> {
        let key = key.trim_matches('/');
        if key.is_empty() || key.contains('\0') || key.split('/').any(|part| part == "..") {
            anyhow::bail!("Invalid R2 object key");
        }
        if self.prefix.is_empty() {
            Ok(key.to_owned())
        } else {
            Ok(format!("{}/{}", self.prefix, key))
        }
    }
}

fn validate_prefix(prefix: &str) -> Result<()> {
    if prefix.contains('\0') || prefix.split('/').any(|part| part == "..") {
        anyhow::bail!("R2_PREFIX contains an unsafe path segment");
    }
    Ok(())
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn required_env(name: &str) -> Result<String> {
    optional_env(name).with_context(|| format!("{name} is required when R2_ENABLED=true"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with_prefix(prefix: &str) -> R2Store {
        R2Store {
            endpoint: "https://example.r2.cloudflarestorage.com".to_owned(),
            bucket: "bucket".to_owned(),
            access_key_id: "access".to_owned(),
            secret_access_key: "secret".to_owned(),
            prefix: prefix.to_owned(),
            manager: Arc::new(OnceCell::new()),
        }
    }

    #[test]
    fn prefixes_object_keys_without_allowing_parent_segments() {
        let store = store_with_prefix("mrpacks");
        assert_eq!(
            store.object_key("instances/id/modpack.mrpack").unwrap(),
            "mrpacks/instances/id/modpack.mrpack"
        );
        assert!(store.object_key("../modpack.mrpack").is_err());
    }

    #[test]
    fn allows_keys_without_a_prefix() {
        let store = store_with_prefix("");
        assert_eq!(
            store.object_key("main/modpack.mrpack").unwrap(),
            "main/modpack.mrpack"
        );
    }
}
