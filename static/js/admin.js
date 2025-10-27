/**
 * Mrpack API - Admin Panel JavaScript
 * 
 * Handles all client-side functionality for the admin panel including:
 * - File uploads with drag & drop
 * - API communication
 * - UI updates and notifications
 * - Form validation
 */

// ============================================================================
// Configuration
// ============================================================================

const API_CONFIG = {
    baseUrl: '/api',
    endpoints: {
        health: '/api/health',
        info: '/api/info',
        download: '/api/download',
        upload: '/api/upload',
        delete: '/api/delete'
    },
    maxFileSize: 500 * 1024 * 1024, // 500 MB default
    allowedExtensions: ['.mrpack'],
    uploadTimeout: 600000, // 10 minutes
    loginUrl: '/login.html'
};

// ============================================================================
// Authentication Manager
// ============================================================================

class AuthManager {
    constructor() {
        this.sessionKey = 'mrpack_auth_session';
    }

    /**
     * Get stored credentials
     */
    getCredentials() {
        return sessionStorage.getItem(this.sessionKey) || 
               localStorage.getItem(this.sessionKey);
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.getCredentials() !== null;
    }

    /**
     * Redirect to login page
     */
    redirectToLogin() {
        window.location.href = API_CONFIG.loginUrl;
    }

    /**
     * Clear credentials and logout
     */
    logout() {
        sessionStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionKey);
        this.redirectToLogin();
    }

    /**
     * Get authorization header
     */
    getAuthHeader() {
        const credentials = this.getCredentials();
        return credentials ? { 'Authorization': `Basic ${credentials}` } : {};
    }
}

// ============================================================================
// API Client
// ============================================================================

class ApiClient {
    constructor(baseUrl, authManager) {
        this.baseUrl = baseUrl;
        this.authManager = authManager;
    }

    /**
     * Make an API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    ...options.headers,
                    ...this.authManager.getAuthHeader()
                }
            });

            // Handle non-JSON responses (like file downloads)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                
                if (!response.ok) {
                    // Handle authentication errors
                    if (response.status === 401) {
                        this.authManager.logout();
                        return;
                    }
                    throw new Error(data.error || `HTTP error ${response.status}`);
                }
                
                return data;
            }

            if (!response.ok) {
                // Handle authentication errors
                if (response.status === 401) {
                    this.authManager.logout();
                    return;
                }
                throw new Error(`HTTP error ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    /**
     * Get health status
     */
    async getHealth() {
        return this.request(API_CONFIG.endpoints.health);
    }

    /**
     * Get modpack information
     */
    async getInfo() {
        return this.request(API_CONFIG.endpoints.info);
    }

    /**
     * Upload a modpack file
     * @param {File} file - File to upload
     * @param {Function} onProgress - Progress callback
     */
    async uploadFile(file, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Progress tracking
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }

            // Success handler
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    try {
                        const error = JSON.parse(xhr.responseText);
                        reject(new Error(error.error || `Upload failed: ${xhr.status}`));
                    } catch (e) {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                }
            });

            // Error handler
            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });

            // Timeout handler
            xhr.addEventListener('timeout', () => {
                reject(new Error('Upload timeout'));
            });

            xhr.timeout = API_CONFIG.uploadTimeout;
            xhr.open('POST', API_CONFIG.endpoints.upload);
            
            // Set authorization header
            const authHeader = this.authManager.getAuthHeader();
            if (authHeader.Authorization) {
                xhr.setRequestHeader('Authorization', authHeader.Authorization);
            }
            
            xhr.send(formData);
        });
    }

    /**
     * Delete the current modpack
     */
    async deleteFile() {
        return this.request(API_CONFIG.endpoints.delete, {
            method: 'DELETE'
        });
    }
}

// ============================================================================
// UI Manager
// ============================================================================

class UIManager {
    constructor() {
        this.elements = {
            fileStatus: document.getElementById('fileStatus'),
            fileName: document.getElementById('fileName'),
            fileSize: document.getElementById('fileSize'),
            refreshBtn: document.getElementById('refreshBtn'),
            deleteBtn: document.getElementById('deleteBtn'),
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            selectedFile: document.getElementById('selectedFile'),
            selectedFileName: document.getElementById('selectedFileName'),
            uploadBtn: document.getElementById('uploadBtn'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            alertContainer: document.getElementById('alertContainer'),
            modpackDetails: document.getElementById('modpackDetails'),
            modpackName: document.getElementById('modpackName'),
            modpackVersion: document.getElementById("modpackVersion"),
            formatVersion: document.getElementById('formatVersion'),
            minecraftVersion: document.getElementById('minecraftVersion'),
            modLoader: document.getElementById('modLoader'),
            loaderVersion: document.getElementById('loaderVersion'),
            modCount: document.getElementById('modCount'),
            modList: document.getElementById('modList')
        };
    }

    /**
     * Show loading indicator
     */
    showLoading(show = true) {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.toggle('show', show);
        }
    }

    /**
     * Show alert message
     * @param {string} message - Alert message
     * @param {string} type - Alert type (success, error, info)
     * @param {number} duration - Duration in milliseconds
     */
    showAlert(message, type = 'info', duration = 5000) {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} show`;

        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        alert.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;

        this.elements.alertContainer.appendChild(alert);

        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }

    /**
     * Update file information display
     * @param {Object} info - File information
     */
    updateFileInfo(info) {
        if (info.available) {
            this.elements.fileStatus.textContent = 'Available';
            this.elements.fileStatus.className = 'status-badge status-available';
            this.elements.fileName.textContent = info.file_name;
            this.elements.fileSize.textContent = this.formatBytes(info.file_size);
            this.elements.deleteBtn.disabled = false;

            // Mostrar detalles del modpack si están disponibles
            if (info.modpack_info) {
                this.updateModpackDetails(info.modpack_info);
                this.elements.modpackDetails.style.display = 'block';
            } else {
                this.elements.modpackDetails.style.display = 'none';
            }
        } else {
            this.elements.fileStatus.textContent = 'Not available';
            this.elements.fileStatus.className = 'status-badge status-unavailable';
            this.elements.fileName.textContent = '-';
            this.elements.fileSize.textContent = '-';
            this.elements.deleteBtn.disabled = true;
            this.elements.modpackDetails.style.display = 'none';
        }
    }

    /**
     * Update modpack details display
     * @param {Object} modpackInfo - Modpack information
     */
    updateModpackDetails(modpackInfo) {
        this.elements.modpackName.textContent = modpackInfo.name || '-';
        this.elements.modpackVersion.textContent = modpackInfo.version_id || '-';        // Nueva
        this.elements.formatVersion.textContent = modpackInfo.format_version || '-';     // Nueva
        this.elements.minecraftVersion.textContent = modpackInfo.minecraft_version || '-';
        this.elements.modLoader.textContent = modpackInfo.loader || '-';
        this.elements.loaderVersion.textContent = modpackInfo.loader_version || '-';
        this.elements.modCount.textContent = modpackInfo.mod_count || '0';

        // Actualizar lista de mods
        this.elements.modList.innerHTML = '';

        if (modpackInfo.mods && modpackInfo.mods.length > 0) {
            modpackInfo.mods.forEach(mod => {
                const modItem = document.createElement('div');
                modItem.className = 'mod-item';
                modItem.innerHTML = `
                    <span class="mod-name">${this.escapeHtml(mod.name)}</span>
                    <span class="mod-env">${this.escapeHtml(mod.environment)}</span>
                    <span class="mod-size">${(mod.file_size / 1024).toFixed(1)} KB</span>
                `;
                this.elements.modList.appendChild(modItem);
            });
        } else {
            this.elements.modList.innerHTML = '<p>No mods information available</p>';
        }
    }

    /**
     * Update selected file display
     * @param {File|null} file - Selected file
     */
    updateSelectedFile(file) {
        if (file) {
            this.elements.selectedFileName.textContent =
                `${file.name} (${this.formatBytes(file.size)})`;
            this.elements.selectedFile.classList.add('show');
            this.elements.uploadBtn.disabled = false;
        } else {
            this.elements.selectedFile.classList.remove('show');
            this.elements.uploadBtn.disabled = true;
        }
    }

    /**
     * Set button loading state
     * @param {HTMLElement} button - Button element
     * @param {boolean} loading - Loading state
     * @param {string} text - Button text
     */
    setButtonLoading(button, loading, text = '') {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = '<div class="spinner"></div> ' + (text || 'Loading...');
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || text;
        }
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Bytes to format
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================================================
// File Validator
// ============================================================================

class FileValidator {
    /**
     * Validate file before upload
     * @param {File} file - File to validate
     * @returns {Object} Validation result
     */
    static validate(file) {
        const errors = [];

        // Check if file exists
        if (!file) {
            errors.push('No file selected');
            return { valid: false, errors };
        }

        // Check file extension
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        if (!API_CONFIG.allowedExtensions.includes(extension)) {
            errors.push(`Invalid file type. Only ${API_CONFIG.allowedExtensions.join(', ')} files are allowed`);
        }

        // Check file size
        if (file.size > API_CONFIG.maxFileSize) {
            const maxSizeMB = API_CONFIG.maxFileSize / (1024 * 1024);
            errors.push(`File size exceeds maximum allowed size of ${maxSizeMB} MB`);
        }

        // Check if file is empty
        if (file.size === 0) {
            errors.push('File is empty');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// ============================================================================
// Admin Panel Application
// ============================================================================

class AdminPanel {
    constructor() {
        this.authManager = new AuthManager();
        this.api = new ApiClient(API_CONFIG.baseUrl, this.authManager);
        this.ui = new UIManager();
        this.selectedFile = null;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Check authentication first
        if (!this.authManager.isAuthenticated()) {
            this.authManager.redirectToLogin();
            return;
        }
        
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.loadInfo();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Refresh button
        this.ui.elements.refreshBtn?.addEventListener('click', () => {
            this.loadInfo();
        });

        // Delete button
        this.ui.elements.deleteBtn?.addEventListener('click', () => {
            this.handleDelete();
        });

        // File input
        this.ui.elements.fileInput?.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Upload button
        this.ui.elements.uploadBtn?.addEventListener('click', () => {
            this.handleUpload();
        });

        // Upload area click
        this.ui.elements.uploadArea?.addEventListener('click', () => {
            this.ui.elements.fileInput?.click();
        });

        // Remove file button
        document.querySelector('.remove-file')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearFileSelection();
        });

        // Logout button
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
                this.authManager.logout();
            }
        });
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        const uploadArea = this.ui.elements.uploadArea;
        if (!uploadArea) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight drop area
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.remove('drag-over');
            });
        });

        // Handle dropped files
        uploadArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });
    }

    /**
     * Load modpack information
     */
    async loadInfo() {
        this.ui.showLoading(true);
        
        try {
            const info = await this.api.getInfo();
            this.ui.updateFileInfo(info);
        } catch (error) {
            console.error('Failed to load info:', error);
            this.ui.showAlert('Failed to load modpack information', 'error');
        } finally {
            this.ui.showLoading(false);
        }
    }

    /**
     * Handle file selection
     * @param {File} file - Selected file
     */
    handleFileSelect(file) {
        if (!file) return;

        // Validate file
        const validation = FileValidator.validate(file);
        if (!validation.valid) {
            this.ui.showAlert(validation.errors.join('. '), 'error');
            this.clearFileSelection();
            return;
        }

        // Update UI
        this.selectedFile = file;
        this.ui.updateSelectedFile(file);
    }

    /**
     * Clear file selection
     */
    clearFileSelection() {
        this.selectedFile = null;
        this.ui.elements.fileInput.value = '';
        this.ui.updateSelectedFile(null);
    }

    /**
     * Handle file upload
     */
    async handleUpload() {
        if (!this.selectedFile) {
            this.ui.showAlert('Please select a file first', 'error');
            return;
        }

        const uploadBtn = this.ui.elements.uploadBtn;
        this.ui.setButtonLoading(uploadBtn, true, 'Uploading...');

        try {
            const response = await this.api.uploadFile(this.selectedFile, (progress) => {
                // Optional: Update progress UI
                console.log(`Upload progress: ${progress.toFixed(2)}%`);
            });

            this.ui.showAlert(
                `File uploaded successfully: ${response.file_name} (${response.file_size_mb.toFixed(2)} MB)`,
                'success'
            );
            
            this.clearFileSelection();
            await this.loadInfo();
        } catch (error) {
            console.error('Upload failed:', error);
            this.ui.showAlert(error.message || 'Failed to upload file', 'error');
        } finally {
            this.ui.setButtonLoading(uploadBtn, false, '⬆️ Upload File');
        }
    }

    /**
     * Handle file deletion
     */
    async handleDelete() {
        if (!confirm('Are you sure you want to delete the current modpack?')) {
            return;
        }

        const deleteBtn = this.ui.elements.deleteBtn;
        this.ui.setButtonLoading(deleteBtn, true, 'Deleting...');

        try {
            await this.api.deleteFile();
            this.ui.showAlert('Modpack deleted successfully', 'success');
            await this.loadInfo();
        } catch (error) {
            console.error('Delete failed:', error);
            this.ui.showAlert(error.message || 'Failed to delete file', 'error');
        } finally {
            this.ui.setButtonLoading(deleteBtn, false, '🗑️ Delete');
        }
    }
}

// ============================================================================
// Application Entry Point
// ============================================================================

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AdminPanel();
    });
} else {
    new AdminPanel();
}