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
    pub download_token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageConfig {
    pub directory: PathBuf,
    pub max_file_size_mb: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    pub require_https: bool,
    pub allowed_origins: Option<Vec<String>>,
}

impl Config {
    /// Load configuration from Shuttle SecretStore
    pub fn from_secrets(secrets: shuttle_runtime::SecretStore) -> Result<Self> {
        // Helper function to get secret from SecretStore
        let get_secret = |key: &str| -> Option<String> { secrets.get(key) };

        let server = ServerConfig {
            host: get_secret("SERVER_HOST").unwrap_or_else(|| "0.0.0.0".to_string()),
            port: get_secret("SERVER_PORT")
                .unwrap_or_else(|| "3000".to_string())
                .parse()
                .context("SERVER_PORT must be a valid port number")?,
        };

        let username = get_secret("ADMIN_USERNAME").context(
            "ADMIN_USERNAME is required. \n\
             Add it to Secrets.toml: ADMIN_USERNAME = \"your_username\"",
        )?;

        let password_hash_raw = get_secret("ADMIN_PASSWORD_HASH").context(
            "ADMIN_PASSWORD_HASH is required.\n\
             \n\
             Steps to fix:\n\
             1. Generate a hash: cargo run --bin hash_password \"YourPassword123\"\n\
             2. Add to Secrets.toml: ADMIN_PASSWORD_HASH = \"$argon2id$v=19$...\"\n\
             3. For production: shuttle project secrets set ADMIN_PASSWORD_HASH='$argon2id$...'",
        )?;

        // Remove surrounding quotes (single or double) to handle shell escaping
        let password_hash = password_hash_raw
            .trim_matches('\'')
            .trim_matches('"')
            .to_string();

        // Validate username
        if username.len() < 3 {
            anyhow::bail!("ADMIN_USERNAME must be at least 3 characters long");
        }

        // Validate password hash format (Argon2 starts with $argon2)
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
                &password_hash.chars().take(20).collect::<String>()
            );
        }

        // Additional validation: Try to parse the hash
        if let Err(e) = PasswordHash::new(&password_hash) {
            anyhow::bail!(
                "ADMIN_PASSWORD_HASH has an invalid format: {}\n\
                 \n\
                 The hash structure is malformed.\n\
                 Generate a new hash with: cargo run --bin hash-password \"YourPassword\"\n\
                 \n\
                 Common issues:\n\
                 - Hash was truncated when copying\n\
                 - Extra quotes around the hash in .env\n\
                 - Extra spaces or newlines in the hash",
                e
            );
        }

        let auth = AuthConfig {
            username,
            password_hash,
            download_token: get_secret("MRPACK_DOWNLOAD_TOKEN").context(
                "MRPACK_DOWNLOAD_TOKEN is required and must match the launcher configuration",
            )?,
        };

        let storage = StorageConfig {
            directory: get_secret("STORAGE_DIR")
                .unwrap_or_else(|| "storage".to_string())
                .into(),
            max_file_size_mb: get_secret("MAX_FILE_SIZE_MB")
                .unwrap_or_else(|| "500".to_string())
                .parse()
                .context("MAX_FILE_SIZE_MB must be a valid number")?,
        };

        let require_https = get_secret("REQUIRE_HTTPS")
            .unwrap_or_else(|| "false".to_string())
            .parse()
            .context("REQUIRE_HTTPS must be true or false")?;

        let allowed_origins = get_secret("ALLOWED_ORIGINS")
            .map(|origins| origins.split(',').map(|s| s.trim().to_string()).collect());

        let security = SecurityConfig {
            require_https,
            allowed_origins,
        };

        let config = Config {
            server,
            auth,
            storage,
            security,
        };

        // Validate configuration
        config.validate()?;

        Ok(config)
    }

    /// Validate the configuration for security issues
    fn validate(&self) -> Result<()> {
        // Check if running in production mode
        let is_production =
            std::env::var("RUST_ENV").unwrap_or_default().to_lowercase() == "production";

        if is_production {
            // In production, enforce security requirements
            if !self.security.require_https {
                tracing::warn!(
                    "⚠️  SECURITY WARNING: REQUIRE_HTTPS is false in production. \
                     Credentials will be sent in plain text!"
                );
            }

            if self.security.allowed_origins.is_none() {
                tracing::warn!(
                    "⚠️  SECURITY WARNING: ALLOWED_ORIGINS is not set. \
                     CORS will allow all origins!"
                );
            }
        }

        // Ensure storage directory is valid
        if self.storage.directory.as_os_str().is_empty() {
            anyhow::bail!("STORAGE_DIR cannot be empty");
        }

        // Validate max file size
        if self.storage.max_file_size_mb == 0 || self.storage.max_file_size_mb > 10240 {
            anyhow::bail!("MAX_FILE_SIZE_MB must be between 1 and 10240 (10GB)");
        }

        // Validate username length
        if self.auth.username.len() < 4 {
            anyhow::bail!("USERNAME must be at least 4 characters long");
        }

        // Validate password hash length
        if self.auth.password_hash.len() < 64 {
            anyhow::bail!("PASSWORD_HASH must be at least 64 characters long");
        }

        if self.auth.download_token.trim().len() < 32 {
            anyhow::bail!("MRPACK_DOWNLOAD_TOKEN must be at least 32 characters long");
        }

        Ok(())
    }

    /// Get the socket address for the server
    pub fn socket_addr(&self) -> Result<SocketAddr> {
        let addr = format!("{}:{}", self.server.host, self.server.port);
        addr.parse()
            .context("Failed to parse socket address from host and port")
    }

    /// Check if CORS should allow all origins
    pub fn allow_all_origins(&self) -> bool {
        self.security.allowed_origins.is_none()
    }
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
                download_token: "a".repeat(32),
            },
            storage: StorageConfig {
                directory: "storage".into(),
                max_file_size_mb: 500,
            },
            security: SecurityConfig {
                require_https: false,
                allowed_origins: None,
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
                username: "ab".to_string(), // Too short
                password_hash: "$argon2id$v=19$m=19456,t=2,p=1$...".to_string(),
                download_token: "a".repeat(32),
            },
            storage: StorageConfig {
                directory: "storage".into(),
                max_file_size_mb: 500,
            },
            security: SecurityConfig {
                require_https: false,
                allowed_origins: None,
            },
        };

        // This should fail due to short username
        let result = config.validate();
        assert!(result.is_err());
    }
}
