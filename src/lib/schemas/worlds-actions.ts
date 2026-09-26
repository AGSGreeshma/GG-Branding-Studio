import { z } from "zod";
import { BrandContextSchema } from "./brand-context";
import { WorldIdSchema, WorldsResultSchema } from "./outputs/worlds";
import { WorkflowPlanSchema } from "./workflow";

/*
 * User actions on the identity worlds (plan §11.1, §14.5): Choose · Combine ·
 * Ask AI to revise · Explore 2 more worlds · Generate different worlds.
 * Client-safe.
 */

export const WorldsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("regenerate"),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    /** Adds w4 and w5 to the three that already exist, in its own request. */
    action: z.literal("explore"),
  }),
  z.object({
    action: z.literal("merge"),
    world_ids: z.array(WorldIdSchema).length(2),
    instruction: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("revise"),
    world_id: WorldIdSchema,
    instruction: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("choose"),
    world_id: WorldIdSchema,
    lock: z.boolean().default(false),
    expected_version: z.number().int().positive(),
  }),
]);
export type WorldsAction = z.infer<typeof WorldsActionSchema>;

export const WorldsActionResponseSchema = z.object({
  worlds: WorldsResultSchema,
  context: BrandContextSchema,
  version: z.number().int().positive(),
  plan: WorkflowPlanSchema,
  blocked_paths: z.array(z.string()),
  chosen_world_id: WorldIdSchema.nullable(),
});
export type WorldsActionResponse = z.infer<typeof WorldsActionResponseSchema>;
