export const MAX_FILE_SIZE = 500 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [".mrpack"];
export const ALLOWED_MOD_EXTENSIONS = [".jar"];

export const ALLOWED_MEDIA_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".bmp",
  ".ico", ".tif", ".tiff", ".mp4", ".webm", ".mov", ".m4v", ".ogv",
];
export const ALLOWED_MEDIA_MIME_PREFIXES = ["image/", "video/"];

export type ValidationResult = { valid: boolean; errors: string[] };

export function validateFile(
  file: File | null,
  allowedExtensions: string[] = ALLOWED_EXTENSIONS,
): ValidationResult {
  const errors: string[] = [];
  if (!file) return { valid: false, errors: ["No file selected"] };

  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const isMediaValidation = allowedExtensions === ALLOWED_MEDIA_EXTENSIONS;
  const hasAllowedExtension = allowedExtensions.includes(extension);
  const hasAllowedMime =
    isMediaValidation &&
    ALLOWED_MEDIA_EXTENSIONS.includes(extension) === false &&
    ALLOWED_MEDIA_MIME_PREFIXES.some((prefix) => file.type?.startsWith(prefix));

  if (!hasAllowedExtension && !hasAllowedMime) {
    const message = isMediaValidation
      ? "Tipo de archivo inválido. Solo imágenes y videos"
      : `Tipo de archivo inválido. Solo se permiten: ${allowedExtensions.join(", ")}`;
    errors.push(message);
  }
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
  }
  if (file.size === 0) errors.push("El archivo está vacío");
  return { valid: errors.length === 0, errors };
}
