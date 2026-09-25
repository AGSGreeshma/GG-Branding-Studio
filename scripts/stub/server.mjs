/*
 * Local stand-in for the OpenAI Responses API (plan §0, ADR-021).
 *
 * Opt-in only: nothing points at it unless OPENAI_BASE_URL says so, which
 * `pnpm dev:stub` does and `pnpm dev` never does. It exists because the
 * OpenAI account has no credits yet, so the workflow, the streaming and the
 * UI can still be exercised end to end against the real database.
 *
 * It routes on the JSON-schema name the AI SDK sends (which llm.ts sets to the
 * agent name), returns the fixture for that agent, and imitates real latency so
 * loading states and progress events are genuinely exercised.
 *
 *   node scripts/stub/server.mjs            # port 4010, realistic latency
 *   STUB_LATENCY=0 node scripts/stub/server.mjs   # instant, for test loops
 */
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");
const PORT = Number(process.env.STUB_PORT ?? 4010);
/** 1 = realistic, 0 = instant. Anything else scales the delays. */
const LATENCY = process.env.STUB_LATENCY === undefined ? 1 : Number(process.env.STUB_LATENCY);

/** Tier latency in ms, matching what the plan expects of each model (§20.2). */
const TIER_LATENCY = {
  fast: [1000, 3000],
  primary: [5000, 15000],
};

const fixtures = new Map();
for (const file of readdirSync(fixturesDir).filter((name) => name.endsWith(".json"))) {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
  fixtures.set(fixture.agent, { ...fixture, calls: 0 });
}
console.log(`[stub] loaded fixtures: ${[...fixtures.keys()].join(", ")}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function delayFor(tier) {
  if (!Number.isFinite(LATENCY) || LATENCY <= 0) return 0;
  const [min, max] = TIER_LATENCY[tier] ?? TIER_LATENCY.fast;
  return (min + Math.random() * (max - min)) * LATENCY;
}

function responseBody(payload, model) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    id: `resp_${Math.random().toString(36).slice(2)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output: [
      {
        type: "message",
        id: `msg_${Math.random().toString(36).slice(2)}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 800 + Math.floor(Math.random() * 400),
      output_tokens: 200 + Math.floor(Math.random() * 300),
      total_tokens: 1200,
    },
  };
}

function errorBody(message, code = "stub_error") {
  return { error: { message, type: "invalid_request_error", code } };
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    let request;
    try {
      request = JSON.parse(raw || "{}");
    } catch {
      return send(400, errorBody("The stub could not parse the request body."));
    }

    // llm.ts names the JSON schema after the agent, so the stub can route on it.
    const agent = request?.text?.format?.name ?? request?.response_format?.json_schema?.name;
    const fixture = agent ? fixtures.get(agent) : undefined;

    if (!fixture) {
      console.log(`[stub] no fixture for "${agent ?? "(unnamed schema)"}"`);
      return send(
        404,
        errorBody(
          `No stub fixture for "${agent ?? "unknown"}". Add scripts/stub/fixtures/${agent ?? "agent"}.json.`,
        ),
      );
    }

    const call = fixture.calls++;
    await sleep(delayFor(fixture.tier ?? "fast"));

    // One fixture deliberately answers with invalid output first, so the repair
    // retry in llm.ts is exercised on every run (plan §13.4).
    if (fixture.invalid_first && call === 0) {
      console.log(`[stub] ${agent}: returning deliberately invalid output (repair retry)`);
      return send(200, responseBody(fixture.invalid_output ?? { nope: true }, request.model));
    }

    const outputs = fixture.outputs ?? [];
    const index = fixture.invalid_first ? call - 1 : call;
    const payload = outputs[Math.min(index, outputs.length - 1)];
    console.log(`[stub] ${agent}: call ${call + 1} -> output ${Math.min(index, outputs.length - 1) + 1}`);
    return send(200, responseBody(payload, request.model));
  });
}).listen(PORT, () => {
  console.log(`[stub] OpenAI stand-in listening on http://localhost:${PORT}/v1`);
  console.log(`[stub] latency multiplier ${LATENCY}`);
});
