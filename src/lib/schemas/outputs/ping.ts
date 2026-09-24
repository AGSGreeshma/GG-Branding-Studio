import { z } from "zod";

/** Tiny output schema used by /api/health?ai=1 to prove structured output works end to end. */
export const PingSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type Ping = z.infer<typeof PingSchema>;
