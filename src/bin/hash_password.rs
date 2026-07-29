use anyhow::{Result, anyhow, bail};
use argon2::password_hash::rand_core::OsRng;
use argon2::{
    Argon2,
    password_hash::{PasswordHasher as _, SaltString},
};
use std::io::{self, Write as _};

fn main() -> Result<()> {
    println!("============================================================");
    println!("Password Hash Generator (Argon2)");
    println!("============================================================");
    println!();

    let password = std::env::args()
        .nth(1)
        .map_or_else(|| read_value("Enter password: "), Ok)?;

    if password.is_empty() {
        bail!("Password cannot be empty");
    }

    if password.len() < 8 {
        eprintln!("Warning: Password is shorter than 8 characters");
        eprintln!("Consider using a stronger password for production");
        println!();
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|why| anyhow!("Failed to hash password: {why}"))?;

    println!("Password hash generated successfully!");
    println!();
    println!("Add this to your .env file:");
    println!("------------------------------------------------------------");
    println!("ADMIN_PASSWORD_HASH={password_hash}");
    println!("------------------------------------------------------------");
    println!();
    println!("Or set it as an environment variable:");
    println!("  export ADMIN_PASSWORD_HASH=\"{password_hash}\"");
    println!();
    println!("Keep this hash secure and never commit it to version control!");
    println!();
    Ok(())
}

fn read_value(prompt: &str) -> io::Result<String> {
    print!("{prompt}");
    io::stdout().flush()?;

    let mut value = String::new();
    io::stdin().read_line(&mut value)?;
    Ok(value.trim().to_string())
}
