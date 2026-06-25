import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappWebhookSignature(input: {
  headers: Headers;
  rawBody: string;
  signedPayload?: string;
  secret?: string;
  now?: number;
  maxAgeMs?: number;
}): boolean {
  const secret = input.secret ?? process.env.WEBHOOK_WHATSAPP_SECRET;
  const timestamp = input.headers.get("X-Faena-Timestamp")?.trim();
  const signature = input.headers.get("X-Faena-Signature");
  const issuedAt = timestamp ? parseTimestamp(timestamp) : null;

  if (!isUsableSecret(secret) || !timestamp || !signature || issuedAt === null)
    return false;
  if (
    Math.abs((input.now ?? Date.now()) - issuedAt) > (input.maxAgeMs ?? 300_000)
  )
    return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  const payload = input.signedPayload ?? input.rawBody;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const received = Buffer.from(signature, "hex");
  const computed = Buffer.from(expected, "hex");
  return (
    received.length === computed.length && timingSafeEqual(received, computed)
  );
}

function isUsableSecret(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !normalized.includes("placeholder") &&
    normalized !== "ci-check-webhook-secret" &&
    normalized !== "replace-with-a-strong-shared-secret"
  );
}

function parseTimestamp(value: string): number | null {
  const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
