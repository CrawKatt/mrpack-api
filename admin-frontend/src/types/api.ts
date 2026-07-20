export interface ModpackInfo {
  name: string;
  summary?: string | null;
  version_id: string;
  format_version: number;
  minecraft_version: string;
  loader: string;
  loader_version: string;
  mod_count: number;
  mods: ModInfo[];
}

export interface ModInfo {
  name: string;
  path: string;
  file_size: number;
  environment: string;
  source: string;
}

export interface ModpackDetails {
  available: boolean;
  file_name: string;
  file_size?: number;
  modpack_info?: ModpackInfo;
}

export interface InstanceCode {
  code: string;
  instance_id: string;
  max_uses?: number | null;
  uses: number;
  active: boolean;
}

export type MediaKind = "image" | "video" | "";

export interface InstanceMedia {
  icon_url?: string | null;
  background_url?: string | null;
  icon_kind?: MediaKind | null;
  background_kind?: MediaKind | null;
}

export interface AdminInstanceView {
  id: string;
  name: string;
  whitelist_count: number;
  codes: InstanceCode[];
  modpack: ModpackDetails;
  media: InstanceMedia;
}

export interface AdminInstancesResponse {
  instances: AdminInstanceView[];
}

export interface CreateInstancePayload {
  name: string;
  iconUrl?: string | null;
  backgroundUrl?: string | null;
}

export interface GenerateCodePayload {
  maxUses?: number;
}

export interface InstanceCodeResponse {
  code: string;
  instance_id: string;
  max_uses?: number | null;
  uses: number;
  active: boolean;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

export interface UploadFileResponse {
  file_name: string;
  file_size_mb: number;
}

export interface MaintenanceStatus {
  enabled: boolean;
  premiumOnly: boolean;
  message: string;
}
