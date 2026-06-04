import { StorageError } from "@faena360/domain";
import type { StorageErrorCode } from "@faena360/domain";

/**
 * Maps a Supabase StorageApiError (or any error) to a domain {@link StorageError}.
 *
 * Mapping rules:
 * - 401 / 403 → `PERMISSION_DENIED`
 * - 404        → `NOT_FOUND`
 * - Upload failures (when operation is "upload") → `UPLOAD_FAILED`
 * - All other cases → `UNKNOWN`
 *
 * The original error is preserved as `cause` for debugging.
 *
 * @param error    The caught error from a Supabase storage operation.
 * @param operation Optional operation context — used to classify upload failures.
 * @returns A typed {@link StorageError} ready to throw or propagate.
 */
export function mapError(
  error: unknown,
  operation?: "upload" | "download" | "delete" | "list"
): StorageError {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Unknown storage error";

  // If it has a Supabase-style statusCode, classify by HTTP status.
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode: number }).statusCode;

    if (statusCode === 401 || statusCode === 403) {
      return new StorageError("PERMISSION_DENIED", message, error);
    }

    if (statusCode === 404) {
      return new StorageError("NOT_FOUND", message, error);
    }

    if (operation === "upload") {
      return new StorageError("UPLOAD_FAILED", message, error);
    }
  }

  // Non-HTTP errors during upload are also UPLOAD_FAILED.
  if (operation === "upload") {
    return new StorageError("UPLOAD_FAILED", message, error);
  }

  return new StorageError("UNKNOWN", message, error);
}
