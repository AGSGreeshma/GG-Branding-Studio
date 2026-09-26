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
