const API_CONFIG = {
    endpoints: {
        info: '/api/info',
        upload: '/api/upload',
        login: '/api/login'
    },
    adminPanelUrl: '/admin/'
};

const elements = {
    loginForm: null,
    usernameInput: null,
    passwordInput: null,
    passwordToggle: null,
    rememberMe: null,
    submitButton: null,
    alertContainer: null
};

class AuthManager {
    constructor() {
        this.sessionKey = 'mrpack_auth_session';
    }

    storeSessionToken(token, remember) {
        const storage = remember ? localStorage : sessionStorage;
        const other = remember ? sessionStorage : localStorage;
        storage.setItem(this.sessionKey, token);
        other.removeItem(this.sessionKey);
    }

    getToken() {
        return sessionStorage.getItem(this.sessionKey) || localStorage.getItem(this.sessionKey);
    }

    clearCredentials() {
        sessionStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionKey);
    }

    isAuthenticated() {
        return this.getToken() !== null;
    }

    async login(username, password, remember) {
        try {
            const response = await fetch(API_CONFIG.endpoints.login, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    remember: !!remember
                })
            });

            if (response.status === 429) {
                return { ok: false, rateLimited: true };
            }

            if (!response.ok) {
                console.error('Login request failed:', response.status);
                return { ok: false };
            }

            const data = await response.json();
            if (data.success === true && data.token) {
                return { ok: true, token: data.token, expiresAt: data.expiresAt };
            }
            return { ok: false };
        } catch (error) {
            console.error('Verification error:', error);
            return { ok: false };
        }
    }

    async validateSession(token) {
        try {
            const response = await fetch('/api/admin/main-pack', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    }
}

class RateLimiter {
    constructor() {
        this.storageKey = 'mrpack_login_attempts';
        this.maxAttempts = 5;
        this.lockoutDuration = 15 * 60 * 1000;
        this.baseDelay = 1000;
    }

    getAttemptData() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) {
            return { attempts: 0, lockedUntil: null, lastAttempt: null };
        }
        return JSON.parse(data);
    }

    saveAttemptData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

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

    recordFailedAttempt() {
        const data = this.getAttemptData();
        data.attempts += 1;
        data.lastAttempt = Date.now();

        if (data.attempts >= this.maxAttempts) {
            data.lockedUntil = Date.now() + this.lockoutDuration;
        }

        this.saveAttemptData(data);
        return data;
    }

    reset() {
        localStorage.removeItem(this.storageKey);
    }

    getDelay() {
        const data = this.getAttemptData();
        if (data.attempts === 0) return 0;
        return Math.min(this.baseDelay * Math.pow(2, data.attempts - 1), 30000);
    }

    getRemainingAttempts() {
        const data = this.getAttemptData();
        return Math.max(0, this.maxAttempts - data.attempts);
    }

    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
}

class UIManager {
    showAlert(message, type = 'error') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} show`;

        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        alert.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;

        elements.alertContainer.innerHTML = '';
        elements.alertContainer.appendChild(alert);

        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    }

    clearAlerts() {
        elements.alertContainer.innerHTML = '';
    }

    setButtonLoading(loading) {
        if (loading) {
            elements.submitButton.disabled = true;
            elements.submitButton.innerHTML = '<div class="spinner"></div><span>Verificando...</span>';
        } else {
            elements.submitButton.disabled = false;
            elements.submitButton.innerHTML = '🔐 Iniciar Sesión';
        }
    }

    togglePasswordVisibility() {
        const type = elements.passwordInput.type === 'password' ? 'text' : 'password';
        elements.passwordInput.type = type;

        const icon = type === 'password' ? '👁️' : '🙈';
        elements.passwordToggle.textContent = icon;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

class FormValidator {
    validate(username, password) {
        const errors = [];

        if (!username || username.trim().length === 0) {
            errors.push('El nombre de usuario es requerido');
        } else if (username.length < 3) {
            errors.push('El nombre de usuario debe tener al menos 3 caracteres');
        }

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

class LoginApp {
    constructor() {
        this.authManager = new AuthManager();
        this.uiManager = new UIManager();
        this.validator = new FormValidator();
        this.rateLimiter = new RateLimiter();

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.initializeElements();
        this.setupEventListeners();
        this.checkLockoutStatus();
        this.checkExistingSession();
    }

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

            setTimeout(() => {
                window.location.reload();
            }, lockout.remainingTime);
        }
    }

    initializeElements() {
        elements.loginForm = document.getElementById('loginForm');
        elements.usernameInput = document.getElementById('username');
        elements.passwordInput = document.getElementById('password');
        elements.passwordToggle = document.getElementById('passwordToggle');
        elements.rememberMe = document.getElementById('rememberMe');
        elements.submitButton = document.getElementById('submitButton');
        elements.alertContainer = document.getElementById('alertContainer');

        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`Element not found: ${key}`);
            }
        }
    }

    setupEventListeners() {
        elements.loginForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        elements.passwordToggle?.addEventListener('click', () => {
            this.uiManager.togglePasswordVisibility();
        });

        elements.usernameInput?.addEventListener('input', () => {
            this.uiManager.clearAlerts();
        });

        elements.passwordInput?.addEventListener('input', () => {
            this.uiManager.clearAlerts();
        });

        [elements.usernameInput, elements.passwordInput].forEach(input => {
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLogin();
                }
            });
        });
    }

    async checkExistingSession() {
        if (!this.authManager.isAuthenticated()) {
            return;
        }

        this.uiManager.showAlert('Verificando sesión existente...', 'info');
        this.uiManager.setButtonLoading(true);

        try {
            const token = this.authManager.getToken();
            const valid = await this.authManager.validateSession(token);

            if (valid) {
                this.uiManager.showAlert('Sesión válida, redirigiendo...', 'success');
                setTimeout(() => {
                    this.redirectToAdmin();
                }, 500);
            } else {
                this.authManager.clearCredentials();
                this.uiManager.clearAlerts();
                this.uiManager.setButtonLoading(false);
            }
        } catch (error) {
            console.error('Session validation error:', error);
            this.authManager.clearCredentials();
            this.uiManager.clearAlerts();
            this.uiManager.setButtonLoading(false);
        }
    }

    async handleLogin() {
        this.uiManager.clearAlerts();

        const lockout = this.rateLimiter.isLockedOut();
        if (lockout.locked) {
            const timeRemaining = this.rateLimiter.formatTime(lockout.remainingTime);
            this.uiManager.showAlert(
                `Cuenta bloqueada temporalmente. Intenta nuevamente en ${timeRemaining}`,
                'error'
            );
            return;
        }

        const username = elements.usernameInput.value.trim();
        const password = elements.passwordInput.value;
        const remember = elements.rememberMe.checked;

        const validation = this.validator.validate(username, password);
        if (!validation.valid) {
            this.uiManager.showAlert(validation.errors.join('. '), 'error');
            return;
        }

        const delay = this.rateLimiter.getDelay();
        if (delay > 0) {
            this.uiManager.showAlert(
                `Espera ${Math.ceil(delay / 1000)} segundos antes de intentar nuevamente`,
                'info'
            );
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.uiManager.setButtonLoading(true);

        try {
            const result = await this.authManager.login(username, password, remember);

            if (result.ok) {
                this.rateLimiter.reset();
                this.authManager.storeSessionToken(result.token, remember);
                this.uiManager.showAlert('¡Autenticación exitosa! Redirigiendo...', 'success');
                setTimeout(() => {
                    this.redirectToAdmin();
                }, 1000);
            } else {
                if (result.rateLimited) {
                    this.uiManager.showAlert(
                        'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
                        'error'
                    );
                    this.uiManager.setButtonLoading(false);
                    return;
                }

                const attemptData = this.rateLimiter.recordFailedAttempt();
                const remaining = this.rateLimiter.getRemainingAttempts();

                if (attemptData.lockedUntil) {
                    const lockoutTime = this.rateLimiter.formatTime(
                        attemptData.lockedUntil - Date.now()
                    );
                    this.uiManager.showAlert(
                        `Demasiados intentos fallidos. Cuenta bloqueada por ${lockoutTime}`,
                        'error'
                    );
                    elements.submitButton.disabled = true;

                    setTimeout(() => {
                        window.location.reload();
                    }, attemptData.lockedUntil - Date.now());
                } else if (remaining <= 2) {
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

    redirectToAdmin() {
        window.location.href = API_CONFIG.adminPanelUrl;
    }
}

new LoginApp();
