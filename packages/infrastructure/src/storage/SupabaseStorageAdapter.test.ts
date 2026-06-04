import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StorageError } from "@faena360/domain";
import { SupabaseStorageAdapter } from "./SupabaseStorageAdapter";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

type StorageMock = {
  upload: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

function createMockSupabaseClient(): {
  client: SupabaseClient;
  storage: StorageMock;
} {
  const storage: StorageMock = {
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  };

  const from = vi.fn().mockReturnValue(storage);

  const client = {
    storage: { from },
  } as unknown as SupabaseClient;

  return { client, storage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseStorageAdapter", () => {
  let adapter: SupabaseStorageAdapter;
  let client: SupabaseClient;
  let storage: StorageMock;

  beforeEach(() => {
    const mock = createMockSupabaseClient();
    client = mock.client;
    storage = mock.storage;
    adapter = new SupabaseStorageAdapter(client, "test-bucket");
  });

  // ---- upload ---------------------------------------------------------------

  it("upload: builds correct tenant-scoped path and returns FileMetadata", async () => {
    const file = new File(["hello"], "doc.pdf", { type: "application/pdf" });

    storage.upload.mockResolvedValueOnce({
      data: {
        id: "uuid-1",
        path: "t1/inv/42/uuid-1.pdf",
        fullPath: "test-bucket/t1/inv/42/uuid-1.pdf",
      },
      error: null,
    });

    const meta = await adapter.upload({
      tenantId: "t1",
      module: "inv",
      entityId: "42",
      file,
    });

    // Path must start with tenantId.
    expect(storage.upload).toHaveBeenCalledOnce();
    const uploadedPath: string = storage.upload.mock.calls[0][0];
    expect(uploadedPath).toMatch(/^t1\/inv\/42\/[0-9a-f-]+\.pdf$/);

    expect(meta.id).toBeTruthy();
    expect(meta.name).toBe("doc.pdf");
    expect(meta.size).toBe(file.size);
    expect(meta.mimeType).toBe("application/pdf");
    expect(meta.createdAt).toBeInstanceOf(Date);
  });

  it("upload: maps Supabase error to StorageError", async () => {
    storage.upload.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 403, message: "Forbidden" },
    });

    await expect(
      adapter.upload({
        tenantId: "t1",
        module: "inv",
        entityId: "42",
        file: new File(["x"], "f.txt"),
      })
    ).rejects.toThrow(StorageError);
  });

  // ---- download -------------------------------------------------------------

  it("download: returns a Blob", async () => {
    const blob = new Blob(["content"]);
    storage.download.mockResolvedValueOnce({ data: blob, error: null });

    const result = await adapter.download("t1/folder/uuid.pdf");
    expect(result).toBe(blob);
    expect(storage.download).toHaveBeenCalledWith("t1/folder/uuid.pdf");
  });

  it("download: maps 404 to NOT_FOUND", async () => {
    storage.download.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 404, message: "Not Found" },
    });

    try {
      await adapter.download("missing.pdf");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(StorageError);
      expect((err as StorageError).code).toBe("NOT_FOUND");
    }
  });

  // ---- delete ---------------------------------------------------------------

  it("delete: calls remove with exact path", async () => {
    storage.remove.mockResolvedValueOnce({ data: null, error: null });

    await adapter.delete("t1/docs/report.pdf");
    expect(storage.remove).toHaveBeenCalledWith(["t1/docs/report.pdf"]);
  });

  it("delete: maps error to StorageError", async () => {
    storage.remove.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 404, message: "Not Found" },
    });

    await expect(adapter.delete("gone.pdf")).rejects.toThrow(StorageError);
  });

  // ---- list -----------------------------------------------------------------

  it("list: returns mapped FileMetadata array", async () => {
    storage.list.mockResolvedValueOnce({
      data: [
        {
          id: "f1",
          name: "a.pdf",
          created_at: "2026-01-01T00:00:00Z",
          metadata: { size: 1024, mimetype: "application/pdf" },
        },
        {
          id: "f2",
          name: "b.pdf",
          created_at: "2026-01-02T00:00:00Z",
          metadata: null,
        },
      ],
      error: null,
    });

    const result = await adapter.list("t1/docs");

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("a.pdf");
    expect(result.items[0].size).toBe(1024);
    expect(result.items[0].path).toBe("t1/docs/a.pdf");

    // File without metadata gets defaults.
    expect(result.items[1].size).toBe(0);
    expect(result.items[1].mimeType).toBe("application/octet-stream");
  });

  it("list: passes limit and cursor (as offset) options", async () => {
    storage.list.mockResolvedValueOnce({ data: [], error: null });

    await adapter.list("t1/docs", { limit: 50, cursor: "20" });

    expect(storage.list).toHaveBeenCalledWith("t1/docs", {
      limit: 50,
      offset: 20,
    });
  });

  it("list: returns empty items on empty result", async () => {
    storage.list.mockResolvedValueOnce({ data: [], error: null });

    const result = await adapter.list("t1/docs");
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("list: maps error to StorageError", async () => {
    storage.list.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 403, message: "Forbidden" },
    });

    await expect(adapter.list("t1/docs")).rejects.toThrow(StorageError);
  });

  it("list: sets nextCursor when page is full", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      name: `${i}.pdf`,
      created_at: "2026-01-01T00:00:00Z",
      metadata: null,
    }));

    storage.list.mockResolvedValueOnce({ data: items, error: null });

    const result = await adapter.list("t1/docs", { limit: 10 });

    // Offset was 0 + limit 10 → next cursor "10"
    expect(result.nextCursor).toBe("10");
  });
});
