"use client";

import { useCallback, useRef } from "react";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import { parseSse } from "@/lib/services/events";
import { useBrandStore, useBrandStoreApi } from "./brand-store";

/*
 * Client half of the workflow loop (E10, plan §18.4, ADR-003).
 * One request per module: POST /workflow/next, read the SSE body as it
 * arrives, push each event into the store. The client drives the loop, so
 * nothing has to stay alive between requests.
 */

const UNREACHABLE = "We couldn't reach the studio. Check your connection and try again.";

export interface WorkflowStream {
  /** Runs the next pending module. Ignored while one is already running. */
  run: () => Promise<void>;
  status: "idle" | "running" | "error";
  message: string | null;
  error: string | null;
}

export function useWorkflowStream(): WorkflowStream {
  const store = useBrandStoreApi();
  const status = useBrandStore((state) => state.workflowStatus);
  const message = useBrandStore((state) => state.workflowMessage);
  const error = useBrandStore((state) => state.workflowError);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    const { project, startWorkflow, applyEvent, failWorkflow, finishWorkflow } = store.getState();
    running.current = true;
    startWorkflow();

    try {
      const response = await fetch(`/api/projects/${project.id}/workflow/next`, {
        method: "POST",
        headers: { accept: "text/event-stream" },
      });

      if (!response.ok || !response.body) {
        // A failure before the stream opens still returns the JSON error shape.
        const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null));
        failWorkflow(parsed.success ? parsed.data.error.message : UNREACHABLE);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSse(buffer);
        buffer = rest;
        for (const event of events) applyEvent(event);
      }

      // Flush anything left in a final frame without its trailing blank line.
      const { events } = parseSse(`${buffer}\n\n`);
      for (const event of events) applyEvent(event);
      finishWorkflow();
    } catch {
      failWorkflow(UNREACHABLE);
    } finally {
      running.current = false;
    }
  }, [store]);

  return { run, status, message, error };
}
