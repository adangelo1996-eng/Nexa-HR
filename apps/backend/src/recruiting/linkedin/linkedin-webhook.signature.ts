import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const SIGNATURE_HEADERS = [
  "x-nexa-signature",
  "x-nexa-webhook-signature",
  "x-linkedin-signature",
  "x-hub-signature-256"
] as const;

function parseSignatureHeader(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

export function verifyLinkedInWebhookSignature(request: Request, rawBody: Buffer, secret: string): boolean {
  if (!secret.trim()) {
    return false;
  }
  let provided: Buffer | null = null;
  for (const name of SIGNATURE_HEADERS) {
    const v = request.headers[name];
    if (typeof v === "string" && v.trim()) {
      provided = parseSignatureHeader(v);
      if (provided) break;
    }
  }
  if (!provided) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
