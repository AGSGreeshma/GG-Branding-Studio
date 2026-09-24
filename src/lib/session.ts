import "server-only";
import { cookies } from "next/headers";
import { AppError } from "@/lib/schemas/errors";
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from "./session-token";

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signOwnerId,
  verifySessionToken,
} from "./session-token";

/**
 * The guest owner id from the signed gg_uid cookie (set by src/proxy.ts).
 * Every project query is scoped by this id.
 * Throws UNAUTHORIZED when the cookie is missing or tampered with.
 */
export async function getOwnerId(): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new AppError("INTERNAL", { message: "SESSION_SECRET is missing or shorter than 32 chars" });
  }
  const store = await cookies();
  const ownerId = await verifySessionToken(store.get(SESSION_COOKIE)?.value, secret);
  if (!ownerId) {
    throw new AppError("UNAUTHORIZED", { message: "Missing or invalid gg_uid cookie" });
  }
  return ownerId;
}
