import { z } from "zod";
import { BattleResultSchema } from "@/lib/schemas/outputs/battle";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import { ModuleNameSchema, WorkflowPlanSchema } from "@/lib/schemas/workflow";

/*
 * Workflow event stream (plan §18.4, ADR-003, E10).
 * Each module run is its own request and streams its own progress; the client
 * drives the loop. Events are SSE frames carrying JSON, and the same Zod union
 * is used to write them on the server and parse them on the client.
 *
 * Client-safe: no server imports here, so the hook can reuse the parser.
 */

export const WorkflowEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workflow.planned"),
    plan: WorkflowPlanSchema,
    fallback_used: z.boolean(),
    /** Why the static plan was used, when it was. */
    fallback_reason: z.string().nullable(),
  }),
  z.object({
    type: z.literal("module.started"),
    run_id: z.string().nullable(),
    module: ModuleNameSchema,
    /** Feeds the loading message (plan §10). */
    label: z.string(),
  }),
  z.object({
    type: z.literal("module.progress"),
    run_id: z.string().nullable(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("agent.completed"),
    run_id: z.string().nullable(),
    parent_run_id: z.string().nullable(),
    agent: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("critique.finding"),
    run_id: z.string().nullable(),
    target_path: z.string(),
    kind: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    detail: z.string(),
  }),
  z.object({
    type: z.literal("module.completed"),
    run_id: z.string().nullable(),
    module: ModuleNameSchema,
    plan: WorkflowPlanSchema,
    /** Present for modules that produce a battle; other modules add their own. */
    battle: BattleResultSchema.nullable(),
  }),
  z.object({
    type: z.literal("decision.required"),
    decision_id: z.string(),
    prompt: z.string(),
    options: z.array(z.string()),
  }),
  z.object({
    type: z.literal("context.updated"),
    version: z.number().int().positive(),
    changed_paths: z.array(z.string()),
  }),
  z.object({
    type: z.literal("error"),
    error: ErrorBodySchema.shape.error,
  }),
]);
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
export type WorkflowEventType = WorkflowEvent["type"];

/** One SSE frame: a named event whose data is the JSON event itself. */
export function encodeEvent(event: WorkflowEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export interface SseParseResult {
  events: WorkflowEvent[];
  /** Whatever is left of a frame that hasn't finished arriving. */
  rest: string;
}

/**
 * Parses whatever has arrived so far. Frames are separated by a blank line;
 * anything the schema rejects is dropped rather than breaking the stream.
 */
export function parseSse(buffer: string): SseParseResult {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: WorkflowEvent[] = [];

  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      const parsed = WorkflowEventSchema.safeParse(JSON.parse(data));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // A frame that isn't JSON is not worth failing the whole run over.
    }
  }
  return { events, rest };
}
