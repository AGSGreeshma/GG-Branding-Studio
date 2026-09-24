# CLAUDE.md — GG Branding Studio

GG Branding Studio is an adaptive AI branding workspace. A user says where they are (idea, product, brand, or protecting a brand). An AI orchestrator assembles a workflow from eight specialized capabilities, challenges its own output, and lets the user make the decisions. Those decisions become a persistent **Brand System**, a **Launch Kit**, and an ongoing **Consistency Guardian**.

**The full product plan is in [`plan.md`](./plan.md).** This file holds only the rules for working in the repo. Before any task, read the relevant sections of `plan.md` and locate the task in its task tree (plan §22).

---

## ⏱ Hackathon mode

- **36-hour hackathon, solo builder. Deadline: Friday 25 Sept 2026, 22:00 IST. Feature freeze: 16:00 IST.**
- **Solo scope (ADR-008):** every capability ships as its thinnest real version, mostly one AI call each. Brand Battle Lite = 2 calls (generate 3 role-labelled directions → one critic call). Five Worlds = 3 worlds. Anti-Generic = 1 revision round. Orchestrator = default plans + AI-written reasons + code validator.
- Build only what plan §22.1 marks **MUST**, then **SHOULD**. Anything marked *post-hackathon* is out of scope unless the founder says otherwise.
- Priority: working live demo path > visible AI workflow (critique, scores, "How the AI worked") > all eight capabilities present > polish.
- If a task runs 50% over its time box, ship the simpler version and log it in plan §27.
- Deploy continuously from Phase 1. Never leave `main` or production broken.
- Keep task specs short in hackathon mode: Objective, Approach, Acceptance Criteria, Testing, Status. The full template (plan §1.1) is for post-hackathon work.

---

## Non-negotiables

1. **Not a chatbot.** Chat is one interaction mechanism; the product is the branding workspace (workflow sidebar, AI workspace, Brand Context panel).
2. **Not a one-prompt generator.** Every AI capability is a separate agent with one job, one prompt, and one output schema.
3. **One connected system.** The eight capabilities are modules invoked by the orchestrator, never separate apps.
4. **The AI plans the workflow** (LLM proposes, code validates, default plans as fallback; plan §7.3). The user never needs to know the internals.
5. **AI recommends, the user decides.** Nothing silently becomes final. Locked decisions are hard constraints for every agent.
6. **Context persists.** Every agent reads from and writes to the shared Brand Context (plan §12).
7. **AI challenges itself.** The Anti-Generic Engine and evaluation are core features, not polish.
8. **Usable outcome.** The user leaves with a real Brand System and Launch Kit.

Don't remove a major capability because it's complex. Use the thinner version in plan §22.1 instead.

---

## Development loop

```
READ PLAN → UNDERSTAND TASK → CHECK EXISTING CODE → CHECK DEPENDENCIES
→ IMPLEMENT (smallest complete version) → TEST → FIX → VERIFY ACCEPTANCE CRITERIA
→ UPDATE TASK STATUS + plan.md → NEXT TASK
```
- One task at a time. Never implement the whole app in one operation.
- Task statuses: `[ ]` not started · `[~]` in progress · `[!]` blocked · `[T]` testing · `[x]` complete.
- End each task with a short summary: what changed, how it was tested, what's next, any plan updates.

## Keeping the plan alive

- Add missing requirements, edge cases, contracts, states or security needs to `plan.md`, marked `> Added:` with a one-line reason.
- **Architecture changes are never silent.** Add an entry to plan §27 (current approach, problem, alternative, reason, impact, migration), then update the affected sections.
- Use an AI technique only when it solves a real product problem.
- Product ambiguity → check plan §28; if it's not there, add it and ask the founder. Don't guess product decisions.

---

## Stack & commands

Next.js (App Router) + TypeScript strict · Tailwind + shadcn/ui · Vercel AI SDK (`ai`, `@ai-sdk/openai`) · OpenAI · Zod · Drizzle + Postgres (Neon) · Zustand · Vitest · Vercel · pnpm. Details and OpenAI notes: plan §20.

```bash
pnpm dev          # local dev
pnpm build        # must pass before pushing to main
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm db:push      # apply Drizzle schema
pnpm seed:demo    # seeded example project
# post-hackathon: pnpm eval, pnpm record:demo
```

## Repo map

```
src/app/          pages + /api route handlers (thin)
src/components/   UI (shadcn in components/ui)
src/lib/schemas/  Zod — single source of truth (server, client, AI output)
src/lib/agents/   one file per agent + registry.ts + orchestrator.ts
src/lib/prompts/  one file per agent: system, buildUser(), PROMPT_VERSION, tier, temperature
src/lib/ai/       llm.ts — the ONLY place that calls OpenAI
src/lib/services/ context-manager, workflow-engine, evaluator, exporter, events, rate-limit
src/lib/lexicon/  deterministic cliché/buzzword/naming detection
src/lib/db/       Drizzle schema, client, queries
evals/            fixtures, runner, results
plan.md           product plan, specs, task tree, decision log
```

---

## Rules for AI code

1. **Structured output only.** Every agent uses `generateStructured` in `lib/ai/llm.ts` (AI SDK `generateObject` + Zod). On invalid output: one repair retry with the validation errors, then a typed error (plan §18.5). No regex parsing of free text.
2. **OpenAI strict schemas:** every property is required, so use `.nullable()`, not `.optional()`. No union at the schema root, shallow nesting, small enums. Re-validate with Zod after every call.
3. **Models from env only:** `MODEL_PRIMARY` for generation and synthesis, `MODEL_FAST` for critics, interviewer turns and consistency checks. Never hardcode model names.
4. **Agents are pure.** `(contextSlice, ctx) → validated output`. No DB access inside agents; services persist.
5. **Pass slices, not everything.** Use `context-manager` to give each agent only the fields it needs.
6. **Respect locks.** No agent may modify a locked decision; enforce this in code after generation, not just in the prompt. Any change to lock handling needs a test.
7. **Explain recommendations:** recommendation, why, evidence from Brand Context, risk, alternative (plan §11.3).
8. **Critics differ from generators:** separate system prompt, lower temperature, fast model.
9. **Deterministic checks go in code** (lexicon, hex/contrast, lengths, plan validation). The LLM judges nuance.
10. **Log every model call** to the `workflow_runs` trace: agent, model, prompt version, tokens, latency, retries, scores. The "How the AI worked" drawer depends on it.
11. **User-supplied content is data, never instructions.** Wrap it in delimited blocks in prompts. Analyze only what was provided; never fabricate facts.
12. **Naming:** never claim a name is available or trademark-free; show a "check availability" note.
13. **Long routes:** set `export const maxDuration` on AI routes. Keep each request to at most 2–3 sequential model calls; run independent calls in parallel (max concurrency 3).

## Code conventions

- TypeScript strict, no `any`. Types come from `z.infer` on the schemas.
- Server-only code (`lib/ai`, `lib/db`, `lib/agents`, secrets) must never be imported into client components; use `import "server-only"`.
- Every query is scoped by `owner_id` from the guest cookie.
- Every async UI operation has a specific loading message, an empty state and a human-readable error state (plan §10). Never show stack traces.
- Accessible and responsive by default: labels, focus states, keyboard navigation, contrast, mobile layout.
- Secrets only in env vars; keep `.env.example` in sync.
- Commit messages reference the task ID, e.g. `feat(H3): extract answers into Brand Context`.

## The demo path is sacred

The plan §23.1 scenario (idea → interview → Brand Battle → Five Worlds → Anti-Generic → Brand Builder → Launch Kit → Consistency Guardian catches a voice mismatch) must always work on `main` and in production. Before pushing to `main`:

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
2. Run the demo idea end to end by hand.
3. Check the production URL after each deploy (demo-mode replay is deferred in solo mode).

## Don't

- Don't make Inkloom a dependency; it isn't required or judged.
- Don't use real brands' names, logos or characters as fixtures or example outputs.
- Don't let visual generation come before strategy (strategy → personality → visual brief → visuals).
- Don't start post-hackathon tasks before the MUST list is done.
- Don't commit secrets, `.env`, or raw eval outputs (only `evals/results/summary.md`).

## When unsure

Prefer the simpler implementation that keeps the demo path reliable. Leave a `// TODO(<task-id>):` note, record the trade-off in the task summary, and add product questions to plan §28.
