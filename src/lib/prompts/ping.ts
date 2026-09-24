import { PingSchema } from "@/lib/schemas/outputs/ping";
import type { ModelTier } from "@/lib/ai/types";

/*
 * Prompt registry entry (plan §13.2) for the health-check ping.
 * Also the template every agent prompt file follows.
 */

export const PROMPT_VERSION = "1.0.0";

export const meta = {
  agent: "health_ping",
  tier: "fast" as ModelTier,
  temperature: 0.2,
  schema: PingSchema,
};

export const system =
  "You are the health check for GG Branding Studio. Answer with JSON that matches the schema. Keep the message under ten words.";

export function buildUser(): string {
  return 'Confirm you can produce structured output. Set "ok" to true and write a short friendly "message".';
}
