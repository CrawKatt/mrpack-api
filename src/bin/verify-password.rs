use argon2::{Argon2, PasswordHash, PasswordVerifier};
use std::io::{self, Write};

fn main() {
    println!("============================================================");
    println!("Password Verification Tool");
    println!("============================================================");
    println!();
    println!("This tool helps you verify if a password matches a hash.");
    println!();

    // Get hash from command line or prompt
    let hash_string = if let Some(arg) = std::env::args().nth(1) {
        arg
    } else {
        print!("Enter password hash from .env: ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .expect("Failed to read hash");

        input.trim().to_string()
    };

    // Validate hash format
    println!();
    println!("Step 1: Validating hash format...");
    
    if hash_string.is_empty() {
        eprintln!("ERROR: Hash cannot be empty");
        std::process::exit(1);
    }

    if !hash_string.starts_with("$argon2") {
        eprintln!("ERROR: Hash must start with $argon2");
        eprintln!("Your hash starts with: {}", &hash_string.chars().take(10).collect::<String>());
        eprintln!();
        eprintln!("Expected format: $argon2id$v=19$m=19456,t=2,p=1$...");
        std::process::exit(1);
    }

    let password_hash = match PasswordHash::new(&hash_string) {
        Ok(h) => {
            println!("   Hash format is VALID");
            println!("   Algorithm: {}", h.algorithm);
            h
        }
        Err(e) => {
            eprintln!();
            eprintln!("ERROR: Invalid hash format");
            eprintln!("Details: {}", e);
            eprintln!();
            eprintln!("Common issues:");
            eprintln!("  - Hash was truncated when copying");
            eprintln!("  - Extra quotes around the hash");
            eprintln!("  - Extra spaces or newlines");
            eprintln!();
            eprintln!("Generate a new hash with:");
            eprintln!("  cargo run --bin hash-password YourPassword");
            std::process::exit(1);
        }
    };

    println!();
    println!("Step 2: Testing password...");

    // Get password to verify
    print!("Enter password to test: ");
    io::stdout().flush().unwrap();

    let mut password = String::new();
    io::stdin()
        .read_line(&mut password)
        .expect("Failed to read password");

    let password = password.trim();

    if password.is_empty() {
        eprintln!("ERROR: Password cannot be empty");
        std::process::exit(1);
    }

    println!();
    println!("Verifying...");
    println!();

    // Verify password
    let argon2 = Argon2::default();
    match argon2.verify_password(password.as_bytes(), &password_hash) {
        Ok(_) => {
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
            std::process::exit(0);
        }
        Err(e) => {
            println!("============================================================");
            println!("FAILED: Password does NOT match the hash");
            println!("============================================================");
            println!();
            println!("Details: {:?}", e);
            println!();
            println!("This means:");
            println!("  - You entered the wrong password, OR");
            println!("  - The hash was generated for a different password");
            println!();
            println!("To fix:");
            println!("  1. Generate a new hash:");
            println!("     cargo run --bin hash-password YourPassword");
            println!();
            println!("  2. Copy the ENTIRE hash to .env");
            println!("     ADMIN_PASSWORD_HASH=$argon2id$...");
            println!();
            println!("  3. NO quotes, NO extra spaces!");
            println!();
            std::process::exit(1);
        }
    }
}