import { z } from "zod";

/** Dotted Brand Context path, e.g. "identity.tagline" or "positioning.statement". */
export const ContextPathSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, "Must be a dotted Brand Context path");

export const DecisionSourceSchema = z.enum(["user", "ai_accepted"]);
export type DecisionSource = z.infer<typeof DecisionSourceSchema>;

/**
 * A user decision about one Brand Context field (plan §11.2).
 * Locked decisions are hard constraints for every agent (CLAUDE.md, AI rule 6).
 * Decisions are written by the user, never by a model, so `value` is any JSON value.
 */
export const DecisionSchema = z.object({
  path: ContextPathSchema,
  value: z.json(),
  locked: z.boolean(),
  reason: z.string().max(2000),
  source: DecisionSourceSchema,
});
export type Decision = z.infer<typeof DecisionSchema>;

/** Body of PATCH /api/projects/[id]/decisions (plan §18.3). */
export const DecisionPatchSchema = DecisionSchema.extend({
  expected_version: z.number().int().nonnegative(),
});
export type DecisionPatch = z.infer<typeof DecisionPatchSchema>;
