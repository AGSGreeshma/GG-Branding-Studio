import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getSessionSecret,
  signOwnerId,
  verifySessionToken,
} from "@/lib/session-token";

/**
 * Guest identity (plan §18.6). Next.js 16 renamed middleware to proxy (ADR-010).
 * Gives every visitor a signed, httpOnly gg_uid cookie holding a random UUID.
 */
export async function proxy(request: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) {
    // Misconfiguration: /api/health reports it. Pages still render; owner-scoped APIs return 500.
    return NextResponse.next();
  }

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(existing, secret)) {
    return NextResponse.next();
  }

  const token = await signOwnerId(crypto.randomUUID(), secret);

  // Forward the new cookie on this request too, so handlers can read it on the very first visit.
  request.cookies.set(SESSION_COOKIE, token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
