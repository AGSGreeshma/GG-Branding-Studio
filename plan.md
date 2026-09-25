# plan.md — GG Branding Studio

> An adaptive AI-powered branding studio that helps founders and brand builders understand, build, improve, differentiate, launch, and maintain brands at any stage of their journey.

This is the founder's product plan and the **source of truth for what to build**. Working rules for the coding AI live in `CLAUDE.md`. This plan is intentionally comprehensive but not assumed to be perfect. Enrich it as described in `CLAUDE.md`, marking additions with `> Added:`.

## 0. Hackathon mode (read first)

> Added 2026-09-24. This is a **36-hour hackathon**. Submission deadline: **Friday 25 September 2026, 22:00 IST**. Target: everything submitted by **21:00 IST**.

- **Team:** solo builder. Every capability is built as its thinnest real version (§22.1, ADR-008).
- **Stack (decided):** Next.js full-stack TypeScript on Vercel, Postgres (Neon) with Drizzle, OpenAI through the Vercel AI SDK with Zod structured outputs (§20).
- **Scope:** build only what §22.1 marks MUST, then SHOULD. Everything marked *post-hackathon* stays in this plan as the product vision but is not built now.
- **Priority order:** a working live demo path > visible AI workflow (critique, scores, "How the AI worked") > all eight capabilities present > polish.
- **Time-boxing:** if a task runs 50% over its box, ship the simpler version and note it in the Decision Log.
- **Deploy from hour 2 onward** and keep production working; never leave `main` broken.
- **Feature freeze:** 25 Sept, 16:00 IST. After that: bug fixes, README, demo video, social posts, submission forms only.


## Contents

0. Hackathon mode (read first)
1. Task documentation
2. Product vision
3. Core architecture
4. The eight capabilities (+ Brand Builder)
5. Entry stages
6. User journey
7. AI Orchestrator
8. Landing page & project creation
9. Workspace layout
10. UX & UI principles
11. User control, locking, explainability, human review
12. Shared Brand Context
13. Agents, prompts, structured outputs, evaluation
14. Module specifications
15. Brand System & versioning
16. Workflow state & history
17. Database
18. Application structure, API, authentication
19. Security, performance, observability
20. Tech stack, environment, deployment
21. Evaluation harness & edge cases
22. Implementation task tree
23. Demo & hackathon alignment
24. Hackathon submission checklist
25. Definition of complete & acceptance criteria
26. Non-goals
27. Decision log
28. Open questions

---

## 1. Task documentation

### 1.1 Task template
Expand a task with this template when you start it (in this file under §22, or in `docs/tasks/<ID>.md` if long; link it from §22).
```md
## Task X — Task Name
### Objective
### What
### Why
### Approach
### Frontend
### Backend
### AI
### Database
### User Benefit
### Dependencies
### Edge Cases
### Acceptance Criteria
### Testing
### Status
```

### 1.2 Status markers
`[ ]` Not Started · `[~]` In Progress · `[!]` Blocked · `[T]` Testing · `[x]` Complete

### 1.3 Example of an expanded task
> Added: a reference example so every later task is written to the same depth.

## Task F2–F6 — AI request service
**Objective:** one reliable way to call a model and get validated structured output.
**What:** `src/lib/ai/llm.ts` exposing `generateStructured({ agent, schema, messages, tier, temperature }) → { result, trace }`.
**Why:** every agent depends on it; centralizing validation, retries and logging keeps agents small and consistent.
**Approach:** Vercel AI SDK `generateObject` with the OpenAI provider and a Zod schema; prompt loaded from the registry; output re-validated with Zod. On validation failure, one repair retry with the validation errors appended; on provider errors, exponential backoff (max 2). Timeout per tier.
**Frontend:** none directly; consumes typed errors (§18.5).
**Backend:** service + typed error classes (`AIOutputInvalid`, `AIProviderUnavailable`, `AITimeout`).
**AI:** none beyond the call itself.
**Database:** writes a `workflow_runs` trace row (model, prompt_version, tokens, latency, retries, error).
**User benefit:** fewer broken steps; clear, recoverable errors when something fails.
**Dependencies:** A5, A6, F1, F3.
**Edge cases:** empty response; truncated JSON; extra fields; provider rate limit; very large context (F8 trims first).
**Acceptance criteria:** valid output returned as a typed object; invalid output repaired or a typed error raised; every call logged.
**Testing:** unit tests with a fake provider returning valid, invalid-then-valid, always-invalid, and timeout responses.
**Status:** [x] Phase 1, 2026-09-24. Uses `generateText` + `Output.object` (ADR-011). Timeout test not automated (needs a 30 s wait); the other cases are covered in `src/lib/ai/llm.test.ts`. The `workflow_runs` write happens in callers via `recordRun` (agents stay pure).

---

## 2. Product vision

**Name:** GG Branding Studio
**Working tagline:** *Build a brand that can think.* (placeholder; this is also the hackathon handbook's headline, so consider a more distinctive final tagline and run it through the Anti-Generic Engine)

**Product statement:** An adaptive AI branding studio for founders and brand builders at every stage, from rough idea to launch-ready brand, and from existing brand to continuous improvement. It combines discovery, analysis, positioning, audience exploration, strategic debate, creative exploration, genericity detection, brand construction, launch generation and consistency checking into one intelligent workflow.

**Who it's for:** founders, startup builders, product builders, creators, communities, small businesses, existing brands, and brand strategists, at any level of branding experience.

**Users arrive in different situations:** "I have an idea." / "I already have a product, but our positioning is unclear." / "Our brand feels outdated." / "Check whether this campaign is consistent with our brand."

### 2.1 The problem
A founder may know *"I want to build an app that helps students find teammates"* but not yet know who exactly it's for, which problem matters most, its category, why people should care, what makes it different, how it should feel, its name, its voice, what its visuals should communicate, how to launch, or whether future content will stay consistent. A chatbot can answer each question in isolation, but **the decisions need to connect**. GG treats branding as a reasoning workflow, not a text-generation task.

### 2.2 Product promise
```
Unclear situation → Understanding → Strategic clarity → Creative exploration
→ Critical evaluation → User decisions → Coherent brand → Launch → Ongoing consistency
```
GG doesn't just answer "What should my brand be?" It helps the user **reason toward the answer**.

### 2.3 Central differentiator
Not "it uses AI to generate branding." GG **decides what kind of branding help the user needs, assembles an appropriate AI workflow, carries context between specialized capabilities, challenges weak outputs, lets the user make the important decisions, and turns those decisions into a persistent Brand System.**

### 2.4 Final principle
The user tells GG where they are. GG understands the situation. AI decides what the brand needs next. Specialized capabilities work together. AI challenges generic and inconsistent thinking. The user makes the important decisions. Those decisions become the Brand System, the source of truth. GG helps the user launch and keep the brand consistent over time.

The non-negotiables are listed in `CLAUDE.md`.

---

## 3. Core architecture

### 3.1 Principle
```
USER CHOOSES THEIR CURRENT STAGE → GG UNDERSTANDS THE USER → AI CREATES A WORKFLOW
→ SPECIALIZED AI MODULES WORK → AI CHALLENGES ITS OWN OUTPUT → USER MAKES IMPORTANT DECISIONS
→ DECISIONS BECOME BRAND CONTEXT → BRAND SYSTEM IS BUILT → LAUNCH MATERIAL IS CREATED
→ BRAND IS CONTINUOUSLY CHECKED
```

### 3.2 Final product architecture
```
                           GG BRANDING STUDIO
                                  |
                         USER CURRENT STAGE
          ┌───────────────────────┼────────────────────────┐
          ▼                       ▼                        ▼
        IDEA                   PRODUCT                   BRAND
          └───────────────────────┼────────────────────────┘
                                  ▼
                         BRAND INTERVIEWER
                                  ▼
                         SHARED BRAND CONTEXT
                                  ▼
                       WORKFLOW ORCHESTRATOR
          ┌──────────────┬────────┼────────┬──────────────┐
          ▼              ▼        ▼        ▼              ▼
     BRAND DOCTOR   BRAND BATTLE AUDIENCE FIVE WORLDS   OTHER
                                 SHIFTER
          └──────────────┴────────┼────────┴──────────────┘
                                  ▼
                        ANTI-GENERIC ENGINE
                                  ▼
                           USER DECISION
                                  ▼
                           BRAND BUILDER
                                  ▼
                         CONSISTENCY TEST
                                  ▼
                           BRAND SYSTEM
                                  ▼
                      FOUNDER-TO-LAUNCH KIT
                                  ▼
                       CONSISTENCY GUARDIAN
                                  ▼
                         ONGOING BRAND AI
```
(Stage D users, "protect my brand", enter directly at Brand Doctor / Consistency Guardian after providing their existing brand material.)

---

## 4. The eight capabilities (+ Brand Builder)

| # | Capability | Job |
|---|---|---|
| 1 | **Brand Interviewer** | Understands the founder; asks adaptive questions |
| 2 | **Brand Doctor** | Analyzes an existing product/brand; finds weaknesses |
| 3 | **Brand Battle** | Generates competing *strategic* directions; specialized roles challenge them |
| 4 | **Audience Shifter** | Reframes the product for different audiences while preserving core value |
| 5 | **Anti-Generic Engine** | Detects clichés, generic AI language, weak and predictable ideas (cross-cutting) |
| 6 | **Consistency Guardian** | Checks future content against the established Brand System |
| 7 | **Founder-to-Launch Kit** | Turns the final strategy into practical launch-ready material |
| 8 | **One Idea, Five Worlds** | Creates five different *identity* directions from the same idea |
| — | **Brand Builder** | Assembles the Brand System from approved decisions and checks relationships |

---

## 5. Entry stages

The landing page asks **"Where are you with your brand?"** The answer is *starting context*, not a rigid workflow.

| Stage | User says | `brand_state` | Likely capabilities |
|---|---|---|---|
| **A — I have an idea** | Idea for a product, startup, community or creator project; no brand yet | `unbranded` | Interviewer, Audience Shifter, Brand Battle, Five Worlds, Anti-Generic, Launch Kit |
| **B — I have a product** | Built a product; needs positioning, differentiation, identity or messaging | `product_without_strong_brand` | Interviewer, Brand Doctor, Audience Shifter, Brand Battle, Five Worlds, Anti-Generic, Launch Kit |
| **C — I have a brand** | Wants to improve, reposition or strengthen an existing brand | `existing_brand` | Brand Doctor, Brand Battle, Audience Shifter, Five Worlds, Anti-Generic, Brand Builder, Consistency Guardian |
| **D — I want to protect my brand** | Wants future content, campaigns and messaging checked | `active_brand` | Consistency Guardian, Brand Doctor, Anti-Generic |

> Hackathon build (Stage D lite): the user pastes existing guidelines/copy, and the Consistency Guardian checks new content against that text directly. The draft-system extraction below is post-hackathon.

> Added: **Stage D bootstrap.** A Stage D user has no Brand System in GG yet. Onboarding asks them to paste or upload existing guidelines/copy; Brand Doctor extracts a *draft* Brand System (voice, personality, messaging rules) that the user confirms before the Consistency Guardian can use it.

---

## 6. User journey

```
Landing Page → Choose Current Stage → Create Project → Initial Context
→ Brand Interviewer / Existing Brand Analysis → AI Workflow Planning
→ Strategic Analysis → Audience Exploration → Strategic Alternatives
→ Creative Exploration → Anti-Generic Critique → User Decision
→ Brand Builder → Consistency Test → Brand System → Founder-to-Launch Kit
→ Consistency Guardian → Ongoing Brand Workspace
```
Not every user follows every step.

**Beginner ("I have an idea but I don't know how to brand it"):** understand the idea → who it's for → clarify the problem → explore positioning → challenge the obvious options → explore different identities → you choose → build the brand system → prepare your launch → keep it consistent.

**Existing brand ("I think my branding isn't working"):** diagnose it → what's working → what's unclear → the contradictions → alternative strategic directions → challenge them → you choose → rebuild the brand → protect it going forward.

---

## 7. AI Orchestrator

**Forbidden structure:** `/brand-interviewer`, `/brand-doctor`, `/brand-battle`, … as separate apps. One orchestrator invokes specialized agents.

### 7.1 Contract
Input:
```json
{
  "entry_stage": "",
  "brand_context": {},
  "user_goal": "",
  "completed_modules": [],
  "locked_decisions": []
}
```
Output:
```json
{
  "workflow": [
    { "module": "brand_doctor", "reason": "Existing product needs positioning analysis" },
    { "module": "brand_battle", "reason": "Multiple positioning options are useful" }
  ],
  "required_user_decision": true
}
```

### 7.2 Rules
The orchestrator may skip, repeat, or add modules, return to an earlier module, ask for more information, or ask the user to decide. It must:
- never ignore locked decisions
- avoid unnecessary modules and repeated questions
- preserve context
- ask for human input when important
- trigger critique when outputs are weak, and Anti-Generic when language is generic
- trigger consistency checks before finalization
- allow iteration, and know when the workflow is complete

Its plan and reasons are stored and shown in the Workflow Sidebar.

### 7.3 Hybrid planning design
> Added: a purely LLM-planned workflow can produce invalid or unreliable sequences, which is risky for a live demo. The planner is therefore **LLM-proposed, code-validated**.

1. **Module registry** (`src/lib/agents/registry.ts`). Every module declares:
   ```ts
   {
     name: "brand_battle",
     requires: ["problem.statement", "audience.primary"], // context fields that must exist
     produces: ["selected_direction", "positioning.*"],
     applicableStates: ["unbranded", "product_without_strong_brand", "existing_brand"],
     needsUserDecision: true,
     cost: "slow", // fast | slow (drives loading UI and parallelism)
   }
   ```
2. **LLM planner** proposes an ordered plan with a reason per module, given the §7.1 input plus context completeness.
3. **Code validator** checks: every module exists; `requires` is satisfiable by the time it runs; no module targets a locked field; Brand Builder comes before Launch Kit; a consistency check comes before finalization; no module is repeated without a stated reason.
4. On validation failure: one repair attempt with the errors, then fall back to the **default plan** for the entry stage (§7.5). The fallback is logged and visible.
5. **Re-planning triggers:** after each module completes, after each user decision, when evaluation scores fall below thresholds (§13.5), or when the user asks ("go back to positioning").

> **Hackathon build (orchestrator lite, ADR-008):** use the §7.5 default plan for the entry stage; one `MODEL_FAST` call writes a short user-facing reason for each step (shown in the sidebar) and may drop steps whose outputs already exist in the Brand Context. The code validator still runs (locks, required fields, Builder before Launch Kit). Full LLM-proposed planning and re-planning are post-hackathon.

### 7.4 Interview completion rule
> Added: the Interviewer ends when `confidence ≥ 0.7` for problem, primary audience and product description, **or** after 6 questions, **or** when the user clicks "That's enough, continue." Low-confidence fields are carried forward as explicit assumptions shown in the Brand Context panel.

> Added 2026-09-25 (ADR-014): confidence is stored as levels, not numbers (ADR-009), so the threshold reads `low = 0.2`, `medium = 0.5`, `high = 0.9`: in practice all three fields must be `high`. The rule lives in `services/interview.ts` (`decideCompletion`) and is decided in code, never by the model; the route discards a question the model produced in the same call if the interview has just ended.

### 7.5 Default plans (fallbacks and examples)
```
Idea (A):     Interviewer → Brand Battle → Five Worlds
              → Anti-Generic → Brand Builder → Launch Kit
Product (B):  Interviewer → Brand Doctor → Brand Battle → Anti-Generic
              → Brand Builder → Launch Kit
Brand (C):    Brand Doctor → Brand Battle → Five Worlds → Anti-Generic
              → Brand Builder → Consistency Guardian
Protect (D):  Brand Doctor (extract draft system) → user confirms → Consistency Guardian
```

> Changed 2026-09-25 (ADR-018): the Audience Shifter left the Stage A and B plans; it ships as a tab beside the Battle results (§14.4). The validator's rules are listed in §7.3 step 3, with "a consistency check before finalization" read as ADR-019 defines it.

---

## 8. Landing page & project creation

**Goal:** immediately explain that GG helps you build or improve your brand using an adaptive AI workflow.

**Hero:** "GG Branding Studio" / "Build a brand that can think." / *Start wherever you are. Tell us what you have. We'll figure out what your brand needs next.*

**Stage selector:** "Where are you with your brand?"
- **I have an idea**: Build a brand from the ground up.
- **I have a product**: Find your positioning and identity.
- **I have a brand**: Improve and strengthen what already exists.
- **I want to protect my brand**: Keep future content consistent.

**How it works:** 1. Tell us where you are · 2. AI understands your situation · 3. AI builds your workflow · 4. Explore and challenge ideas · 5. Choose what feels right · 6. Get your Brand System · 7. Launch and keep your brand consistent

**On stage selection, create** Project, Session, Brand Context, Workflow State:
```json
{ "project_id": "uuid", "entry_stage": "idea", "brand_state": "unbranded", "status": "active" }
```
> Added: a **"See an example"** link opens the seeded demo project read-only, so judges and first-time users can see a finished Brand System before starting.

---

## 9. Workspace layout

```
-----------------------------------------------------
| GG Branding Studio                                |
-----------------------------------------------------
| Workflow       | AI Workspace      | Brand Context|
| ✓ Discover     | Conversation      | Audience     |
| ✓ Understand   |                   | Problem      |
| → Position     | Results           | Positioning  |
|   Explore      |                   | Personality  |
|   Challenge    | Comparisons       | Voice        |
|   Build        |                   | Visuals      |
|   Launch       |                   | Decisions    |
-----------------------------------------------------
```
- **Workflow Sidebar:** what the AI is doing (✓ done, → current, pending) with the orchestrator's reason for each step. Completed stages are inspectable.
- **AI Workspace:** conversation, questions, generated options, comparison cards, critiques, decision prompts, visual directions, brand outputs.
- **Brand Context Panel:** current decisions, lock icons, and assumptions; updates live.

> Added: an **"How the AI worked"** drawer per completed step shows agents involved, scores, critique findings and before/after revisions (from `workflow_runs`). This makes the AI workflow visible to judges (25% criterion).

---

## 10. UX & UI principles

**Feel:** intelligent, strategic, creative, human, clear, interactive, premium. **Not** corporate-heavy, **not** a generic chatbot.

**Prefer:** cards, comparisons, visual summaries, progress indicators, decision controls, expandable explanations, structured output.
**Avoid:** huge text walls, endless chat scrolling, unclear workflow, hidden AI operations, too many buttons, generic dashboard design.

**Loading states:** name the operation, never just "Loading…". E.g. *Understanding your audience…* · *Comparing positioning directions…* · *Challenging generic language…* · *Checking your brand for contradictions…* (driven by streaming events, §18.4).

**Empty states:** every area has one, e.g. *"Your Brand System is still forming. Once you make your first strategic decisions, they'll appear here."*

**Error states:** human-readable, never stack traces.
> We couldn't complete this AI step. Your previous work is safe.
> [Try Again] [Return to Workflow]

**Accessibility:** keyboard navigation, clear contrast, accessible buttons, meaningful labels, screen-reader-friendly structure, `aria-live` for streaming status.

**Responsive:** desktop, tablet, mobile. Desktop uses three panels; mobile collapses into Workflow → AI Workspace → Brand Context (tabs or stacked).

---

## 11. User control, locking, explainability, human review

### 11.1 User control
AI recommendations never silently become final. Provide: **Accept · Edit · Improve · Regenerate · Compare · Explore Alternatives · Why? · Lock**.

### 11.2 Decision locking
Locked decisions are **constraints** for all future AI stages.
```json
{ "category": "personality", "value": ["Bold", "Warm", "Intelligent"], "locked": true }
```
> Added: if the user edits or unlocks a decision that later outputs depend on, mark those outputs **stale** (using `derived_from` provenance, §12) and offer "Update dependent items".

### 11.3 Explainability
Important recommendations include **Recommendation · Why · Evidence from Brand Context · Potential Risk · Alternative**.

Example:
- **Recommended positioning:** "Project collaboration network for students"
- **Why:** Your audience needs trust and relevance, and your strongest differentiator is verified student identity.
- **Risk:** "Collaboration network" may sound too broad.
- **Alternative:** "Find the right people for your next project."

### 11.4 Human review
The AI flags when human judgment is needed, e.g. *"Multiple directions are strategically viable. User decision required."* or *"The AI found conflicting priorities. Choose what matters more: [Distinctiveness] [Immediate Clarity]"*.

---

## 12. Shared Brand Context (data contract)

Every agent works from this shared, structured context. The Zod schema in `src/lib/schemas/brand-context.ts` is canonical and shared by server, client and AI calls.

> Added: fields extended so the context can hold everything the Launch Kit (§14.9) needs, plus assumptions and provenance. The original plan's context had no place for candidate names, pitches, key messages, shapes, or multiple social posts.

```json
{
  "project":     { "name": "", "description": "", "stage": "" },
  "problem":     { "statement": "", "importance": "", "existing_alternatives": [] },
  "audience":    { "primary": [], "secondary": [], "needs": [], "pain_points": [], "behaviors": [] },
  "product":     { "description": "", "features": [], "benefits": [] },
  "positioning": { "category": "", "statement": "", "differentiator": "", "competitive_angle": "",
                   "value_proposition": "" },
  "personality": { "traits": [], "principles": [], "traits_to_avoid": [] },
  "identity":    { "name": "", "naming_direction": "", "naming_territories": [],
                   "candidate_names": [{ "name": "", "territory": "", "rationale": "", "risks": [] }],
                   "tagline": "" },
  "messaging":   { "one_line_pitch": "", "elevator_pitch": "", "key_messages": [] },
  "voice":       { "tone": [], "rules": [], "examples": [] },
  "visual":      { "colors": [], "typography": [], "imagery": [], "composition": [], "shapes": [],
                   "symbols": [], "things_to_avoid": [] },
  "brand_rules": [],
  "selected_direction": null,
  "launch":      { "headline": "", "subheadline": "", "cta": "", "social_posts": [],
                   "announcement": "", "product_description": "" },
  "meta":        { "assumptions": [], "open_questions": [], "confidence": {} },
  "provenance":  { "<field.path>": { "source": "user|agent", "agent": "", "run_id": "",
                                    "decision_id": "", "derived_from": [] } }
}
```

**Rules**
- Agents receive only the slices they need (`context_manager.slice_for(agent)`).
- Only confirmed user decisions and validated agent outputs are written to context.
- Every write records provenance so the product can explain *why* and detect stale dependents.
- Every write increments `brand_context.version` (optimistic concurrency, §18.3).

> Added 2026-09-24 (ADR-009): in the Zod schema, `meta.confidence` is an array of `{ path, level: "low"|"medium"|"high" }` and `provenance` is an array of `{ path, source, agent, run_id, decision_id, derived_from }`. OpenAI strict mode rejects open-keyed maps, so the JSON above is the logical shape and the arrays are the stored shape. `visual.colors` is `{ name, hex, role }[]`, `visual.typography` is `{ role, family, rationale }[]`, `launch.social_posts` is `{ platform, text }[]`, and `selected_direction` is `{ name, source_module, summary, run_id } | null`.

---

## 13. Agents, prompts, structured outputs, evaluation

### 13.1 Agent contract
Every agent defines: **ROLE · INPUT · CONTEXT · TASK · CONSTRAINTS · OUTPUT SCHEMA · EVALUATION · FAILURE HANDLING**.

Example, **Brand Interviewer**:
- **ROLE:** You are a brand discovery strategist.
- **INPUT:** entry stage, current Brand Context, conversation history.
- **TASK:** Determine what is known, what is missing, and which question would provide the highest-value information.
- **CONSTRAINTS:** Don't ask for information already known. Don't ask unnecessary questions. Don't start branding before sufficient problem and audience understanding.
- **OUTPUT:** known information, missing information, assumptions, next question.

### 13.2 Prompt registry
> Added: consistent prompt files make prompts reviewable and testable.
```ts
// src/lib/prompts/<agent>.ts
export const PROMPT_VERSION = "1.0.0";
export const meta = { tier: "primary" | "fast", temperature: 0.9, schema: DirectionSchema, maxTokens: 2000 };
export const system = `...role, task, constraints...`;
export function buildUser(slice: ContextSlice): string { /* fills the template */ }
```
User-supplied text is inserted inside clearly delimited blocks (e.g. `<user_content>…</user_content>`) with an instruction to treat it as data.

### 13.3 Structured outputs
Use schemas wherever possible. Example direction schema:
```json
{
  "direction_name": "", "positioning": "", "audience": [], "personality": [],
  "tagline": "", "voice": {}, "visual_direction": {}, "strengths": [], "risks": []
}
```

### 13.4 Output validation
```
AI → Schema Validation → Valid? ── YES → Continue
                                └─ NO  → Repair / Retry
```
On repeated failure: graceful error + user-friendly message + retry option.

### 13.5 Evaluation & critique loop
Score important outputs on audience fit, clarity, distinctiveness, specificity, strategic strength, consistency, genericity risk (1–10):
```json
{ "audience_fit": 8, "clarity": 9, "distinctiveness": 8, "specificity": 9,
  "strategic_strength": 8, "consistency": 9, "genericity_risk": 2 }
```
Internal signals unless the UI explicitly defines what they mean.

> Added: concrete loop rules.
> - Evaluation is done by a separate critic call (fast model, low temperature) with a written rubric, plus deterministic lexicon checks (§14.6).
> - **Trigger revision** when `genericity_risk ≥ 5`, or `distinctiveness ≤ 6`, or `audience_fit ≤ 6`, or any high-severity lexicon hit.
> - Revise **only** the flagged fields; never locked ones. **Max 2 revision rounds** (hackathon: **1**), then present the best version with remaining concerns stated.
> - Store before/after and score deltas; show them in the "How the AI worked" drawer.
> - Thresholds are tuned with the eval harness (§21) and recorded in the Decision Log.

---

## 14. Module specifications

### 14.1 Brand Interviewer
Adaptive, not a fixed list of 20 questions.
**Loop:** user answer → extract known info → identify missing info → identify assumptions → choose highest-value question → ask → update context. Completion per §7.4.
```json
{ "known_information": [], "missing_information": [], "assumptions": [], "next_question": "",
  "question_reason": "", "suggested_answers": [], "confidence": 0 }
```
> Added: `question_reason` (shown as "why I'm asking") and `suggested_answers` (tappable chips) make the interview faster and more transparent.

> Added 2026-09-25: the real output also carries `refusal` (a polite decline instead of a question when the idea is clearly illegal or harmful, H11) and `extracted_updates`: `{ path, values[], evidence }[]`, where `path` is an **enum of the thirteen Brand Context paths the Interviewer may write** (project, problem, audience, product) and `evidence` holds the user's own words behind the update. Without it the agent could only ask questions, never fill the context. `values` is always a list — a single entry for text fields — because OpenAI strict schemas reject unions. `confidence` follows the ADR-009 array shape. Suggested-answer counts (2–4) are clamped in code: strict mode ignores array length keywords.

**User benefit:** no branding expertise needed.

### 14.2 Brand Doctor
**Inputs (any of):** product description, brand name, tagline, website copy, social content, brand guidelines, audience info, visual info.
**Evaluates:** audience clarity, problem clarity, value proposition, positioning, differentiation, messaging, personality, voice, consistency, genericity, contradictions, audience mismatch.
```json
{ "strengths": [], "weaknesses": [], "contradictions": [], "audience_mismatch": [],
  "generic_elements": [], "opportunities": [], "recommendations": [] }
```
> Added: every finding carries `evidence` (a quote or reference from the provided material) and `type: fact|interpretation|recommendation`. For Stage D it also outputs a `draft_brand_system` for user confirmation.

### 14.3 Brand Battle (strategic competition)
**Answers:** *"What strategic position should this brand take?"*

| Agent | Focus |
|---|---|
| Strategist | Positioning, category, differentiation |
| Creative Director | Personality, identity, creativity |
| Audience Advocate | Audience, relevance, user perception |
| Skeptic | Weaknesses, assumptions, contradictions, risks |
| Differentiation Expert | Distinctiveness, competitive space, generic patterns |
| Synthesis Agent | Combines perspectives into directions |

**Output:** Directions A, B, C, each with positioning, audience, personality, strengths, weaknesses, risks, opportunities.
**User actions:** Choose A · Choose B · Choose C · Combine · Ask AI to revise · Generate another battle. The selection is written to `selected_direction`.

> **Hackathon build: Brand Battle Lite (ADR-008).** Two calls instead of five.
> 1. **Generate** (`MODEL_PRIMARY`, temperature ~0.9): one call returns three directions, each written from a named lens (Strategist, Creative Director, Audience Advocate) with positioning, audience, personality, strengths and risks.
> 2. **Challenge** (`MODEL_FAST`, temperature ~0.2): one call acting as Skeptic + Differentiation Expert critiques all three, scores them (§13.5), flags clichés and weak assumptions, and gives a short recommendation (replaces the separate synthesis step).
> A code check confirms the three directions differ in audience focus or category; if two collide, regenerate once. The UI labels each card with its lens and shows the critic's objections under it. Expected runtime 15–25 s.
>
> Post-hackathon: **execution design.** Round 1: Strategist, Creative Director and Audience Advocate each propose a direction in parallel. Round 2: Skeptic and Differentiation Expert critique all three in parallel. Round 3: Synthesis produces the final A/B/C with the critiques addressed or stated as risks. Divergence check in code: the three directions must differ in audience focus or category; otherwise regenerate the duplicate. Each agent's contribution is visible in the Battle view.

### 14.4 Audience Shifter
> Hackathon build: one call, three audiences, shown as a tab next to the Brand Battle results.

Explores different audiences without changing the product (e.g. Students → A, Professionals → B, Companies → C).
**Per audience:** profile, core need, value proposition, messaging, benefits, voice, positioning, risks.
> Added: a fixed "invariant value" line (what stays the same for all audiences) is shown at the top, making the "protect the underlying value" requirement visible.

### 14.5 One Idea, Five Worlds (identity exploration)
> Hackathon build: **3 worlds** in one call (ADR-008). Keep the name; the UI can offer "Explore 2 more worlds" post-hackathon.

**Answers:** *"What could this brand feel and look like in different identity directions?"* Worlds selected dynamically (e.g. Technical, Playful, Editorial, Premium, Bold). Runs **after** a strategic direction is chosen and inherits it.
**Per world:** positioning, personality, naming direction, tagline direction, voice, visual mood, audience perception, risks, opportunities.
> **Must not duplicate Brand Battle.** Brand Battle = strategic competition. Five Worlds = identity exploration.

> Added: each world renders a mini visual card (palette swatches, type sample, sample headline) so worlds are compared visually, not as text walls.

### 14.6 Anti-Generic Engine (cross-cutting)
Available throughout the workflow.
**Checks:** names, taglines, positioning, descriptions, voice, messaging, launch copy, visual concepts.
**Detects:** clichés, buzzwords, empty claims, predictable language, generic startup phrases, weak differentiation, copycat positioning, overused naming patterns.
**Process:** AI output → genericity analysis → problems → reasons → alternative → improved output.

Example: *"Empowering the future with innovative technology."* → no specific audience, no concrete problem, no meaningful differentiation, common startup language, no memorable idea. Suggested direction: *describe the specific transformation the product creates for its audience.*

> Added: **two layers.** (1) Deterministic: `src/lib/lexicon/` holds buzzwords ("empower", "seamless", "revolutionize", "unlock", "next-gen"…), empty-claim patterns ("the best", "world-class"), and naming patterns (dropped-vowel "-r" names, "-ify/-ly" suffixes, two stock words joined). Each hit has a severity. (2) LLM critic for nuance (weak differentiation, copycat positioning). Output per item:
> ```json
> { "target_path": "identity.tagline", "original": "", "issues": [{ "kind": "", "evidence": "", "severity": "low|med|high" }],
>   "genericity_risk": 0, "alternatives": [], "improved": "" }
> ```

### 14.7 Brand Builder
Builds the Brand System from approved decisions and **checks relationships**:

| Check | Question |
|---|---|
| Name ↔ Positioning | Does the name fit? |
| Tagline ↔ Value Proposition | Does the tagline say something meaningful? |
| Personality ↔ Audience | Would the audience respond to it? |
| Voice ↔ Personality | Does the writing sound like the intended personality? |
| Visual ↔ Strategy | Does the visual direction communicate the positioning? |
| Launch ↔ Brand | Does launch communication sound like the same brand? |

Each check returns `ok | tension | conflict` with a note. Conflicts go to the user as a decision (§11.4), not auto-resolved silently.

### 14.8 Visual direction
Not a full logo generator. Focus on typography direction, color mood, imagery, shapes, composition, visual personality, symbols, things to avoid.

Example **visual world**: Mood: warm + bold + intelligent · Typography: modern geometric sans-serif · Color: warm neutral base with energetic accent · Imagery: real people, candid moments · Composition: large type, generous whitespace · Avoid: overly corporate imagery, generic gradients, stock-photo feel.

> Added: colors are output as hex values with roles (background, text, accent); code checks hex validity and WCAG contrast for text pairs. Typography suggestions are limited to freely licensed fonts (e.g. Google Fonts) so the UI can render real specimens.

**Optional visual generation:** first a structured visual brief, then references. Never replace strategy.
```
Strategy → Personality → Visual Brief → Visual Exploration
NOT: Generate random logo → invent strategy afterward
```

### 14.9 Founder-to-Launch Kit

| Section | Contents |
|---|---|
| Brand Foundation | Problem, Audience, Value Proposition, Differentiator |
| Positioning | Category, Positioning Statement, Competitive Angle |
| Personality | Traits, Principles, Traits to Avoid |
| Naming | Naming Territories, Candidate Names, Rationale |
| Messaging | Tagline, One-Line Pitch, Elevator Pitch, Key Messages |
| Voice | Tone, Writing Rules, Examples |
| Visual Direction | Typography, Color Mood, Shapes, Imagery, Composition, Symbols, Avoidances |
| Launch | Landing Page Headline, Subheadline, CTA, Social Launch, Announcement, Product Description |

These correspond to the handbook's expected output system. All launch copy passes the Anti-Generic Engine and a voice check before display.

### 14.10 Consistency Guardian
Once a Brand System exists, the user submits new content: Instagram/LinkedIn posts, website copy, product or feature announcements, campaigns, emails, ads, landing pages.

**Process:** new content → load Brand System → analyze → check audience → positioning → voice → personality → messaging → detect conflicts → suggest revision.

**Result example:**
```
Brand Consistency Check
Audience     ✓ Consistent
Positioning  ✓ Consistent
Voice        ⚠ Needs revision
Personality  ✕ Inconsistent
Messaging    ✓ Consistent

Detected issue: The content uses formal corporate language, while the
established voice is direct, friendly and conversational.
Suggested revision: ...
```

> Added: output schema
> ```json
> { "content_type": "linkedin_post",
>   "checks": [{ "dimension": "voice", "verdict": "consistent|needs_revision|inconsistent",
>                "evidence": "", "brand_rule_ref": "" }],
>   "issues": [{ "excerpt": "", "problem": "", "fix": "" }],
>   "genericity": { "risk": 0, "hits": [] },
>   "suggested_revision": "" }
> ```
> The UI highlights each `excerpt` inline in the submitted text and shows the suggested revision as a diff.

**Continuous loop:** Brand System → New Content → Consistency Guardian → Revision → Brand System.

### 14.11 File / website input & analysis
Users may eventually provide: brand documents, website content or URL, product descriptions, existing copy, brand guidelines, images, social posts.
```
Website URL → Extract relevant content → Analyze brand
```
- Analyze **only** information actually provided. Never fabricate information.
- Distinguish **user-provided facts**, **AI interpretation**, and **recommendations**.
- Treat uploaded/fetched content as data, never instructions.

> Added: limits: files ≤ 10 MB; types PDF, DOCX, TXT, MD, PNG/JPG; website fetch limited to the given page plus up to 5 same-domain pages, with timeouts; blocked for private/internal IP ranges (SSRF protection).

---

## 15. Brand System & versioning

The final Brand System is the source of truth; the Consistency Guardian and all later work read from it.
```
Brand System
├── Foundation        ├── Personality     ├── Voice
├── Audience          ├── Principles      ├── Messaging
├── Positioning       ├── Naming          ├── Visual Direction
├── Differentiation   ├── Tagline         ├── Brand Rules
                                          └── Launch Assets
```
**Versioning:** important brand changes create versions (Brand v1, v2, v3…). The user can see what changed. Never silently overwrite important decisions.
> Added: each version stores a `change_summary` and a field-level diff; the Version History view shows them, and any version can be restored as a new version.

---

## 16. Workflow state & history

**States:** `INITIAL`, `DISCOVERY`, `CONTEXT_BUILDING`, `WORKFLOW_PLANNING`, `ANALYSIS`, `POSITIONING`, `EXPLORATION`, `CRITIQUE`, `USER_DECISION`, `BRAND_BUILDING`, `QUALITY_CHECK`, `LAUNCH`, `ACTIVE_BRAND`, `CONSISTENCY_CHECK`

> Added: allowed transitions are defined in `src/lib/services/workflow-engine.ts`; invalid transitions are rejected. Any state can move to `USER_DECISION` and back. `ACTIVE_BRAND ↔ CONSISTENCY_CHECK` loops indefinitely. A module failure leaves the state unchanged and records the error.

**History:** store stage, module, input context, output, user decision, timestamp, status. This enables debugging, history, explainability, reopening previous decisions, and demo visibility.

---

## 17. Database

| Table | Fields |
|---|---|
| `users` | id, email, name, created_at, updated_at *(post-hackathon; hackathon mode uses `projects.owner_id` = guest cookie ID)* |
| `projects` | id, user_id, name, entry_stage, brand_state, status, created_at, updated_at |
| `brand_context` | id, project_id, context_json, version, created_at |
| `workflow_runs` | id, project_id, module, stage, status, input_context, output_context, created_at, completed_at |
| `decisions` | id, project_id, category, value, reason, source, locked, created_at, updated_at |
| `brand_system` | id, project_id, version, brand_json, created_at |
| `launch_assets` | id, project_id, asset_type, content, version, created_at |
| `consistency_checks` | id, project_id, content, result, suggestions, created_at |

> Added:
> - `projects`: `owner_id` (guest cookie ID in hackathon mode).
> - `users`: `password_hash`, `is_guest`.
> - `projects`: `workflow_state`, `current_plan_json`, `share_slug` (nullable, for read-only share links), `archived_at`.
> - `workflow_runs`: `agent`, `model`, `prompt_version`, `tokens_in`, `tokens_out`, `latency_ms`, `retry_count`, `error_code`, `evaluation_json`, `parent_run_id` (Brand Battle sub-agents).
> - `decisions`: `path` (context field path), `superseded_by`, `run_id`.
> - `brand_system`: `change_summary`, `diff_json`.
> - `sources` (new): id, project_id, kind (`paste|file|url`), title, content_text, storage_key, created_at — for §14.11 source tracking.
> - `interview_turns` (new, 2026-09-25, ADR-013): id, project_id, role (`assistant|user`), content, question_reason, suggested_answers_json, run_id, created_at. The Brand Context stores the extracted facts; this table stores the conversation they came from, so the interview can be replayed and each question linked to the run that produced it.
> - Indexes on `project_id` everywhere; unique `(project_id, version)` on versioned tables. Deleting a project cascades to all its rows.

---

## 18. Application structure, API, authentication

> Changed 2026-09-24 (ADR-006): one Next.js codebase replaces the separate Python backend and React frontend. The responsibilities in the original `backend/` and `frontend/` layouts map onto `src/lib/` (server logic) and `src/app/` + `src/components/` (UI).

### 18.1 Project structure
```
src/
├── app/
│   ├── page.tsx                          # landing + stage selector
│   ├── project/[id]/page.tsx             # workspace (3 panels)
│   ├── project/[id]/brand-system/page.tsx
│   ├── project/[id]/launch-kit/page.tsx
│   ├── project/[id]/consistency/page.tsx
│   ├── share/[slug]/page.tsx             # read-only public Brand System + Launch Kit
│   └── api/                              # route handlers (§18.3)
├── components/   StageSelector, ProjectCard, WorkflowSidebar, WorkflowStage, AIWorkspace,
│                 ChatInterface, AIResult, BrandContext, DirectionCard, BattleView,
│                 FiveWorldsView, AudienceComparison, CritiquePanel, DecisionControls,
│                 BrandSystem, LaunchKit, ConsistencyCheck, VersionHistory,
│                 HowTheAIWorked, LoadingStatus, EmptyState, ErrorState, ui/ (shadcn)
├── lib/
│   ├── schemas/     brand-context.ts, workflow.ts, decisions.ts, errors.ts, outputs/*.ts
│   │                (Zod — single source of truth for server and client)
│   ├── agents/      registry.ts, orchestrator.ts, interviewer.ts, brand-doctor.ts,
│   │                battle/{strategist,creative-director,audience-advocate,skeptic,
│   │                differentiation,synthesizer}.ts, audience-shifter.ts, five-worlds.ts,
│   │                anti-generic.ts, brand-builder.ts, launch-kit.ts,
│   │                consistency-guardian.ts, critic.ts
│   ├── prompts/     <agent>.ts  (system, buildUser(slice), PROMPT_VERSION, tier, temperature)
│   ├── ai/          llm.ts (generateStructured: validate, repair, retry, trace)
│   ├── services/    context-manager.ts, workflow-engine.ts, evaluator.ts, exporter.ts,
│   │                events.ts (stream helpers), rate-limit.ts
│   ├── lexicon/     buzzwords.ts, empty-claims.ts, naming-patterns.ts, detect.ts
│   ├── db/          schema.ts (Drizzle), client.ts, queries.ts
│   └── session.ts   guest identity cookie
├── state/brand-store.ts   (Zustand)
└── demo/recorded-run.json (DEMO_MODE replay)
evals/  fixtures/*.json · run.ts · results/summary.md
scripts/ seed-demo.ts · record-demo.ts
```

### 18.2 Responsibilities
- **Route handlers** stay thin: resolve guest owner → load project → call an agent/service → persist → stream events.
- **Agents** are pure functions `(slice, ctx) → validated output` that call `ai/llm.ts`. They never touch the DB.
- **Services** own persistence, context slicing, workflow state transitions and evaluation.
- **Client** holds UI state in Zustand and drives the workflow loop (§18.4).

### 18.3 API (Next.js route handlers under `/api`)
```
POST  /api/projects                          GET   /api/projects
GET   /api/projects/[id]                     PATCH /api/projects/[id]
POST  /api/projects/[id]/interview           # one interview turn
POST  /api/projects/[id]/workflow/plan
POST  /api/projects/[id]/workflow/next       # runs next module, streams events
GET   /api/projects/[id]/workflow
POST  /api/projects/[id]/modules/[module]    # explicit runs: brand-doctor, brand-battle,
                                             # audience-shifter, five-worlds, anti-generic,
                                             # brand-builder, launch-kit
POST  /api/projects/[id]/consistency-check
PATCH /api/projects/[id]/decisions
GET   /api/projects/[id]/history
GET   /api/projects/[id]/export?format=md|json
POST  /api/projects/[id]/share               GET /share/[slug] (page)
GET   /api/health
```
The per-module endpoints from the original plan are collapsed into one dynamic `modules/[module]` route validated against the module registry (saves time, same behavior).

Semantics:
- `POST /workflow/next` runs the next pending module. Final event: `{ status: "running"|"awaiting_decision"|"complete", run_id, decision_prompt? }`.
- `PATCH /decisions` body: `{ path, value, locked, reason, source: "user"|"ai_accepted", expected_version }`. A mismatched `expected_version` returns `409 CONFLICT`.
- Explicit module runs exist for user actions ("Generate another battle"); the orchestrator calls the same agent functions internally.

### 18.4 Streaming
> Changed (ADR-003): serverless functions can't hold a long-lived stream, so **each module run is its own request** and streams its own progress in the response body (SSE format over a `ReadableStream`). The client drives the loop: call `workflow/next` → render events → if `awaiting_decision`, show decision UI → user decides → call `workflow/next` again.

AI routes set `export const maxDuration` high enough for the slowest module (Brand Battle). Check the Vercel plan's limit; keep every request under it by running Brand Battle's agents in parallel.

| Event | Payload |
|---|---|
| `workflow.planned` | `{ plan: [{module, reason}], fallback_used }` |
| `module.started` | `{ run_id, module, label }` — label feeds the loading message |
| `module.progress` | `{ run_id, message }` — e.g. "Skeptic is challenging Direction B…" |
| `agent.completed` | `{ run_id, parent_run_id, agent, summary }` |
| `critique.finding` | `{ run_id, target_path, kind, severity }` |
| `module.completed` | `{ run_id, module, scores, output }` |
| `decision.required` | `{ decision_id, prompt, options }` |
| `context.updated` | `{ version, changed_paths }` |
| `error` | error object (§18.5) |

### 18.5 Error model
All errors use one shape:
```json
{ "error": { "code": "AI_OUTPUT_INVALID", "message": "We couldn't complete this AI step. Your previous work is safe.",
             "retryable": true, "request_id": "..." } }
```
Codes: `VALIDATION_ERROR` (422) · `UNAUTHORIZED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) · `CONFLICT` (409) · `LOCK_VIOLATION` (409) · `RATE_LIMITED` (429) · `AI_OUTPUT_INVALID` (502) · `AI_PROVIDER_UNAVAILABLE` (503) · `AI_TIMEOUT` (504) · `INTERNAL` (500). `message` is always user-safe; details go to logs with `request_id`.

### 18.6 Authentication
Full vision: sign up, login, logout, session management; a user's projects belong to that user; users never access another user's project.

> Hackathon mode (ADR-005): **guest identity only.** On first visit the server sets a signed, httpOnly, secure, SameSite=Lax cookie `gg_uid` (random UUID). `projects.owner_id` = that ID and every query is scoped by it, so users still cannot see each other's projects. Share links (`/share/[slug]`) are read-only. Accounts with "Save my work" (e.g. Auth.js or Supabase Auth) are *post-hackathon* (B1–B6).


## 19. Security, performance, observability

**Security:** secret management, authentication security, authorization (every query scoped by owner), input validation, file validation, rate limiting, prompt injection awareness, data isolation, secure logging, production security review.
> Added: rate limit AI endpoints per user and per IP (protects API credits on the public demo); per-project daily AI-call cap; CORS restricted to the frontend origin; SSRF protection for URL fetch; no user content in logs beyond IDs and lengths.

**Content policy:** > Added: the product declines to brand clearly illegal or harmful ventures (e.g. scams, hate content) with a polite message; this check runs in the Interviewer's first turn.

**Performance:** AI latency tracking, context size management, query optimization, frontend rendering optimization, caching where appropriate, parallel agent execution where safe, streaming where useful.
> Added budgets (targets, tune later): interview turn < 5 s; Brand Battle < 45 s; Five Worlds < 40 s; Brand Builder < 30 s; consistency check < 10 s. Cache identical Anti-Generic checks by content hash.

**Observability:** track AI failures, workflow failures, invalid structured output, API latency, module execution, database errors, workflow completion, retry frequency. Avoid unnecessary sensitive data in logs.
> Added: structured JSON logs with `request_id`; optional error tracking (e.g. Sentry) via `SENTRY_DSN`; a simple internal `/admin/metrics` page (or SQL views) for run success rate, retries and latency per agent.

---

## 20. Tech stack, environment, deployment

### 20.1 Tech stack (decided 2026-09-24, ADR-006)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (latest stable, App Router) + TypeScript strict | One language, one repo, one deploy; no CORS; server and client share Zod schemas |
| UI | Tailwind + shadcn/ui, lucide icons | Polished card-based UI quickly |
| AI | OpenAI via Vercel AI SDK (`ai`, `@ai-sdk/openai`): `generateObject` / `streamObject` with Zod | Structured outputs validated at the boundary; streaming built in |
| DB | Postgres on Neon (via Vercel Marketplace) + Drizzle ORM (`drizzle-kit push`) | Free tier, JSONB for context, no migration ceremony during the hackathon |
| State | Zustand (`brand-store`) + fetch/streams | Minimal client state |
| Tests | Vitest (unit: lexicon, lock enforcement, plan validator, schemas) | Fast; full E2E is post-hackathon |
| Hosting | Vercel (preview + production from GitHub) | Deploy in minutes; judges get a stable URL |
| Package manager | pnpm | |

Why not FastAPI + React: two languages, two deployments, CORS, and duplicated types. That costs hours we don't have in 36.

### 20.2 OpenAI notes
- **Models come from env.** `MODEL_PRIMARY` = the strongest model within budget, for generation and synthesis. `MODEL_FAST` = a small/mini model, for critics, interviewer turns and consistency checks. Check current model names, prices and structured-output support in OpenAI's docs before choosing.
- **Structured outputs (strict mode) quirks:** every object property must be required, so use `.nullable()` instead of `.optional()`. Avoid a union at the schema root and very deep nesting. Keep enums small. Always re-validate with Zod after the call.
- **Temperature:** generators ~0.9 for divergent options, critics ~0.2. Some reasoning models reject or ignore `temperature`; if so, omit it and ask for divergence in the prompt.
- **Rate limits and credits:** Brand Battle fires about 5 calls. Cap concurrency at 3, back off on 429, and check the account's tier limits before the demo.
- **Cost guard:** per-project daily AI-call cap and per-IP rate limit (§19), because the live URL is public.

> Added 2026-09-25 (ADR-017), from reading the installed `@ai-sdk/openai` 4.0.73:
> - `gpt-6-sol` and `gpt-6-luna` **are** handled correctly: both are known model ids, both are detected as reasoning models, and both accept a reasoning effort of `none`, `low`, `medium`, `high`, `xhigh` or `max`.
> - For any `gpt-6*` model the provider **drops `temperature`** (with a warning), even at effort `none`, because `supportsNonReasoningParameters` is false. The generator-vs-critic temperature split (0.9 vs 0.2, §13.5) therefore has no effect on gpt-6 models.
> - Setting a reasoning effort also makes the provider request a `detailed` reasoning summary by default, which costs output tokens.
> - **Recommendation while the account has no gpt-6 access:** keep `MODEL_PRIMARY=gpt-4.1`, `MODEL_FAST=gpt-4.1-mini` and `OPENAI_OMIT_TEMPERATURE=0`, so the critics really do run cold. The account's model list (checked 2026-09-25) reaches gpt-5.4 but not gpt-6.
> - `MODEL_PRIMARY_REASONING_EFFORT` / `MODEL_FAST_REASONING_EFFORT` are optional and ignored by the gpt-4.1 family, so they can stay set when switching models.

### 20.3 Environment variables

> Added 2026-09-25: `MODEL_PRIMARY_REASONING_EFFORT` and `MODEL_FAST_REASONING_EFFORT` (`none|low|medium`, optional) and, for local work only, `OPENAI_BASE_URL` — set by `pnpm dev:stub` to point at `scripts/stub` (ADR-021) and never set in production.
Keep `.env.example` in sync.
```
OPENAI_API_KEY=
MODEL_PRIMARY=
MODEL_FAST=
DATABASE_URL=
SESSION_SECRET=              # signs the guest cookie
NEXT_PUBLIC_APP_URL=
DEMO_MODE=0
RATE_LIMIT_PER_MIN=20
DAILY_AI_CALLS_PER_PROJECT=200
OPENAI_OMIT_TEMPERATURE=0    # set to 1 if the chosen models reject `temperature`
```
> Added 2026-09-24: `OPENAI_OMIT_TEMPERATURE` lets the same prompts run on reasoning models that reject `temperature` (§20.2). `SESSION_SECRET` must be at least 32 characters, or the guest cookie is not issued and `/api/health` reports it missing.

### 20.4 Commands
```bash
pnpm dev          # local dev
pnpm build        # production build (must pass before pushing to main)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm db:push      # apply Drizzle schema to DATABASE_URL
pnpm db:studio    # inspect DB
pnpm eval         # run evals/fixtures → evals/results/summary.md
pnpm seed:demo    # create the seeded demo project
pnpm record:demo  # save a good live run to src/demo/recorded-run.json
```

### 20.5 Deployment
- Connect the GitHub repo to Vercel in **Phase 1**. Add Neon from the Vercel Marketplace (sets `DATABASE_URL`). Add all env vars to Production and Preview.
- `pnpm db:push` against production once schemas change (hackathon mode, no migration files).
- `/api/health` checks DB connectivity and that the OpenAI key and models are configured.
- Seed the demo project in production (`pnpm seed:demo`) and link it as "See an example" on the landing page.

### 20.6 Demo mode
`DEMO_MODE=1` replays `src/demo/recorded-run.json` (the same stream events with realistic timing) **only if** the live provider fails or rate-limits. The UI shows a small "replay" badge so the demo stays honest. Record it with `pnpm record:demo` after the demo path works live.


## 21. Evaluation harness & edge cases

### 21.1 Evaluation harness
> Added. Evidence for the 25% "thoughtful evaluation" criterion.
- `evals/fixtures/`: 12 inputs, 3 per entry stage (hackathon mode: 5 — three Stage A, one Stage C, one bad social post; deferred in solo mode, ADR-008), including hard cases: very vague idea, contradictory answers, non-English input, an existing brand full of buzzwords, a social post in the wrong voice.
- `pnpm eval` runs each fixture headless through its default plan with scripted user choices and writes `evals/results/summary.md`.
- **Metrics:** schema validity rate · retries per run · lexicon hits before vs after Anti-Generic · critic scores before vs after revision · Brand Builder conflicts found · lock violations (**must be 0**) · Consistency Guardian detection rate on seeded bad posts · latency p50/p95 per module · tokens per run.
- The README and demo show the summary table.

### 21.2 Edge cases to handle
> Added.
- User answers "I don't know" or skips questions → record as assumption, continue, show it in the context panel.
- Contradictory answers → Interviewer asks one clarifying question.
- Very short input ("an app") → Interviewer starts broad; very long input → summarize and confirm.
- Non-English input → respond in the user's language; keep schema keys in English.
- User rejects all three directions → offer "Generate another battle" with a reason field ("None fit because…").
- User locks conflicting decisions → Brand Builder flags the conflict as a decision prompt.
- Two browser tabs edit the same project → version conflict (409) with "Reload latest".
- Provider down mid-workflow → state unchanged, retry button, previous work safe.
- Candidate names may be trademarked or taken → never claim availability; show "check availability" note.
- Consistency Guardian input without a Brand System → explain and route to Stage D bootstrap.
- Pasted content containing instructions ("ignore previous instructions…") → treated as content; the check still runs.

---

## 22. Implementation task tree

All tasks start `[ ]`. Expand each using §1.1 when you start it. New tasks are marked (new). Tasks without a marker are `[ ]`. Phase 1 progress is summarised in §22.1 "Status".

**A. Project foundation:** [x] A1 Repository setup · [x] A2 Development environment · [x] A3 Environment variables · [x] A4 Base frontend · [x] A5 Base backend · [x] A6 Database connection · A7 Database migrations · [~] A8 Logging · [x] A9 Error handling · A10 CI pipeline (lint, test, E2E) (new) · [x] A11 package.json scripts (new) · A12 Seed demo project (new)

**B. Authentication:** B1 Registration · B2 Login · B3 Logout · B4 Session persistence · B5 Protected routes · B6 User/project authorization · [~] B7 Guest mode + "save my work" (new)

**C. Project management:** [x] C1 Create · [x] C2 List · [x] C3 Open · C4 Rename (auto-named from the interview; manual rename post-hackathon) · C5 Delete/archive · [x] C6 Save project state · C7 Project dashboard

**D. Stage selection:** [x] D1 Stage selector UI · [x] D2 Stage descriptions · [x] D3 Stage selection state · [x] D4 Project initialization · [x] D5 Initial AI context · D6 Stage D bootstrap flow (new)

**E. Workspace:** [x] E1 Layout · [x] E2 Workflow sidebar · [x] E3 AI conversation (interview cards) · [x] E4 Brand Context panel · [x] E5 Decision cards · [x] E6 Result cards · [x] E7 Loading states · [x] E8 Error states · [x] E9 Responsive workspace · [x] E10 Streaming client hook (new) · [x] E11 "How the AI worked" drawer (new) · [x] E12 Empty states (new)

**F. AI foundation:** [x] F1 LLM provider abstraction · [x] F2 AI request service · [x] F3 Prompt registry · [x] F4 Structured output parser · [x] F5 Schema validation · [x] F6 Retry mechanism · [x] F7 Error handling · [~] F8 Token/context management · [x] F9 AI logging · [~] F10 Critic/evaluator service (new — the Battle critic scores per §13.5; a shared service comes with Anti-Generic) · F11 Eval harness (new)

**G. Brand Context:** [x] G1 Schema · [x] G2 Storage · [x] G3 Retrieval · [x] G4 Updates · [x] G5 Versioning · [x] G6 Locked decisions (enforced in code on every write; Lock offered when a direction is chosen) · [x] G7 Display · [~] G8 Provenance & stale detection (new — provenance written, stale detection later) · [x] G9 Optimistic concurrency (new)

**H. Brand Interviewer:** [x] H1 Prompt · [x] H2 Question generation · [x] H3 Answer extraction · [x] H4 Missing-info detection · [x] H5 Assumption detection · [x] H6 Completion detection · [x] H7 API · [x] H8 UI (with suggested-answer chips) · [x] H9 Context integration · [x] H10 Testing · [x] H11 Content-policy check (new)

**I. Workflow Orchestrator:** [x] I1 Workflow schema · [~] I2 Planner (lite: AI writes the reasons, code owns the plan — ADR-008) · [x] I3 Module registry · [~] I4 Module selection (registry-driven skip; full selection is post-hackathon) · [x] I5 Executor · [x] I6 Context passing · I7 Dynamic branching · I8 Stage repetition · I9 Completion · [x] I10 Logging · [x] I11 Testing · [x] I12 Plan validator + default-plan fallback (new) · I13 Re-planning triggers (new) · [x] I14 State-transition rules (new)

**J. Brand Doctor:** J1 Product analysis · J2 Brand analysis · J3 Strengths · J4 Weaknesses · J5 Contradictions · J6 Audience mismatch · J7 Genericity analysis · J8 Recommendations · J9 API · J10 UI · J11 Evidence + fact/interpretation labels (new) · J12 Draft Brand System extraction (new)

**K. Brand Battle:** [x] K1 Strategist · [x] K2 Creative Director · [x] K3 Audience Advocate · [x] K4 Skeptic · [x] K5 Differentiation agent · K6 Parallel generation (*one call covers all three lenses in Lite*) · [~] K7 Debate/synthesis (Combine merges two directions; the 5-agent debate is post-hackathon) · [x] K8 Direction evaluation · [x] K9 API · [x] K10 UI · [x] K11 User selection · [x] K12 Direction persistence · [x] K13 Divergence check (new)

**L. Audience Shifter:** L1 Audience discovery · L2 Profile · L3 Value proposition · L4 Positioning · L5 Messaging · L6 Comparison · L7 UI · L8 Selection

**M. Five Worlds:** M1 World generation · M2 Personality · M3 Positioning · M4 Naming direction · M5 Voice · M6 Visual direction · M7 Risks · M8 Evaluation · M9 UI (mini visual cards) · M10 Selection

**N. Anti-Generic Engine:** N1 Generic language detector · N2 Cliché detection · N3 Buzzword detection · N4 Weak differentiation · N5 Naming critique · N6 Tagline critique · N7 Positioning critique · N8 Messaging critique · N9 Alternative generation · N10 Workflow integration · N11 Critique UI · N12 Lexicon files + severity (new) · N13 Revision loop with thresholds (new)

**O. Brand Builder:** O1 Gather approved decisions · O2 Resolve conflicts · O3 Final positioning · O4 Personality · O5 Naming system · O6 Tagline · O7 Voice · O8 Messaging · O9 Visual brief · O10 Brand rules · O11 Final consistency check · O12 Brand System generation

**P. Brand System UI:** P1 Foundation · P2 Audience · P3 Positioning · P4 Differentiation · P5 Personality · P6 Naming · P7 Tagline · P8 Voice · P9 Messaging · P10 Visual Direction · P11 Brand Rules · P12 Decision locking · P13 Editing · P14 Version history · P15 Restore version (new)

**Q. Founder-to-Launch Kit:** Q1 Launch strategy · Q2 Landing page copy · Q3 Product pitch · Q4 Elevator pitch · Q5 Social launch · Q6 Announcement · Q7 CTA · Q8 Launch messaging · Q9 UI · Q10 Export

**R. Consistency Guardian:** R1 Content input · R2 Content parsing · R3 Load Brand System · R4 Audience check · R5 Positioning check · R6 Personality check · R7 Voice check · R8 Messaging check · R9 Genericity check · R10 Revision generation · R11 Result UI (inline highlights + diff) · R12 History

**S. File / website analysis:** S1 File upload · S2 File extraction · S3 Content parsing · S4 Website input · S5 Website content extraction · S6 Analysis from external material · S7 Source tracking · S8 Error handling · S9 SSRF + size limits (new)

**T. Visual intelligence:** T1 Visual brief · T2 Typography (free fonts, rendered specimens) · T3 Color mood (hex + contrast check) · T4 Imagery · T5 Composition · T6 Symbols · T7 Avoidance list · T8 Optional visual generation · T9 Visual direction UI

**U. Export:** U1 Brand System export · U2 Launch Kit export · U3 PDF generation · U4 Copy-to-clipboard · U5 Shareable view · U6 Export testing · U7 Markdown + JSON export (new)

**V. Testing:** [~] V1 Unit · [~] V2 API · V3 Database · V4 AI schema · V5 Agent (fake provider) · V6 Orchestrator · V7 Workflow integration · V8 Frontend · V9 End-to-end (demo path) · V10 Error · V11 Responsive · V12 Accessibility · [x] V13 Lock-violation tests (new) · [x] V14 Authorization tests (cross-user access) (new)

**W. Security:** W1 Secret management · W2 Auth security · W3 Authorization · W4 Input validation · W5 File validation · W6 Rate limiting · W7 Prompt injection awareness · W8 Data isolation · W9 Secure logging · W10 Production security review · W11 AI usage caps (new)

**X. Performance:** [x] X1 AI latency tracking · X2 Context size management · X3 Query optimization · X4 Frontend rendering · X5 Caching · X6 Safe parallel agents · [x] X7 Streaming

**Y. Observability:** Y1 Structured logs + request IDs · Y2 Error tracking · Y3 Run metrics views · Y4 Workflow completion tracking (all new, detailing §19)

**Z. Deployment:** Z1 Vercel project + GitHub deploys · Z2 Frontend deploy · Z3 Neon production DB + `db:push` · Z4 Env + CORS config · [~] Z5 Health check · Z6 Seed demo in production · Z7 Demo mode replay (new)

**SUB. Submission (new):** SUB1 README (problem, workflow diagram, agents, eval table, setup, disclosure of reused code/AI tools) · SUB2 Public repo check · SUB3 Demo video · SUB4 Final acceptance run on production

### 22.1 Solo hackathon sprint plan (deadline 25 Sept 2026, 22:00 IST)

> Changed 2026-09-24 (ADR-007, ADR-008): one builder, about a day left. Every capability is kept but built as its thinnest real version (mostly one AI call each). Hours are focused working hours; fill in real clock times.

#### Scope

**MUST (the live demo path, Stage A):**
- Foundation: A1–A6, A11, A12 · guest cookie (§18.6)
- AI core: F1–F9 · Brand Context: G1–G4, G6 · Stage selection: D1–D5
- Workspace: E1–E8, E10, E11 (simple "How the AI worked" list)
- Interviewer: H1–H9
- Orchestrator (lite, §7.3): I1, I3, I5, I6, I14 + default plans with AI-written reasons
- **Brand Battle Lite** (§14.3): 2 calls; K9–K12 (API, UI, selection, persistence)
- Five Worlds: M1–M10 with **3 worlds**, one call
- Anti-Generic: N1–N3, N9, N10, N12, N13 with **one** revision round
- Brand Builder: O1–O12 in one call + relationship checks in its output
- Brand System UI: P1–P12 (read, edit, lock)
- Launch Kit: Q1–Q9, one call
- Consistency Guardian: R1–R11, one call
- Export: U4 (copy), U7 (Markdown)
- Deploy: Z1–Z6

**SHOULD (so all eight capabilities genuinely work):**
- Brand Doctor: J1–J8, J11, one call, pasted text, for Stage B and C
- Audience Shifter: L1–L8, one call, shown as a tab beside the Battle results
- Stage D lite: user pastes existing guidelines/copy; the Guardian checks content against that text directly

**Post-hackathon:** full 5-agent Brand Battle, AI-proposed plans + validator + re-planning (I2, I4, I7–I13), 2-round revision loop, 5 worlds, eval harness (F11), demo-mode replay (Z7), share links (U5), version history UI (P14–P15), Stage D draft-system extraction (D6, J12), accounts (B1–B6), files/websites (S), image generation (T8), PDF (U3), broad tests.

**Tests kept:** lexicon detection, lock enforcement, schema validation of each agent output (fake model), owner scoping. Run the demo path by hand before every push to `main`.

#### Status

> Added 2026-09-24: Phase 1 (Foundation) code complete. Checkpoint still open: one structured OpenAI call working **in production** needs the founder's OpenAI key, a Neon database and a Vercel project (manual steps).

> Added 2026-09-25: Phase 2 (Discover) code complete and verified against the **real Neon database**: project creation, the three-panel workspace, the Interviewer loop, context versioning with provenance, completion in code and the workflow advancing to `WORKFLOW_PLANNING`. `pnpm db:push` has been run (all tables now exist, including the new `interview_turns`). **The live model call is blocked: the OpenAI account has no credits** (§28), so the interview was exercised with a local stub of the OpenAI endpoint, not the real model. The demo path cannot be signed off in production until credits are added and `MODEL_PRIMARY` / `MODEL_FAST` are set in Vercel.

| Task | Status | Notes |
|---|---|---|
| A1–A5, A11 | [x] | Next.js 16.3 + TS strict + Tailwind 4 + shadcn/ui (Radix base), pnpm 12, scripts per §20.4 (`eval`, `record:demo` deferred) |
| A6 | [x] | Drizzle schema, Neon HTTP client, owner-scoped queries; `pnpm db:push` applied and exercised end to end (2026-09-25) |
| A8 | [~] | Structured JSON logs with `request_id` (`services/log.ts`); no Sentry |
| A9 | [x] | `schemas/errors.ts` (§18.5 codes, `AppError`, `toErrorResponse`) + `services/route.ts` `withErrors` |
| A12 | [ ] | `pnpm seed:demo` is a placeholder (Phase 8) |
| B7 (guest part) | [~] | Signed `gg_uid` cookie via `src/proxy.ts` + `getOwnerId()`; "save my work" is post-hackathon |
| D1, D2 | [x] | Landing hero + four stage cards; selecting one creates the project and opens the workspace |
| F1, F2, F4–F7 | [x] | `ai/llm.ts` `generateStructured`: Zod re-validation, 1 repair retry, 2 backoff retries on 429/5xx/network, per-tier timeouts, typed errors |
| F3 | [x] | Registry shape set by `prompts/ping.ts` and followed by `prompts/interviewer.ts`; later agents add their own files |
| F8 | [~] | `services/context-manager.ts` slices the context per agent (Interviewer done); token budgeting is post-hackathon |
| F9 | [x] | `LlmTrace` on every call (also on failure via `AiCallError.trace`); the interview route persists both outcomes with `recordRun()` |
| G1 | [x] | `schemas/brand-context.ts` + `emptyBrandContext()`; strict-mode compatibility is unit-tested |
| G2–G5, G9 | [x] | Append-only versions, `saveContext` with expected version → `CONFLICT`; verified against the real database |
| Z5 | [~] | `GET /api/health` (env presence, DB ping, `?ai=1` structured ping). DB check verified; the AI check cannot pass until the account has credits |
| Z1–Z3 | [~] | Neon connected and `pnpm db:push` applied. Founder: confirm the Vercel project's env vars (`MODEL_PRIMARY`, `MODEL_FAST` were missing) |
| C1–C3, C6 | [x] | `POST`/`GET /api/projects`, `GET /api/projects/[id]`, "Your projects" on the landing page, all owner-scoped |
| D1, D3–D5 | [x] | Stage card → project + Brand Context v1 + default plan (§7.5) → `/project/[id]` |
| E1–E4, E7–E9, E12 | [x] | Three panels (Workflow · AI Workspace · Brand Context), stacked in that order below `lg`; named loading, human error state with Try Again, empty states |
| F3, F9 | [x] | `prompts/interviewer.ts` follows the registry shape; every call (including failures) is written to `workflow_runs` |
| G2–G5, G7, G9 | [x] | Append-only context versions verified against Postgres (v1 → v4 across a run), provenance carries the user's own words |
| H1–H11 | [x] | Interviewer agent, API, card UI, completion rule in code (§7.4), content-policy decline, 15 tests |
| I1, I5, I6 | [x] / [~] | Default plans with static reasons + `completeStep`; AI-written reasons and the module runner are Phase 3 |
| V13, V14 | [x] | Locked paths are never written (unit + route tests); another guest cookie gets 404 on read and write (also verified live) |
| **Phase 3** | | **Orchestrate + Battle Lite, 2026-09-25** |
| I1, I3, I5, I6, I12, I14 | [x] | Module registry, plan validator (requires · locks · Builder before Launch Kit · a check before finalization), one repair attempt, static fallback, workflow state machine |
| I2 (lite) | [x] | One `MODEL_FAST` call writes the sidebar reasons and may skip a covered step; any failure falls back to the static plan with `fallback_used: true` |
| E10, X7 | [x] | `services/events.ts` + `stream.ts` (SSE over `ReadableStream`), `useWorkflowStream` on the client; `POST /workflow/next` runs one module per request |
| K1–K5, K8–K13 | [x] | Battle Lite: generate (primary, 3 lenses) + challenge (fast, scores/objections/clichés/recommendation), code divergence check with one regeneration, Choose · Combine · Revise · Generate another |
| E5, E6, E11 | [x] | Battle cards with lens badges, score bars, critic objections, "Why?" (§11.3) and a "How the AI worked" list from `workflow_runs` |
| G6 | [x] | Choosing writes `selected_direction` + `positioning.*` + `personality.traits` with provenance, offers Lock, and never overwrites a locked path |
| ADR-017 | [x] | Reasoning-effort env vars wired through `llm.ts` (see §20.2) |

Tests: 116 passing. Phase 3 added the plan validator and state machine, the planner's repair/fallback path, the SSE round trip, the Battle schemas against the shipped stub fixtures, the divergence check, score clamping, and the choose route (locked paths, stale versions, cross-guest 404).

#### Schedule

| Phase | Hours | Deliverable | Checkpoint |
|---|---|---|---|
| 1. Foundation | 2 | Next.js + shadcn + Drizzle/Neon + guest cookie + Zod schemas + `llm.ts`, deployed on Vercel | One structured OpenAI call works **in production** |
| 2. Discover | 2.5 | Landing, stage selector, project creation, 3-panel workspace, Interviewer loop, live Brand Context panel | Idea → questions → context fills in |
| 3. Orchestrate + Battle Lite | 2.5 | Default plans with AI reasons in sidebar, streaming client, Battle Lite with role labels and critic notes, choose / combine / regenerate | 3 directions + critique; choice saved |
| 4. Worlds + Anti-Generic | 2.5 | 3 world cards (palette swatches, font sample, headline), lexicon, critic, one revision round, before/after UI | Visible critique with score change |
| 5. Build + Launch | 2.5 | Brand Builder, Brand System page with locks and edits, Launch Kit | Complete kit renders |
| 6. Guardian + export | 1.5 | Consistency Guardian with inline highlights and suggested revision; Markdown export + copy buttons | Bad post gets caught |
| 7. Other stages | 1.5 | Brand Doctor (B/C), Audience Shifter tab, Stage D lite | All eight capabilities reachable |
| 8. Polish | 1.5 | Loading/empty/error states, mobile check, "How the AI worked" list, seeded example project | Demo path flawless in production |

**Total ≈ 16.5 focused hours.** Sleep 4–5 hours, ideally after Phase 4 or 5, with production deployed and working before you sleep.

**Hard milestones (IST, Friday 25 Sept):**
- **16:00 — feature freeze.** Bug fixes only.
- **16:00–18:30:** README (problem, workflow diagram, agents, before/after example, setup, disclosure of AI tools used) and the 2–4 minute demo video.
- **18:30–20:30:** your Instagram post, your LinkedIn post with the video uploaded directly (Inkloom description, inkloom.art, code INKLOOM-WCC, tags, collaboration request to @wecodecoderss), and the submission form.
- **21:00:** check the repo is public, the live URL works in an incognito window, and the video opens. Submit. The last hour is buffer.

#### If you fall behind, cut in this order
1. Audience Shifter: show three audience reframes as static cards (no selection flow).
2. Five Worlds: drop the visual swatches; text cards only.
3. "How the AI worked": show steps and scores only, no before/after per step (keep the Anti-Generic before/after itself).
4. Stage D lite: hide the card on the landing page.
5. Brand Doctor: Stage B only.

**Never cut:** the live end-to-end Stage A flow, Brand Battle Lite with visible critique, the Anti-Generic before/after, and the Consistency Guardian catching the bad post.

## 23. Demo & hackathon alignment

### 23.1 Demo flow
1. Open GG Branding Studio.
2. Select **"I have an idea"**.
3. Enter: *"I want to build an app that helps college students find reliable teammates."*
4. Brand Interviewer asks questions.
5. Brand Context updates.
6. AI explains: *"Based on what you've told me, I think we should explore positioning first."*
7. Brand Battle runs.
8. Three strategic directions appear.
9. User chooses one.
10. One Idea, Five Worlds runs.
11. Five identity directions appear.
12. Anti-Generic Engine critiques them.
13. User chooses a direction.
14. Brand Builder creates the Brand System.
15. Consistency check runs.
16. Founder-to-Launch Kit appears.
17. User opens Consistency Guardian.
18. User pastes a social post.
19. AI detects a voice mismatch.
20. AI suggests a revision.

The handbook recommends a 2–4 minute video showing the actual product, realistic input, the AI workflow, the generated brand system, and the strongest original feature. Cut waiting time in editing; show the "How the AI worked" drawer and the eval table briefly.

### 23.2 Demo story
*"Instead of asking an AI to generate a brand in one prompt, GG Branding Studio understands where a founder is, decides what the brand needs, uses specialized AI capabilities, challenges its own output, lets the founder make decisions, and then turns those decisions into a living Brand System."*

### 23.3 Judging alignment
| Criterion | Weight | Show |
|---|---|---|
| Prompt engineering / AI workflow | 25% | Specialized agents, prompt chains, structured outputs, context passing, evaluation, critique |
| Originality | 20% | Adaptive workflow, eight capabilities, AI-selected workflow, Anti-Generic layer, continuous Consistency Guardian |
| Working implementation | 20% | Real input → real AI processing → real workflow → real output |
| Problem solving / usefulness | 15% | How the system improves actual branding decisions |
| UI / UX | 10% | A clear branding workspace |
| Demo | 10% | The actual working product |

### 23.4 Inkloom
Inkloom integration is not required and not a judging criterion. Not a core dependency. Visual generation can be considered independently.

---

## 24. Hackathon submission checklist

> Added from the participant handbook (the product-side items; social posts are per-member and outside the codebase).
- [ ] Submitted before **25 Sept 2026, 22:00 IST** (target 21:00)
- [ ] Built within the official build window; any pre-existing work disclosed in the README
- [ ] Public or judge-accessible GitHub repository
- [ ] Live deployed product link, usable without friction (guest mode)
- [ ] Demo video (2–4 min): problem → product → realistic input → AI workflow → output → strongest original feature
- [ ] README explains prompt architecture, agents, chains and evaluation methods
- [ ] Each team member's role and specific contribution documented (needed for individual submissions)
- [ ] Every member: own Instagram post, own LinkedIn post with the demo video uploaded directly, individual submission form
- [ ] Third-party licenses and API terms respected

---

## 25. Definition of complete & acceptance criteria

### 25.1 Complete product
> Hackathon mode: "create an account" is replaced by guest identity, and "save and return later" works in the same browser via the guest cookie or a share link.

A user can: create an account · create a project · select their stage · explain their situation · have AI understand it · receive an adaptive workflow · interact with Brand Interviewer · analyze an existing product/brand when relevant · explore strategic directions · explore identity worlds · shift positioning across audiences · detect generic branding · critique AI outputs · make and lock decisions · build and review a Brand System · generate a Launch Kit · save and return later · submit future content · run Consistency Guardian · receive revision suggestions · view workflow history · export/share brand materials.

### 25.2 Acceptance criteria
- [ ] Landing page works
- [ ] Stage selection works
- [ ] Project creation works
- [ ] Authentication works
- [ ] Workspace works
- [ ] Brand Context works
- [ ] Workflow state works
- [ ] AI service works
- [ ] Structured output validation works
- [ ] Brand Interviewer works
- [ ] Workflow Orchestrator works
- [ ] Brand Doctor works
- [ ] Brand Battle works
- [ ] Audience Shifter works
- [ ] One Idea, Five Worlds works
- [ ] Anti-Generic Engine works
- [ ] Brand Builder works
- [ ] Brand System works
- [ ] Founder-to-Launch Kit works
- [ ] Consistency Guardian works
- [ ] User decisions persist
- [ ] Locked decisions are respected
- [ ] Workflow history persists
- [ ] Project versions persist
- [ ] Error handling works
- [ ] Testing exists
- [ ] Security review completed
- [ ] Production deployment works
- [ ] Demo scenario works from start to finish

### 25.3 Definition of done (every task)
> Added: code merged to `main` · tests added and passing · lint/type checks pass · loading, empty and error states handled for any UI · acceptance criteria verified · task status updated · plan updated if anything changed.

---

## 26. Non-goals

> Added: to protect scope.
- Full logo generation or a vector design editor.
- Checking domain or trademark availability (we only warn).
- Team collaboration / multi-user editing of one project.
- Payments, billing, or subscription plans.
- Inkloom integration.
- Native mobile apps (responsive web only).

---

## 27. Decision log

Record architectural decisions here (see `CLAUDE.md`). Format: **ID · Date · Decision · Context/problem · Alternatives · Reason · Impact/migration · Status**.

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| ADR-001 | 2026-09-24 | Hybrid orchestrator: LLM proposes, code validates, default plans as fallback (§7.3) | Reliability for the live demo while keeping AI-chosen workflows | Accepted |
| ADR-002 | 2026-09-24 | Zod schemas in `src/lib/schemas` are canonical for server, client and AI output | One codebase; no schema drift. Replaces the original Pydantic + OpenAPI proposal | Accepted |
| ADR-003 | 2026-09-24 | Per-request streaming: each module run streams its own events; the client drives the loop (§18.4) | Serverless functions can't hold a long-lived stream | Accepted |
| ADR-004 | 2026-09-24 | Brand Context extended with messaging, candidate names, meta and provenance (§12) | Launch Kit and explainability need fields the original schema lacked | Accepted |
| ADR-005 | 2026-09-24 | Guest-cookie identity only for the hackathon; accounts later (§18.6) | Judges need instant access; full auth doesn't fit 36 hours | Accepted |
| ADR-006 | 2026-09-24 | Next.js full-stack TypeScript on Vercel + Neon Postgres + Drizzle + OpenAI via Vercel AI SDK (§20.1). Replaces FastAPI + React | One language and one deploy; saves hours of setup and type syncing. Impact: `backend/`/`frontend/` layouts in the original plan map to `src/lib` and `src/app` (§18.1) | Accepted |
| ADR-007 | 2026-09-24 | Hackathon scope and schedule (§22.1) | 36-hour limit; protect the live demo path | Accepted |
| ADR-008 | 2026-09-24 | Solo scope: Brand Battle Lite (2 calls), 3 worlds, 1 revision round, orchestrator lite (default plans + AI reasons), Stage D lite; eval harness, replay and share links deferred | One builder, ~1 day left. Battle is kept because it's the strongest signal for the AI-workflow and originality criteria; its cost was call count, not model strength | Accepted |
| ADR-009 | 2026-09-24 | Brand Context `meta.confidence` and `provenance` are arrays of `{ path, ... }` entries, not maps keyed by field path (§12). **Alternative:** `z.record`. **Impact:** readers look entries up by `path`; no migration (no data yet) | OpenAI strict structured outputs (on by default in `@ai-sdk/openai`) reject open records; a unit test enforces strict compatibility | Accepted |
| ADR-010 | 2026-09-24 | Guest cookie is set in `src/proxy.ts` (Node runtime), not `src/middleware.ts` (edge). **Alternative:** deprecated `middleware.ts`. **Impact:** none functionally; signing uses Web Crypto and still works on edge | Next.js 16 deprecated `middleware.ts` and renamed it Proxy; Proxy always runs on Node.js | Accepted |
| ADR-011 | 2026-09-24 | `llm.ts` uses AI SDK 7 `generateText` + `Output.object({ schema })` instead of `generateObject` (§20.1, F2). **Impact:** same behavior (JSON schema response format, `NoObjectGeneratedError` on invalid output); retries handled in `llm.ts` with `maxRetries: 0` so the trace's retry count is exact | `generateObject` is marked deprecated in the installed AI SDK 7 | Accepted |
| ADR-012 | 2026-09-24 | A timed-out model call is not retried (fast 30 s, primary 60 s per attempt); invalid output gets 1 repair retry, 429/5xx/network errors get 2 backoff retries | A second attempt after a timeout would exceed the route's `maxDuration` on Vercel | Accepted |
| ADR-013 | 2026-09-25 | New `interview_turns` table for conversation history (§17). **Alternative:** replay turns from `workflow_runs.output_context`. **Impact:** additive; `pnpm db:push` applied | The schema had nowhere to keep the interview, and the runs table is a trace, not a transcript: the workspace needs ordered turns with their "why I'm asking" line and answer chips | Accepted |
| ADR-014 | 2026-09-25 | The §7.4 threshold `confidence ≥ 0.7` reads as `low 0.2 / medium 0.5 / high 0.9`, so all three tracked fields must be `high`; the Interviewer may write only 13 allow-listed context paths (schema enum + code check) | ADR-009 stores levels, not numbers, and the completion rule must be deterministic. The path allow-list stops the discovery agent from writing positioning or identity fields that belong to later modules | Accepted |
| ADR-015 | 2026-09-25 | A 429 that means "no credits left" (`insufficient_quota`) is not retried and is reported as `AI_PROVIDER_UNAVAILABLE`, not `RATE_LIMITED` | Found while testing Phase 2: the account is out of credit, and the retry ladder turned a 6 s failure into a 30 s one on the demo path. Nothing is gained by retrying an exhausted quota | Accepted |
| ADR-016 | 2026-09-25 | The Zustand workspace store is created per mount behind a provider (`state/brand-store.tsx`), not as a module singleton | Zustand v5 serves `getInitialState()` during SSR, so a singleton seeded during render made the server render the workspace with an empty context and crash. A per-mount store makes the server-rendered snapshot the store's initial state | Accepted |
| ADR-017 | 2026-09-25 | Optional `MODEL_PRIMARY_REASONING_EFFORT` / `MODEL_FAST_REASONING_EFFORT` (none/low/medium), sent via `providerOptions.openai` only when set, with a per-call override | Reasoning models (o-series, gpt-5+, gpt-6) spend tokens and seconds thinking; the interviewer's short turns don't need it and the Battle might. Non-reasoning models ignore the field, so it is safe to leave set | Accepted |
| ADR-018 | 2026-09-25 | Audience Shifter leaves the Stage A and B default plans; Brand Battle follows the interview directly (§7.5). It stays in the registry for Phase 7 as a tab beside the Battle results (§14.4) | Solo scope (ADR-008) ships it as a tab, not a workflow step, so a plan step for it would promise a screen that does not exist. Impact: §7.5 Stage A/B plans are one step shorter | Accepted |
| ADR-019 | 2026-09-25 | The §7.3 rule "a consistency check comes before finalization" is implemented as: if the plan contains `brand_builder`, an `anti_generic` or `consistency_guardian` step must come before it | "Finalization" is the Brand Builder: it is the step that turns choices into the Brand System. All four default plans satisfy this, so the static fallback always validates | Accepted |
| ADR-020 | 2026-09-25 | A module's current output (the Battle's directions and critique) is stored in `workflow_runs` under the reserved agent name `module_state`, not in a new table or the Brand Context | The Brand Context holds decisions the user has made; unchosen directions are not decisions. A new table would be a migration mid-hackathon for data that is already project-scoped and time-ordered. **Revisit** in Phase 5 if other modules need richer queries | Accepted |
| ADR-021 | 2026-09-25 | Local OpenAI stub with per-agent fixtures (`scripts/stub/`), opt-in through `pnpm dev:stub` only | The OpenAI account has no credits until after the build, so the workflow, streaming and UI had to be verifiable some other way. It imitates tier latency (1–3 s fast, 5–15 s primary) and answers invalid once for `battle_challenge` so the repair retry is exercised. Nothing else sets `OPENAI_BASE_URL`, so `pnpm dev`, `pnpm build` and production can never reach it | Accepted |


## 28. Open questions

Update the relevant sections and the Decision Log once answered.

**Answered 2026-09-24**
- [x] Timeline: 36-hour hackathon; submit by 25 Sept 2026, 22:00 IST (§0, §22.1).
- [x] Stack: Next.js full-stack TypeScript (§20.1, ADR-006).
- [x] LLM provider: OpenAI (§20.2).
- [x] Authentication for the demo: guest cookie (ADR-005).
- [x] Team: solo; scope per ADR-008.

**Still open**
- [x] **Which models:** the key can reach the gpt-4.1, gpt-4o and gpt-5.x families. Set for now: `MODEL_PRIMARY=gpt-4.1`, `MODEL_FAST=gpt-4.1-mini` (both honour `temperature`, so `OPENAI_OMIT_TEMPERATURE=0`). Switching `MODEL_PRIMARY` to `gpt-5.4` needs `OPENAI_OMIT_TEMPERATURE=1`, which also drops the critics' low temperature.
- [ ] **🚨 OpenAI credits (blocker, 2026-09-25):** the account has **no credits remaining**, so every model call fails with `insufficient_quota`. Everything around the AI works (verified against the real database with a local stub), but no live AI step can run in dev or production until credits are added. Rate-limit tier still unknown.
- [ ] **Vercel env vars:** `MODEL_PRIMARY` and `MODEL_FAST` were missing from the pulled env and must be added in Vercel too, or production will fail with `AI_PROVIDER_UNAVAILABLE`.
- [ ] **Hosting accounts:** OK to use Vercel + Neon (free tiers)?
- [ ] **Visual generation (T8):** default is *cut* for the hackathon. Confirm.
- [ ] **Final product name and tagline:** keep "GG Branding Studio" / "Build a brand that can think."?
- [ ] **Pre-existing code:** anything already built before the hackathon window that must be disclosed?
