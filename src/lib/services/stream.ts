import "server-only";
import { toErrorResponse } from "@/lib/schemas/errors";
import { encodeEvent, type WorkflowEvent } from "./events";
import { describeError, logEvent } from "./log";

/*
 * Server half of the workflow stream (plan §18.4). A module run streams its
 * own progress in the response body and the connection closes when it ends, so
 * nothing has to stay alive between requests (ADR-003).
 */

export type Emit = (event: WorkflowEvent) => void;

/**
 * Runs `handler`, streaming whatever it emits. A thrown error becomes a final
 * `error` event with the user-safe message (plan §18.5) instead of a dead
 * connection, so the workspace can show it and offer Try Again.
 */
export function eventStream(
  handler: (emit: Emit) => Promise<void>,
  meta: { requestId: string; path: string },
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };

      try {
        await handler(emit);
      } catch (err) {
        const { status, body } = toErrorResponse(err, meta.requestId);
        logEvent(status >= 500 ? "error" : "warn", "stream.failed", {
          request_id: meta.requestId,
          path: meta.path,
          status,
          code: body.error.code,
          ...describeError(err),
        });
        emit({ type: "error", error: body.error });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Stops proxies buffering the stream into one lump.
      "x-accel-buffering": "no",
      "x-request-id": meta.requestId,
    },
  });
}
