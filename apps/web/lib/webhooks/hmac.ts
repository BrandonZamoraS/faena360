import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappWebhookSignature(input: {
  headers: Headers;
  rawBody: string;
  secret?: string;
  now?: number;
  maxAgeMs?: number;
}): boolean {
  const secret = input.secret ?? process.env.WEBHOOK_WHATSAPP_SECRET;
  const timestamp = input.headers.get("X-Faena-Timestamp")?.trim();
  const signature = input.headers.get("X-Faena-Signature");
  const issuedAt = timestamp ? parseTimestamp(timestamp) : null;

  if (!secret || !timestamp || !signature || issuedAt === null) return false;
  if (
    Math.abs((input.now ?? Date.now()) - issuedAt) > (input.maxAgeMs ?? 300_000)
  )
    return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");
  const received = Buffer.from(signature, "hex");
  const computed = Buffer.from(expected, "hex");
  return (
    received.length === computed.length && timingSafeEqual(received, computed)
  );
}

function parseTimestamp(value: string): number | null {
  const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
