import { z } from "zod";
import { EntryStageSchema } from "./workflow";

/** Body of POST /api/projects (plan §8, §18.3). */
export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  entry_stage: EntryStageSchema,
  description: z.string().trim().max(2000),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
