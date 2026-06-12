/**
 * Mrpack API - Login Page JavaScript
 * 
 * Handles authentication and redirects to admin panel
 */

// ============================================================================
// Configuration
// ============================================================================

const API_CONFIG = {
    endpoints: {
        info: '/api/info',
        upload: '/api/upload',
        login: '/api/login'
    },
    adminPanelUrl: '/admin.html'
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    loginForm: null,
    usernameInput: null,
    passwordInput: null,
    passwordToggle: null,
    rememberMe: null,
    submitButton: null,
    alertContainer: null
};

// ============================================================================
// Authentication Manager
// ============================================================================

class AuthManager {
    constructor() {
        this.sessionKey = 'mrpack_auth_session';
    }

    /**
     * Store authentication credentials in session
     */
    storeCredentials(username, password, remember) {
        const credentials = btoa(`${username}:${password}`);
        sessionStorage.setItem(this.sessionKey, credentials);
        localStorage.removeItem(this.sessionKey);
    }

    /**
     * Get stored credentials
     */
    getCredentials() {
        return sessionStorage.getItem(this.sessionKey);
    }

    /**
     * Clear stored credentials
     */
    clearCredentials() {
        sessionStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionKey);
    }

    /**
     * Check if user is already authenticated
     */
    isAuthenticated() {
        return this.getCredentials() !== null;
    }

    /**
     * Verify credentials with the API
     */
    async verifyCredentials(username, password) {
        try {
            // Use dedicated login endpoint (no Basic Auth, no browser dialog)
            const response = await fetch(API_CONFIG.endpoints.login, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            if (!response.ok) {
                console.error('Login request failed:', response.status);
                return false;
            }

            const data = await response.json();
            return data.success === true;
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }
}

// ============================================================================
// Rate Limiter (Protection against brute force attacks)
// ============================================================================

class RateLimiter {
    constructor() {
        this.storageKey = 'mrpack_login_attempts';
        this.maxAttempts = 5;
        this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
        this.baseDelay = 1000; // 1 second base delay
    }

    /**
     * Get current attempt data
     */
    getAttemptData() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) {
            return { attempts: 0, lockedUntil: null, lastAttempt: null };
        }
        return JSON.parse(data);
    }

    /**
     * Save attempt data
     */
    saveAttemptData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    /**
     * Check if currently locked out
     */
    isLockedOut() {
        const data = this.getAttemptData();
        if (data.lockedUntil && Date.now() < data.lockedUntil) {
            return {
                locked: true,
                remainingTime: data.lockedUntil - Date.now()
            };
        }
        return { locked: false };
    }

    /**
     * Record a failed attempt
     */
    recordFailedAttempt() {
        const data = this.getAttemptData();
        data.attempts += 1;
        data.lastAttempt = Date.now();

        // Lock account after max attempts
        if (data.attempts >= this.maxAttempts) {
            data.lockedUntil = Date.now() + this.lockoutDuration;
        }

        this.saveAttemptData(data);
        return data;
    }

    /**
     * Reset attempts after successful login
     */
    reset() {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Get delay before next attempt (exponential backoff)
     */
    getDelay() {
        const data = this.getAttemptData();
        if (data.attempts === 0) return 0;
        
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
        return Math.min(this.baseDelay * Math.pow(2, data.attempts - 1), 30000);
    }

    /**
     * Get remaining attempts before lockout
     */
    getRemainingAttempts() {
        const data = this.getAttemptData();
        return Math.max(0, this.maxAttempts - data.attempts);
    }

    /**
     * Format time remaining
     */
    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
}

// ============================================================================
// UI Manager
// ============================================================================

class UIManager {
    /**
     * Show alert message
     */
    showAlert(message, type = 'error') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} show`;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        alert.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
        
        elements.alertContainer.innerHTML = '';
        elements.alertContainer.appendChild(alert);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    }

    /**
     * Clear all alerts
     */
    clearAlerts() {
        elements.alertContainer.innerHTML = '';
    }

    /**
     * Set loading state on button
     */
    setButtonLoading(loading) {
        if (loading) {
            elements.submitButton.disabled = true;
            elements.submitButton.innerHTML = '<div class="spinner"></div><span>Verificando...</span>';
        } else {
            elements.submitButton.disabled = false;
            elements.submitButton.innerHTML = '🔐 Iniciar Sesión';
        }
    }

    /**
     * Toggle password visibility
     */
    togglePasswordVisibility() {
        const type = elements.passwordInput.type === 'password' ? 'text' : 'password';
        elements.passwordInput.type = type;
        
        const icon = type === 'password' ? '👁️' : '🙈';
        elements.passwordToggle.textContent = icon;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================================================
// Form Validator
// ============================================================================

class FormValidator {
    /**
     * Validate login form
     */
    validate(username, password) {
        const errors = [];

        // Username validation
        if (!username || username.trim().length === 0) {
            errors.push('El nombre de usuario es requerido');
        } else if (username.length < 3) {
            errors.push('El nombre de usuario debe tener al menos 3 caracteres');
        }

        // Password validation
        if (!password || password.length === 0) {
            errors.push('La contraseña es requerida');
        } else if (password.length < 8) {
            errors.push('La contraseña debe tener al menos 8 caracteres');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// ============================================================================
// Login Application
// ============================================================================

class LoginApp {
    constructor() {
        this.authManager = new AuthManager();
        this.uiManager = new UIManager();
        this.validator = new FormValidator();
        this.rateLimiter = new RateLimiter();
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    /**
     * Setup the application
     */
    setup() {
        this.initializeElements();
        this.setupEventListeners();
        this.checkLockoutStatus();
        this.checkExistingSession();
    }

    /**
     * Check if user is locked out
     */
    checkLockoutStatus() {
        const lockout = this.rateLimiter.isLockedOut();
        
        if (lockout.locked) {
            const timeRemaining = this.rateLimiter.formatTime(lockout.remainingTime);
            this.uiManager.showAlert(
                `Demasiados intentos fallidos. Intenta nuevamente en ${timeRemaining}`,
                'error'
            );
            this.uiManager.setButtonLoading(false);
            elements.submitButton.disabled = true;
            
            // Re-check after the lockout expires
            setTimeout(() => {
                window.location.reload();
            }, lockout.remainingTime);
        }
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        elements.loginForm = document.getElementById('loginForm');
        elements.usernameInput = document.getElementById('username');
        elements.passwordInput = document.getElementById('password');
        elements.passwordToggle = document.getElementById('passwordToggle');
        elements.rememberMe = document.getElementById('rememberMe');
        elements.submitButton = document.getElementById('submitButton');
        elements.alertContainer = document.getElementById('alertContainer');

        // Verify all elements exist
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`Element not found: ${key}`);
            }
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Form submission
        elements.loginForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Password toggle
        elements.passwordToggle?.addEventListener('click', () => {
            this.uiManager.togglePasswordVisibility();
        });

        // Clear error on input
        elements.usernameInput?.addEventListener('input', () => {
            this.uiManager.clearAlerts();
        });

        elements.passwordInput?.addEventListener('input', () => {
            this.uiManager.clearAlerts();
        });

        // Enter key on inputs
        [elements.usernameInput, elements.passwordInput].forEach(input => {
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLogin();
                }
            });
        });
    }

    /**
     * Check if user already has a valid session
     */
    async checkExistingSession() {
        if (this.authManager.isAuthenticated()) {
            // Show verifying message
            this.uiManager.showAlert('Verificando sesión existente...', 'info');
            this.uiManager.setButtonLoading(true);
            
            // Try to verify the stored credentials are still valid
            const credentials = this.authManager.getCredentials();
            
            // Decode and verify
            try {
                const decoded = atob(credentials);
                const [username, password] = decoded.split(':');
                
                const valid = await this.authManager.verifyCredentials(username, password);
                
                if (valid) {
                    this.uiManager.showAlert('Sesión válida, redirigiendo...', 'success');
                    setTimeout(() => {
                        this.redirectToAdmin();
                    }, 500);
                } else {
                    // Invalid credentials, clear them
                    this.authManager.clearCredentials();
                    this.uiManager.clearAlerts();
                    this.uiManager.setButtonLoading(false);
                }
            } catch (error) {
                // Invalid stored credentials
                console.error('Session validation error:', error);
                this.authManager.clearCredentials();
                this.uiManager.clearAlerts();
                this.uiManager.setButtonLoading(false);
            }
        }
    }

    /**
     * Handle login form submission
     */
    async handleLogin() {
        this.uiManager.clearAlerts();

        // Check if locked out
        const lockout = this.rateLimiter.isLockedOut();
        if (lockout.locked) {
            const timeRemaining = this.rateLimiter.formatTime(lockout.remainingTime);
            this.uiManager.showAlert(
                `Cuenta bloqueada temporalmente. Intenta nuevamente en ${timeRemaining}`,
                'error'
            );
            return;
        }

        // Get form values
        const username = elements.usernameInput.value.trim();
        const password = elements.passwordInput.value;
        const remember = elements.rememberMe.checked;

        // Validate
        const validation = this.validator.validate(username, password);
        if (!validation.valid) {
            this.uiManager.showAlert(validation.errors.join('. '), 'error');
            return;
        }

        // Apply delay before attempting (rate limiting)
        const delay = this.rateLimiter.getDelay();
        if (delay > 0) {
            this.uiManager.showAlert(
                `Espera ${Math.ceil(delay / 1000)} segundos antes de intentar nuevamente`,
                'info'
            );
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Show loading state
        this.uiManager.setButtonLoading(true);

        try {
            // Verify credentials
            const isValid = await this.authManager.verifyCredentials(username, password);

            if (isValid) {
                // Reset rate limiting on successful login
                this.rateLimiter.reset();
                
                // Store credentials
                this.authManager.storeCredentials(username, password, remember);
                
                // Show success message
                this.uiManager.showAlert('¡Autenticación exitosa! Redirigiendo...', 'success');
                
                // Redirect after short delay
                setTimeout(() => {
                    this.redirectToAdmin();
                }, 1000);
            } else {
                // Record failed attempt
                const attemptData = this.rateLimiter.recordFailedAttempt();
                const remaining = this.rateLimiter.getRemainingAttempts();
                
                // Check if now locked out
                if (attemptData.lockedUntil) {
                    const lockoutTime = this.rateLimiter.formatTime(
                        attemptData.lockedUntil - Date.now()
                    );
                    this.uiManager.showAlert(
                        `Demasiados intentos fallidos. Cuenta bloqueada por ${lockoutTime}`,
                        'error'
                    );
                    elements.submitButton.disabled = true;
                    
                    // Reload page after lockout expires
                    setTimeout(() => {
                        window.location.reload();
                    }, attemptData.lockedUntil - Date.now());
                } else if (remaining <= 2) {
                    // Warn user when close to lockout
                    this.uiManager.showAlert(
                        `Credenciales incorrectas. ${remaining} intentos restantes antes del bloqueo`,
                        'error'
                    );
                } else {
                    this.uiManager.showAlert('Credenciales incorrectas', 'error');
                }
                
                this.uiManager.setButtonLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.uiManager.showAlert('Error de conexión. Intenta nuevamente', 'error');
            this.uiManager.setButtonLoading(false);
        }
    }

    /**
     * Redirect to admin panel
     */
    redirectToAdmin() {
        window.location.href = API_CONFIG.adminPanelUrl;
    }
}

// ============================================================================
// Application Entry Point
// ============================================================================

// Initialize application
new LoginApp();
