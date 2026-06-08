# AGENT RULES — Always-Load Tier
## The contract every coding agent loads at the start of every session

> **What this is:** the short, always-in-context companion to `BUILD_STANDARD.md`.
> This file is self-sufficient for ~90% of work. When you need depth, the pointer table at the bottom tells you which `BUILD_STANDARD.md` section to open — load it *on demand*, do not paste the whole standard into context (it would push the codebase out, and you need the codebase to avoid guessing).
> **When this file conflicts with your habits or instincts, this file wins.**

---

## ⚡ The 12 Commandments — read before the first keystroke

1. **Don't know → say so.** Never invent an API, library, column name, endpoint, or behavior. When unsure → STOP and ask, or mark `// ⚠️ ASSUMPTION:`. (BS §A)
2. **The schema/contract is truth.** Every column, type, and endpoint must trace to a real source you have *seen*. No source → don't write it. (Rule 1, BS §A)
3. **Porting from a prototype/static HTML?** The logic hides in `onclick`, hardcoded arrays, scattered `if`s, and comments. **Inventory all of it before rewriting.** (BS §B)
4. **Fail closed.** Errors return real errors (4xx/5xx). Never `{ok:true, mock:true}`. (Rule 2)
5. **Errors must reach the UI.** Don't swallow a failure into a green toast. (Rule 3)
6. **Authorize on the server.** Hiding a button ≠ blocking. GET checks too. (Rule 4)
7. **One source of business logic.** The engine computes; the worker only fetches + formats. (Rule 5)
8. **Test for real before claiming done.** Full CRUD via curl, inspect the DB, never trust the toast. (Rule 6)
9. **Read first, code second.** New session = reload the architecture from config, not from folder names. (Rule 7)
10. **Money is integer, guard every division, test with real numbers from the spec.** (BS §9)
11. **Report non-trivial work as PLAN → ACT → VERIFY → SELF-REVIEW.** (BS §C)
12. **Before saying "done," run the three checklists below: Anti-Hallucination, Port (if porting), and the 7 Rules.**
13. **When something breaks, fix the cause or say you're stuck — never hide the symptom** (`as any`, empty `catch`, skipped/edited test, commented-out code). (§5 below)
14. **Never leak secrets or PII** — not in code, logs, or error responses. (§6 below)

---

## OWNER DEFAULTS
> Applied to **every** project unless `PROJECT_CONTRACT` (BS §D) overrides for that project.
> `[HARD]` = violating this is a bug; never change without explicit instruction.
> `[SOFT]` = default starting point; may be overridden per project — ask before diverging on anything expensive.

```yaml
# --- HARD (non-negotiable across all projects) ---
ui_language:          "[HARD] Vietnamese only — every label, message, button, toast in Vietnamese"
money:                "[HARD] VND, INTEGER, never float; display as 1.234.567 (vi-VN)"
date_format:          "[HARD] dd/MM/yyyy"
code_language:        "[HARD] English for code, comments, commit messages, technical docs"
owner_conversation:   "[HARD] Vietnamese when talking to the owner; English for the artifacts above"

# --- SOFT (sensible starting point, overridable per project) ---
infra_default:        "[SOFT] Cloudflare end-to-end (Pages + Workers/Functions + D1 + KV)"
db_default:           "[SOFT] SQLite (D1) — do NOT silently default to Postgres"
auth_default:         "[SOFT] OTP via Telegram"
notification_channel: "[SOFT] Telegram Bot first; email/Slack only when explicitly required"
ci_cd_default:        "[SOFT] Cloudflare Git integration + pre-push hook (solo); GitHub Actions when money/multi-dev"
```

> **Rule of thumb:** a `[SOFT]` default is where you *start*, not a wall. If the task clearly wants something else, ask. A `[HARD]` default is a wall — if the task seems to violate it, that's a signal something is wrong; confirm before proceeding.

---

## ① Anti-Hallucination — the non-negotiable core (BS §A)

**Grounding rule:** every line of code you write must trace to one of these. If it traces to none, don't write it.
- **G1** a file in the repo you have *read/grepped this session*
- **G2** official docs for the lib/framework (version-matched)
- **G3** the `PROJECT_CONTRACT` / spec / PRD / SRS
- **G4** real output from a command you actually ran

> Your memory is **not** a source. Use it to form a hypothesis, then verify against G1–G4 before it becomes code.

**When unsure, three legal moves (in order):** **VERIFY** (run a command / read a file / read docs) → **ASK** (one specific question) → **MARK** (`// ⚠️ ASSUMPTION: … | VERIFY-BY: … | RISK-IF-WRONG: …`). Guessing-and-stating-as-fact is a serious violation.

**Before you `import` a third-party lib:** is it in `package.json`/lockfile? right version? is there already one in the repo? Adding a dependency is an architectural decision — report it, don't slip it in.

**Anti-Hallucination checklist (before commit):**
- [ ] Every column / endpoint / method / import in the diff traces to G1–G4
- [ ] Every imported external lib is declared, at the right version
- [ ] Every cross-boundary call (frontend↔backend, code↔DB, code↔config) is anchored on **both** ends
- [ ] Every forced guess carries a `⚠️ ASSUMPTION` marker
- [ ] **Zero** unresolved assumptions outstanding (or the remainder is explicitly reported)
- [ ] Every "I tested / it runs" claim has real logs attached — no log means not tested

---

## ② Porting from a prototype — the core (BS §B)

> A static HTML prototype holds two assets: the **UI** (easy to see, easy to port) and the **hidden logic** (hard to see, easily dropped). Agents port the first and lose the second. This stops that.

**Law:** write no production line for a screen until its **Logic Inventory** is complete and confirmed.

**Where logic hides — check every one:** inline `onclick`/`onchange` (validation, thresholds), hardcoded arrays/objects (master data, coefficients), scattered `if`/`switch` (business branching), template literals (conditional display), conditional CSS classes (alert rules), `data-*` attributes (state machine), **comments** (permissions not yet coded), default `value`s (config), DOM/tab order (workflow sequence), realistic-looking "demo" data (might be real seed — **ask**), hand-written calc in `<script>` (the **entire business engine**).

**Port order (mandatory):** read the prototype exhaustively → produce the Logic Inventory (7 sections: Data, Rules, Formulas, State/Flow, Permissions, Formatting, Ambiguities) → confirm ambiguities with the owner → port **data** (hardcoded → seed/settings/DB) → port **formulas** (copy *verbatim*, test same-input-same-output, *then* refactor) → port **rules & state** (two-layer validation, state machine, API permissions) → port **UI last** → diff prototype vs production side by side.

> **Why UI last:** building UI first tricks you into thinking you're done when it merely *looks* right, and the logic gets skipped.

**Port acceptance — a screen is done only when:**
- [ ] 100% of Logic Inventory items are `done` or `n/a with a reason` — **nothing silently vanished**
- [ ] Every formula yields the **same output for the same input** as the prototype (proven by a test)
- [ ] Every rule / permission / edge case from the inventory is present in production
- [ ] No hardcoded business data remains (moved to DB/settings)
- [ ] Side-by-side behavior matches — not just appearance

---

## ③ The 7 Rules — checklist (full text: BS §0a)

1. **Contract-First** — migration `.sql` is truth; grep old column names after every schema change.
2. **Fail-Closed** — DB error → 503, never a mock 200; read routes never mock.
3. **Errors reach the UI** — router passes through `Response` / lifts `result.error` to 4xx/5xx; frontend checks `response.error` before showing success.
4. **Authorize on the server** — `can(user, roles)` at the top of every sensitive handler; GET too; default new role = lowest; webhooks verify a secret.
5. **One source of logic** — engine computes, worker fetches+formats; constants come from `settings`.
6. **Integration-test first** — full CRUD, inspect the DB, with logs.
7. **Context-First** — read config to find the *real* entry point before editing (don't trust folder names).

**Before "done":**
- [ ] (R1) Schema ↔ all SQL ↔ types match; grepped old columns
- [ ] (R2) Every catch fail-closed (503), no mock 200
- [ ] (R3) Router guard present; frontend checks error
- [ ] (R4) Server-side role check on every sensitive endpoint; GET too; lowest default role
- [ ] (R5) Logic in one place; constants from settings
- [ ] (R6) Full CRUD run + DB inspected, with logs

---

## ④ Working protocol (full: BS §C)

For any non-trivial task (touches >1 file, or schema/auth/engine/money, or a port):

- **PLAN** — goal in one line · files to touch · sources already read (G1–G4) · assumptions to resolve (ask first if any) · numbered steps (dependency-first) · sensitive touchpoints. *For large tasks, stop after PLAN and wait for approval.*
- **ACT** — follow the plan; deviations stated; forced guesses get `⚠️ ASSUMPTION` markers.
- **VERIFY** — paste real command logs; CRUD/integration results; DB/state inspected after writes.
- **SELF-REVIEW** — run checklists ①②③; report `DONE` / `DONE-WITH-WARNINGS` / `NOT DONE because…`. **Never report DONE while an assumption is outstanding.**

**Honesty:** "tested" means logs exist. "Works" means real output exists. When wrong, say "I was wrong about X" plainly. When blocked, say what you couldn't verify and why — don't guess past it.

**STOP and ASK when:** a number/array might be real-data-vs-placeholder · a threshold/coefficient might be hard-vs-from-settings · two sources (prototype/spec/schema) conflict · a large dependency is needed · the frontend needs an endpoint/column the backend lacks · the request has ≥2 materially different readings. *A timely question is far cheaper than a day of wrong code.*

---

## ⑤ When something breaks — fix the cause, never hide the symptom (BS §0c)

> A red test, a type error, a stack trace — the fastest way to turn it green is almost always the worst. **A symptom hidden is not a problem solved.**

**Forbidden — every one of these is a lie that the problem is solved:**
- `as any` / `as unknown as X` / `// @ts-ignore` / `!` to silence the type checker
- empty `catch {}`, or returning fake/default data on error (also breaks Rule 2)
- changing a test's expected value to match the bug, or `.skip` / `.only` / commenting out a failing test
- commenting out or deleting the broken code path (also drops logic — §B)
- hardcoding or special-casing the test's exact input
- shotgun-changing unrelated code; declaring victory on a fix you can't explain
- inline `eslint-disable` to make the build pass

**When genuinely stuck (the only legal exit):** read more — the cause is in code you haven't read yet → reproduce the failure minimally → then **STATE & ASK**: *"Stuck on X. Symptom: … Tried: … Hypothesis: … Need: …"* **Being stuck and saying so is success. Hiding it is the failure.**

---

## ⑥ Secrets & data safety (BS §0d)

- Secrets come from the environment, never hardcoded — not even "temporarily."
- Never log or return secrets/PII (tokens, passwords, full customer records, phone numbers).
- `.env` is gitignored; secrets live in the platform store (e.g. `wrangler secret put`).
- Never paste real customer/business data into a third-party tool to debug — use synthetic data.
- Verify a webhook secret *before* doing any work.
- Unsure if a field is sensitive? Treat it as sensitive until confirmed.

---

## Pointer table — where to go deeper in `BUILD_STANDARD.md`

| Need depth on… | Open BS section |
|---|---|
| Full anti-hallucination protocol (10 hallucination types, library rules, uncertainty ledger) | **§A** |
| Full port protocol (Logic Inventory template, hiding-places map, traps) | **§B** |
| Working/reporting protocol in detail | **§C** |
| Per-project declaration form to fill in | **§D** |
| The 7 Rules with real failures and fixes | **§0a** |
| Anti-pattern catalog (forbidden error-hiding shortcuts, the Stuck Protocol) | **§0c** |
| Secrets & data-safety handling rules | **§0d** |
| Auto-review framework (machine-parseable checks, CI gates) | **§0b** |
| Build order / dependency-first phasing | **§1** |
| Schema · Auth · Engine · Heatmap · State machine · Dashboard · Alerts | **§2–§8** |
| Financial calculation (pool distribution, rounding) | **§9** |
| Acceptance criteria templates | **§10** |
| Stack migration | **§11** |
| Cloudflare-only CI/CD specifics | **Appendix P1** |
| Multi-stack / hybrid environments | **Appendix P2** |
| Copy-paste agent kickoff commands | **Appendix P3** |

> *AGENT RULES v1.0 — companion to BUILD_STANDARD v4.x. Load this every session; pull BS sections on demand.*
