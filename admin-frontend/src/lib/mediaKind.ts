import type { MediaKind } from "../types/api";

export function detectMediaKind(url: string | null | undefined): MediaKind {
  const clean = String(url || "").split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif|svg|bmp|ico|tiff?)$/.test(clean)) return "image";
  return "";
}
