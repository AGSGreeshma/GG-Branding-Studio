import { z } from "zod";
import { BrandContextSchema } from "./brand-context";
import { AntiGenericResultSchema } from "./outputs/anti-generic";
import { WorkflowPlanSchema } from "./workflow";

/*
 * What the user does with the Anti-Generic Engine's rewrites (plan §11.1).
 * Nothing is applied until they say so: the engine recommends, they decide.
 */

export const AntiGenericActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    /** The context paths whose rewrite the user accepted. Empty keeps everything as it was. */
    accept_paths: z.array(z.string().max(120)).max(20),
    expected_version: z.number().int().positive(),
  }),
]);
export type AntiGenericAction = z.infer<typeof AntiGenericActionSchema>;

export const AntiGenericActionResponseSchema = z.object({
  anti_generic: AntiGenericResultSchema,
  context: BrandContextSchema,
  version: z.number().int().positive(),
  plan: WorkflowPlanSchema,
  blocked_paths: z.array(z.string()),
  applied_paths: z.array(z.string()),
});
export type AntiGenericActionResponse = z.infer<typeof AntiGenericActionResponseSchema>;
