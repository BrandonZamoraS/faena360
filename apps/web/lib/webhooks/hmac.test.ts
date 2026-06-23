import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhatsappWebhookSignature } from "./hmac";

const secret = "test-whatsapp-secret";
const timestamp = "1719050400000";
const rawBody = JSON.stringify({ phone: "+54 9 11 1234 5678", text: "Hola" });
const validSignature = createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
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
});
