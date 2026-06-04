import type { UploadParams } from "@faena360/domain";

/**
 * Builds a tenant-scoped storage path from upload parameters.
 *
 * Path pattern: `{tenantId}/{module}/{entityId}/{fileId}.{ext}`
 *
 * - `tenantId`, `module`, `entityId` come directly from params.
 * - `fileId` is a generated UUID (deterministic per upload call).
 * - Extension is extracted from the file name (or `fileName` override).
 *
 * This function is pure and has no side effects.
 */
export function buildPath(params: UploadParams): string {
  const { tenantId, module, entityId } = params;

  // Determine the display name for extension extraction.
  const rawName =
    params.fileName ??
    (params.file instanceof File ? params.file.name : "file.bin");

  // Extract extension: everything after the last dot, or "bin" if none.
  const lastDot = rawName.lastIndexOf(".");
  const ext = lastDot > 0 ? rawName.slice(lastDot + 1) : "bin";

  // Generate a UUID for the file identifier segment.
  const fileId = crypto.randomUUID();

  return `${tenantId}/${module}/${entityId}/${fileId}.${ext}`;
}
