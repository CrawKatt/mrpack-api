import type {
  AdminInstanceView,
  AdminInstancesResponse,
  ApiResponse,
  CreateInstancePayload,
  GenerateCodePayload,
  InstanceCodeResponse,
  ModpackDetails,
  UploadFileResponse,
} from "../types/api";

const SESSION_KEY = "mrpack_auth_session";
const LOGIN_URL = "/login.html";

export const session = {
  getCredentials(): string | null {
    return sessionStorage.getItem(SESSION_KEY);
  },
  isAuthenticated(): boolean {
    return this.getCredentials() !== null;
  },
  redirectToLogin(): void {
    window.location.replace(LOGIN_URL);
  },
  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.redirectToLogin();
  },
  getAuthHeader(): Record<string, string> {
    const credentials = this.getCredentials();
    return credentials ? { Authorization: `Basic ${credentials}` } : {};
  },
};

async function parseError(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      return data.error || data.message || fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

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
    const message = await parseError(
      response,
      `HTTP error ${response.status}`,
    ).catch(() => `HTTP error ${response.status}`);
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

  createInstance(
    name: string,
    iconUrl: string | null,
    backgroundUrl: string | null,
  ): Promise<AdminInstanceView> {
    const payload: CreateInstancePayload = { name, iconUrl, backgroundUrl };
    return request<AdminInstanceView>("/api/admin/instances", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  deleteInstance(instanceId: string): Promise<ApiResponse> {
    return request<ApiResponse>(
      `/api/admin/instances/${encodeURIComponent(instanceId)}`,
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
