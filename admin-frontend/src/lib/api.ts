import type {
  AdminInstanceView,
  AdminInstancesResponse,
  ApiResponse,
  CrashReportDetail,
  CrashReportListResponse,
  CreateInstancePayload,
  GenerateCodePayload,
  InstanceCodeResponse,
  MainPackConfig,
  MaintenanceStatus,
  ModpackDetails,
  UpdateInstancePayload,
  UploadFileResponse,
} from "../types/api";

const SESSION_KEY = "mrpack_auth_session";
const LOGIN_URL = "/login.html";

export const session = {
  getToken(): string | null {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  },
  isAuthenticated(): boolean {
    return this.getToken() !== null;
  },
  redirectToLogin(): void {
    window.location.replace(LOGIN_URL);
  },
  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch("/api/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
      }
    }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.redirectToLogin();
  },
  getAuthHeader(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
      ...session.getAuthHeader(),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
      session.logout();
      throw new Error("unauthorized");
    }
    const errorData = data as { error?: string; message?: string } | null;
    const message = errorData?.error || errorData?.message || `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function uploadMultipart(
  endpoint: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress((event.loaded / event.total) * 100);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
        return;
      }
      if (xhr.status === 401) {
        session.logout();
        return;
      }
      try {
        const err = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(err.error || `Upload failed: ${xhr.status}`));
      } catch {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timeout")));
    xhr.timeout = 10 * 60 * 1000;

    xhr.open("POST", endpoint);
    const authHeader = session.getAuthHeader().Authorization;
    if (authHeader) xhr.setRequestHeader("Authorization", authHeader);
    xhr.send(formData);
  });
}

export const api = {
  getInfo(): Promise<ModpackDetails> {
    return request<ModpackDetails>("/api/info");
  },

  uploadFile(file: File, onProgress?: (pct: number) => void): Promise<UploadFileResponse> {
    return uploadMultipart("/api/upload", file, onProgress) as Promise<UploadFileResponse>;
  },

  deleteFile(): Promise<ApiResponse> {
    return request<ApiResponse>("/api/delete", { method: "DELETE" });
  },

  addModFile(file: File, onProgress?: (pct: number) => void): Promise<ApiResponse> {
    return uploadMultipart("/api/mods", file, onProgress) as Promise<ApiResponse>;
  },

  removeMod(path: string): Promise<ApiResponse> {
    return request<ApiResponse>("/api/mods", {
      method: "DELETE",
      body: JSON.stringify({ path }),
    });
  },

  listInstances(): Promise<AdminInstancesResponse> {
    return request<AdminInstancesResponse>("/api/admin/instances");
  },

  getMaintenanceStatus(): Promise<MaintenanceStatus> {
    return request<MaintenanceStatus>("/api/maintenance/status");
  },

  toggleMaintenance(): Promise<MaintenanceStatus> {
    return request<MaintenanceStatus>("/api/admin/maintenance/toggle", {
      method: "POST",
    });
  },

  updateMaintenanceConfig(premiumOnly: boolean, message: string): Promise<MaintenanceStatus> {
    return request<MaintenanceStatus>("/api/admin/maintenance/config", {
      method: "POST",
      body: JSON.stringify({ premiumOnly, message }),
    });
  },

  listWhitelist(): Promise<string[]> {
    return request<string[]>("/api/admin/maintenance/whitelist");
  },

  addWhitelistEntry(nick: string): Promise<MaintenanceStatus> {
    return request<MaintenanceStatus>(
      `/api/admin/maintenance/whitelist/${encodeURIComponent(nick)}`,
      { method: "POST" },
    );
  },

  removeWhitelistEntry(nick: string): Promise<MaintenanceStatus> {
    return request<MaintenanceStatus>(
      `/api/admin/maintenance/whitelist/${encodeURIComponent(nick)}`,
      { method: "DELETE" },
    );
  },

  createInstance(
    name: string,
    iconUrl: string | null,
    backgroundUrl: string | null,
    options?: { isPublic?: boolean; isMain?: boolean },
  ): Promise<AdminInstanceView> {
    const payload: CreateInstancePayload = {
      name,
      iconUrl,
      backgroundUrl,
      isPublic: options?.isPublic,
      isMain: options?.isMain,
    };
    return request<AdminInstanceView>("/api/admin/instances", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateInstance(
    instanceId: string,
    payload: UpdateInstancePayload,
  ): Promise<AdminInstanceView> {
    return request<AdminInstanceView>(
      `/api/admin/instances/${encodeURIComponent(instanceId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  },

  deleteInstance(instanceId: string): Promise<ApiResponse> {
    return request<ApiResponse>(
      `/api/admin/instances/${encodeURIComponent(instanceId)}`,
      { method: "DELETE" },
    );
  },

  getMainPackConfig(): Promise<MainPackConfig> {
    return request<MainPackConfig>("/api/admin/main-pack");
  },

  updateMainPackConfig(payload: MainPackConfig): Promise<MainPackConfig> {
    return request<MainPackConfig>("/api/admin/main-pack", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listCrashReports(): Promise<CrashReportListResponse> {
    return request<CrashReportListResponse>("/api/admin/crash-reports");
  },

  getCrashReport(id: string): Promise<CrashReportDetail> {
    return request<CrashReportDetail>(
      `/api/admin/crash-reports/${encodeURIComponent(id)}`,
    );
  },

  deleteCrashReport(id: string): Promise<ApiResponse> {
    return request<ApiResponse>(
      `/api/admin/crash-reports/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  generateCode(
    instanceId: string,
    maxUses = 1,
  ): Promise<InstanceCodeResponse> {
    const payload: GenerateCodePayload = { maxUses };
    return request<InstanceCodeResponse>(
      `/api/admin/instances/${encodeURIComponent(instanceId)}/codes`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  uploadInstanceModpack(
    instanceId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ApiResponse> {
    return uploadMultipart(
      `/api/admin/instances/${encodeURIComponent(instanceId)}/upload`,
      file,
      onProgress,
    ) as Promise<ApiResponse>;
  },

  uploadInstanceMedia(
    instanceId: string,
    slot: "icon" | "background",
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ApiResponse> {
    return uploadMultipart(
      `/api/admin/instances/${encodeURIComponent(instanceId)}/media/${encodeURIComponent(slot)}`,
      file,
      onProgress,
    ) as Promise<ApiResponse>;
  },

  addInstanceMod(
    instanceId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ApiResponse> {
    return uploadMultipart(
      `/api/admin/instances/${encodeURIComponent(instanceId)}/mods`,
      file,
      onProgress,
    ) as Promise<ApiResponse>;
  },

  async downloadFile(): Promise<void> {
    const response = await fetch("/api/download", {
      headers: { ...session.getAuthHeader() },
    });
    if (response.status === 401) {
      session.logout();
      return;
    }
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modpack.mrpack";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
