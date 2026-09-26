# Brand Battle — model comparison

_Generated 2026-09-26T10:47:21.807Z by `pnpm eval:battle` (plan §21.1)._

Each run is one Brand Battle: the generate call produces three directions from three lenses, and the challenge call scores and objects to them (§14.3). Scores are the critic's, 1–10, averaged across the three directions; **genericity risk is inverted — lower is better**.

**Judge:** every configuration was scored by the same critic model, `gpt-6-luna`, so the score columns are comparable across rows.

## Configurations

| Config | Generator | Critic | Runs OK | Distinct. ↑ | Generic risk ↓ | Audience fit ↑ | Clarity ↑ | Specificity ↑ | Strategy ↑ | Clichés/run ↓ | Generate | Challenge | Repairs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gpt-4.1` | `gpt-4.1` | `gpt-6-luna` | 3/3 | 6.3 | 6.4 | 8.1 | 7.6 | 6.4 | 7.0 | 10.3 | 7.6s | 13.7s | 0 |
| `gpt-5.4` | `gpt-5.4` | `gpt-6-luna` | 3/3 | 7.2 | 4.8 | 8.3 | 8.1 | 7.7 | 7.6 | 6.7 | 17.6s | 7.5s | 0 |
| `gpt-6-luna` | `gpt-6-luna` | `gpt-6-luna` | 3/3 | 6.7 | 5.2 | 8.0 | 8.0 | 7.4 | 7.2 | 5.0 | 12.4s | 5.3s | 0 |
| `gpt-6-sol` | `gpt-6-sol` | `gpt-6-luna` | 3/3 | 6.8 | 4.7 | 8.2 | 8.2 | 7.9 | 7.3 | 3.3 | 16.0s | 4.8s | 0 |

## Per fixture

| Fixture | Config | OK | Diverged | Distinct categories | Distinct audiences | Ruled out / direction | Objections | Distinct. | Generic risk | Recommended |
|---|---|---|---|---|---|---|---|---|---|---|
| college-teammates | `gpt-4.1` | yes | yes | 3/3 | 3/3 | 3.0 | 7 | 6.7 | 5.7 | C |
| freelance-tax | `gpt-4.1` | yes | yes | 3/3 | 3/3 | 3.0 | 7 | 6.0 | 6.7 | A |
| repair-network | `gpt-4.1` | yes | yes | 3/3 | 3/3 | 3.0 | 9 | 6.3 | 6.7 | A |
| college-teammates | `gpt-5.4` | yes | yes | 3/3 | 3/3 | 3.0 | 6 | 7.7 | 5.0 | A |
| freelance-tax | `gpt-5.4` | yes | yes | 3/3 | 3/3 | 3.0 | 6 | 7.0 | 4.3 | C |
| repair-network | `gpt-5.4` | yes | yes | 3/3 | 3/3 | 3.0 | 8 | 7.0 | 5.0 | C |
| college-teammates | `gpt-6-luna` | yes | yes | 3/3 | 3/3 | 3.0 | 7 | 6.7 | 5.0 | B |
| freelance-tax | `gpt-6-luna` | yes | yes | 3/3 | 3/3 | 3.0 | 8 | 6.7 | 5.7 | C |
| repair-network | `gpt-6-luna` | yes | yes | 3/3 | 3/3 | 3.0 | 7 | 6.7 | 5.0 | A |
| college-teammates | `gpt-6-sol` | yes | yes | 3/3 | 3/3 | 3.0 | 6 | 6.3 | 5.0 | B |
| freelance-tax | `gpt-6-sol` | yes | yes | 3/3 | 3/3 | 3.0 | 6 | 7.0 | 4.7 | B |
| repair-network | `gpt-6-sol` | yes | yes | 3/3 | 3/3 | 3.0 | 8 | 7.0 | 4.3 | A |

## What the directions actually were

**college-teammates · `gpt-4.1`**

- **A** (strategist) *The Reliability Index* — Teamworthiness Scoring Platform; for College students who have been burned before and want a way to guarantee project outcomes.
- **B** (creative_director) *The Vibe Check Club* — Teaming Culture Platform; for Students who see themselves as builders and want to join a trusted peer group, not just fill a roster.
- **C** (audience_advocate) *Who's Got My Back?* — Trust-First Teaming App; for Frustrated students who’ve been burned by ghosting or dead weight, and want proof of reliability before risking it again.

**freelance-tax · `gpt-4.1`**

- **A** (strategist) *The Invisible Tax Buffer* — Automatic Financial Sorting Tool; for Freelance designers who worry most about unexpected, career-threatening tax bills.
- **B** (creative_director) *Your Money’s Real Mirror* — Money Clarity Experience; for Designers craving a sense of control and reassurance in their freelance finances.
- **C** (audience_advocate) *Spend Without Fear* — Trustworthy Financial Safety Net; for Freelancers who feel nervous every time they check their account or spend money, worried about making a costly mistake.

**repair-network · `gpt-4.1`**

- **A** (strategist) *The Appliance Decider* — Trusted Local Repair Assessment; for Decision-stressed homeowners weighing repair vs replacement costs.
- **B** (creative_director) *Fix Folks* — Neighborhood Appliance Allies; for Small-town families who value local relationships and reliability.
- **C** (audience_advocate) *No-Surprise Fix* — Fairness-First Appliance Repair; for Households tired of being burned by unclear costs and flaky repairers.

**college-teammates · `gpt-5.4`**

- **A** (strategist) *The teammate due-diligence app* — team formation risk filter; for Students about to form a team for a graded class project, hackathon, or side project who feel the highest cost of picking the wrong people.
- **B** (creative_director) *The anti-ghost team culture brand* — accountability-first project network; for Students and hackathon participants who are emotionally tired of flaky group culture and want a stronger social norm around accountability.
- **C** (audience_advocate) *The confidence-before-you-commit app* — teammate confidence tool; for Students who do not have a trusted network yet and currently rely on whoever is nearby, whoever replies, or what friends vaguely say.

**freelance-tax · `gpt-5.4`**

- **A** (strategist) *From money tool to tax-buffer system* — tax set-aside system for freelance creatives; for Freelance designers and illustrators in their first three years who get paid in uneven bursts and need a hard boundary between business income and personal spending.
- **B** (creative_director) *A brand about creative freedom with guardrails* — spending clarity tool for freelance creatives; for Early-career freelance designers and illustrators who chose creative work for freedom, not for spreadsheets, and want money to feel less like hidden danger.
- **C** (audience_advocate) *Designed for the first years, when one mistake can hurt most* — first-freelance-year money safety tool; for Freelance designers and illustrators in their first three years who are still learning how uneven cash flow works and are most exposed to a career-threatening tax bill.

**repair-network · `gpt-5.4`**

- **A** (strategist) *The repair decision service* — Appliance repair decision service; for Households in small towns who mainly want confidence that a repair makes financial sense before booking anyone.
- **B** (creative_director) *The town that fixes things* — Local repair community for appliances; for People in small towns who are uneasy about letting a stranger handle an expensive home appliance and respond to familiar, local trust cues.
- **C** (audience_advocate) *No nasty surprises repair* — Fair-first appliance repair booking; for Stretched households in small towns who feel exposed to being overcharged, messed around, or talked into replacing an appliance without a clear basis.

**college-teammates · `gpt-6-luna`**

- **A** (strategist) *The Team-Selection Check* — Teammate vetting for student projects; for College students forming hackathon teams who need to decide quickly whom to work with.
- **B** (creative_director) *Receipts of Collaboration* — A track record for student collaborators; for Students building side projects who want to show more than an idea or an introduction when looking for collaborators.
- **C** (audience_advocate) *A Less Anxious Yes* — Confidence for choosing project teammates; for College students choosing teammates for projects where someone disappearing could put the group’s grade at risk.

**freelance-tax · `gpt-6-luna`**

- **A** (strategist) *The Tax Splitter* — Automatic tax set-aside tool for freelance designers; for Freelance designers and illustrators in their first three years who want a practical replacement for remembering to move tax money themselves.
- **B** (creative_director) *The January Plot Twist* — A calm-money companion for early freelance life; for New freelance designers and illustrators unsettled by irregular income and the looming January bill, rather than people seeking accounting tools.
- **C** (audience_advocate) *What’s Actually Yours* — Safe-to-spend clarity for new freelance designers; for First-three-year freelance designers and illustrators who find irregular invoices hard to interpret and want clarity without taking on more bookkeeping.

**repair-network · `gpt-6-luna`**

- **A** (strategist) *The Repair-or-Replace Check* — Appliance repair decision service; for Households unsure whether a broken appliance is worth repairing.
- **B** (creative_director) *Your Town’s Repair Desk* — Local appliance repair network; for Households in small towns that want a local route to getting a broken appliance assessed and repaired.
- **C** (audience_advocate) *Know the Call-Out Cost* — Upfront-priced appliance repair booking; for Households worried about paying for an uncertain repair or waiting for someone who may not turn up.

**college-teammates · `gpt-6-sol`**

- **A** (strategist) *Before You Commit* — Teammate vetting app; for College students choosing teammates for a project that could affect their grade
- **B** (creative_director) *Show Your Work Together* — Collaboration track record; for College students and hackathon teams looking for people to build side projects with
- **C** (audience_advocate) *Know Before You Depend on Them* — Team-choice support; for Students worried about being left to carry a group project when a teammate stops replying or drops out

**freelance-tax · `gpt-6-sol`**

- **A** (strategist) *Tax Taken Out of the Decision* — Automatic tax set-aside tool; for Freelance designers and illustrators in their first three years who receive irregular invoice payments.
- **B** (creative_director) *January, Without the Ambush* — Tax-bill preparation tool; for First-three-year freelance designers and illustrators who dread the large January bill.
- **C** (audience_advocate) *The Number That’s Yours* — Safe-to-spend guide for freelance income; for New freelance designers and illustrators trying to make everyday spending decisions between irregular payments.

**repair-network · `gpt-6-sol`**

- **A** (strategist) *Decide Before You Book* — Repair-or-replace decision service; for Households unsure whether fixing a broken appliance will cost less than replacing it.
- **B** (creative_director) *Worth Mending* — Local appliance repair network; for Households inclined to replace a broken appliance because repair feels too difficult to pursue.
- **C** (audience_advocate) *Know What You're Agreeing To* — Clear-cost appliance repair booking; for Households wary of paying for a visit only to hear that replacing the appliance is cheaper.

## How to read this

- **Distinctiveness** and **genericity risk** are the two that matter for this product: the whole argument against one-prompt branding is that the obvious answer is generic.
- **Distinct categories / audiences** is the deterministic check (§14.3), not the model's opinion. 1/3 means the three lenses produced one idea three times, whatever the scores say.
- **Ruled out / direction** is how many predictable ideas each lens named and rejected before writing its own (ADR-026). Zero means the prompt's method was ignored.
- **Repairs** counts schema repair retries. Anything above zero means the model struggles with the Battle schema and will be slower and more expensive in production.
- Latency matters against `maxDuration = 60` per workflow step (ADR-023).

Fixtures: `college-teammates`, `freelance-tax`, `repair-network` (see `evals/fixtures/battle/` for why each one is in the set).

<!-- eval:antigeneric -->
## Anti-Generic Engine — before and after

_Generated 2026-09-26T13:12:45.841Z by `pnpm eval:antigeneric` (plan §21.1)._

Each run takes a fixture through the real pipeline — Brand Battle, then Five Worlds, then the Anti-Generic rounds — and measures the brand language before and after. **Lexicon hits are deterministic** (`src/lib/lexicon`); the scores come from the critic model, 1–10, and **genericity risk is inverted: lower is better**.

**Judge:** `gpt-6-luna` scored every round, so before and after are measured on the same scale.

### Summary

| Config | Fixture | Rounds | Fields | Rewritten | Lexicon hits ↓ | Genericity risk ↓ | Distinctiveness ↑ | Calls | Latency | Tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| `gpt-6-sol` | college-teammates | 2 | 4 | 4 | 0 → 0 | 5.3 → 4.0 | 5.5 → 7.0 | 6 | 73.9s | 6767/5663 |
| `gpt-6-sol` | freelance-tax | 2 | 4 | 3 | 0 → 0 | 5.5 → 5.3 | 5.0 → 5.3 | 6 | 70.0s | 6662/5458 |
| `gpt-6-sol` | repair-network | 2 | 4 | 3 | 0 → 0 | 5.5 → 5.3 | 5.3 → 5.5 | 6 | 73.7s | 6907/5508 |
| `gpt-4.1` | college-teammates | 2 | 4 | 3 | 0 → 0 | 6.0 → 4.8 | 5.3 → 6.3 | 6 | 57.6s | 6572/7761 |
| `gpt-4.1` | freelance-tax | 2 | 4 | 4 | 0 → 0 | 6.8 → 5.3 | 4.5 → 6.0 | 6 | 68.9s | 7201/8235 |
| `gpt-4.1` | repair-network | 2 | 4 | 4 | 0 → 0 | 7.0 → 5.8 | 4.3 → 5.5 | 6 | 55.0s | 7123/7101 |

### What changed

**college-teammates · `gpt-6-sol`** — 4 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: We help students introduce themselves through projects they have worked on and what former teammates say it was like to work with them.
  - after: For students choosing hackathon or side-project teammates, our app puts past projects alongside former teammates’ accounts of working together, so they can judge who’s likely to do the work before committing.
  - genericity risk 5 → 3, distinctiveness 6 → 8, lexicon hits 0 → 0
- **Differentiator**
  - before: A student’s introduction pairs their past projects with signals from the people who shared the work.
  - after: Past projects appear alongside accounts from the people who worked on them, connecting what a student did with what it was like to depend on them.
  - genericity risk 5 → 4, distinctiveness 6 → 7, lexicon hits 0 → 0
- **Value proposition**
  - before: Give potential teammates something more meaningful to discuss than a name in a group chat.
  - after: Before you say yes to a teammate, see their past projects and hear from people who worked with them—not just a name in a group chat.
  - genericity risk 6 → 3, distinctiveness 4 → 8, lexicon hits 0 → 0
- **Naming direction**
  - before: Names drawn from records, annotations, and the traces a project leaves behind.
  - after: Names drawn from shared project records, teammate accounts, and the question of who did the work.
  - genericity risk 5 → 6, distinctiveness 6 → 5, lexicon hits 0 → 0

**freelance-tax · `gpt-6-sol`** — 3 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: We show you one number you can spend after a share of each invoice payment has gone into your tax pot.
  - after: For freelance designers and illustrators in their first three years, our tool moves a tax share from each incoming invoice payment into a separate pot and shows what’s left to spend.
  - genericity risk 5 → 5, distinctiveness 6 → 6, lexicon hits 0 → 0
- **Value proposition**
  - before: Know what is yours to use when an irregular payment lands.
  - after: When an invoice gets paid, see what you can spend after your tax share moves into a separate pot.
  - genericity risk 7 → 6, distinctiveness 4 → 5, lexicon hits 0 → 0
- **Naming direction**
  - before: Short words from accounting and allocation, chosen for their everyday meaning rather than financial jargon.
  - after: Short, everyday words for money set aside when an invoice is paid and the amount left to spend; avoid general accounting terms.
  - genericity risk 6 → 5, distinctiveness 3 → 4, lexicon hits 0 → 0

**repair-network · `gpt-6-sol`** — 3 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: We help you see whether a repair looks worthwhile and what the call-out will cost before you book a vetted repairer in your town.
  - after: For small-town households with a broken appliance, we show a repair-or-replace estimate and fixed call-out price before they book a vetted repairer in town.
  - genericity risk 5 → 5, distinctiveness 6 → 6, lexicon hits 0 → 0
- **Value proposition**
  - before: Take the first step toward repair without agreeing to an unknown call-out cost or booking blind.
  - after: See a repair-or-replace estimate and the fixed call-out price before you book someone local to fix your appliance.
  - genericity risk 7 → 6, distinctiveness 4 → 5, lexicon hits 0 → 0
- **Naming direction**
  - before: Short names drawn from checking, weighing and seeing costs clearly, without sounding like a financial product.
  - after: Short names rooted in the broken-appliance moment: deciding whether to fix or replace it before calling a repairer in town.
  - genericity risk 7 → 5, distinctiveness 3 → 5, lexicon hits 0 → 0

**college-teammates · `gpt-4.1`** — 3 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: We make it possible to see a potential teammate’s real track record, not just their enthusiasm.
  - after: Our app helps college students building hackathon and side-project teams compare potential teammates’ peer-reviewed reliability scores and verified project histories before joining forces.
  - genericity risk 6 → 4, distinctiveness 6 → 7, lexicon hits 0 → 0
- **Value proposition**
  - before: Students can confidently build teams knowing each member has a proven record of seeing real projects through to the end.
  - after: Before picking teammates, students can check each person’s project history, reliability ratings, and peer feedback—so decisions are based on actual follow-through, not just first impressions.
  - genericity risk 6 → 5, distinctiveness 5 → 6, lexicon hits 0 → 0
- **Naming direction**
  - before: Direct, functional, connoting clarity and objective records.
  - after: Names should center on choosing proven teammates for student projects—using language that evokes selection, track record, and following through together on real work.
  - genericity risk 8 → 7, distinctiveness 3 → 4, lexicon hits 0 → 0

**freelance-tax · `gpt-4.1`** — 4 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: We show you, every day, what money truly belongs to you and what’s off-limits, so you can spend with confidence and no guilt.
  - after: For freelance designers in their first three years, our tool moves your tax share from each invoice into a separate pot as payments arrive, so you always see exactly what’s actually yours to spend.
  - genericity risk 7 → 4, distinctiveness 4 → 7, lexicon hits 0 → 0
- **Differentiator**
  - before: Instead of another ‘finance tool’, this gives designers one clear, daily, safe-to-spend number—no more admin or guesswork.
  - after: Unlike tools that just track your income, we automatically move the tax slice from each client payment into its own pot—your daily safe-to-spend number is what’s truly left after tax, no manual sorting needed.
  - genericity risk 6 → 6, distinctiveness 6 → 6, lexicon hits 0 → 0
- **Value proposition**
  - before: Removes daily stress and second-guessing; designers know instantly what they can use, with nothing to track or sort.
  - after: When a payment lands, you see what’s yours to spend after tax instantly—no checking spreadsheets, no remembering percentages, no worrying if you’ve set enough aside.
  - genericity risk 7 → 5, distinctiveness 4 → 6, lexicon hits 0 → 0
- **Naming direction**
  - before: Names that evoke drawing boundaries, clarity, or marking what’s truly yours—using metaphors from illustration and design.
  - after: Naming should come from the moment designers sort an invoice payment: separating what’s set aside for tax versus what’s safe to spend—using language from design workflows like color-separating, proofing, or final sign-off.
  - genericity risk 7 → 6, distinctiveness 4 → 5, lexicon hits 0 → 0

**repair-network · `gpt-4.1`** — 4 of 4 lines rewritten over 2 round(s).

- **Positioning statement**
  - before: Finally, you can know if it’s worth repairing your appliance, and exactly what you’ll pay, before anyone rings your doorbell.
  - after: Get a local repair pro’s quote and honest repair-or-replace advice for your broken appliance, before you schedule a visit.
  - genericity risk 6 → 6, distinctiveness 5 → 5, lexicon hits 0 → 0
- **Differentiator**
  - before: We alone give you a fair repair-or-replace assessment and a fixed price up front, so you’re never stuck guessing or pressured.
  - after: Only our network connects you with local, vetted repairers who show you, up front, whether fixing your appliance is worth it—with a set price, before anyone comes out.
  - genericity risk 7 → 5, distinctiveness 6 → 7, lexicon hits 0 → 0
- **Value proposition**
  - before: No more repair roulette: just clear information and control, before spending a penny.
  - after: See exactly what it costs to fix your appliance—and whether it makes sense to repair or replace—before you book a local pro.
  - genericity risk 8 → 4, distinctiveness 3 → 7, lexicon hits 0 → 0
- **Naming direction**
  - before: Names inspired by materials, hardware, and working processes that suggest reliability and craft.
  - after: Names rooted in the trust and clarity of finding a local repair expert who helps you choose repair versus replacement, right when your appliance breaks.
  - genericity risk 7 → 8, distinctiveness 3 → 3, lexicon hits 0 → 0

### How to read this

- **Lexicon hits** are the honest number: a word list either matched or it did not, and it cannot be talked round.
- **Genericity risk** and **distinctiveness** are the critic's opinion of the same text before and after. A model that rewrites its own work and then praises it would show movement here and none in the lexicon column — worth watching for.
- **Rounds** shows where the loop stopped. Two rounds means the second pass still found something; one round means the first rewrite satisfied every threshold (§13.5).
- A run with zero rewrites is not a failure: it means the Battle and Worlds output was already specific enough.
<!-- /eval:antigeneric -->
