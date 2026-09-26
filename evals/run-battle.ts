/*
 * Brand Battle model comparison (plan §21.1, F11, ADR-025).
 *
 *   pnpm eval:battle                             # every config, every fixture
 *   pnpm eval:battle -- --configs gpt-6-luna     # one config
 *   pnpm eval:battle -- --fixtures college-teammates,freelance-tax
 *   pnpm eval:battle -- --judge gpt-4.1-mini     # one critic scores every config
 *   pnpm eval:battle -- --dry-run                # print the plan, call nothing
 *
 * Every run costs money, so the runner prints what it is about to spend calls
 * on and supports --dry-run. Raw results are written per run and only
 * `summary.md` is committed (CLAUDE.md).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { runBattleChallenge, runBattleGenerate, checkDivergence } from "@/lib/agents/battle";
import type { BattleSlice } from "@/lib/prompts/battle";
import { isAppError } from "@/lib/schemas/errors";
import type { BattleDirection, BattleScores } from "@/lib/schemas/outputs/battle";
import { MODEL_CONFIGS, type ModelConfig } from "./configs";
import { writeSection } from "./summary";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures", "battle");
const resultsDir = join(here, "results");

/* ------------------------------ fixtures ------------------------------ */

const FixtureSchema = z.object({
  id: z.string(),
  label: z.string(),
  stage: z.string(),
  why_this_fixture: z.string(),
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

/* -------------------------------- args -------------------------------- */

interface Args {
  configs: ModelConfig[];
  fixtures: Fixture[];
  judge: string | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const value = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index !== -1 ? (argv[index + 1] ?? null) : null;
  };
  const list = (flag: string): string[] | null => {
    const raw = value(flag);
    return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : null;
  };

  const wantedConfigs = list("--configs");
  const configs = wantedConfigs
    ? wantedConfigs.map((name) => {
        const found = MODEL_CONFIGS.find((config) => config.name === name);
        if (!found) throw new Error(`Unknown config "${name}". Known: ${MODEL_CONFIGS.map((c) => c.name).join(", ")}`);
        return found;
      })
    : MODEL_CONFIGS;

  const allFixtures = loadFixtures();
  const wantedFixtures = list("--fixtures");
  const fixtures = wantedFixtures
    ? wantedFixtures.map((id) => {
        const found = allFixtures.find((fixture) => fixture.id === id);
        if (!found) throw new Error(`Unknown fixture "${id}". Known: ${allFixtures.map((f) => f.id).join(", ")}`);
        return found;
      })
    : allFixtures;

  return {
    configs,
    fixtures,
    judge: value("--judge"),
    dryRun: argv.includes("--dry-run"),
  };
}

/* ------------------------------- metrics ------------------------------- */

interface CallMetrics {
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  retries: number;
}

interface RunResult {
  config: string;
  primary: string;
  fast: string;
  judge: string;
  fixture: string;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  generate: CallMetrics | null;
  challenge: CallMetrics | null;
  /** The code divergence check (§14.3): did the lenses actually diverge? */
  divergence: { ok: boolean; message: string | null };
  distinctCategories: number;
  distinctAudiences: number;
  /** ADR-026: how many predictable ideas each lens named and rejected. */
  rejectedPerDirection: number;
  clicheCount: number;
  objectionCount: number;
  meanScores: BattleScores | null;
  directions: Array<{ id: string; lens: string; name: string; category: string; audience: string }>;
  recommended: string | null;
}

const SCORE_KEYS = [
  "audience_fit",
  "clarity",
  "distinctiveness",
  "specificity",
  "strategic_strength",
  "genericity_risk",
] as const;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

function distinctCount(values: string[]): number {
  return new Set(values.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim())).size;
}

function applyConfig(config: ModelConfig, judge: string | null): void {
  process.env.MODEL_PRIMARY = config.primary;
  process.env.MODEL_FAST = judge ?? config.fast;
  process.env.OPENAI_OMIT_TEMPERATURE = config.omitTemperature ? "1" : "0";
  process.env.MODEL_PRIMARY_REASONING_EFFORT = config.primaryEffort ?? "";
  process.env.MODEL_FAST_REASONING_EFFORT = config.fastEffort ?? "";
  // Summaries cost output tokens and nothing reads them here (ADR-024).
  process.env.OPENAI_REASONING_SUMMARY = "off";
}

async function runOne(config: ModelConfig, fixture: Fixture, judge: string | null): Promise<RunResult> {
  applyConfig(config, judge);
  const slice = fixture.slice as BattleSlice;

  const base: RunResult = {
    config: config.name,
    primary: config.primary,
    fast: config.fast,
    judge: judge ?? config.fast,
    fixture: fixture.id,
    ok: false,
    errorCode: null,
    errorMessage: null,
    generate: null,
    challenge: null,
    divergence: { ok: false, message: null },
    distinctCategories: 0,
    distinctAudiences: 0,
    rejectedPerDirection: 0,
    clicheCount: 0,
    objectionCount: 0,
    meanScores: null,
    directions: [],
    recommended: null,
  };

  let directions: BattleDirection[];
  try {
    const generated = await runBattleGenerate(slice);
    directions = generated.directions;
    base.generate = {
      latencyMs: generated.trace.latencyMs,
      tokensIn: generated.trace.tokensIn,
      tokensOut: generated.trace.tokensOut,
      retries: generated.trace.retryCount,
    };
  } catch (err) {
    base.errorCode = isAppError(err) ? err.code : "UNKNOWN";
    base.errorMessage = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return base;
  }

  const divergence = checkDivergence(directions);
  base.divergence = { ok: divergence.ok, message: divergence.message };
  base.distinctCategories = distinctCount(directions.map((d) => d.positioning.category));
  base.distinctAudiences = distinctCount(directions.map((d) => d.audience_focus));
  base.rejectedPerDirection = mean(directions.map((d) => d.obvious_ideas_rejected.length));
  base.directions = directions.map((d) => ({
    id: d.id,
    lens: d.lens,
    name: d.name,
    category: d.positioning.category,
    audience: d.audience_focus,
  }));

  try {
    const challenged = await runBattleChallenge(slice, directions);
    base.challenge = {
      latencyMs: challenged.trace.latencyMs,
      tokensIn: challenged.trace.tokensIn,
      tokensOut: challenged.trace.tokensOut,
      retries: challenged.trace.retryCount,
    };
    const critiques = challenged.critique.critiques;
    base.clicheCount = critiques.reduce((total, entry) => total + entry.cliches.length, 0);
    base.objectionCount = critiques.reduce((total, entry) => total + entry.objections.length, 0);
    base.recommended = challenged.critique.recommendation.direction_id;
    base.meanScores = Object.fromEntries(
      SCORE_KEYS.map((key) => [key, mean(critiques.map((entry) => entry.scores[key]))]),
    ) as unknown as BattleScores;
    base.ok = true;
  } catch (err) {
    base.errorCode = isAppError(err) ? err.code : "UNKNOWN";
    base.errorMessage = err instanceof Error ? err.message.slice(0, 200) : String(err);
  }

  return base;
}

/* ------------------------------- reporting ------------------------------- */

function seconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function score(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(1);
}

function buildSummary(results: RunResult[], args: Args, startedAt: Date): string {
  const byConfig = new Map<string, RunResult[]>();
  for (const result of results) {
    byConfig.set(result.config, [...(byConfig.get(result.config) ?? []), result]);
  }

  const lines: string[] = [];
  lines.push("## Brand Battle — model comparison");
  lines.push("");
  lines.push(`_Generated ${startedAt.toISOString()} by \`pnpm eval:battle\` (plan §21.1)._`);
  lines.push("");
  lines.push(
    "Each run is one Brand Battle: the generate call produces three directions from three lenses, and the challenge call scores and objects to them (§14.3). Scores are the critic's, 1–10, averaged across the three directions; **genericity risk is inverted — lower is better**.",
  );
  lines.push("");
  lines.push(
    args.judge
      ? `**Judge:** every configuration was scored by the same critic model, \`${args.judge}\`, so the score columns are comparable across rows.`
      : "**⚠ No fixed judge.** Each configuration scored its own output with its own fast model, so score columns compare a model against itself, not against the others. Re-run with `--judge <model>` for a fair comparison.",
  );
  lines.push("");

  lines.push("### Configurations");
  lines.push("");
  lines.push("| Config | Generator | Critic | Runs OK | Distinct. ↑ | Generic risk ↓ | Audience fit ↑ | Clarity ↑ | Specificity ↑ | Strategy ↑ | Clichés/run ↓ | Generate | Challenge | Repairs |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [name, runs] of byConfig) {
    const ok = runs.filter((run) => run.ok);
    const first = runs[0]!;
    const scoreOf = (key: (typeof SCORE_KEYS)[number]) =>
      ok.length ? score(mean(ok.map((run) => run.meanScores![key]))) : "—";
    const repairs = runs.reduce(
      (total, run) => total + (run.generate?.retries ?? 0) + (run.challenge?.retries ?? 0),
      0,
    );
    lines.push(
      `| \`${name}\` | \`${first.primary}\` | \`${first.judge}\` | ${ok.length}/${runs.length} | ${scoreOf("distinctiveness")} | ${scoreOf("genericity_risk")} | ${scoreOf("audience_fit")} | ${scoreOf("clarity")} | ${scoreOf("specificity")} | ${scoreOf("strategic_strength")} | ${ok.length ? score(mean(ok.map((r) => r.clicheCount))) : "—"} | ${ok.length ? seconds(mean(ok.map((r) => r.generate!.latencyMs))) : "—"} | ${ok.length ? seconds(mean(ok.map((r) => r.challenge!.latencyMs))) : "—"} | ${repairs} |`,
    );
  }
  lines.push("");

  lines.push("### Per fixture");
  lines.push("");
  lines.push("| Fixture | Config | OK | Diverged | Distinct categories | Distinct audiences | Ruled out / direction | Objections | Distinct. | Generic risk | Recommended |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const result of results) {
    lines.push(
      `| ${result.fixture} | \`${result.config}\` | ${result.ok ? "yes" : `no (${result.errorCode})`} | ${result.generate ? (result.divergence.ok ? "yes" : "no") : "—"} | ${result.generate ? `${result.distinctCategories}/3` : "—"} | ${result.generate ? `${result.distinctAudiences}/3` : "—"} | ${result.generate ? result.rejectedPerDirection.toFixed(1) : "—"} | ${result.ok ? result.objectionCount : "—"} | ${result.meanScores ? score(result.meanScores.distinctiveness) : "—"} | ${result.meanScores ? score(result.meanScores.genericity_risk) : "—"} | ${result.recommended?.toUpperCase() ?? "—"} |`,
    );
  }
  lines.push("");

  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    lines.push("### Failures");
    lines.push("");
    for (const failure of failures) {
      lines.push(`- \`${failure.config}\` on \`${failure.fixture}\`: **${failure.errorCode}** — ${failure.errorMessage}`);
    }
    lines.push("");
  }

  lines.push("### What the directions actually were");
  lines.push("");
  for (const result of results.filter((entry) => entry.directions.length)) {
    lines.push(`**${result.fixture} · \`${result.config}\`**`);
    lines.push("");
    for (const direction of result.directions) {
      lines.push(`- **${direction.id.toUpperCase()}** (${direction.lens}) *${direction.name}* — ${direction.category}; for ${direction.audience}`);
    }
    lines.push("");
  }

  lines.push("### How to read this");
  lines.push("");
  lines.push("- **Distinctiveness** and **genericity risk** are the two that matter for this product: the whole argument against one-prompt branding is that the obvious answer is generic.");
  lines.push("- **Distinct categories / audiences** is the deterministic check (§14.3), not the model's opinion. 1/3 means the three lenses produced one idea three times, whatever the scores say.");
  lines.push("- **Ruled out / direction** is how many predictable ideas each lens named and rejected before writing its own (ADR-026). Zero means the prompt's method was ignored.");
  lines.push("- **Repairs** counts schema repair retries. Anything above zero means the model struggles with the Battle schema and will be slower and more expensive in production.");
  lines.push("- Latency matters against `maxDuration = 60` per workflow step (ADR-023).");
  lines.push("");
  lines.push(`Fixtures: ${args.fixtures.map((fixture) => `\`${fixture.id}\``).join(", ")} (see \`evals/fixtures/battle/\` for why each one is in the set).`);
  lines.push("");
  return lines.join("\n");
}

/* --------------------------------- main --------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs();
  const calls = args.configs.length * args.fixtures.length * 2;

  console.log(`Configs:  ${args.configs.map((config) => config.name).join(", ")}`);
  console.log(`Fixtures: ${args.fixtures.map((fixture) => fixture.id).join(", ")}`);
  console.log(`Judge:    ${args.judge ?? "(each config scores itself)"}`);
  console.log(`Model calls to make: ${calls}${process.env.OPENAI_BASE_URL ? " (against OPENAI_BASE_URL, not api.openai.com)" : ""}`);

  if (args.dryRun) {
    console.log("\n--dry-run: nothing was called.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local.");
  }

  const startedAt = new Date();
  const results: RunResult[] = [];

  for (const config of args.configs) {
    for (const fixture of args.fixtures) {
      process.stdout.write(`\n▶ ${config.name} · ${fixture.id} … `);
      const result = await runOne(config, fixture, args.judge);
      results.push(result);
      if (result.ok) {
        console.log(
          `ok (generate ${seconds(result.generate?.latencyMs)}, challenge ${seconds(result.challenge?.latencyMs)}, distinctiveness ${score(result.meanScores?.distinctiveness)}, generic risk ${score(result.meanScores?.genericity_risk)})`,
        );
      } else {
        console.log(`FAILED ${result.errorCode}: ${result.errorMessage}`);
      }
    }
  }

  mkdirSync(resultsDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const rawPath = join(resultsDir, `battle-${stamp}.json`);
  writeFileSync(rawPath, JSON.stringify({ startedAt, judge: args.judge, results }, null, 2));
  const summaryPath = join(resultsDir, "summary.md");
  writeSection(summaryPath, "battle", buildSummary(results, args, startedAt));

  console.log(`\nRaw:     ${rawPath}`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
