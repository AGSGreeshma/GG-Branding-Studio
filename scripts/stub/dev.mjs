/*
 * `pnpm dev:stub` — the dev server wired to the local OpenAI stand-in.
 *
 * This is the ONLY thing that points the app at the stub: it sets
 * OPENAI_BASE_URL for the child process only. `pnpm dev`, `pnpm build` and
 * production never see it, so nothing can accidentally ship against fixtures.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const port = process.env.STUB_PORT ?? "4010";

const children = [];
function run(command, args, env, name) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => {
    console.log(`[dev:stub] ${name} exited (${code})`);
    stop();
    process.exit(code ?? 0);
  });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

run("node", [join(here, "server.mjs")], { STUB_PORT: port }, "stub");
run("pnpm", ["exec", "next", "dev"], { OPENAI_BASE_URL: `http://localhost:${port}/v1` }, "next");

console.log(`[dev:stub] app on http://localhost:3000 talking to the stub on ${port}`);
console.log("[dev:stub] fixtures: scripts/stub/fixtures — real OpenAI is NOT called");
