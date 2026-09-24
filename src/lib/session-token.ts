/*
 * Guest identity token (plan §18.6, ADR-005): "<uuid>.<base64url HMAC-SHA256(uuid)>".
 * Pure Web Crypto, no Node APIs, so it runs in the proxy, route handlers,
 * the edge runtime and tests alike. No "server-only" import on purpose:
 * src/proxy.ts imports this file.
 */

export const SESSION_COOKIE = "gg_uid";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MIN_SECRET_LENGTH = 32;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

/** SESSION_SECRET if it is set and long enough, otherwise null. */
export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function getKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function signOwnerId(ownerId: string, secret: string): Promise<string> {
  if (!UUID_RE.test(ownerId)) throw new Error("Owner id must be a UUID");
  const signature = await crypto.subtle.sign("HMAC", await getKey(secret), encoder.encode(ownerId));
  return `${ownerId}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the owner UUID if the token is well formed and correctly signed, otherwise null. */
export async function verifySessionToken(
  token: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const ownerId = token.slice(0, dot);
  const signature = fromBase64Url(token.slice(dot + 1));
  if (!UUID_RE.test(ownerId) || !signature) return null;
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await getKey(secret),
    signature,
    encoder.encode(ownerId),
  );
  return valid ? ownerId : null;
}
