use anyhow::{Result, anyhow, bail};
use argon2::{Argon2, PasswordHash, PasswordVerifier as _};
use std::io::{self, Write as _};

fn main() -> Result<()> {
    print_header();
    let hash_string = std::env::args()
        .nth(1)
        .map_or_else(|| read_value("Enter password hash from .env: "), Ok)?;
    let password_hash = validate_hash(&hash_string)?;

    println!();
    println!("Step 2: Testing password...");
    let password = read_value("Enter password to test: ")?;
    if password.is_empty() {
        bail!("Password cannot be empty");
    }

    println!();
    println!("Verifying...");
    println!();

    match Argon2::default().verify_password(password.as_bytes(), &password_hash) {
        Ok(()) => print_success(),
        Err(why) => {
            print_failure(&why);
            bail!("Password does not match the hash");
        }
    }

    Ok(())
}

fn print_header() {
    println!("============================================================");
    println!("Password Verification Tool");
    println!("============================================================");
    println!();
    println!("This tool helps you verify if a password matches a hash.");
    println!();
}

fn validate_hash(hash: &str) -> Result<PasswordHash<'_>> {
    println!();
    println!("Step 1: Validating hash format...");

    if hash.is_empty() {
        bail!("Hash cannot be empty");
    }
    if !hash.starts_with("$argon2") {
        let prefix: String = hash.chars().take(10).collect();
        bail!(
            "Hash must start with $argon2 (received prefix: {prefix}). \
             Expected format: $argon2id$v=19$m=19456,t=2,p=1$..."
        );
    }

    let password_hash =
        PasswordHash::new(hash).map_err(|why| anyhow!("Invalid hash format: {why}"))?;
    println!("   Hash format is VALID");
    println!("   Algorithm: {}", password_hash.algorithm);
    Ok(password_hash)
}

fn read_value(prompt: &str) -> io::Result<String> {
    print!("{prompt}");
    io::stdout().flush()?;

    let mut value = String::new();
    io::stdin().read_line(&mut value)?;
    Ok(value.trim().to_string())
}

fn print_success() {
    println!("============================================================");
    println!("SUCCESS: Password matches the hash!");
    println!("============================================================");
    println!();
    println!("Your credentials are correct.");
    println!();
    println!("If authentication still fails in the API:");
    println!("  1. Make sure username in .env is correct");
    println!("  2. Check for extra spaces in .env file");
    println!("  3. Restart the server after changing .env");
    println!("  4. Try incognito mode in browser");
    println!();
}

fn print_failure(why: &argon2::password_hash::Error) {
    println!("============================================================");
    println!("FAILED: Password does NOT match the hash");
    println!("============================================================");
    println!();
    println!("Details: {why}");
    println!();
    println!("Generate a new hash with:");
    println!("  cargo run --bin hash_password YourPassword");
    println!();
    println!("Then copy the complete ADMIN_PASSWORD_HASH value to .env.");
    println!();
}
