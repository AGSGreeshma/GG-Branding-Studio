/*
 * Model configurations the eval harness compares (plan §21.1, ADR-025).
 *
 * Edit this list rather than the runner. A config is only as good as its
 * availability: a model the account cannot reach shows up as a failed row,
 * which is itself a useful result.
 */

export interface ModelConfig {
  /** Short name used on the command line and in the results table. */
  name: string;
  primary: string;
  fast: string;
  /**
   * Reasoning models drop `temperature` anyway (§20.2); setting this keeps the
   * request honest and avoids a provider warning on every call.
   */
  omitTemperature: boolean;
  /** Optional reasoning effort per tier, for models that support it. */
  primaryEffort?: "none" | "low" | "medium";
  fastEffort?: "none" | "low" | "medium";
  notes?: string;
}

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    name: "gpt-4.1",
    primary: "gpt-4.1",
    fast: "gpt-4.1-mini",
    omitTemperature: false,
    notes: "The only family that honours the hot-generator / cold-critic split (0.9 vs 0.2).",
  },
  {
    name: "gpt-5.4",
    primary: "gpt-5.4",
    fast: "gpt-5.4-mini",
    omitTemperature: true,
    primaryEffort: "low",
    fastEffort: "low",
    notes: "Reasoning family; temperature is ignored.",
  },
  {
    name: "gpt-6-luna",
    primary: "gpt-6-luna",
    fast: "gpt-6-luna",
    omitTemperature: true,
    primaryEffort: "low",
    fastEffort: "none",
    notes: "Same model for both tiers, so the critic is not a cheaper model than the generator.",
  },
  {
    name: "gpt-6-sol",
    primary: "gpt-6-sol",
    fast: "gpt-6-luna",
    omitTemperature: true,
    primaryEffort: "low",
    fastEffort: "none",
    notes: "The production pairing as of 2026-09-26.",
  },
];

export function configByName(name: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((config) => config.name === name);
}
