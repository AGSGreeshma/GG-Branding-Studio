import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/schemas/errors";
import { describeError, logEvent } from "./log";

export interface RequestMeta {
  requestId: string;
}

export type RouteHandler<C> = (
  request: NextRequest,
  context: C,
  meta: RequestMeta,
) => Promise<Response>;

/**
 * Wraps a route handler: assigns a request_id, returns it in `x-request-id`,
 * and turns any thrown error into the plan §18.5 shape with a user-safe
 * message. Details go to the logs with the same request_id.
 */
export function withErrors<C = unknown>(handler: RouteHandler<C>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const response = await handler(request, context, { requestId });
      try {
        response.headers.set("x-request-id", requestId);
      } catch {
        // Some responses (e.g. Response.redirect) have immutable headers.
      }
      return response;
    } catch (err) {
      const { status, body } = toErrorResponse(err, requestId);
      logEvent(status >= 500 ? "error" : "warn", "request.failed", {
        request_id: requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        status,
        code: body.error.code,
        ...describeError(err),
      });
      return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
    }
  };
}
