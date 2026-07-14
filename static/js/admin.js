const API_CONFIG = {
    endpoints: {
        health: '/api/health',
        info: '/api/info',
        download: '/api/download',
        upload: '/api/upload',
        delete: '/api/delete',
        mods: '/api/mods',
        instances: '/api/admin/instances',
        maintenanceStatus: '/api/maintenance/status',
        maintenanceToggle: '/api/admin/maintenance/toggle',
        maintenanceConfig: '/api/admin/maintenance/config',
        maintenanceWhitelist: '/api/admin/maintenance/whitelist',
    },
    maxFileSize: 500 * 1024 * 1024,
    allowedExtensions: ['.mrpack'],
    allowedModExtensions: ['.jar'],
    allowedMediaExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.bmp', '.ico', '.tif', '.tiff', '.mp4', '.webm', '.mov', '.m4v', '.ogv'],
    allowedMediaMimePrefixes: ['image/', 'video/'],
    uploadTimeout: 600000,
    loginUrl: '/login.html',
    adminNickStorageKey: 'mrpack_admin_minecraft_nick',
};

class AuthManager {
    constructor() {
        this.sessionKey = 'mrpack_auth_session';
    }

    getCredentials() {
        return sessionStorage.getItem(this.sessionKey);
    }

    isAuthenticated() {
        return this.getCredentials() !== null;
    }

    redirectToLogin() {
        window.location.href = API_CONFIG.loginUrl;
    }

    logout() {
        sessionStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionKey);
        this.redirectToLogin();
    }

    getAuthHeader() {
        const credentials = this.getCredentials();
        return credentials ? { Authorization: `Basic ${credentials}` } : {};
    }
}

class ApiClient {
    constructor(authManager) {
        this.authManager = authManager;
    }

    async request(endpoint, options = {}) {
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                ...options.headers,
                ...this.authManager.getAuthHeader()
            }
        });

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await response.json() : null;

        if (!response.ok) {
            if (response.status === 401) {
                this.authManager.logout();
                return null;
            }
            throw new Error(data?.error || data?.message || `HTTP error ${response.status}`);
        }

        return data ?? response;
    }

    async getInfo() {
        return this.request(API_CONFIG.endpoints.info);
    }

    async listInstances() {
        return this.request(API_CONFIG.endpoints.instances);
    }

    async createInstance(name, iconUrl = null, backgroundUrl = null) {
        return this.request(API_CONFIG.endpoints.instances, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, iconUrl, backgroundUrl })
        });
    }

    async generateInstanceCode(instanceId, maxUses = 1) {
        return this.request(`${API_CONFIG.endpoints.instances}/${encodeURIComponent(instanceId)}/codes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxUses })
        });
    }

    async deleteInstance(instanceId) {
        return this.request(`${API_CONFIG.endpoints.instances}/${encodeURIComponent(instanceId)}`, {
            method: 'DELETE'
        });
    }

    async uploadInstanceModpack(instanceId, file, onProgress = null) {
        return this.uploadMultipart(
            `${API_CONFIG.endpoints.instances}/${encodeURIComponent(instanceId)}/upload`,
            file,
            onProgress,
        );
    }

    async uploadInstanceMedia(instanceId, slot, file, onProgress = null) {
        return this.uploadMultipart(
            `${API_CONFIG.endpoints.instances}/${encodeURIComponent(instanceId)}/media/${encodeURIComponent(slot)}`,
            file,
            onProgress,
        );
    }

    async addInstanceMod(instanceId, file, onProgress = null) {
        return this.uploadMultipart(
            `${API_CONFIG.endpoints.instances}/${encodeURIComponent(instanceId)}/mods`,
            file,
            onProgress,
        );
    }

    async uploadFile(file, onProgress = null) {
        return this.uploadMultipart(API_CONFIG.endpoints.upload, file, onProgress);
    }

    async addModFile(file, onProgress = null) {
        return this.uploadMultipart(API_CONFIG.endpoints.mods, file, onProgress);
    }

    async uploadMultipart(endpoint, file, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
                });
            }
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { reject(new Error('Invalid JSON response')); }
                    return;
                }
                if (xhr.status === 401) {
                    this.authManager.logout();
                    return;
                }
                try {
                    const error = JSON.parse(xhr.responseText);
                    reject(new Error(error.error || `Upload failed: ${xhr.status}`));
                } catch {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('timeout', () => reject(new Error('Upload timeout')));
            xhr.timeout = API_CONFIG.uploadTimeout;
            xhr.open('POST', endpoint);
            const authHeader = this.authManager.getAuthHeader();
            if (authHeader.Authorization) xhr.setRequestHeader('Authorization', authHeader.Authorization);
            xhr.send(formData);
        });
    }

    async deleteFile() {
        return this.request(API_CONFIG.endpoints.delete, { method: 'DELETE' });
    }

    async removeMod(path) {
        return this.request(API_CONFIG.endpoints.mods, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
    }

    async downloadFile() {
        const response = await this.request(API_CONFIG.endpoints.download);
        if (!response) return;
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'modpack.mrpack';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }
}

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
            downloadBtn: document.getElementById('downloadBtn'),
            modUploadArea: document.getElementById('modUploadArea'),
            modFileInput: document.getElementById('modFileInput'),
            selectedModFile: document.getElementById('selectedModFile'),
            selectedModFileName: document.getElementById('selectedModFileName'),
            addModBtn: document.getElementById('addModBtn'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            alertContainer: document.getElementById('alertContainer'),
            modpackDetails: document.getElementById('modpackDetails'),
            modpackName: document.getElementById('modpackName'),
            modpackVersion: document.getElementById('modpackVersion'),
            formatVersion: document.getElementById('formatVersion'),
            minecraftVersion: document.getElementById('minecraftVersion'),
            modLoader: document.getElementById('modLoader'),
            loaderVersion: document.getElementById('loaderVersion'),
            modCount: document.getElementById('modCount'),
            modList: document.getElementById('modList'),
            instanceNameInput: document.getElementById('instanceNameInput'),
            createInstanceBtn: document.getElementById('createInstanceBtn'),
            instanceIconUrlInput: document.getElementById('instanceIconUrlInput'),
            instanceBackgroundUrlInput: document.getElementById('instanceBackgroundUrlInput'),
            instancesList: document.getElementById('instancesList')
        };
    }

    showLoading(show = true) {
        this.elements.loadingIndicator?.classList.toggle('show', show);
    }

    showAlert(message, type = 'info', duration = 5000) {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} show`;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        alert.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
        this.elements.alertContainer?.appendChild(alert);
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }

    updateFileInfo(info) {
        const available = info?.available === true;
        this.elements.fileStatus.textContent = available ? 'Available' : 'Not available';
        this.elements.fileStatus.className = `status-badge ${available ? 'status-available' : 'status-unavailable'}`;
        this.elements.fileName.textContent = available ? info.file_name : '-';
        this.elements.fileSize.textContent = available ? this.formatBytes(info.file_size) : '-';
        this.elements.deleteBtn.disabled = !available;
        if (this.elements.downloadBtn) this.elements.downloadBtn.disabled = !available;
        if (this.elements.addModBtn) this.elements.addModBtn.disabled = !available || !this.elements.selectedModFileName?.textContent;

        if (available && info.modpack_info) {
            this.updateModpackDetails(info.modpack_info);
            this.elements.modpackDetails.style.display = 'block';
        } else {
            this.elements.modpackDetails.style.display = 'none';
        }
    }

    updateModpackDetails(modpackInfo) {
        this.elements.modpackName.textContent = modpackInfo.name || '-';
        this.elements.modpackVersion.textContent = modpackInfo.version_id || '-';
        this.elements.formatVersion.textContent = modpackInfo.format_version || '-';
        this.elements.minecraftVersion.textContent = modpackInfo.minecraft_version || '-';
        this.elements.modLoader.textContent = modpackInfo.loader || '-';
        this.elements.loaderVersion.textContent = modpackInfo.loader_version || '-';
        this.elements.modCount.textContent = modpackInfo.mod_count || '0';
        this.elements.modList.innerHTML = '';

        if (!modpackInfo.mods?.length) {
            this.elements.modList.innerHTML = '<p>No mods information available</p>';
            return;
        }

        modpackInfo.mods.forEach((mod) => {
            const modItem = document.createElement('div');
            modItem.className = 'mod-item';
            modItem.innerHTML = `
                <span class="mod-name" title="${this.escapeHtml(mod.path || '')}">${this.escapeHtml(mod.name || mod.path || 'unknown')}</span>
                <span class="mod-source">${this.escapeHtml(mod.source || 'manifest')}</span>
                <span class="mod-env">${this.escapeHtml(mod.environment || 'both')}</span>
                <span class="mod-size">${((mod.file_size || 0) / 1024).toFixed(1)} KB</span>
                <button class="mod-remove-btn" type="button" data-action="remove-mod" data-mod-path="${this.escapeHtml(mod.path || '')}" data-mod-name="${this.escapeHtml(mod.name || mod.path || 'mod')}">Remove</button>
            `;
            this.elements.modList.appendChild(modItem);
        });
    }

    updateInstances(instances) {
        if (!this.elements.instancesList) return;
        this.elements.instancesList.innerHTML = '';
        if (!instances?.length) {
            this.elements.instancesList.innerHTML = '<p class="instance-empty">No instances created yet.</p>';
            return;
        }

        instances.forEach((instance) => {
            const item = document.createElement('div');
            item.className = 'instance-admin-card';
            const codes = (instance.codes || []).map((code) => {
                const maxUses = code.maxUses ?? code.max_uses;
                const usage = maxUses ? `${code.uses}/${maxUses}` : `${code.uses}`;
                return `<div class="instance-code-row"><code>${this.escapeHtml(code.code)}</code><span>${usage} uses</span><button class="btn btn-success btn-copy-code" type="button" data-action="copy-code" data-code="${this.escapeHtml(code.code)}">Copy</button></div>`;
            }).join('');
            const modpackInfo = instance.modpack?.modpack_info;
            const media = instance.media || {};
            const iconUrl = media.iconUrl || media.icon_url || '';
            const backgroundUrl = media.backgroundUrl || media.background_url || '';
            const iconKind = media.iconKind || media.icon_kind || this.detectMediaKind(iconUrl);
            const backgroundKind = media.backgroundKind || media.background_kind || this.detectMediaKind(backgroundUrl);
            item.innerHTML = `
                <div class="instance-media-preview ${backgroundUrl ? 'has-background' : ''}">
                    ${this.renderMedia(backgroundUrl, backgroundKind, 'instance-background-preview')}
                    <div class="instance-icon-preview">${this.renderMedia(iconUrl, iconKind, 'instance-icon-media') || '🎮'}</div>
                </div>
                <div class="instance-card-main">
                    <div class="instance-card-header">
                        <div>
                            <h3>${this.escapeHtml(instance.name)}</h3>
                            <p>${this.escapeHtml(instance.id)} · whitelist: ${instance.whitelist_count || 0}</p>
                        </div>
                        <span class="status-badge ${instance.modpack?.available ? 'status-available' : 'status-unavailable'}">${instance.modpack?.available ? 'Modpack cargado' : 'Sin modpack'}</span>
                    </div>
                    <div class="instance-modpack-summary">
                        ${modpackInfo ? `${this.escapeHtml(modpackInfo.version_id)} · MC ${this.escapeHtml(modpackInfo.minecraft_version)} · ${this.escapeHtml(modpackInfo.loader)} · ${modpackInfo.mod_count} mods` : 'Sube un archivo .mrpack para que esta instancia pueda generar una biblioteca jugable.'}
                    </div>
                    <div class="instance-media-summary">Icono: ${iconUrl ? 'configurado' : 'sin configurar'} · Background: ${backgroundUrl ? 'configurado' : 'sin configurar'}</div>
                    <div class="instance-codes">${codes || '<span>No codes yet</span>'}</div>
                </div>
                <div class="instance-actions">
                    <button class="btn btn-primary" type="button" data-action="upload-instance-modpack" data-instance-id="${this.escapeHtml(instance.id)}">Subir .mrpack</button>
                    <button class="btn btn-primary" type="button" data-action="upload-instance-media" data-slot="icon" data-instance-id="${this.escapeHtml(instance.id)}">Subir icono</button>
                    <button class="btn btn-primary" type="button" data-action="upload-instance-media" data-slot="background" data-instance-id="${this.escapeHtml(instance.id)}">Subir background</button>
                    <button class="btn btn-success" type="button" data-action="generate-code" data-instance-id="${this.escapeHtml(instance.id)}" ${instance.modpack?.available ? '' : 'disabled'}>Generar código</button>
                    <button class="btn btn-success" type="button" data-action="add-instance-mod" data-instance-id="${this.escapeHtml(instance.id)}" ${instance.modpack?.available ? '' : 'disabled'}>Añadir .jar</button>
                    <button class="btn btn-danger" type="button" data-action="delete-instance" data-instance-id="${this.escapeHtml(instance.id)}" data-instance-name="${this.escapeHtml(instance.name)}">Eliminar instancia</button>
                </div>
            `;
            this.elements.instancesList.appendChild(item);
        });
    }

    updateSelectedFile(file) {
        if (file) {
            this.elements.selectedFileName.textContent = `${file.name} (${this.formatBytes(file.size)})`;
            this.elements.selectedFile.classList.add('show');
            this.elements.uploadBtn.disabled = false;
        } else {
            this.elements.selectedFile.classList.remove('show');
            this.elements.uploadBtn.disabled = true;
        }
    }

    updateSelectedModFile(file, modpackAvailable = true) {
        if (!this.elements.selectedModFile || !this.elements.addModBtn) return;
        if (file) {
            this.elements.selectedModFileName.textContent = `${file.name} (${this.formatBytes(file.size)})`;
            this.elements.selectedModFile.classList.add('show');
            this.elements.addModBtn.disabled = !modpackAvailable;
        } else {
            this.elements.selectedModFile.classList.remove('show');
            this.elements.addModBtn.disabled = true;
        }
    }

    setButtonLoading(button, loading, text = '') {
        if (!button) return;
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = `<div class="spinner"></div> ${text || 'Loading...'}`;
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || text;
        }
    }

    detectMediaKind(url) {
        const clean = String(url || '').split('?')[0].toLowerCase();
        if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return 'video';
        if (/\.(png|jpe?g|webp|gif|avif|svg|bmp|ico|tiff?)$/.test(clean)) return 'image';
        return '';
    }

    renderMedia(url, kind, className) {
        if (!url) return '';
        const safeUrl = this.escapeHtml(url);
        const mediaKind = kind || this.detectMediaKind(url);
        if (mediaKind === 'video') {
            return `<video class="${className}" src="${safeUrl}" muted loop autoplay playsinline></video>`;
        }
        return `<img class="${className}" src="${safeUrl}" alt="" loading="lazy">`;
    }
    formatBytes(bytes) {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
}

class FileValidator {
    static validate(file, allowedExtensions = API_CONFIG.allowedExtensions) {
        const errors = [];
        if (!file) return { valid: false, errors: ['No file selected'] };
        const extension = `.${file.name.split('.').pop().toLowerCase()}`;
        const isMediaValidation = allowedExtensions === API_CONFIG.allowedMediaExtensions;
        const hasAllowedExtension = allowedExtensions.includes(extension);
        const hasAllowedMime = isMediaValidation
            && API_CONFIG.allowedMediaMimePrefixes.some((prefix) => file.type?.startsWith(prefix));
        if (!hasAllowedExtension && !hasAllowedMime) {
            const message = isMediaValidation
                ? 'Invalid file type. Images and videos are allowed'
                : `Invalid file type. Only ${allowedExtensions.join(', ')} files are allowed`;
            errors.push(message);
        }
        if (file.size > API_CONFIG.maxFileSize) errors.push(`File size exceeds maximum allowed size of ${API_CONFIG.maxFileSize / (1024 * 1024)} MB`);
        if (file.size === 0) errors.push('File is empty');
        return { valid: errors.length === 0, errors };
    }
}

class AdminPanel {
    constructor() {
        this.authManager = new AuthManager();
        this.api = new ApiClient(this.authManager);
        this.ui = new UIManager();
        this.maintenance = new MaintenanceManager(this.authManager);
        this.selectedFile = null;
        this.selectedModFile = null;
        this.modpackAvailable = false;
        this.init();
    }

    init() {
        if (!this.authManager.isAuthenticated()) {
            this.authManager.redirectToLogin();
            return;
        }
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.maintenance.setupListeners();
        this.loadInfo();
        this.loadInstances();
        this.maintenance.loadStatus();
        this.maintenance.loadWhitelist();
    }

    setupEventListeners() {
        this.ui.elements.createInstanceBtn?.addEventListener('click', () => this.handleCreateInstance());
        this.ui.elements.instanceNameInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.handleCreateInstance();
        });
        this.ui.elements.instancesList?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            if (button.dataset.action === 'generate-code') this.handleGenerateCode(button.dataset.instanceId);
            if (button.dataset.action === 'copy-code') this.copyText(button.dataset.code);
            if (button.dataset.action === 'upload-instance-modpack') this.handleUploadInstanceModpack(button.dataset.instanceId);
            if (button.dataset.action === 'add-instance-mod') this.handleAddInstanceMod(button.dataset.instanceId);
            if (button.dataset.action === 'upload-instance-media') this.handleUploadInstanceMedia(button.dataset.instanceId, button.dataset.slot);
            if (button.dataset.action === 'delete-instance') this.handleDeleteInstance(button.dataset.instanceId, button.dataset.instanceName);
        });
        this.ui.elements.refreshBtn?.addEventListener('click', () => {
            this.loadInfo();
            this.loadInstances();
            this.maintenance.loadStatus();
            this.maintenance.loadWhitelist();
        });
        this.ui.elements.deleteBtn?.addEventListener('click', () => this.handleDelete());
        this.ui.elements.downloadBtn?.addEventListener('click', () => this.handleDownload());
        this.ui.elements.fileInput?.addEventListener('change', (event) => this.handleFileSelect(event.target.files[0]));
        this.ui.elements.uploadBtn?.addEventListener('click', () => this.handleUpload());
        this.ui.elements.modFileInput?.addEventListener('change', (event) => this.handleModFileSelect(event.target.files[0]));
        this.ui.elements.addModBtn?.addEventListener('click', () => this.handleAddMod());
        this.ui.elements.uploadArea?.addEventListener('click', () => this.ui.elements.fileInput?.click());
        this.ui.elements.modUploadArea?.addEventListener('click', () => this.ui.elements.modFileInput?.click());
        document.querySelector('.remove-file')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.clearFileSelection();
        });
        document.querySelector('.remove-mod-file')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.clearModFileSelection();
        });
        this.ui.elements.modList?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="remove-mod"]');
            if (button) this.handleRemoveMod(button.dataset.modPath, button.dataset.modName);
        });
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('¿Estás seguro que deseas cerrar sesión?')) this.authManager.logout();
        });
    }

    setupDragAndDrop() {
        this.setupDropZone(this.ui.elements.uploadArea, (file) => this.handleFileSelect(file));
        this.setupDropZone(this.ui.elements.modUploadArea, (file) => this.handleModFileSelect(file));
    }

    setupDropZone(element, callback) {
        if (!element) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
            element.addEventListener(eventName, (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
        });
        ['dragenter', 'dragover'].forEach((eventName) => element.addEventListener(eventName, () => element.classList.add('drag-over')));
        ['dragleave', 'drop'].forEach((eventName) => element.addEventListener(eventName, () => element.classList.remove('drag-over')));
        element.addEventListener('drop', (event) => {
            const file = event.dataTransfer.files[0];
            if (file) callback(file);
        });
    }

    async loadInfo() {
        this.ui.showLoading(true);
        try {
            const info = await this.api.getInfo();
            this.modpackAvailable = info?.available === true;
            this.ui.updateFileInfo(info);
            this.ui.updateSelectedModFile(this.selectedModFile, this.modpackAvailable);
        } catch (error) {
            console.error('Failed to load info:', error);
            this.ui.showAlert(error.message || 'Failed to load modpack information', 'error');
        } finally {
            this.ui.showLoading(false);
        }
    }

    async loadInstances() {
        try {
            const response = await this.api.listInstances();
            this.ui.updateInstances(response?.instances || []);
        } catch (error) {
            console.error('Failed to load instances:', error);
            this.ui.showAlert(error.message || 'Failed to load instances', 'error');
        }
    }

    async handleCreateInstance() {
        const input = this.ui.elements.instanceNameInput;
        const iconInput = this.ui.elements.instanceIconUrlInput;
        const backgroundInput = this.ui.elements.instanceBackgroundUrlInput;
        const name = input?.value?.trim();
        const iconUrl = iconInput?.value?.trim() || null;
        const backgroundUrl = backgroundInput?.value?.trim() || null;
        if (!name) {
            this.ui.showAlert('Instance name is required', 'error');
            input?.focus();
            return;
        }
        this.ui.setButtonLoading(this.ui.elements.createInstanceBtn, true, 'Creating...');
        try {
            await this.api.createInstance(name, iconUrl, backgroundUrl);
            input.value = '';
            if (iconInput) iconInput.value = '';
            if (backgroundInput) backgroundInput.value = '';
            this.ui.showAlert('Instance created', 'success');
            await this.loadInstances();
        } catch (error) {
            console.error('Create instance failed:', error);
            this.ui.showAlert(error.message || 'Failed to create instance', 'error');
        } finally {
            this.ui.setButtonLoading(this.ui.elements.createInstanceBtn, false, 'Create Instance');
        }
    }

    async handleUploadInstanceMedia(instanceId, slot) {
        if (!instanceId || !slot) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const validation = FileValidator.validate(file, API_CONFIG.allowedMediaExtensions);
            if (!validation.valid) {
                this.ui.showAlert(validation.errors.join(', '), 'error');
                return;
            }
            try {
                await this.api.uploadInstanceMedia(instanceId, slot, file);
                this.ui.showAlert(`${slot === 'icon' ? 'Icono' : 'Background'} actualizado`, 'success');
                await this.loadInstances();
            } catch (error) {
                console.error('Upload instance media failed:', error);
                this.ui.showAlert(error.message || 'Failed to upload instance media', 'error');
            }
        };
        input.click();
    }
    async handleGenerateCode(instanceId) {
        if (!instanceId) return;
        try {
            const code = await this.api.generateInstanceCode(instanceId, 1);
            await this.copyText(code.code);
            this.ui.showAlert(`Generated code: ${code.code}`, 'success', 10000);
            await this.loadInstances();
        } catch (error) {
            console.error('Generate code failed:', error);
            this.ui.showAlert(error.message || 'Failed to generate code', 'error');
        }
    }

    async copyText(value) {
        if (!value) return;
        try {
            await navigator.clipboard?.writeText(value);
            this.ui.showAlert(`Copied: ${value}`, 'success', 2500);
        } catch {
            window.prompt('Copy this code:', value);
        }
    }

    chooseFile(accept) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
            input.click();
        });
    }

    async handleUploadInstanceModpack(instanceId) {
        if (!instanceId) return;
        const file = await this.chooseFile('.mrpack');
        if (!file) return;
        const validation = FileValidator.validate(file, API_CONFIG.allowedExtensions);
        if (!validation.valid) {
            this.ui.showAlert(validation.errors.join('. '), 'error');
            return;
        }
        try {
            await this.api.uploadInstanceModpack(instanceId, file);
            this.ui.showAlert(`Modpack uploaded to ${instanceId}`, 'success');
            await this.loadInstances();
        } catch (error) {
            console.error('Instance modpack upload failed:', error);
            this.ui.showAlert(error.message || 'Failed to upload instance modpack', 'error');
        }
    }

    async handleAddInstanceMod(instanceId) {
        if (!instanceId) return;
        const file = await this.chooseFile('.jar');
        if (!file) return;
        const validation = FileValidator.validate(file, API_CONFIG.allowedModExtensions);
        if (!validation.valid) {
            this.ui.showAlert(validation.errors.join('. '), 'error');
            return;
        }
        try {
            await this.api.addInstanceMod(instanceId, file);
            this.ui.showAlert(`Mod added to ${instanceId}`, 'success');
            await this.loadInstances();
        } catch (error) {
            console.error('Instance mod upload failed:', error);
            this.ui.showAlert(error.message || 'Failed to add mod to instance', 'error');
        }
    }

    async handleDeleteInstance(instanceId, instanceName) {
        if (!instanceId) return;
        const label = instanceName || instanceId;
        if (!confirm(`¿Eliminar la instancia "${label}"? Esta acción borra el .mrpack, los códigos asociados y los archivos de media. No se puede deshacer.`)) return;
        try {
            await this.api.deleteInstance(instanceId);
            this.ui.showAlert(`Instancia "${label}" eliminada`, 'success');
            await this.loadInstances();
        } catch (error) {
            console.error('Delete instance failed:', error);
            this.ui.showAlert(error.message || 'Failed to delete instance', 'error');
        }
    }

    handleFileSelect(file) {
        const validation = FileValidator.validate(file);
        if (!validation.valid) {
            this.ui.showAlert(validation.errors.join('. '), 'error');
            this.clearFileSelection();
            return;
        }
        this.selectedFile = file;
        this.ui.updateSelectedFile(file);
    }

    clearFileSelection() {
        this.selectedFile = null;
        this.ui.elements.fileInput.value = '';
        this.ui.updateSelectedFile(null);
    }

    handleModFileSelect(file) {
        if (!this.modpackAvailable) {
            this.ui.showAlert('Upload a mrpack before adding mods', 'error');
            this.clearModFileSelection();
            return;
        }
        const validation = FileValidator.validate(file, API_CONFIG.allowedModExtensions);
        if (!validation.valid) {
            this.ui.showAlert(validation.errors.join('. '), 'error');
            this.clearModFileSelection();
            return;
        }
        this.selectedModFile = file;
        this.ui.updateSelectedModFile(file, this.modpackAvailable);
    }

    clearModFileSelection() {
        this.selectedModFile = null;
        if (this.ui.elements.modFileInput) this.ui.elements.modFileInput.value = '';
        this.ui.updateSelectedModFile(null, this.modpackAvailable);
    }

    async handleUpload() {
        if (!this.selectedFile) return this.ui.showAlert('Please select a file first', 'error');
        this.ui.setButtonLoading(this.ui.elements.uploadBtn, true, 'Uploading...');
        try {
            const response = await this.api.uploadFile(this.selectedFile);
            this.ui.showAlert(`File uploaded successfully: ${response.file_name} (${response.file_size_mb.toFixed(2)} MB)`, 'success');
            this.clearFileSelection();
            await this.loadInfo();
        } catch (error) {
            console.error('Upload failed:', error);
            this.ui.showAlert(error.message || 'Failed to upload file', 'error');
        } finally {
            this.ui.setButtonLoading(this.ui.elements.uploadBtn, false, '⬆️ Upload File');
        }
    }

    async handleAddMod() {
        if (!this.selectedModFile) return this.ui.showAlert('Please select a mod jar first', 'error');
        this.ui.setButtonLoading(this.ui.elements.addModBtn, true, 'Adding...');
        try {
            const response = await this.api.addModFile(this.selectedModFile);
            this.ui.showAlert(`Mod added: ${response.path}`, 'success');
            this.clearModFileSelection();
            await this.loadInfo();
        } catch (error) {
            console.error('Mod upload failed:', error);
            this.ui.showAlert(error.message || 'Failed to add mod', 'error');
        } finally {
            this.ui.setButtonLoading(this.ui.elements.addModBtn, false, '➕ Add Mod');
            this.ui.updateSelectedModFile(this.selectedModFile, this.modpackAvailable);
        }
    }

    async handleRemoveMod(path, name) {
        if (!path || !confirm(`Remove ${name || path} from the mrpack?`)) return;
        try {
            await this.api.removeMod(path);
            this.ui.showAlert(`Mod removed: ${name || path}`, 'success');
            await this.loadInfo();
        } catch (error) {
            console.error('Mod removal failed:', error);
            this.ui.showAlert(error.message || 'Failed to remove mod', 'error');
        }
    }

    async handleDownload() {
        try { await this.api.downloadFile(); }
        catch (error) {
            console.error('Download failed:', error);
            this.ui.showAlert(error.message || 'Failed to download modpack', 'error');
        }
    }

    async handleDelete() {
        if (!confirm('Are you sure you want to delete the current modpack?')) return;
        this.ui.setButtonLoading(this.ui.elements.deleteBtn, true, 'Deleting...');
        try {
            await this.api.deleteFile();
            this.ui.showAlert('Modpack deleted successfully', 'success');
            await this.loadInfo();
        } catch (error) {
            console.error('Delete failed:', error);
            this.ui.showAlert(error.message || 'Failed to delete file', 'error');
        } finally {
            this.ui.setButtonLoading(this.ui.elements.deleteBtn, false, '🗑️ Delete');
        }
    }
}

class MaintenanceManager {
    constructor(authManager) {
        this.authManager = authManager;
        this.api = new ApiClient(authManager);
        this.status = { enabled: false, premiumOnly: false, message: '' };
        this.whitelist = [];
        this.elements = {
            toggleBtn: document.getElementById('maintenanceToggleBtn'),
            toggleText: document.querySelector('#maintenanceToggleBtn .toggle-pill-text'),
            premiumOnly: document.getElementById('maintenancePremiumOnly'),
            message: document.getElementById('maintenanceMessage'),
            saveConfigBtn: document.getElementById('maintenanceSaveConfigBtn'),
            adminNickInput: document.getElementById('adminNickInput'),
            whitelistAddInput: document.getElementById('whitelistAddInput'),
            whitelistAddBtn: document.getElementById('whitelistAddBtn'),
            whitelistList: document.getElementById('whitelistList'),
        };
        this.adminNick = sessionStorage.getItem(API_CONFIG.adminNickStorageKey) || '';
        if (this.elements.adminNickInput) this.elements.adminNickInput.value = this.adminNick;
    }

    async loadStatus() {
        try {
            const response = await fetch(API_CONFIG.endpoints.maintenanceStatus, {
                headers: this.authManager.getAuthHeader(),
            });
            if (response.status === 401) { this.authManager.logout(); return; }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.status = await response.json();
            this.renderStatus();
        } catch (error) {
            console.error('Failed to load maintenance status:', error);
            this.showAlert(`No se pudo cargar el estado: ${error.message}`, 'error');
        }
    }

    async loadWhitelist() {
        try {
            const response = await fetch(API_CONFIG.endpoints.maintenanceWhitelist, {
                headers: this.authManager.getAuthHeader(),
            });
            if (response.status === 401) { this.authManager.logout(); return; }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.whitelist = await response.json();
            this.renderWhitelist();
        } catch (error) {
            console.error('Failed to load whitelist:', error);
            this.showAlert(`No se pudo cargar la whitelist: ${error.message}`, 'error');
        }
    }

    renderStatus() {
        if (!this.elements.toggleBtn) return;
        const on = this.status.enabled;
        this.elements.toggleBtn.classList.toggle('on', on);
        this.elements.toggleBtn.classList.toggle('off', !on);
        if (this.elements.toggleText) {
            this.elements.toggleText.textContent = on ? 'Activado' : 'Desactivado';
        }
        if (this.elements.premiumOnly) this.elements.premiumOnly.checked = !!this.status.premiumOnly;
        if (this.elements.message) this.elements.message.value = this.status.message || '';
    }

    renderWhitelist() {
        if (!this.elements.whitelistList) return;
        if (!this.whitelist.length) {
            this.elements.whitelistList.innerHTML = '<p class="whitelist-empty">La whitelist está vacía.</p>';
            return;
        }
        this.elements.whitelistList.innerHTML = this.whitelist
            .map((nick) => `
                <div class="whitelist-item">
                    <code>${this.escapeHtml(nick)}</code>
                    <button class="btn btn-danger btn-tiny" type="button" data-action="remove-whitelist" data-nick="${this.escapeHtml(nick)}">Quitar</button>
                </div>
            `)
            .join('');
    }

    showAlert(message, type = 'info') {
        const container = document.getElementById('alertContainer');
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} show`;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        alert.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
        container.appendChild(alert);
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    async handleToggle() {
        const wasEnabled = this.status.enabled;
        try {
            this.persistAdminNick();
            if (!wasEnabled) {
                const nick = this.elements.adminNickInput?.value?.trim();
                if (nick) {
                    await this.addWhitelist(nick, /*silent*/ true);
                }
            }
            await this.post(API_CONFIG.endpoints.maintenanceToggle, null);
            await this.loadStatus();
            this.showAlert(wasEnabled ? 'Mantenimiento desactivado' : 'Mantenimiento activado', 'success');
        } catch (error) {
            this.showAlert(error.message || 'Error al cambiar el estado', 'error');
        }
    }

    async handleSaveConfig() {
        const premiumOnly = !!this.elements.premiumOnly?.checked;
        const message = this.elements.message?.value?.trim();
        if (!message) {
            this.showAlert('El mensaje no puede estar vacío', 'error');
            return;
        }
        try {
            await this.post(API_CONFIG.endpoints.maintenanceConfig, { premiumOnly, message });
            await this.loadStatus();
            this.showAlert('Configuración guardada', 'success');
        } catch (error) {
            this.showAlert(error.message || 'Error al guardar', 'error');
        }
    }

    async handleAddWhitelist() {
        const nick = this.elements.whitelistAddInput?.value?.trim();
        if (!nick) return;
        try {
            await this.addWhitelist(nick);
            if (this.elements.whitelistAddInput) this.elements.whitelistAddInput.value = '';
        } catch (error) {
            this.showAlert(error.message || 'Error al añadir', 'error');
        }
    }

    async addWhitelist(nick, silent = false) {
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(nick)) {
            throw new Error('Nick inválido (3-16 chars, [a-zA-Z0-9_])');
        }
        await this.post(`${API_CONFIG.endpoints.maintenanceWhitelist}/${encodeURIComponent(nick)}`, null);
        await this.loadWhitelist();
        if (!silent) this.showAlert(`"${nick}" añadido a la whitelist`, 'success');
    }

    async handleRemoveWhitelist(nick) {
        if (!confirm(`¿Quitar "${nick}" de la whitelist?`)) return;
        try {
            const response = await fetch(`${API_CONFIG.endpoints.maintenanceWhitelist}/${encodeURIComponent(nick)}`, {
                method: 'DELETE',
                headers: this.authManager.getAuthHeader(),
            });
            if (response.status === 401) { this.authManager.logout(); return; }
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            await this.loadWhitelist();
            this.showAlert(`"${nick}" quitado`, 'success');
        } catch (error) {
            this.showAlert(error.message || 'Error al quitar', 'error');
        }
    }

    persistAdminNick() {
        const value = this.elements.adminNickInput?.value?.trim() || '';
        if (value) {
            sessionStorage.setItem(API_CONFIG.adminNickStorageKey, value);
        } else {
            sessionStorage.removeItem(API_CONFIG.adminNickStorageKey);
        }
    }

    async post(endpoint, body) {
        const options = {
            method: 'POST',
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...this.authManager.getAuthHeader(),
            },
        };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(endpoint, options);
        if (response.status === 401) { this.authManager.logout(); throw new Error('Unauthorized'); }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        return response.json().catch(() => null);
    }

    setupListeners() {
        this.elements.toggleBtn?.addEventListener('click', () => this.handleToggle());
        this.elements.saveConfigBtn?.addEventListener('click', () => this.handleSaveConfig());
        this.elements.whitelistAddBtn?.addEventListener('click', () => this.handleAddWhitelist());
        this.elements.whitelistAddInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.handleAddWhitelist();
        });
        this.elements.adminNickInput?.addEventListener('change', () => this.persistAdminNick());
        this.elements.whitelistList?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="remove-whitelist"]');
            if (button) this.handleRemoveWhitelist(button.dataset.nick);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AdminPanel());
} else {
    new AdminPanel();
}
