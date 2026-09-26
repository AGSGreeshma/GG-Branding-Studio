import "server-only";
import { generateStructured } from "@/lib/ai/llm";
import type { LlmTrace } from "@/lib/ai/types";
import * as prompt from "@/lib/prompts/worlds";
import type { BrandContext } from "@/lib/schemas/brand-context";
import {
  WORLD_IDS,
  type World,
  type WorldChecks,
  type WorldId,
} from "@/lib/schemas/outputs/worlds";
import { checkTypography } from "@/lib/visual/fonts";
import { checkPalette } from "@/lib/visual/palette";

/*
 * Five Worlds agent (plan §14.5, M1–M8). Pure: slice in, validated worlds out.
 *
 * Everything the schema cannot state is enforced here: list lengths, and the
 * deterministic colour and typography checks (§14.8). Hex values that can be
 * repaired are repaired; anything else is reported as an issue for the card
 * rather than quietly accepted (CLAUDE.md, AI rule 9).
 */

const MAX_PERSONALITY = 5;
const VOICE_RULES = 3;
const MAX_NAMES = 3;
const MAX_LIST = 3;
const MAX_COLORS = 5;

function cleanList(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

/** Applies the code-side rules to one world and returns it with its check results. */
export function normaliseWorld(world: World): { world: World; checks: WorldChecks } {
  const palette = checkPalette(world.colors.slice(0, MAX_COLORS));
  const typography = checkTypography(world.typography.slice(0, 2));

  const normalised: World = {
    ...world,
    name: world.name.trim(),
    summary: world.summary.trim(),
    personality: cleanList(world.personality, MAX_PERSONALITY),
    voice_rules: cleanList(world.voice_rules, VOICE_RULES),
    voice_sample_line: world.voice_sample_line.trim(),
    sample_names: world.sample_names
      .filter((entry) => entry.name.trim())
      .slice(0, MAX_NAMES)
      .map((entry) => ({ name: entry.name.trim(), rationale: entry.rationale.trim() })),
    // checkPalette returns the same colours with every fixable hex repaired.
    colors: palette.colors,
    typography: typography.entries.map((entry) => entry.spec),
    imagery: cleanList(world.imagery, MAX_LIST),
    composition: cleanList(world.composition, MAX_LIST),
    risks: cleanList(world.risks, MAX_LIST),
    opportunities: cleanList(world.opportunities, MAX_LIST),
    obvious_ideas_rejected: cleanList(world.obvious_ideas_rejected, MAX_LIST),
  };

  const checks: WorldChecks = {
    world_id: world.id,
    issues: [
      ...palette.issues.map((issue) => ({
        kind: issue.kind,
        severity: issue.severity,
        message: issue.message,
      })),
      ...typography.issues.map((issue) => ({
        kind: "font" as const,
        severity: issue.severity,
        message: issue.message,
      })),
    ],
    contrast: palette.pair
      ? {
          ratio: palette.pair.ratio,
          level: palette.pair.level,
          text: palette.pair.text.name,
          background: palette.pair.background.name,
        }
      : null,
    font_families: typography.families.map((font) => font.family),
  };

  return { world: normalised, checks };
}

/** Keeps worlds in id order and drops anything the model invented an id for. */
function orderWorlds(worlds: World[], allowed: readonly WorldId[]): World[] {
  const byId = new Map(worlds.map((world) => [world.id, world]));
  const ordered = allowed
    .map((id) => byId.get(id))
    .filter((world): world is World => world !== undefined);
  return ordered.length === allowed.length ? ordered : worlds.slice(0, allowed.length);
}

export function sliceForWorlds(context: BrandContext): prompt.WorldsSlice {
  return {
    direction_name: context.selected_direction?.name ?? "",
    direction_summary: context.selected_direction?.summary ?? "",
    positioning: context.positioning,
    personality: context.personality.traits,
    audience: context.audience.primary,
    problem: context.problem.statement,
    product: context.product.description,
  };
}

export interface WorldsResultPart {
  worlds: World[];
  checks: WorldChecks[];
  trace: LlmTrace;
}

function finish(worlds: World[], trace: LlmTrace): WorldsResultPart {
  const normalised = worlds.map(normaliseWorld);
  return {
    worlds: normalised.map((entry) => entry.world),
    checks: normalised.map((entry) => entry.checks),
    trace,
  };
}

/** The first three worlds (ADR-008's M1 floor). */
export async function runWorldsGenerate(
  slice: prompt.WorldsSlice,
  note?: string | null,
): Promise<WorldsResultPart> {
  const { result, trace } = await generateStructured({
    agent: prompt.generateMeta.agent,
    schema: prompt.generateMeta.schema,
    system: prompt.generateSystem,
    prompt: prompt.buildGenerateUser(slice, note),
    tier: prompt.generateMeta.tier,
    temperature: prompt.generateMeta.temperature,
    maxTokens: prompt.generateMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  return finish(orderWorlds(result.worlds, ["w1", "w2", "w3"]), trace);
}

/** "Explore 2 more worlds": w4 and w5, in their own request. */
export async function runWorldsExplore(
  slice: prompt.WorldsSlice,
  existing: World[],
): Promise<WorldsResultPart> {
  const { result, trace } = await generateStructured({
    agent: prompt.exploreMeta.agent,
    schema: prompt.exploreMeta.schema,
    system: prompt.exploreSystem,
    prompt: prompt.buildExploreUser(slice, existing),
    tier: prompt.exploreMeta.tier,
    temperature: prompt.exploreMeta.temperature,
    maxTokens: prompt.exploreMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  return finish(orderWorlds(result.worlds, ["w4", "w5"]), trace);
}

export interface SingleWorldResult {
  world: World;
  checks: WorldChecks;
  note: string;
  trace: LlmTrace;
}

export async function runWorldsMerge(
  slice: prompt.WorldsSlice,
  first: World,
  second: World,
  instruction: string | null,
): Promise<SingleWorldResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.mergeMeta.agent,
    schema: prompt.mergeMeta.schema,
    system: prompt.mergeSystem,
    prompt: prompt.buildMergeUser(slice, first, second, instruction),
    tier: prompt.mergeMeta.tier,
    temperature: prompt.mergeMeta.temperature,
    maxTokens: prompt.mergeMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  const { world, checks } = normaliseWorld({ ...result.world, id: "merged" });
  return { world, checks, note: result.merge_note.trim(), trace };
}

export async function runWorldsRevise(
  slice: prompt.WorldsSlice,
  world: World,
  instruction: string,
): Promise<SingleWorldResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.reviseMeta.agent,
    schema: prompt.reviseMeta.schema,
    system: prompt.reviseSystem,
    prompt: prompt.buildReviseUser(slice, world, instruction),
    tier: prompt.reviseMeta.tier,
    temperature: prompt.reviseMeta.temperature,
    maxTokens: prompt.reviseMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  const revised = normaliseWorld({ ...result.world, id: world.id });
  return {
    world: revised.world,
    checks: revised.checks,
    note: result.change_note.trim(),
    trace,
  };
}

/** True when two worlds are describable by the same personality (M8). */
export function worldsAreDistinct(worlds: readonly World[]): boolean {
  const signatures = worlds.map((world) =>
    world.personality
      .map((trait) => trait.toLowerCase().trim())
      .sort()
      .join("|"),
  );
  return new Set(signatures).size === signatures.length;
}

export const PROMPT_VERSION = prompt.PROMPT_VERSION;
export const ALL_WORLD_IDS = WORLD_IDS;
