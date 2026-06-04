import type {
  FileMetadata,
  FileStoragePort,
  ListResult,
  UploadParams,
} from "@faena360/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPath } from "./pathBuilder";
import { mapError } from "./errorMapper";

/**
 * Tenant-aware file-storage adapter backed by Supabase Storage.
 *
 * Implements {@link FileStoragePort} by delegating to a Supabase client
 * instance.  Paths are constructed with `tenantId` as the first segment so
 * that RLS policies can validate tenant ownership server-side.
 *
 * @example
 * ```ts
 * const adapter = new SupabaseStorageAdapter(supabaseClient, "tenant-files");
 * const meta = await adapter.upload({ tenantId: "t1", module: "invoices", entityId: "42", file: pdfFile });
 * ```
 */
export class SupabaseStorageAdapter implements FileStoragePort {
  private readonly bucket: string;

  /**
   * @param client  A configured Supabase client instance.
   * @param bucket  Supabase Storage bucket name (default: `"tenant-files"`).
   */
  constructor(
    private readonly client: SupabaseClient,
    bucket = "tenant-files"
  ) {
    this.bucket = bucket;
  }

  /** @inheritdoc */
  async upload(params: UploadParams): Promise<FileMetadata> {
    const path = buildPath(params);
    const fileBody = params.file;

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .upload(path, fileBody, { upsert: false });

    if (error) throw mapError(error, "upload");

    // Derive metadata from the upload response and params.
    const name =
      params.fileName ?? (fileBody instanceof File ? fileBody.name : "file");
    const size = fileBody instanceof File ? fileBody.size : fileBody.size;
    const mimeType = fileBody.type || "application/octet-stream";
    const id = data?.id ?? path;
    const createdAt = new Date();

    return { id, name, size, mimeType, path, createdAt };
  }

  /** @inheritdoc */
  async download(path: string): Promise<Blob> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(path);

    if (error) throw mapError(error, "download");
    if (!data)
      throw mapError(new Error("Download returned no data"), "download");

    return data;
  }

  /** @inheritdoc */
  async delete(path: string): Promise<void> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .remove([path]);

    if (error) throw mapError(error, "delete");
    if (!data || data.length === 0) {
      throw mapError(new Error("No file was deleted"), "delete");
    }
  }

  /** @inheritdoc */
  async list(
    prefix: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<ListResult> {
    const limit = options?.limit ?? 100;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(prefix, { limit, offset });

    if (error) throw mapError(error, "list");

    const items: FileMetadata[] = (data ?? [])
      .filter((obj) => obj.id !== null) // skip synthetic folder sentinels
      .map((obj) => ({
        id: obj.id ?? `${prefix ? prefix + "/" : ""}${obj.name}`,
        name: obj.name,
        size: (obj.metadata as { size?: number } | undefined)?.size ?? 0,
        mimeType:
          (obj.metadata as { mimetype?: string } | undefined)?.mimetype ??
          "application/octet-stream",
        path: `${prefix ? prefix + "/" : ""}${obj.name}`,
        createdAt: obj.created_at ? new Date(obj.created_at) : new Date(),
      }));

    const nextCursor =
      items.length === limit ? String(offset + limit) : undefined;

    return { items, nextCursor };
  }
}
