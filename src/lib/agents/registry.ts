import type { BrandState, ModuleName, WorkflowState } from "@/lib/schemas/workflow";

/*
 * Module registry (plan §7.3, I3). One declaration per capability: what it
 * needs from the Brand Context, what it writes back, where it applies and how
 * expensive it is. The orchestrator plans with it and the validator checks
 * against it, so a plan can never schedule a module whose inputs don't exist.
 *
 * Client-safe on purpose: the sidebar and the Battle view read the labels.
 */

export interface ModuleSpec {
  name: ModuleName;
  /** Shown in the workflow sidebar. */
  label: string;
  /** Context paths that must hold a value before this module can run. */
  requires: string[];
  /** Context paths this module writes. Used for lock checks and skip detection. */
  produces: string[];
  applicableStates: BrandState[];
  needsUserDecision: boolean;
  /** Drives loading UI and parallelism (plan §7.3). */
  cost: "fast" | "slow";
  /** Workflow state while this module runs (I14). */
  state: WorkflowState;
  /** Loading message while it runs (plan §10). */
  loadingLabel: string;
  /** Whether Phase 3 can actually run it. Later phases flip these on. */
  implemented: boolean;
}

const ALL_STATES: BrandState[] = [
  "unbranded",
  "product_without_strong_brand",
  "existing_brand",
  "active_brand",
];

export const MODULE_REGISTRY: Record<ModuleName, ModuleSpec> = {
  interviewer: {
    name: "interviewer",
    label: "Understand your idea",
    requires: [],
    produces: ["problem.statement", "audience.primary", "product.description"],
    applicableStates: ALL_STATES,
    needsUserDecision: false,
    cost: "fast",
    state: "DISCOVERY",
    loadingLabel: "Understanding your idea…",
    implemented: true,
  },
  brand_doctor: {
    name: "brand_doctor",
    label: "Diagnose the brand",
    requires: ["product.description"],
    // Stage D: the Doctor also drafts the brand rules the Guardian checks against (§14.2, J12).
    produces: ["problem.statement", "positioning.category", "brand_rules"],
    applicableStates: ["product_without_strong_brand", "existing_brand", "active_brand"],
    needsUserDecision: false,
    cost: "slow",
    state: "ANALYSIS",
    loadingLabel: "Diagnosing your brand…",
    implemented: false,
  },
  /*
   * The Battle is two steps, not one (ADR-023): generation is the expensive
   * call, and splitting it keeps each request well inside maxDuration and lets
   * a failed critique be retried without paying for the directions again.
   */
  brand_battle: {
    name: "brand_battle",
    label: "Compete strategic directions",
    requires: ["problem.statement", "audience.primary", "product.description"],
    // Directions are proposals, not context: nothing is written until the user chooses.
    produces: [],
    applicableStates: ALL_STATES,
    needsUserDecision: false,
    cost: "slow",
    state: "POSITIONING",
    loadingLabel: "Competing three strategic directions…",
    implemented: true,
  },
  battle_critique: {
    name: "battle_critique",
    label: "Challenge the directions",
    requires: ["problem.statement", "audience.primary"],
    // The user's choice at the end of this step is what writes the context.
    produces: [
      "selected_direction",
      "positioning.category",
      "positioning.statement",
      "positioning.differentiator",
      "positioning.value_proposition",
      "positioning.competitive_angle",
      "personality.traits",
    ],
    applicableStates: ALL_STATES,
    needsUserDecision: true,
    cost: "fast",
    state: "CRITIQUE",
    loadingLabel: "The critic is reviewing the three directions…",
    implemented: true,
  },
  audience_shifter: {
    name: "audience_shifter",
    label: "Reframe the audience",
    requires: ["product.description", "audience.primary"],
    produces: ["audience.secondary", "audience.needs"],
    applicableStates: ALL_STATES,
    needsUserDecision: true,
    cost: "slow",
    state: "POSITIONING",
    loadingLabel: "Reframing your audience…",
    // Solo scope (ADR-018): a tab beside the Battle results in Phase 7, not a plan step.
    implemented: false,
  },
  five_worlds: {
    name: "five_worlds",
    label: "Explore identities",
    requires: ["positioning.statement"],
    produces: [
      "personality.traits",
      "identity.naming_direction",
      "identity.candidate_names",
      "voice.tone",
      "voice.rules",
      "voice.examples",
      "visual.colors",
      "visual.typography",
      "visual.imagery",
      "visual.composition",
    ],
    applicableStates: ALL_STATES,
    needsUserDecision: true,
    cost: "slow",
    state: "EXPLORATION",
    loadingLabel: "Exploring three identity worlds…",
    implemented: true,
  },
  anti_generic: {
    name: "anti_generic",
    label: "Challenge generic language",
    requires: ["positioning.statement"],
    produces: [
      "positioning.statement",
      "positioning.differentiator",
      "positioning.value_proposition",
      "identity.naming_direction",
      "identity.tagline",
      "messaging.one_line_pitch",
    ],
    // The user applies the rewrites; nothing changes behind their back (§11.1).
    applicableStates: ALL_STATES,
    needsUserDecision: true,
    cost: "slow",
    state: "CRITIQUE",
    loadingLabel: "Challenging generic language…",
    implemented: true,
  },
  brand_builder: {
    name: "brand_builder",
    label: "Build the Brand System",
    requires: ["positioning.statement", "audience.primary"],
    produces: ["identity.name", "voice.tone", "brand_rules", "messaging.one_line_pitch"],
    applicableStates: ALL_STATES,
    needsUserDecision: false,
    cost: "slow",
    state: "BRAND_BUILDING",
    loadingLabel: "Building your Brand System…",
    implemented: false,
  },
  launch_kit: {
    name: "launch_kit",
    label: "Prepare the launch",
    requires: ["positioning.statement", "messaging.one_line_pitch"],
    produces: ["launch.headline", "launch.social_posts", "launch.announcement"],
    applicableStates: ALL_STATES,
    needsUserDecision: false,
    cost: "slow",
    state: "LAUNCH",
    loadingLabel: "Preparing your launch kit…",
    implemented: false,
  },
  consistency_guardian: {
    name: "consistency_guardian",
    label: "Guard consistency",
    requires: ["brand_rules"],
    produces: [],
    applicableStates: ALL_STATES,
    needsUserDecision: false,
    cost: "fast",
    state: "CONSISTENCY_CHECK",
    loadingLabel: "Checking against your brand…",
    implemented: false,
  },
};

export const MODULE_LABELS = Object.fromEntries(
  Object.values(MODULE_REGISTRY).map((spec) => [spec.name, spec.label]),
) as Record<ModuleName, string>;

export function moduleSpec(name: ModuleName): ModuleSpec {
  return MODULE_REGISTRY[name];
}

/** Modules that critique or check existing work; one must precede the Brand Builder (§7.3). */
export const CRITIQUE_MODULES: ModuleName[] = ["anti_generic", "consistency_guardian"];
