use anyhow::{Context, Result};
use argon2::PasswordHash;
use serde::Deserialize;
use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub auth: AuthConfig,
    pub storage: StorageConfig,
    pub security: SecurityConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    pub username: String,
    pub password_hash: String,
    pub download_token_hash: Option<String>,
    pub maintenance_token_hash: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageConfig {
    pub directory: PathBuf,
    pub max_file_size_mb: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    pub require_https: bool,
    pub trust_proxy_headers: bool,
    pub allowed_origins: Option<Vec<String>>,
    pub max_crash_report_bytes: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let _ = dotenvy::dotenv();

        let server = ServerConfig {
            host: std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .context("SERVER_PORT must be a valid port number")?,
        };

        let username = std::env::var("ADMIN_USERNAME").context(
            "ADMIN_USERNAME environment variable is required. \
             Set it to your desired admin username.",
        )?;

        let password_hash_raw = std::env::var("ADMIN_PASSWORD_HASH").context(
            "ADMIN_PASSWORD_HASH environment variable is required.\n\
             \n\
             Steps to fix:\n\
             1. Generate a hash: cargo run --bin hash_password \"YourPassword123\"\n\
             2. Copy the ENTIRE hash output (starts with $argon2)\n\
             3. Add to .env: ADMIN_PASSWORD_HASH='$argon2id$v=19$...'\n\
             4. Use SINGLE QUOTES to prevent shell variable expansion!",
        )?;

        let password_hash = password_hash_raw
            .trim_matches('\'')
            .trim_matches('"')
            .to_string();

        if username.len() < 3 {
            anyhow::bail!("ADMIN_USERNAME must be at least 3 characters long");
        }

        if !password_hash.starts_with("$argon2") {
            anyhow::bail!(
                "ADMIN_PASSWORD_HASH is not a valid Argon2 hash.\n\
                 \n\
                 Current value starts with: {}\n\
                 Expected format: $argon2id$v=19$m=19456,t=2,p=1$...\n\
                 \n\
                 To fix:\n\
                 1. Run: cargo run --bin hash-password \"YourPassword\"\n\
                 2. Copy the complete hash (entire line after ADMIN_PASSWORD_HASH=)\n\
                 3. Update .env with the full hash\n\
                 4. Verify with: cargo run --bin verify-password",
                password_hash.chars().take(20).collect::<String>()
            );
        }

        if let Err(e) = PasswordHash::new(&password_hash) {
            anyhow::bail!(
                "ADMIN_PASSWORD_HASH has an invalid format: {e}\n\
                 \n\
                 The hash structure is malformed.\n\
                 Generate a new hash with: cargo run --bin hash-password \"YourPassword\"\n\
                 \n\
                 Common issues:\n\
                 - Hash was truncated when copying\n\
                 - Extra quotes around the hash in .env\n\
                 - Extra spaces or newlines in the hash"
            );
        }

        let auth = AuthConfig {
            username,
            password_hash,
            download_token_hash: read_optional_hash("DOWNLOAD_TOKEN_HASH")?,
            maintenance_token_hash: read_optional_hash("MAINTENANCE_TOKEN_HASH")?,
        };

        let storage = StorageConfig {
            directory: std::env::var("STORAGE_DIR")
                .unwrap_or_else(|_| "storage".to_string())
                .into(),
            max_file_size_mb: std::env::var("MAX_FILE_SIZE_MB")
                .unwrap_or_else(|_| "2048".to_string())
                .parse()
                .context("MAX_FILE_SIZE_MB must be a valid number")?,
        };

        let require_https = std::env::var("REQUIRE_HTTPS")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .context("REQUIRE_HTTPS must be true or false")?;

        let trust_proxy_headers = std::env::var("TRUST_PROXY_HEADERS")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .context("TRUST_PROXY_HEADERS must be true or false")?;

        let max_crash_report_bytes = std::env::var("MAX_CRASH_REPORT_BYTES")
            .unwrap_or_else(|_| (2 * 1024 * 1024).to_string())
            .parse()
            .context("MAX_CRASH_REPORT_BYTES must be a valid number")?;

        let allowed_origins = std::env::var("ALLOWED_ORIGINS")
            .ok()
            .map(|origins| origins.split(',').map(|s| s.trim().to_string()).collect());

        let security = SecurityConfig {
            require_https,
            trust_proxy_headers,
            allowed_origins,
            max_crash_report_bytes,
        };

        let config = Self {
            server,
            auth,
            storage,
            security,
        };

        config.validate()?;

        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        let is_production =
            std::env::var("RUST_ENV").unwrap_or_default().to_lowercase() == "production";

        if is_production {
            if !self.security.require_https {
                tracing::warn!(
                    "⚠️  SECURITY WARNING: REQUIRE_HTTPS is false in production. \
                     Credentials will be sent in plain text!"
                );
            }

            if self.security.allowed_origins.is_none() {
                tracing::warn!(
                    "⚠️  SECURITY WARNING: ALLOWED_ORIGINS is not set. \
                     Cross-origin browser access will be disabled."
                );
            }

            if self.security.trust_proxy_headers {
                tracing::warn!(
                    "⚠️  SECURITY WARNING: TRUST_PROXY_HEADERS is true. \
                     Only enable it when requests reach the API through a trusted reverse proxy \
                     that overwrites X-Forwarded-* headers."
                );
            }

            if self.auth.download_token_hash.is_none() {
                anyhow::bail!(
                    "DOWNLOAD_TOKEN_HASH is required in production. \
                     Generate one with: cargo run --bin hash_password \"LongRandomToken\""
                );
            }
        }

        if self.security.max_crash_report_bytes == 0
            || self.security.max_crash_report_bytes > 20 * 1024 * 1024
        {
            anyhow::bail!("MAX_CRASH_REPORT_BYTES must be between 1 and 20971520 (20MB)");
        }

        if self.storage.directory.as_os_str().is_empty() {
            anyhow::bail!("STORAGE_DIR cannot be empty");
        }

        if self.storage.max_file_size_mb == 0 || self.storage.max_file_size_mb > 10240 {
            anyhow::bail!("MAX_FILE_SIZE_MB must be between 1 and 10240 (10GB)");
        }

        if self.auth.username.len() < 4 {
            anyhow::bail!("USERNAME must be at least 4 characters long");
        }

        if self.auth.password_hash.len() < 64 {
            anyhow::bail!("PASSWORD_HASH must be at least 64 characters long");
        }

        Ok(())
    }

    pub fn socket_addr(&self) -> Result<SocketAddr> {
        let addr = format!("{}:{}", self.server.host, self.server.port);
        addr.parse()
            .context("Failed to parse socket address from host and port")
    }

    pub fn allow_all_origins(&self) -> bool {
        self.security
            .allowed_origins
            .as_ref()
            .is_some_and(|origins| origins.iter().any(|origin| origin == "*"))
    }
}

fn read_optional_hash(env_name: &str) -> Result<Option<String>> {
    let Some(raw_hash) = std::env::var(env_name).ok() else {
        return Ok(None);
    };

    let hash = raw_hash.trim_matches('\'').trim_matches('"').to_string();
    if hash.is_empty() {
        return Ok(None);
    }

    if !hash.starts_with("$argon2") {
        anyhow::bail!("{env_name} is not a valid Argon2 hash");
    }

    PasswordHash::new(&hash).with_context(|| format!("{env_name} has an invalid format"))?;

    Ok(Some(hash))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_socket_addr() {
        let config = Config {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 8080,
            },
            auth: AuthConfig {
                username: "admin".to_string(),
                password_hash: "$argon2id$v=19$m=19456,t=2,p=1$...".to_string(),
                download_token_hash: None,
                maintenance_token_hash: None,
            },
            storage: StorageConfig {
                directory: "storage".into(),
                max_file_size_mb: 500,
            },
            security: SecurityConfig {
                require_https: false,
                trust_proxy_headers: false,
                allowed_origins: None,
                max_crash_report_bytes: 2 * 1024 * 1024,
            },
        };

        let addr = config.socket_addr().unwrap();
        assert_eq!(addr.port(), 8080);
    }

    #[test]
    fn test_validate_username_length() {
        let config = Config {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 8080,
            },
            auth: AuthConfig {
                username: "ab".to_string(),
                password_hash: "$argon2id$v=19$m=19456,t=2,p=1$...".to_string(),
                download_token_hash: None,
                maintenance_token_hash: None,
            },
            storage: StorageConfig {
                directory: "storage".into(),
                max_file_size_mb: 500,
            },
            security: SecurityConfig {
                require_https: false,
                trust_proxy_headers: false,
                allowed_origins: None,
                max_crash_report_bytes: 2 * 1024 * 1024,
            },
        };

        let result = config.validate();
        assert!(result.is_err());
    }
}
