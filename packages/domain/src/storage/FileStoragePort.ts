/**
 * Provider-agnostic file storage port following Clean/Hexagonal Architecture.
 * Infrastructure adapters (Supabase, S3, GCS) implement this interface.
 *
 * Path convention: `{tenantId}/{module}/{entityId}/{fileId}.{ext}`
 * Tenant isolation is enforced server-side via RLS policies, not by the port.
 */

/** Metadata for a stored file. */
export interface FileMetadata {
  /** Unique file identifier (UUID). */
  id: string;
  /** Original file name (e.g. "invoice-2026.pdf"). */
  name: string;
  /** File size in bytes. */
  size: number;
  /** MIME type (e.g. "application/pdf"). */
  mimeType: string;
  /** Full storage path including tenant prefix (e.g. "t1/invoices/inv-42/uuid.pdf"). */
  path: string;
  /** ISO 8601 timestamp of when the file was created. */
  createdAt: Date;
}

/** Parameters for uploading a file through the storage port. */
export interface UploadParams {
  /** Tenant identifier — first segment of the storage path. */
  tenantId: string;
  /** Business module (e.g. "invoices", "contracts"). */
  module: string;
  /** Entity identifier within the module (e.g. invoice ID). */
  entityId: string;
  /** The file or blob to upload. */
  file: File | Blob;
  /** Optional custom file name override. Defaults to file.name if omitted. */
  fileName?: string;
}

/** Paginated result from a list operation. */
export interface ListResult {
  /** Array of file metadata for the current page. */
  items: FileMetadata[];
  /** Opaque cursor for fetching the next page, or undefined if no more pages. */
  nextCursor?: string;
}

/**
 * File storage port — the domain contract for tenant-aware file operations.
 * All methods are async and throw {@link StorageError} on failure.
 */
export interface FileStoragePort {
  /**
   * Upload a file to tenant-scoped storage.
   * @throws {StorageError} with code `UPLOAD_FAILED` or `PERMISSION_DENIED`
   */
  upload(params: UploadParams): Promise<FileMetadata>;

  /**
   * Download a file by its full storage path.
   * @throws {StorageError} with code `NOT_FOUND` or `PERMISSION_DENIED`
   */
  download(path: string): Promise<Blob>;

  /**
   * Delete a file by its full storage path.
   * @throws {StorageError} with code `NOT_FOUND` or `PERMISSION_DENIED`
   */
  delete(path: string): Promise<void>;

  /**
   * List files under a given path prefix.
   * @throws {StorageError} with code `PERMISSION_DENIED`
   */
  list(
    prefix: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<ListResult>;
}
