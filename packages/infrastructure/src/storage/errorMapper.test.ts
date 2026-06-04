import { describe, it, expect } from "vitest";
import { StorageError } from "@faena360/domain";
import { mapError } from "./errorMapper";

describe("mapError", () => {
  it("maps 403 statusCode to PERMISSION_DENIED", () => {
    const err = { statusCode: "403", message: "Forbidden" } as unknown;
    const result = mapError(err);

    expect(result).toBeInstanceOf(StorageError);
    expect(result.code).toBe("PERMISSION_DENIED");
    expect(result.message).toBe("Forbidden");
    expect(result.cause).toBe(err);
  });

  it("maps 401 statusCode to PERMISSION_DENIED", () => {
    const err = { statusCode: "401", message: "Unauthorized" } as unknown;
    const result = mapError(err);

    expect(result.code).toBe("PERMISSION_DENIED");
  });

  it("maps 404 statusCode to NOT_FOUND", () => {
    const err = { statusCode: "404", message: "Not Found" } as unknown;
    const result = mapError(err);

    expect(result.code).toBe("NOT_FOUND");
    expect(result.message).toBe("Not Found");
    expect(result.cause).toBe(err);
  });

  it("maps upload operation errors to UPLOAD_FAILED (other status)", () => {
    const err = { statusCode: "500", message: "Server error" } as unknown;
    const result = mapError(err, "upload");

    expect(result.code).toBe("UPLOAD_FAILED");
  });

  it("maps non-HTTP upload errors to UPLOAD_FAILED", () => {
    const err = new Error("Network failure");
    const result = mapError(err, "upload");

    expect(result.code).toBe("UPLOAD_FAILED");
    expect(result.cause).toBe(err);
  });

  it("maps unknown errors to UNKNOWN when no operation context", () => {
    const err = new Error("Something weird happened");
    const result = mapError(err);

    expect(result.code).toBe("UNKNOWN");
  });

  it("maps 500 to UNKNOWN for non-upload operations", () => {
    const err = { statusCode: "500", message: "Boom" } as unknown;
    const result = mapError(err, "download");

    expect(result.code).toBe("UNKNOWN");
  });

  it("preserves error cause for debugging", () => {
    const err = { statusCode: "403", message: "nope" } as unknown;
    const result = mapError(err);

    expect(result.cause).toBe(err);
  });

  it("coerces numeric statusCode to number", () => {
    const err = { statusCode: 404, message: "Not Found" } as unknown;
    const result = mapError(err);

    expect(result.code).toBe("NOT_FOUND");
  });
});
