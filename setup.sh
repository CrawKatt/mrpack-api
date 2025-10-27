#!/bin/bash

# Mrpack API - Interactive Setup Script
# This script helps you set up the API with secure configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main setup
main() {
    print_header "Mrpack API - Interactive Setup"

    echo "This script will help you:"
    echo "  1. Verify prerequisites"
    echo "  2. Build the project"
    echo "  3. Generate secure password hash"
    echo "  4. Create .env configuration"
    echo "  5. Verify everything works"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 1
    fi
    echo ""

    # Step 1: Check prerequisites
    print_header "Step 1: Checking Prerequisites"

    if command_exists rustc; then
        RUST_VERSION=$(rustc --version | cut -d' ' -f2)
        print_success "Rust installed: $RUST_VERSION"
    else
        print_error "Rust is not installed"
        echo "Install Rust from: https://rustup.rs/"
        exit 1
    fi

    if command_exists cargo; then
        CARGO_VERSION=$(cargo --version | cut -d' ' -f2)
        print_success "Cargo installed: $CARGO_VERSION"
    else
        print_error "Cargo is not installed"
        exit 1
    fi

    echo ""

    # Step 2: Build the project
    print_header "Step 2: Building the Project"

    echo "Building in release mode (this may take a few minutes)..."
    if cargo build --release --quiet; then
        print_success "Project built successfully"
    else
        print_error "Build failed"
        echo "Run 'cargo build --release' manually to see errors"
        exit 1
    fi

    # Build utilities
    echo ""
    echo "Building password utilities..."
    if cargo build --release --bin hash_password --quiet && \
       cargo build --release --bin verify-password --quiet; then
        print_success "Utilities built successfully"
    else
        print_error "Failed to build utilities"
        exit 1
    fi

    echo ""

    # Step 3: Generate credentials
    print_header "Step 3: Setting Up Admin Credentials"

    echo "You need to create an admin account."
    echo ""

    # Get username
    while true; do
        read -p "Enter admin username (min 3 chars): " ADMIN_USER
        if [ ${#ADMIN_USER} -ge 3 ]; then
            break
        else
            print_error "Username must be at least 3 characters"
        fi
    done

    print_success "Username: $ADMIN_USER"
    echo ""

    # Get password
    while true; do
        read -s -p "Enter admin password (min 8 chars): " ADMIN_PASS
        echo ""

        if [ ${#ADMIN_PASS} -lt 8 ]; then
            print_error "Password must be at least 8 characters"
            continue
        fi

        read -s -p "Confirm password: " ADMIN_PASS_CONFIRM
        echo ""

        if [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
            print_error "Passwords don't match"
            continue
        fi

        break
    done

    print_success "Password set"
    echo ""

    # Generate hash
    echo "Generating secure password hash..."
    ADMIN_HASH=$(echo "$ADMIN_PASS" | ./target/release/hash_password 2>/dev/null | grep "ADMIN_PASSWORD_HASH=" | cut -d'=' -f2-)

    if [ -z "$ADMIN_HASH" ]; then
        print_error "Failed to generate password hash"
        echo "Try running manually: cargo run --bin hash_password"
        exit 1
    fi

    print_success "Password hash generated"
    echo ""

    # Step 4: Create .env file
    print_header "Step 4: Creating Configuration File"

    if [ -f .env ]; then
        print_warning ".env file already exists"
        read -p "Overwrite it? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env file"
            print_info "You can manually update it with the generated credentials"
            echo ""
            echo "Username: $ADMIN_USER"
            echo "Hash: $ADMIN_HASH"
            echo ""
            exit 0
        fi
        mv .env .env.backup
        print_info "Backup created: .env.backup"
    fi

    # Get optional configuration
    echo "Optional configuration (press Enter for defaults):"
    echo ""

    read -p "Server host [0.0.0.0]: " SERVER_HOST
    SERVER_HOST=${SERVER_HOST:-0.0.0.0}

    read -p "Server port [3000]: " SERVER_PORT
    SERVER_PORT=${SERVER_PORT:-3000}

    read -p "Storage directory [storage]: " STORAGE_DIR
    STORAGE_DIR=${STORAGE_DIR:-storage}

    read -p "Max file size in MB [500]: " MAX_FILE_SIZE
    MAX_FILE_SIZE=${MAX_FILE_SIZE:-500}

    read -p "Is this for production? (y/n) [n]: " -n 1 -r PROD_ENV
    echo ""
    if [[ $PROD_ENV =~ ^[Yy]$ ]]; then
        RUST_ENV="production"
        REQUIRE_HTTPS="true"
        RUST_LOG="info"

        read -p "Enter allowed CORS origins (comma-separated, e.g., https://example.com): " ALLOWED_ORIGINS
    else
        RUST_ENV="development"
        REQUIRE_HTTPS="false"
        RUST_LOG="debug"
        ALLOWED_ORIGINS=""
    fi

    echo ""

    # Write .env file
    cat > .env << EOF
# ============================================================================
# Mrpack API Configuration
# ============================================================================
# Generated: $(date)
# DO NOT commit this file to version control!
# ============================================================================

# Admin Authentication (REQUIRED)
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD_HASH=$ADMIN_HASH

# Server Configuration
SERVER_HOST=$SERVER_HOST
SERVER_PORT=$SERVER_PORT

# Storage Configuration
STORAGE_DIR=$STORAGE_DIR
MAX_FILE_SIZE_MB=$MAX_FILE_SIZE

# Security Configuration
REQUIRE_HTTPS=$REQUIRE_HTTPS
ALLOWED_ORIGINS=$ALLOWED_ORIGINS

# Environment
RUST_ENV=$RUST_ENV
RUST_LOG=$RUST_LOG
EOF

    # Set secure permissions
    chmod 600 .env
    print_success ".env file created with secure permissions (600)"

    # Create storage directory
    if [ ! -d "$STORAGE_DIR" ]; then
        mkdir -p "$STORAGE_DIR"
        print_success "Storage directory created: $STORAGE_DIR"
    fi

    echo ""

    # Step 5: Verify configuration
    print_header "Step 5: Verifying Configuration"

    echo "Testing password hash..."
    echo "$ADMIN_PASS" | ./target/release/verify-password "$ADMIN_HASH" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        print_success "Password hash verified successfully"
    else
        print_error "Password verification failed"
        echo "This shouldn't happen. Check the hash manually."
    fi

    echo ""

    # Final instructions
    print_header "Setup Complete!"

    print_success "Configuration file created: .env"
    print_success "Admin username: $ADMIN_USER"
    print_success "Password: [hidden]"
    echo ""

    echo "Next steps:"
    echo ""
    echo "  1. Start the server:"
    echo "     ${GREEN}./target/release/mrpack_api${NC}"
    echo ""
    echo "  2. Or with cargo:"
    echo "     ${GREEN}cargo run --release${NC}"
    echo ""
    echo "  3. Access the admin panel:"
    echo "     ${GREEN}http://localhost:$SERVER_PORT/admin.html${NC}"
    echo ""
    echo "  4. API endpoints:"
    echo "     - Health: ${GREEN}http://localhost:$SERVER_PORT/api/health${NC}"
    echo "     - Info:   ${GREEN}http://localhost:$SERVER_PORT/api/info${NC}"
    echo "     - Download: ${GREEN}http://localhost:$SERVER_PORT/api/download${NC}"
    echo ""

    if [[ $RUST_ENV == "production" ]]; then
        print_warning "Production mode enabled"
        echo ""
        echo "Important for production:"
        echo "  - Use a reverse proxy (nginx) with SSL/TLS"
        echo "  - Configure firewall rules"
        echo "  - Set up regular backups"
        echo "  - Review SECURITY.md for best practices"
        echo ""
    fi

    print_info "Configuration saved in .env (never commit this file!)"
    print_info "Read SETUP.md for detailed deployment instructions"
    echo ""

    read -p "Start the server now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        print_header "Starting Mrpack API Server"
        echo ""
        ./target/release/mrpack_api
    else
        echo ""
        print_success "Setup complete! Start the server whenever you're ready."
        echo ""
    fi
}

# Run main
main
