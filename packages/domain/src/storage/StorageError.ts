/**
 * Typed error codes for storage operations.
 * Adapters map provider-specific errors to these codes.
 */
export type StorageErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UPLOAD_FAILED"
  | "UNKNOWN";

/**
 * Domain error thrown by all {@link FileStoragePort} methods.
 * Carries a typed `code` so callers can branch on error type
 * without depending on provider-specific error classes.
 */
export class StorageError extends Error {
  /** Typed error code identifying the failure category. */
  public readonly code: StorageErrorCode;

  /** Original error that caused this failure (provider-specific). */
  public readonly cause?: unknown;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}
