import { sessionSecret as signingSecret } from "./session-secret.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 2 * 60 * 60_000;

function secret() {
  return `${signingSecret()}:generated-media`;
}
export function generatedAccessSignature(fileName, expiresAt) {
  return createHmac("sha256", secret())
    .update(`${String(fileName)}:${Number(expiresAt)}`)
    .digest("base64url");
}

export function isTemplateCoverFile(fileName) {
  return /^template-cover-[a-zA-Z0-9_-]+-[a-f0-9-]+\.(?:png|jpe?g|webp)$/i.test(
    String(fileName || ""),
  );
}

export function hasValidGeneratedAccess(fileName, expiresAt, signature, now = Date.now()) {
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  const expected = Buffer.from(generatedAccessSignature(fileName, expiry));
  const received = Buffer.from(String(signature || ""));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function signedGeneratedUrl(value, {
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const source = String(value || "");
  const match = source.match(/^(.*\/generated\/)([^/?#]+)(\?[^#]*)?(#.*)?$/);
  if (!match) return value;
  const fileName = decodeURIComponent(match[2]);
  if (!fileName || fileName !== fileName.split(/[\\/]/).pop()) return value;
  if (isTemplateCoverFile(fileName)) return value;
  const expiresAt = now + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
  const params = new URLSearchParams((match[3] || "").replace(/^\?/, ""));
  params.set("exp", String(expiresAt));
  params.set("sig", generatedAccessSignature(fileName, expiresAt));
  return `${match[1]}${encodeURIComponent(fileName)}?${params}${match[4] || ""}`;
}

export function signGeneratedUrls(value, options, seen = new WeakSet()) {
  if (typeof value === "string") return signedGeneratedUrl(value, options);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => signGeneratedUrls(item, options, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      signGeneratedUrls(item, options, seen),
    ]),
  );
}

