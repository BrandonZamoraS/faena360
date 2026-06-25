import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhatsappWebhookSignature } from "./hmac";

const secret = "test-whatsapp-secret";
const timestamp = "1719050400000";
const rawBody = JSON.stringify({ phone: "+54 9 11 1234 5678", text: "Hola" });
const validSignature = createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");
const signedPayload = JSON.stringify({ method: "GET", tipo: "gasto" });
const validPayloadSignature = createHmac("sha256", secret)
  .update(`${timestamp}.${signedPayload}`)
  .digest("hex");

function buildHeaders(signature: string) {
  return new Headers({
    "X-Faena-Timestamp": timestamp,
    "X-Faena-Signature": signature,
  });
}

describe("verifyWhatsappWebhookSignature", () => {
  it("accepts an exact lowercase hex sha256 signature", () => {
    expect(
      verifyWhatsappWebhookSignature({
        headers: buildHeaders(validSignature),
        rawBody,
        secret,
        now: Number(timestamp),
      })
    ).toBe(true);
  });

  it.each([
    `${validSignature}g`,
    `${validSignature}00`,
    `sha256=${validSignature}`,
    validSignature.toUpperCase(),
  ])("rejects malformed signature %s", (signature) => {
    expect(
      verifyWhatsappWebhookSignature({
        headers: buildHeaders(signature),
        rawBody,
        secret,
        now: Number(timestamp),
      })
    ).toBe(false);
  });

  it.each([
    "",
    "placeholder-webhook-whatsapp-secret",
    "replace-with-a-strong-shared-secret",
    "ci-check-webhook-secret",
  ])("rejects unusable configured secret %s", (configuredSecret) => {
    expect(
      verifyWhatsappWebhookSignature({
        headers: buildHeaders(validSignature),
        rawBody,
        secret: configuredSecret,
        now: Number(timestamp),
      })
    ).toBe(false);
  });

  it("accepts an alternate canonical signed payload when provided", () => {
    expect(
      verifyWhatsappWebhookSignature({
        headers: buildHeaders(validPayloadSignature),
        rawBody,
        signedPayload,
        secret,
        now: Number(timestamp),
      })
    ).toBe(true);
  });

  it("rejects a signature when the canonical signed payload is tampered", () => {
    expect(
      verifyWhatsappWebhookSignature({
        headers: buildHeaders(validPayloadSignature),
        rawBody,
        signedPayload: JSON.stringify({ method: "GET", tipo: "inicio_jornada" }),
        secret,
        now: Number(timestamp),
      })
    ).toBe(false);
  });
});
