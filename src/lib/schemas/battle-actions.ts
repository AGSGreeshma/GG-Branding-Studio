import { z } from "zod";
import { BrandContextSchema } from "./brand-context";
import { DirectionIdSchema, BattleResultSchema } from "./outputs/battle";
import { WorkflowPlanSchema } from "./workflow";

/*
 * User actions on a Brand Battle (plan §11.1, §14.3): Choose · Combine ·
 * Ask AI to revise · Generate another battle. Client-safe.
 */

export const BattleActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("regenerate"),
    /** Optional "none of these fit because…" carried into the new battle. */
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("merge"),
    direction_ids: z.array(DirectionIdSchema).length(2),
    instruction: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("revise"),
    direction_id: DirectionIdSchema,
    instruction: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("choose"),
    direction_id: DirectionIdSchema,
    /** Lock the positioning against later agents (plan §11.2). */
    lock: z.boolean().default(false),
    expected_version: z.number().int().positive(),
  }),
]);
export type BattleAction = z.infer<typeof BattleActionSchema>;

export const BattleActionResponseSchema = z.object({
  battle: BattleResultSchema,
  context: BrandContextSchema,
  version: z.number().int().positive(),
  plan: WorkflowPlanSchema,
  /** Paths the write skipped because the user locked them. */
  blocked_paths: z.array(z.string()),
  /** Set after "choose": the direction now recorded in the Brand Context. */
  chosen_direction_id: DirectionIdSchema.nullable(),
});
export type BattleActionResponse = z.infer<typeof BattleActionResponseSchema>;
