/*
 * Anti-Generic Engine evaluation (plan §21.1, F11, N13).
 *
 * Runs each fixture through the real pipeline — Brand Battle, then Five
 * Worlds, then the Anti-Generic rounds — and reports what the engine actually
 * changed: deterministic lexicon hits, genericity risk and distinctiveness
 * before and after, latency and tokens.
 *
 *   pnpm eval:antigeneric
 *   pnpm eval:antigeneric -- --configs gpt-6-luna --judge gpt-6-luna
 *   pnpm eval:antigeneric -- --fixtures college-teammates --dry-run
 *
 * The judge matters even more here than in the Battle comparison: the scores
 * before and after must come from the same critic or the delta means nothing.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { runBattleChallenge, runBattleGenerate } from "@/lib/agents/battle";
import { runWorldsGenerate } from "@/lib/agents/five-worlds";
import { detectGeneric, countBySeverity } from "@/lib/lexicon/detect";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import { isAppError } from "@/lib/schemas/errors";
import type { GenericScores } from "@/lib/schemas/outputs/anti-generic";
import {
  collectFields,
  runAntiGenericRound,
  sliceForAntiGeneric,
} from "@/lib/services/anti-generic";
import { applyContextWrites } from "@/lib/services/context-manager";
import { MODEL_CONFIGS, type ModelConfig } from "./configs";
import { writeSection } from "./summary";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures", "battle");
const resultsDir = join(here, "results");

/* ------------------------------ fixtures ------------------------------ */

const FixtureSchema = z.object({
  id: z.string(),
  label: z.string(),
  slice: z.object({
    problem: z.object({
      statement: z.string(),
      importance: z.string(),
      existing_alternatives: z.array(z.string()),
    }),
    audience: z.object({
      primary: z.array(z.string()),
      secondary: z.array(z.string()),
      needs: z.array(z.string()),
      pain_points: z.array(z.string()),
      behaviors: z.array(z.string()),
    }),
    product: z.object({
      description: z.string(),
      features: z.array(z.string()),
      benefits: z.array(z.string()),
    }),
    assumptions: z.array(z.string()),
  }),
});
type Fixture = z.infer<typeof FixtureSchema>;

function loadFixtures(): Fixture[] {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => FixtureSchema.parse(JSON.parse(readFileSync(join(fixturesDir, name), "utf8"))))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** A Brand Context as it would look when the engine runs, built by the real code. */
function contextFor(fixture: Fixture): BrandContext {
  const base = emptyBrandContext({ name: fixture.label, stage: "idea" });
  return {
    ...base,
    problem: fixture.slice.problem,
    audience: fixture.slice.audience,
    product: fixture.slice.product,
    meta: { ...base.meta, assumptions: fixture.slice.assumptions },
  };
}

/* -------------------------------- args -------------------------------- */

interface Args {
  configs: ModelConfig[];
  fixtures: Fixture[];
  judge: string | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index !== -1 ? (argv[index + 1] ?? null) : null;
  };
  const list = (flag: string) => {
    const raw = value(flag);
    return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : null;
  };

  const wantedConfigs = list("--configs");
  const configs = wantedConfigs
    ? wantedConfigs.map((name) => {
        const found = MODEL_CONFIGS.find((config) => config.name === name);
        if (!found) throw new Error(`Unknown config "${name}"`);
        return found;
      })
    : MODEL_CONFIGS;

  const all = loadFixtures();
  const wantedFixtures = list("--fixtures");
  const fixtures = wantedFixtures
    ? wantedFixtures.map((id) => {
        const found = all.find((fixture) => fixture.id === id);
        if (!found) throw new Error(`Unknown fixture "${id}"`);
        return found;
      })
    : all;

  return { configs, fixtures, judge: value("--judge"), dryRun: argv.includes("--dry-run") };
}

function applyConfig(config: ModelConfig, judge: string | null): void {
  process.env.MODEL_PRIMARY = config.primary;
  process.env.MODEL_FAST = judge ?? config.fast;
  process.env.OPENAI_OMIT_TEMPERATURE = config.omitTemperature ? "1" : "0";
  process.env.MODEL_PRIMARY_REASONING_EFFORT = config.primaryEffort ?? "";
  process.env.MODEL_FAST_REASONING_EFFORT = config.fastEffort ?? "";
  process.env.OPENAI_REASONING_SUMMARY = "off";
}

/* ------------------------------- metrics ------------------------------- */

interface FieldMovement {
  path: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
  lexiconBefore: number;
  lexiconHighBefore: number;
  lexiconAfter: number;
  lexiconHighAfter: number;
  scoresBefore: GenericScores | null;
  scoresAfter: GenericScores | null;
}

interface RunResult {
  config: string;
  fixture: string;
  judge: string;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  stage: "battle" | "worlds" | "anti_generic" | "done";
  rounds: number;
  callCount: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  fields: FieldMovement[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

const MAX_EVAL_ROUNDS = 2;

async function runOne(config: ModelConfig, fixture: Fixture, judge: string | null): Promise<RunResult> {
  applyConfig(config, judge);

  const result: RunResult = {
    config: config.name,
    fixture: fixture.id,
    judge: judge ?? config.fast,
    ok: false,
    errorCode: null,
    errorMessage: null,
    stage: "battle",
    rounds: 0,
    callCount: 0,
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    fields: [],
  };

  const track = (trace: { latencyMs: number; tokensIn: number | null; tokensOut: number | null }) => {
    result.callCount += 1;
    result.latencyMs += trace.latencyMs;
    result.tokensIn += trace.tokensIn ?? 0;
    result.tokensOut += trace.tokensOut ?? 0;
  };

  const fail = (err: unknown) => {
    result.errorCode = isAppError(err) ? err.code : "UNKNOWN";
    result.errorMessage = err instanceof Error ? err.message.slice(0, 180) : String(err);
    return result;
  };

  let context = contextFor(fixture);
  const battleSlice = {
    problem: context.problem,
    audience: context.audience,
    product: context.product,
    assumptions: context.meta.assumptions,
  };

  // 1. Brand Battle, then take the critic's recommendation — the same choice
  //    the product nudges the user towards.
  try {
    const generated = await runBattleGenerate(battleSlice);
    track(generated.trace);
    const challenged = await runBattleChallenge(battleSlice, generated.directions);
    track(challenged.trace);

    const recommendedId = challenged.critique.recommendation.direction_id;
    const direction =
      generated.directions.find((entry) => entry.id === recommendedId) ?? generated.directions[0]!;

    context = applyContextWrites(
      context,
      [
        { path: "positioning.category", value: direction.positioning.category },
        { path: "positioning.statement", value: direction.positioning.statement },
        { path: "positioning.differentiator", value: direction.positioning.differentiator },
        { path: "positioning.value_proposition", value: direction.positioning.value_proposition },
        { path: "personality.traits", value: direction.personality },
        {
          path: "selected_direction",
          value: {
            name: direction.name,
            source_module: "brand_battle",
            summary: direction.positioning.statement,
            run_id: null,
          },
        },
      ],
      { agent: "brand_battle", source: "agent", runId: null, lockedPaths: [] },
    ).context;
  } catch (err) {
    return fail(err);
  }

  // 2. Five Worlds, taking the first world, so every config is compared on
  //    the same decision rather than on a different one.
  result.stage = "worlds";
  try {
    const worlds = await runWorldsGenerate({
      direction_name: context.selected_direction?.name ?? "",
      direction_summary: context.selected_direction?.summary ?? "",
      positioning: context.positioning,
      personality: context.personality.traits,
      audience: context.audience.primary,
      problem: context.problem.statement,
      product: context.product.description,
    });
    track(worlds.trace);
    const world = worlds.worlds[0]!;
    context = applyContextWrites(
      context,
      [
        { path: "identity.naming_direction", value: world.naming_direction },
        { path: "voice.rules", value: world.voice_rules },
        { path: "voice.examples", value: [world.voice_sample_line] },
      ],
      { agent: "five_worlds", source: "agent", runId: null, lockedPaths: [] },
    ).context;
  } catch (err) {
    return fail(err);
  }

  // 3. The Anti-Generic rounds, recording the state before the first round.
  result.stage = "anti_generic";
  let fields = collectFields(context, []);
  const originals = fields.map((field) => ({ ...field }));
  const firstScores = new Map<string, GenericScores>();
  const lastScores = new Map<string, GenericScores>();

  try {
    for (let round = 1; round <= MAX_EVAL_ROUNDS; round++) {
      const output = await runAntiGenericRound({
        slice: sliceForAntiGeneric(context),
        fields,
        roundNumber: round,
        maxRounds: MAX_EVAL_ROUNDS,
      });
      for (const trace of output.traces) track(trace);
      for (const finding of output.round.findings) {
        if (!firstScores.has(finding.target_path)) firstScores.set(finding.target_path, finding.scores);
        lastScores.set(finding.target_path, finding.scores);
      }
      fields = output.fields;
      result.rounds = round;
      if (output.done) break;
    }
  } catch (err) {
    return fail(err);
  }

  result.fields = originals.map((original) => {
    const now = fields.find((field) => field.path === original.path)!;
    const before = detectGeneric(original.original);
    const after = detectGeneric(now.current);
    return {
      path: original.path,
      label: original.label,
      before: original.original,
      after: now.current,
      changed: now.current.trim() !== original.original.trim(),
      lexiconBefore: before.length,
      lexiconHighBefore: countBySeverity(before).high,
      lexiconAfter: after.length,
      lexiconHighAfter: countBySeverity(after).high,
      scoresBefore: firstScores.get(original.path) ?? null,
      scoresAfter: lastScores.get(original.path) ?? null,
    };
  });

  result.stage = "done";
  result.ok = true;
  return result;
}

/* ------------------------------- reporting ------------------------------- */

function score(value: number | undefined | null): string {
  return value === undefined || value === null ? "—" : value.toFixed(1);
}

function buildSummary(results: RunResult[], args: Args, startedAt: Date): string {
  const lines: string[] = [];
  lines.push("## Anti-Generic Engine — before and after");
  lines.push("");
  lines.push(`_Generated ${startedAt.toISOString()} by \`pnpm eval:antigeneric\` (plan §21.1)._`);
  lines.push("");
  lines.push(
    "Each run takes a fixture through the real pipeline — Brand Battle, then Five Worlds, then the Anti-Generic rounds — and measures the brand language before and after. **Lexicon hits are deterministic** (`src/lib/lexicon`); the scores come from the critic model, 1–10, and **genericity risk is inverted: lower is better**.",
  );
  lines.push("");
  lines.push(
    args.judge
      ? `**Judge:** \`${args.judge}\` scored every round, so before and after are measured on the same scale.`
      : "**⚠ No fixed judge.** Each configuration judged its own rewrites, so the before/after deltas are not comparable between configurations.",
  );
  lines.push("");

  lines.push("### Summary");
  lines.push("");
  lines.push(
    "| Config | Fixture | Rounds | Fields | Rewritten | Lexicon hits ↓ | Genericity risk ↓ | Distinctiveness ↑ | Calls | Latency | Tokens |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const run of results) {
    if (!run.ok) {
      lines.push(
        `| \`${run.config}\` | ${run.fixture} | — | — | failed in ${run.stage} | — | — | — | ${run.callCount} | — | — |`,
      );
      continue;
    }
    const judged = run.fields.filter((field) => field.scoresBefore && field.scoresAfter);
    const genericBefore = mean(judged.map((field) => field.scoresBefore!.genericity_risk));
    const genericAfter = mean(judged.map((field) => field.scoresAfter!.genericity_risk));
    const distinctBefore = mean(judged.map((field) => field.scoresBefore!.distinctiveness));
    const distinctAfter = mean(judged.map((field) => field.scoresAfter!.distinctiveness));
    const hitsBefore = run.fields.reduce((total, field) => total + field.lexiconBefore, 0);
    const hitsAfter = run.fields.reduce((total, field) => total + field.lexiconAfter, 0);
    lines.push(
      `| \`${run.config}\` | ${run.fixture} | ${run.rounds} | ${run.fields.length} | ${run.fields.filter((field) => field.changed).length} | ${hitsBefore} → ${hitsAfter} | ${score(genericBefore)} → ${score(genericAfter)} | ${score(distinctBefore)} → ${score(distinctAfter)} | ${run.callCount} | ${(run.latencyMs / 1000).toFixed(1)}s | ${run.tokensIn}/${run.tokensOut} |`,
    );
  }
  lines.push("");

  lines.push("### What changed");
  lines.push("");
  for (const run of results.filter((entry) => entry.ok)) {
    const changed = run.fields.filter((field) => field.changed);
    lines.push(`**${run.fixture} · \`${run.config}\`** — ${changed.length} of ${run.fields.length} lines rewritten over ${run.rounds} round(s).`);
    lines.push("");
    for (const field of changed) {
      lines.push(`- **${field.label}**`);
      lines.push(`  - before: ${field.before}`);
      lines.push(`  - after: ${field.after}`);
      if (field.scoresBefore && field.scoresAfter) {
        lines.push(
          `  - genericity risk ${field.scoresBefore.genericity_risk} → ${field.scoresAfter.genericity_risk}, distinctiveness ${field.scoresBefore.distinctiveness} → ${field.scoresAfter.distinctiveness}, lexicon hits ${field.lexiconBefore} → ${field.lexiconAfter}`,
        );
      }
    }
    lines.push("");
  }

  const failures = results.filter((run) => !run.ok);
  if (failures.length) {
    lines.push("### Failures");
    lines.push("");
    for (const failure of failures) {
      lines.push(
        `- \`${failure.config}\` on \`${failure.fixture}\` failed during **${failure.stage}**: ${failure.errorCode} — ${failure.errorMessage}`,
      );
    }
    lines.push("");
  }

  lines.push("### How to read this");
  lines.push("");
  lines.push("- **Lexicon hits** are the honest number: a word list either matched or it did not, and it cannot be talked round.");
  lines.push("- **Genericity risk** and **distinctiveness** are the critic's opinion of the same text before and after. A model that rewrites its own work and then praises it would show movement here and none in the lexicon column — worth watching for.");
  lines.push("- **Rounds** shows where the loop stopped. Two rounds means the second pass still found something; one round means the first rewrite satisfied every threshold (§13.5).");
  lines.push("- A run with zero rewrites is not a failure: it means the Battle and Worlds output was already specific enough.");
  lines.push("");
  return lines.join("\n");
}

/* --------------------------------- main --------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs();
  const perRun = 2 + 1 + MAX_EVAL_ROUNDS * 2;
  console.log(`Configs:  ${args.configs.map((config) => config.name).join(", ")}`);
  console.log(`Fixtures: ${args.fixtures.map((fixture) => fixture.id).join(", ")}`);
  console.log(`Judge:    ${args.judge ?? "(each config judges itself)"}`);
  console.log(
    `Model calls: up to ${args.configs.length * args.fixtures.length * perRun}${process.env.OPENAI_BASE_URL ? " (against OPENAI_BASE_URL)" : ""}`,
  );

  if (args.dryRun) {
    console.log("\n--dry-run: nothing was called.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");

  const startedAt = new Date();
  const results: RunResult[] = [];
  for (const config of args.configs) {
    for (const fixture of args.fixtures) {
      process.stdout.write(`\n▶ ${config.name} · ${fixture.id} … `);
      const result = await runOne(config, fixture, args.judge);
      results.push(result);
      console.log(
        result.ok
          ? `ok (${result.rounds} round(s), ${result.fields.filter((field) => field.changed).length}/${result.fields.length} rewritten, ${result.callCount} calls, ${(result.latencyMs / 1000).toFixed(1)}s)`
          : `FAILED in ${result.stage}: ${result.errorCode} ${result.errorMessage}`,
      );
    }
  }

  mkdirSync(resultsDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const rawPath = join(resultsDir, `antigeneric-${stamp}.json`);
  writeFileSync(rawPath, JSON.stringify({ startedAt, judge: args.judge, results }, null, 2));
  const summaryPath = join(resultsDir, "summary.md");
  writeSection(summaryPath, "antigeneric", buildSummary(results, args, startedAt));

  console.log(`\nRaw:     ${rawPath}`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
