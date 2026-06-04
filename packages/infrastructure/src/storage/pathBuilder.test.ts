import { describe, it, expect } from "vitest";
import type { UploadParams } from "@faena360/domain";
import { buildPath } from "./pathBuilder";

function makeParams(overrides?: Partial<UploadParams>): UploadParams {
  return {
    tenantId: "t1",
    module: "invoices",
    entityId: "inv-42",
    file: new File(["dummy"], "invoice-2026.pdf", { type: "application/pdf" }),
    ...overrides,
  };
}

describe("buildPath", () => {
  it("builds a path with tenantId, module, entityId, uuid, and extension", () => {
    const path = buildPath(makeParams());

    // Pattern: t1/invoices/inv-42/<uuid>.pdf
    const pattern = /^t1\/invoices\/inv-42\/[0-9a-f-]+\.pdf$/;
    expect(path).toMatch(pattern);
  });

  it("uses fileName override when provided", () => {
    const path = buildPath(makeParams({ fileName: "custom.xlsx" }));

    expect(path).toMatch(/\.xlsx$/);
  });

  it("extracts extension from a file with multiple dots", () => {
    const params = makeParams({
      file: new File(["data"], "backup.v2.tar.gz", {
        type: "application/gzip",
      }),
    });
    const path = buildPath(params);

    expect(path).toMatch(/\.gz$/);
  });

  it("falls back to 'bin' when file name has no extension", () => {
    const params = makeParams({
      file: new File(["raw"], "README", { type: "text/plain" }),
    });
    const path = buildPath(params);

    expect(path).toMatch(/\.bin$/);
  });

  it("handles Blob input without name by falling back", () => {
    const params = makeParams({
      file: new Blob(["blob data"]),
      fileName: "export.csv",
    });
    const path = buildPath(params);

    expect(path).toMatch(/\.csv$/);
  });

  it("generates a different UUID on each call (deterministic per invocation)", () => {
    const p = makeParams();
    const path1 = buildPath(p);
    const path2 = buildPath(p);

    // UUIDs should differ.
    expect(path1).not.toBe(path2);
  });

  it("sanitises nothing — just builds the literal segments", () => {
    const path = buildPath(
      makeParams({
        tenantId: "tenant-1",
        module: "invoicing",
        entityId: "entity-abc",
      })
    );

    expect(path).toMatch(/^tenant-1\/invoicing\/entity-abc\/[0-9a-f-]+\.pdf$/);
  });
});
