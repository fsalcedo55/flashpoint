export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;
export const documentStatuses = ["processing", "ready", "failed"] as const;
export type DocumentType = "pdf" | "docx";
export type DocumentSection = { location: string; text: string };

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
