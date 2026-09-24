import { NextResponse } from "next/server";
import { AiCallError, generateStructured } from "@/lib/ai/llm";
import { pingDb } from "@/lib/db/queries";
import * as pingPrompt from "@/lib/prompts/ping";
import { isAppError, type ErrorCode } from "@/lib/schemas/errors";
import { describeError, logEvent } from "@/lib/services/log";
import { withErrors } from "@/lib/services/route";
import { getSessionSecret } from "@/lib/session-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Env vars the app cannot run without. Only presence is reported, never values. */
const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "MODEL_PRIMARY",
  "MODEL_FAST",
  "DATABASE_URL",
  "SESSION_SECRET",
] as const;

interface AiCheck {
  ok: boolean;
  model: string | null;
  latencyMs: number;
  errorCode?: ErrorCode;
  cached?: boolean;
}

/*
 * The URL is public, so cache the AI ping per server instance for 30 s.
 * Hammering ?ai=1 then costs at most two model calls a minute per instance.
 */
const AI_CACHE_MS = 30_000;
let lastAiCheck: { at: number; result: AiCheck } | null = null;

async function checkAi(): Promise<AiCheck> {
  if (lastAiCheck && Date.now() - lastAiCheck.at < AI_CACHE_MS) {
    return { ...lastAiCheck.result, cached: true };
  }
  const started = Date.now();
  let result: AiCheck;
  try {
    const { result: ping, trace } = await generateStructured({
      agent: pingPrompt.meta.agent,
      schema: pingPrompt.meta.schema,
      system: pingPrompt.system,
      prompt: pingPrompt.buildUser(),
      tier: pingPrompt.meta.tier,
      temperature: pingPrompt.meta.temperature,
      promptVersion: pingPrompt.PROMPT_VERSION,
    });
    result = { ok: ping.ok, model: trace.model, latencyMs: trace.latencyMs };
  } catch (err) {
    result = {
      ok: false,
      model: err instanceof AiCallError ? err.trace.model : (process.env.MODEL_FAST ?? null),
      latencyMs: Date.now() - started,
      errorCode: isAppError(err) ? err.code : "INTERNAL",
    };
  }
  lastAiCheck = { at: Date.now(), result };
  return result;
}

export const GET = withErrors(async (request) => {
  const env = Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, Boolean(process.env[name])]),
  ) as Record<(typeof REQUIRED_ENV)[number], boolean>;
  // A too-short secret counts as missing: the cookie would not be signed.
  env.SESSION_SECRET = getSessionSecret() !== null;
  const envOk = Object.values(env).every(Boolean);

  let db: { ok: boolean; latencyMs: number | null };
  try {
    db = { ok: true, latencyMs: await pingDb() };
  } catch (err) {
    logEvent("error", "health.db_failed", describeError(err));
    db = { ok: false, latencyMs: null };
  }

  const ai = request.nextUrl.searchParams.get("ai") === "1" ? await checkAi() : undefined;
  const ok = envOk && db.ok && (ai ? ai.ok : true);

  return NextResponse.json(
    { ok, env, db, ...(ai ? { ai } : {}), time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
});
