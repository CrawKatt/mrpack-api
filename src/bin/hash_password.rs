use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use argon2::password_hash::rand_core::OsRng;
use std::io::{self, Write};

fn main() {
    println!("============================================================");
    println!("Password Hash Generator (Argon2)");
    println!("============================================================");
    println!();

    // Get password from command line argument or prompt
    let password = if let Some(arg) = std::env::args().nth(1) {
        arg
    } else {
        // Prompt for password
        print!("Enter password: ");
        io::stdout().flush().unwrap();

        let mut password = String::new();
        io::stdin()
            .read_line(&mut password)
            .expect("Failed to read password");

        password.trim().to_string()
    };

    // Validate password
    if password.is_empty() {
        eprintln!("Error: Password cannot be empty");
        std::process::exit(1);
    }

    if password.len() < 8 {
        eprintln!("Warning: Password is shorter than 8 characters");
        eprintln!("Consider using a stronger password for production");
        println!();
    }

    // Generate salt
    let salt = SaltString::generate(&mut OsRng);

    // Hash the password
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("Failed to hash password");

    // Output the hash
    println!("Password hash generated successfully!");
    println!();
    println!("Add this to your .env file:");
    println!("------------------------------------------------------------");
    println!("ADMIN_PASSWORD_HASH={}", password_hash);
    println!("------------------------------------------------------------");
    println!();
    println!("Or set it as an environment variable:");
    println!("  export ADMIN_PASSWORD_HASH=\"{}\"", password_hash);
    println!();
    println!("Keep this hash secure and never commit it to version control!");
    println!();
}