# BUILD STANDARD — Universal Engineering Contract for AI Coding Agents

> **Version:** v4.1 · Instructions in English, business examples in Vietnamese (the domain knowledge stays in its native form).
> **Audience:** coding agents (Claude Code / Cursor / Copilot / any) and human developers.
> **Companion file:** `AGENT_RULES.md` is the short, always-load tier — load it every session. This file is the **on-demand reference**; pull a section when you need depth. Do not paste this whole file into context: it would crowd out the codebase, and §A requires you to read the codebase to avoid guessing.
> **Nature:** this is a *contract*, not a suggestion. When it conflicts with an agent's habit or instinct, **the contract wins.**

---

## TL;DR — read these before the first keystroke

1. **Don't know → say so.** Never invent an API, lib, column, endpoint, or behavior. Unsure → STOP and ask, or mark `// ⚠️ ASSUMPTION:`. (§A)
2. **The schema/contract is truth.** Every column, type, endpoint must trace to a real source. No source → don't write it. (Rule 1, §A)
3. **Porting from a prototype/static HTML?** Logic hides in `onclick`, hardcoded arrays, scattered `if`s, comments. **Inventory it all before rewriting.** (§B)
4. **Fail closed.** Errors return real errors (4xx/5xx). Never `{ok:true, mock:true}`. (Rule 2)
5. **Errors reach the UI.** Don't swallow a failure into a green toast. (Rule 3)
6. **Authorize on the server.** Hiding a button ≠ blocking. GET checks too. (Rule 4)
7. **One source of business logic.** Engine computes; worker only fetches + formats. (Rule 5)
8. **Test for real before "done".** Full CRUD, inspect the DB, never trust the toast. (Rule 6)
9. **Read first, code second.** New session = reload architecture from config, not folder names. (Rule 7)
10. **Money is integer, guard every division, test with real spec numbers.** (§9)
11. **Report non-trivial work as PLAN → DIFF → VERIFY → SELF-REVIEW.** (§C)
12. **Before "done," run the §0a + §A + §B checklists.**
13. **When something breaks, fix the cause or say you're stuck — never hide the symptom** (`as any`, empty catch, skipped test, commented-out code). (§0c)
14. **Never leak secrets or PII** — not in code, logs, or error responses. (§0d)

---

## 0. Purpose & Philosophy

This document exists to defeat **three** classes of error, in priority order:

| Class | Symptom | Solved in |
|---|---|---|
| **L0 — Hallucination** | Agent invents an API/lib/column/behavior, "confidently wrong" | **§A** |
| **L1 — Dropped logic on port** | Rebuilds the UI from a prototype but loses the hidden logic | **§B** |
| **L2 — Architecture/business bugs** | Fail-open, swallowed errors, duplicated logic, broken authorization | **§0a (7 Rules)** |

> **Founding principle:** a line that is wrong because it was *fabricated* is more dangerous than one that is wrong because of a *bug* — tests catch bugs, but fabrications usually *look plausible* and slip through review. That is why §A comes before everything.

**Using this in a new project:**
1. Copy both files into the repo root: `AGENT_RULES.md` (always-load) and `BUILD_STANDARD.md` (this file).
2. Fill in `OWNER_DEFAULTS` once (below) and `PROJECT_CONTRACT` (§D) per project — these are the *required* per-context pieces.
3. Cloudflare → also read Appendix P1. Multi-environment → read P2.
4. Point the agent at the files in the first command: *"Follow AGENT_RULES.md and BUILD_STANDARD.md. Start with §A and §C."*

**Two content layers:** each section has (1) a **Universal principle** that applies to any project/stack, and (2) an **Example** from 8H Portfolio Manager (kept in Vietnamese) to illustrate. Replace `[PROJECT_NAME]`, `[STACK]`, `[DB_ENGINE]` with real values.

---

## OWNER DEFAULTS — declared once, applied to every project

> Fill this once; it is the cross-project layer of "ground truth" (a G3 source for §A). `PROJECT_CONTRACT` (§D) overrides it per project.
> `[HARD]` = violating it is a bug; never change without explicit instruction.
> `[SOFT]` = default starting point; overridable per project — ask before diverging on anything expensive.

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

> A `[SOFT]` default is where you *start*, not a wall — if the task clearly wants otherwise, ask. A `[HARD]` default *is* a wall — if the task seems to violate it, treat that as a signal something is wrong and confirm first.

---

# §A. ANTI-HALLUCINATION PROTOCOL
## (Priority #1 — read before every other section)

> **Hallucination, in coding:** the agent produces code that references something **nonexistent** or **unverified** — an API method, a library, a column, a config option, a framework behavior — and presents it as fact. This is the most dangerous error source because the code *looks correct*.

### A0. The supreme rule: Grounding

> **Every code token you write must trace to one of these four sources. If it traces to none, you may not write it.**

| # | Valid ground truth | How to verify |
|---|---|---|
| G1 | **A file in the repo** (schema, types, existing code) | You `read`/`grep`'d it *this session* |
| G2 | **Official docs** for the lib/framework/API | You read them, version matches |
| G3 | **OWNER_DEFAULTS / PROJECT_CONTRACT (§D)** or the project spec/PRD/SRS | You can cite the specific item |
| G4 | **Real output** from a command you ran (terminal, curl, test) | You have the log to paste |

**The agent's "memory" is not a valid source.** Memory is for *forming a hypothesis*; you must verify it against G1–G4 before it becomes code.

### A1. The golden rule: "Don't know → say so"

When unsure about a technical fact, there are exactly **three** legal moves (in priority order):

1. **VERIFY** — run a command / read a file / read docs to turn the hypothesis into fact (G1–G4). *Always prefer this.*
2. **ASK** — if you can't self-verify, stop and ask one specific question.
3. **MARK** — if you must proceed to avoid blocking, write the code with a mandatory marker:
   ```
   // ⚠️ ASSUMPTION: [what is being assumed] — NOT verified.
   // VERIFY-BY: [how to check, e.g. "run `wrangler d1 execute --command '.schema users'`"]
   // RISK-IF-WRONG: [consequence if wrong]
   ```

> **Absolutely forbidden:** guessing and presenting it as certain. Writing `getUser()` because "the function is probably called getUser" without a marker is a serious violation.

### A2. Common hallucination types + how to block each

| ID | Type | Real failure | Block (mandatory) |
|---|---|---|---|
| **HX1** | **Invent a lib API/method** | Calling `db.query.findFirst()` when the lib has no such method | Read the lib's docs/types before calling; or grep existing usage in the repo |
| **HX2** | **Invent an import / uninstalled lib** | `import { z } from 'zod'` when `zod` isn't in `package.json` | Read `package.json`/`requirements.txt` before any external import |
| **HX3** | **Invent a column/table name** | Querying `users.full_name` when the schema only has `name` | `grep` the migration before each column; maps to Rule 1 |
| **HX4** | **Invent framework behavior** | Assuming `useEffect` runs before render | Read docs when unsure; don't infer semantics |
| **HX5** | **Invent an existing endpoint** | Calling `POST /api/foo` when the router has no `foo` case | `grep "case '"` the router before calling from the frontend |
| **HX6** | **Invent a version/feature** | Using v5-only syntax on a v3 project | Check the lockfile version; read the changelog if in doubt |
| **HX7** | **Invent a config option** | Adding a nonexistent key to `wrangler.toml` | Read the config file's docs/schema |
| **HX8** | **Invent "already tested"** | Reporting "CRUD passed" without running it | Paste real logs (G4); no log = not tested |
| **HX9** | **Invent data/numbers** | Filling "illustrative" figures where real ones are required | Real numbers come from spec/DB; demo numbers must be clearly labeled |
| **HX10** | **Overconfidence after partial reading** | Editing a file without reading it fully, assuming the unread part | Read the whole relevant span; state explicitly what you haven't read |

### A3. Library-import rule (blocks HX1, HX2, HX6)

> **Before importing any third-party library:**

- [ ] Is it **present** in `package.json` / `requirements.txt` / `go.mod` / lockfile? (grepped)
- [ ] If absent and needed → **report the new dependency**, don't slip it in silently. Adding a dependency is an architectural decision.
- [ ] What **version** is in use? Does the method/syntax you intend exist at that version?
- [ ] Is there **already a lib in the repo** that does this? (avoid duplicates)

**Dependency-addition report template:**
```
📦 PROPOSED DEPENDENCY
  Lib: [name]@[version]
  Why: [why needed, why not the existing options]
  Cost/risk: [bundle size, maintenance, license if notable]
  → Wait for confirmation? [Y for large libs / N for trivial ones, but still log it]
```

### A4. API & schema reference rule (blocks HX3, HX5, HX7)

> **Every cross-boundary reference (frontend↔backend, code↔DB, code↔config) must be anchored on both ends.**

Before the frontend calls an endpoint:
```bash
grep -rn "case '[endpoint-name]'" [API_FILE]   # does the endpoint exist?
```
Before code touches a DB column:
```bash
grep -rn "[column_name]" migrations/   # is the column in the schema?
```
Before adding a key to a config file:
```bash
# Read that config file's own docs/schema. Do not infer key names.
```

**If one end doesn't exist yet** (e.g. the frontend needs an endpoint the backend lacks) → that is **work to do**, not something to assume is there. Record it in the PLAN (§C).

### A5. The Uncertainty Ledger

In any long session, the agent **keeps a list** of assumptions / unverified items, and **resolves them all before reporting done**. At the end of each work unit, print:

```
📒 UNCERTAINTY LEDGER
  [ ] ASSUMPTION #1: … → VERIFY-BY: … → STATUS: open/resolved
  [ ] ASSUMPTION #2: …
  → Open assumptions: N. Do NOT report "complete" while N > 0.
```

> If none remain: write `LEDGER: clean (0 assumptions outstanding)`.

### A6. Anti-Hallucination checklist (run before commit)

- [ ] **(A0)** Every column/endpoint/method/import in the diff traces to G1–G4
- [ ] **(A3)** Every external import is declared, at the right version
- [ ] **(A4)** Every cross-boundary call is anchored on both ends
- [ ] **(A1)** Every forced guess carries a `⚠️ ASSUMPTION` marker
- [ ] **(A5)** The Uncertainty Ledger is clean (0 open) or the remainder is reported
- [ ] **(HX8)** Every "tested/ran" claim has real logs attached

---

# §B. PROTOTYPE → PRODUCTION PROTOCOL
## (Priority #1 — where agents drop the most logic)

> **The core problem:** a static HTML prototype (or single-file CDN React, mockup, Figma export) holds **two assets**: (1) the *UI* — visible, easy to port; and (2) the *hidden logic* — invisible, easily dropped. When rebuilding in a real framework, agents tend to port (1) and **lose (2)**. This section stops that.

### B0. Principle: "A prototype is a SPEC, not a throwaway draft"

These prototypes are usually a *living behavioral specification* — they encode many business decisions (order, conditions, formulas, formatting). **Treat each prototype as a spec to be read exhaustively**, not a sketch to glance at and redraw from memory.

> **Law:** write no production line for a screen until that screen's "Logic Inventory" (§B2) is complete.

### B1. Map of where logic hides in a prototype

Places business logic typically hides in static HTML — the agent **must inspect each**:

| Hiding place | Example in prototype | Logic easily lost |
|---|---|---|
| **inline `onclick` / `onchange`** | `onclick="if(x>100)alert('overload')"` | validation, thresholds, business rules |
| **hardcoded array/object** | `const LEVELS=[{coef:1.0},...]` | master data, coefficients, enums |
| **scattered `if`/`switch` in script** | color by util, format by status | business branching |
| **template literal / string concat** | `` `${val>=15?'pass':'fail'}` `` | conditional display, thresholds |
| **conditional CSS class** | `class="${m<0?'red':'green'}"` | visual-alert rules |
| **`data-*` attribute** | `data-stage="signed"` | state machine, metadata |
| **comment** | `// only CEO can edit` | permissions, not-yet-coded constraints |
| **default `value`/`placeholder`** | `value="0.07"` | default parameters, config |
| **DOM / tab order** | order of form steps | workflow, mandatory sequence |
| **realistic "demo" numbers** | a table pre-filled with 14 staff rows | might be real seed data — ask! |
| **plain-JS calculation** | a hand-written bonus function in `<script>` | the **entire business engine** |

### B2. Logic Inventory — the mandatory pre-code deliverable

> Before porting a prototype, the agent **produces this table** and shows it to the owner for confirmation. This is the single most important checkpoint against dropped logic.

For **each screen/component** in the prototype, produce:

```
## LOGIC INVENTORY — [screen name]

### 1. Data
| Data element | Source in prototype | Where production gets it | Note |
|---|---|---|---|
| Staff list | hardcoded `STAFF[]` (14 rows) | DB `users` (seed) | Real data? → ASK |

### 2. Business Rules
| # | Rule found in prototype | Location (line/file) | Port status |
|---|---|---|---|
| R1 | util ≥130% → red "overload" | onclick line 88 | [ ] not ported |
| R2 | bonus = pool × coef / Σcoef | calcBonus() line 142 | [ ] not ported → into engine |

### 3. Formulas — ESPECIALLY IMPORTANT
| Formula | Original expression in prototype | Destination | Tested? |
|---|---|---|---|
| Suggested manday | `base*levelF*aiF*alloc` | engine/manday.ts | [ ] needs test |

### 4. State / Flow
| State/step | How prototype expresses it | Transition rule |
|---|---|---|
| project stage | data-stage attribute | advance one step only (see §6) |

### 5. Permissions — often only in comments!
| Action | Who may (per prototype) | Present at the API yet? |
|---|---|---|
| Edit salary | "CEO only" (comment line 30) | [ ] NO — must add guard |

### 6. Formatting
| Value | Prototype format | Rule |
|---|---|---|
| VND money | "1.743.000.000" | integer + vi-VN format |

### 7. ⚠️ AMBIGUITIES — ask before assuming
- [ ] Is the 14-staff array real seed or placeholder?
- [ ] Is the 130% threshold hard, or read from settings?
```

> **Inventory acceptance:** every item in sections 2, 3, 5 (rules, formulas, permissions) must have an explicit port status. **No item may disappear** between prototype and production without a recorded reason.

### B3. Classic "drop" traps when porting (prevention checklist)

- [ ] **Client-side validation lost on componentization.** Prototype `if(x>100)` in onclick → port to real validation *and* add server validation (Rule 4).
- [ ] **Logic in DOM order lost when componentizing.** A 5-step ordered form → a state machine, not 5 loose components that lose the order constraint.
- [ ] **Hardcoded array copied as hardcoded array** instead of moved to DB/settings (violates §0 seed-first + Rule 5).
- [ ] **Hand-written formula rewritten from memory** (numeric drift!) instead of copied *exactly* then refactored. → **Copy the formula verbatim first, refactor later, test with the same input.**
- [ ] **Edge case in the prototype dropped.** Prototype handles `if(arr.length===0)` → production must too.
- [ ] **Number/date/money format silently changed** → wrong display, wrong parsing.
- [ ] **Conditional "disabled/hidden" states** in the prototype = business rules, must be ported.
- [ ] **Comments describing not-yet-coded constraints** = mandatory TODOs, not noise.

### B4. Safe port procedure (mandatory order)

```
P1. READ the prototype exhaustively — every <script>, onclick, array, comment.
P2. BUILD the Logic Inventory (§B2) — show the owner; confirm the ambiguities (section 7).
P3. PORT DATA first — hardcoded → seed/settings/DB (§0, Rule 5).
P4. PORT FORMULAS — copy VERBATIM into the engine, write a test with the prototype's own input,
    confirm identical output, THEN refactor. (§4, §9)
P5. PORT RULES & STATE — two-layer validation, state machine (§6), API permissions (§4 / Rule 4).
P6. PORT UI — last. The UI is the easy part; do it last.
P7. RECONCILE — open prototype and production side by side, tick every Inventory item.
P8. INTEGRATION TEST (Rule 6) + Anti-Hallucination check (§A6).
```

> **Why UI last (P6):** doing UI first tempts the agent to think it's "done" once it *looks* right, then skip the logic. Forcing logic first means the hard part is done while still fresh.

### B5. Acceptance: what "ported correctly" means

A screen is ported only when:
- [ ] 100% of Logic Inventory items (§B2) are `done` or `n/a with a reason`.
- [ ] Every formula yields the **same output for the same input** as the prototype (proven by a test).
- [ ] Every rule/permission/edge-case from the Inventory is present in production.
- [ ] No hardcoded business data remains (moved to DB/settings).
- [ ] Side-by-side prototype↔production: behavior matches, not just appearance.

### B6. Example: 8H — porting the `XC-CMS prototype` (single HTML, CDN React/Recharts)

```
Prototype: 1 file HTML, React+Recharts via CDN, data nhúng cứng.
Logic ẩn phát hiện được:
  - Mảng top-20 khách hàng nhúng trong <script> → THỰC RA là data thật (FUKANG 20.32 tỷ...)
    → KHÔNG copy thành array, đưa vào DB. (đã hỏi & xác nhận)
  - Hàm tính HHI concentration viết tay trong script → copy nguyên văn vào engine/concentration.ts + test.
  - Quy tắc "top 132 KH = 80% doanh thu" → là phân tích, không phải rule cứng; ghi chú.
  - Màu cảnh báo theo ngưỡng doanh thu → business rule, port + đọc ngưỡng từ settings.
```

---

# §C. AGENT WORKING PROTOCOL — how to work & report
## (Agent-agnostic: Claude Code, Cursor, Copilot, any)

> **Purpose:** standardize *how the agent thinks out loud and reports*, so the owner can supervise it and the agent can catch its own mistakes. A good agent is not a quiet one — it is one that **exposes enough of its process to be audited.**

### C1. The mandatory loop for any non-trivial task: PLAN → ACT → VERIFY → SELF-REVIEW

> "Non-trivial" = anything touching >1 file, or schema/auth/engine/money, or a prototype port.

#### Phase 1 — PLAN (before any code)
```
📋 PLAN
  Goal: [one line, exactly what the owner wants]
  Files in scope: [list]
  Sources already read (G1–G4): [what you read/grepped to avoid guessing — §A0]
  Assumptions to resolve: [or "none"] → if any, ASK before proceeding.
  Steps: [numbered, dependency-first — §1]
  Sensitive touchpoints: [auth? money? migration? logic port?]
```
> For large tasks, **stop after PLAN and wait for approval**. For small, clear tasks, PLAN can be 2–3 lines, then continue.

#### Phase 2 — ACT (while coding)
- Follow the PLAN. Deviating → say "deviating because…".
- Every forced assumption → `⚠️ ASSUMPTION` marker (§A1) + into the Ledger (§A5).

#### Phase 3 — VERIFY (after coding, before reporting)
```
✅ VERIFY
  Commands actually run: [paste logs — do NOT fabricate, §HX8]
  CRUD/integration test: [result per step — Rule 6]
  DB/state inspected after write: [evidence real data landed]
```

#### Phase 4 — SELF-REVIEW (grade yourself before saying "done")
```
🔍 SELF-REVIEW
  §A6 Anti-Hallucination: [pass? any open ASSUMPTION?]
  §0a 7 Rules:           [which apply, pass?]
  §B5 Port (if porting): [Inventory clear? formulas same-input→same-output?]
  Uncertainty Ledger:    [clean / N open]
  → Verdict: DONE / DONE-WITH-WARNINGS / NOT DONE because…
```

### C2. Honesty in reporting (blocks HX8)

- **"Tested" = logs exist.** No logs → say "NOT tested, this is proposed code".
- **"It runs" = real output exists.** Never infer "it probably runs".
- **When wrong, say "I was wrong about X" plainly.** No waffling, no excessive apology (keep self-respect, fix the work).
- **When blocked and unable to self-verify:** say "I can't verify X because Y; I need you to decide/provide Z" — don't guess past it.

### C3. When to STOP and ASK (instead of guessing)

Stop and ask when any of these occur:
- A number/array in the prototype is unclear: **real data or placeholder?** (§B2 section 7)
- A **threshold/coefficient** is unclear: hard, or read from settings?
- Two sources (prototype vs spec vs schema) **conflict**.
- A **large dependency** is needed (§A3), or an architectural decision changes.
- The **frontend needs an endpoint/column the backend lacks** — confirm the approach.
- The request is ambiguous enough to have ≥2 readings with materially different results.

> A timely question is far cheaper than a day of wrong-direction code.

---

# §D. PROJECT_CONTRACT — required per-project declaration
## (Fill this for EACH project — it is the "G3 source" for §A)

> This is the *one* part that must be written per project. It is the anchor that keeps the agent from guessing. Leaving it blank invites hallucination. It overrides OWNER_DEFAULTS where they differ.

```yaml
# ===== PROJECT CONTRACT =====
project_name:        "[PROJECT_NAME]"
one_line_purpose:    "[what this project does, for whom]"

# --- Stack (be specific, with versions) ---
frontend:            "[e.g. React 18 + Vite 5 + Tailwind 3]"
state_mgmt:          "[e.g. Zustand + React Query v5]"
backend_runtime:     "[e.g. Cloudflare Pages Functions / Node 20 / Bun]"
api_style:           "[REST / GraphQL / RPC]"
database:            "[e.g. Cloudflare D1 (SQLite) / Postgres 15 / Supabase]"
auth_method:         "[OTP Telegram / Email magic link / OAuth / Password]"
external_integrations: "[Telegram Bot / Stripe / n8n / ...]"

# --- Entry points (defeats Rule 7 reading the wrong file) ---
real_api_entry:      "[path to the REAL API file, e.g. worker/index.js]"
deploy_command:      "[the real deploy command, from package.json]"
migrations_dir:      "[e.g. migrations/]"
engine_dir:          "[e.g. src/lib/engine/]"
types_source:        "[the single schema-bound types file, e.g. src/types/index.ts]"
seed_file:           "[e.g. seed.sql]"

# --- Numeric conventions (overrides OWNER_DEFAULTS if needed) ---
money_storage:       "INTEGER [unit: VND / cent]"
percent_storage:     "INTEGER [0-100 / 0-10000]"
rounding_rule:       "[floor + distribute remainder / round half-up]"

# --- Authorization (roles high → low) ---
roles:               "[e.g. CEO > PM_TONG > PM_OWNER > TEAM]"
default_new_role:    "[MUST be the lowest role]"
public_routes:       "[login + webhook only]"

# --- Business ground truth ---
spec_documents:      "[paths to SRS/PRD, e.g. docs/SRS_v1.md]"
prototype_files:     "[paths to HTML prototypes if porting, e.g. prototype/cms.html]"
business_constants:  "[where read from: settings table / config file]"

# --- Absolute constraints for this project (if any) ---
hard_constraints:    "[e.g. 'XC not in the cap table' / 'no float for money']"

# --- CI/CD ---
ci_cd:               "[GitHub Actions / Cloudflare Git integration / manual] — see Appendix"
```

---

# §0. Foundational execution conventions (Universal)

1. **Seed first, edit via UI later.** All master data (staff / catalogs / parameters) is seeded by script at init (`seed.sql`/`seed.ts`), then edited via an Admin/Settings screen. Do NOT hardcode business values — read from DB/`settings`.
2. **All financial figures / coefficients / thresholds read from `settings`**, never literals in code. Changing a threshold = changing one DB row, not a redeploy.
3. **UI in the end-user's language; English for code** (variables, tables, functions, technical comments).
4. **Every create/update/delete → append to `activity_log`** (append-only; never UPDATE/DELETE the log).
5. **Money: INTEGER** (smallest unit). **Percent: INTEGER** (0-100 or 0-10000). Pick one convention, keep it consistent project-wide (declared in §D).
6. **Never drop logic on port.** Every prototype goes through §B before being rewritten.
7. **Never fabricate.** Every technical reference is anchored per §A.
8. **Never hide a broken thing.** Fix the cause or say you're stuck — never silence a test/type/error (§0c).
9. **Never leak secrets or PII.** They come from the environment and never appear in code, logs, or error responses (§0d).

---

# §0a. THE 7 CODING RULES — apply at all times
## (Distilled from 4 real review rounds — anchored to §A/§B)

> The compass while coding. Each rule has a real failure + how to avoid it. Do NOT skip.

### Rule 1 — Contract-First: the schema is the single source of truth
**Real failure:** migration, API SQL, API types, frontend types each different. (D1 used `name`, worker used `task`, client used `taskName`.)
**Principle:**
- The migration `.sql` is truth. Everything else must match. *(see §A4 — anchor column names)*
- After every migration change → grep the whole repo for old column names.
- One single types file derived from the schema (declared in §D `types_source`).
```bash
grep -rn "old_column_name" src/ [API_DIR]/ migrations/   # run after every schema change
```

### Rule 2 — Fail-Closed, not Fail-Open
**Real failure:** OTP accepted any 6-digit code when the DB failed. API returned `{ok:true, mock:true}` with HTTP 200 → the UI thought it succeeded.
**Principle:**
- **DB error → return an error, no fallback.** Never accept what you can't verify.
- **Read routes: no mock.** Return `[]` or 503. Mock is for writes only (and must use HTTP 202).
- Distinguish status: 201 = real success; 200/202 + mock = warning.
```js
// ❌ Wrong: catch (e) { return { ok: true, mock: true }; }
// ✅ Right:
catch (e) { return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503 }); }
```

### Rule 3 — Errors must reach the UI
**Real failure:** the backend returned `{error}` but `handleApi()` wrapped it into a 200 → the frontend saw `res.ok` → green "Saved" toast.
**Principle:**
- Backend: `result instanceof Response` must pass through; `result.error` → 4xx/5xx.
- Frontend: always check `response.error` *before* showing success.
```js
if (result instanceof Response) return result;
if (result?.error) return new Response(JSON.stringify(result), { status: result.status || 400 });
```

### Rule 4 — Authorize at the API, not just the UI
**Real failure:** the sidebar hid a button but the API still accepted the request from TEAM. The login fallback role defaulted to CEO.
**Principle:**
- Every sensitive endpoint: `can(user, roles)` at the top of the handler.
- **Default role = lowest** (TEAM/Viewer), never the highest.
- **GET checks the role too**, not just POST/PUT.
- Public webhooks must verify a secret token.
> *When porting: permissions often live only in comments — see §B2 section 5.*

### Rule 5 — One source of business logic
**Real failure:** the TS engine computed utilization one way, the JS worker another. Bonus threshold: engine used margin, worker used revenue plan.
**Principle:**
- Business logic in exactly one place. Engine in `[engine_dir]` → the worker calls that exact formula.
- The worker never "recomputes". It only fetches + formats.
- Hardcoded constants → read from `settings`.
> *When porting: copy the formula VERBATIM into the engine first, test with the same input, then refactor — §B4 P4.*

### Rule 6 — Integration-test before review
**Real failure:** stakeholder-create returned success but the DB didn't receive it. Revenue status "Chậm" didn't match the DB enum "Trễ".
**Principle:**
- Before "done": run one full CRUD cycle.
- Create → Read → Update → Delete, all four must pass.
- Inspect the DB directly after a write (not just the toast). *(see §HX8 — "tested" = logs exist)*
```bash
curl -X POST [API]/tasks -d '{...}'   # Create
curl [API]/tasks                      # Read (must show the new record)
curl -X PUT [API]/tasks -d '{...}'    # Update
curl -X DELETE "[API]/tasks?id=..."   # Delete
```

### Rule 7 — Context-First: reload the codebase each new session
**Problem:** the agent edits code before understanding the architecture → many review rounds.
**Principle:** each new session, **the first 5 minutes are reading, not coding.**

#### Step 0 — Config-First (find the REAL entry point)
> Lesson: don't trust convention (the `functions/` folder name), trust config. *(Real failure: the agent read `functions/api/index.js` — 130 lines, the old file — and ignored `worker/index.js` — 2560 lines, the real file.)*
```bash
cat [config: wrangler.toml / vercel.json / package.json]   # where is the real entry point?
cat package.json                                            # which file does "deploy" run?
wc -l [candidate API files]                                # the longer file is usually the real one
grep -c "case '\|app.get\|router\." [candidate API files]  # which has more routes?
```
> Cross-reference: pre-declare `real_api_entry` + `deploy_command` in §D so you don't re-discover this every time.

#### Step 1 — Survey the architecture (tool depends on the environment)
Use a semantic-search tool if available (`semble`, Cursor's codebase index, Claude Code project context); otherwise `grep`/`rg`. Answer 5 questions:
```
1. architecture: how do frontend / backend / database connect?
2. auth & permission: which routes are public? where is authorization?
3. schema: which tables? relationships? (read migrations/)
4. business logic: where is the engine? does the worker recompute?
5. API routes: what is the handler flow?
```

#### Step 2 — Answer 3 questions before coding
1. What tables does `[DB_ENGINE]` have, and their relationships?
2. Which routes are public, and what is the auth flow?
3. Is business logic in the engine or the worker?

### 7-Rules checklist before "done"
- [ ] (R1) Schema ↔ all SQL ↔ types match? Grepped old columns?
- [ ] (R2) Every catch fail-closed (503), no mock 200?
- [ ] (R3) Router guard `instanceof Response` + `result.error`? Frontend checks `response.error`?
- [ ] (R4) Server-side role check on every sensitive endpoint? GET too? Lowest default role?
- [ ] (R5) Logic in one place? Constants from settings?
- [ ] (R6) Full CRUD run + DB inspected (with logs)?
- [ ] (R7) Read config to find the real entry point before editing?

> *The 7 Rules are distilled from 4 review rounds of 8H Portfolio Manager — 05/2026. Anchored to §A (anti-hallucination) + §B (anti-drop on port).*

---

# §0c. ANTI-PATTERN CATALOG — forbidden ways to "make the error go away"
## (The highest-leverage page for running a cheaper model safely)

> **The disease:** §A forbids fabricating what you don't *know*. §0c forbids hiding what's *broken*. Same illness — substituting *the disappearance of a symptom* for *the solution of a problem*. This is the most common failure mode of a coding agent under pressure: a red test, a type error, a stack trace — and the fastest way to turn red into green is almost always the worst way.

> **Core law:** **A symptom hidden is not a problem solved.** When something breaks, you fix the cause or you stop and say you're stuck. You never silence the messenger.

### Group A — Silencing the type checker
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| `as any`, `as unknown as X`, casting to a wrong type | Hides a real type mismatch that will fail at runtime | Understand why the types disagree; fix the type or the value |
| `// @ts-ignore`, `// @ts-nocheck` | Turns off the one tool that catches the bug | Read the error — the type checker is usually right |
| `!` non-null assertion to silence "possibly null" | Asserts a fact you have not verified (also §A: claiming truth without grounding) | Handle the null case, or prove it cannot be null |

### Group B — Faking a green test
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| Changing the expected value to match the actual output | The test now asserts the bug; it tests nothing | If the spec says X, the code must produce X — fix the code, not the assertion |
| `.skip` / `.only` / commenting out a failing test | Pretends the case doesn't exist | A failing test is information; make it pass, or delete it with a recorded reason |
| Wrapping the assertion in `try/catch` | Swallows the failure | Let it fail loudly |
| Mocking the function *under test* | Tests the mock, not the code | Mock dependencies, never the subject |

### Group C — Swallowing runtime errors
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| Empty `catch {}` / `catch(e){}` | The error vanishes; the program runs on in a broken state | Handle it or rethrow; at minimum log + fail-closed (Rule 2) |
| Broad `try/catch` around a whole block to stop one line throwing | Hides which line failed and why | Narrow the catch to the real failure |
| Returning fake/default data on error | The classic fail-open — UI shows green on a broken backend (Rule 2) | Return a real error (4xx/5xx) |
| `?.` sprinkled everywhere to stop null errors | Hides that something upstream is unexpectedly null | Find *why* it's null; `?.` is for genuinely optional values, not for silencing |

### Group D — Silencing the linter/build
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| Inline `eslint-disable` / blanket disable to pass | Turns off a guardrail | Fix the flagged issue; disable only one rule on one line, with a written reason |

### Group E — Faking a fix in the logic
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| Commenting out the broken code path | The feature is now silently gone (this is dropped logic — §B) | Fix the path; don't amputate it |
| Hardcoding a value to make one case pass | Works for that input, breaks for every other | Solve the general case |
| Special-casing the exact test input | The test passes, the feature doesn't work | If you're matching the test's literal input, you're cheating the test |

### Group F — Meta anti-patterns (behavioral)
| Forbidden move | Why it's a lie | Do this instead |
|---|---|---|
| **Shotgun debugging** — changing unrelated code hoping the error moves | You no longer know what fixed what | One hypothesis, one change, observe |
| Deleting code you don't understand because it "seems" related | You may be removing the part that was correct | Understand before you delete |
| Declaring victory when the symptom is gone but you can't explain why | An unexplained fix is an unfound bug | You must be able to state what was wrong and why the change fixes it |

### The Stuck Protocol — the legitimate exit
> Forbidding the shortcuts without giving a legal alternative just traps the agent, and a trapped agent cheats. So: when you genuinely cannot fix it, you have exactly these moves (never a move from the catalog above):

1. **READ MORE** — the cause is usually in code you haven't read yet. Widen the search. (Rule 7)
2. **REPRODUCE MINIMALLY** — shrink the failing case until the cause is obvious.
3. **STATE & ASK** — *"I'm stuck on X. Symptom: … Tried: … Hypothesis: … I need: …"* Then stop and ask.

> This mirrors §A1 (verify → ask → mark). **Being stuck and saying so is a success state. Hiding that you're stuck is the failure.**

> **Why this section narrows the weak↔strong model gap:** a strong model rejects these shortcuts on its own — it finds them distasteful. A weaker model, under the pressure of a red test, reaches for whatever turns it green. Naming the shortcut, the reason it's a lie, and the correct alternative hands the weaker model the judgment it lacks, externalized.

---

# §0d. SECRETS & DATA SAFETY — non-negotiable handling rules
## (Pure rules, no judgment required — the kind a weaker model can follow reliably)

- **Never commit secrets.** `.env`, keys, tokens → in `.gitignore`, injected via the platform's secret store (e.g. `wrangler secret put`). Find a secret already in code/history → flag it, don't just relocate it.
- **Never log secrets or PII.** No `console.log` of tokens, passwords, full customer records, phone numbers. Logs are forever and often shipped off-box.
- **Never put secrets/PII in error responses.** A 500 returns "internal error", not the stack trace carrying the DB connection string.
- **Never send real customer/business data to a third-party API "for debugging."** No pasting a customer table into an external tool. Use synthetic data.
- **Secrets come from the environment, never hardcoded — even "temporarily."** A temporary hardcode is a committed hardcode.
- **Inbound/webhook:** verify the secret *before* doing any work (Rule 4, C03).
- **When unsure whether a field is sensitive** (a name? an internal id? a price?), treat it as sensitive until confirmed.

> **Example (8H):** dữ liệu khách hàng thật của XC (FUKANG, 3.143 khách, doanh thu, sản lượng xe) là PII/dữ liệu nghiệp vụ nhạy cảm — không log ra production, không gửi sang tool ngoài để debug, không nhúng vào prototype công khai. Dùng dữ liệu giả khi thử nghiệm.

---

# §0b. AUTO-REVIEW FRAMEWORK — automated checks (machine-parseable)

> **Purpose:** let an agent/script **self-check** compliance. Each item has an ID (mapped to a Rule/Section), a severity, and an AUTO command. The result is a compliance score. **v4 adds the `HALL-*` group (anti-hallucination) and the `PORT-*` group (anti-drop on port).**

### Structure of each rule
```
[ID] [SEVERITY] [DOMAIN] → maps to Rule/Section
  VERIFY: boolean condition to check
  AUTO:   bash command to run automatically (if any)
  FAIL:   action if violated
```

| Level | Symbol | Meaning | If violated |
|---|---|---|---|
| 🔴 CRITICAL | `C` | Security hole / financial error / data loss / **unanchored fabrication** | Block merge, fix now |
| 🟡 HIGH | `H` | Business bug / wrong logic / **logic dropped on port** | Fix before release |
| 🟢 MEDIUM | `M` | Code smell / missing test / debt | Fix next sprint |
| ⚪ LOW | `L` | Style / convention | Nice-to-have |

### 🔴 CRITICAL — Anti-Hallucination (NEW GROUP, maps §A)
```
[HALL01] CRITICAL HALLUCINATION — every external import is declared (→ §A3, HX2)
  VERIFY: every `import X from 'lib'` (non-relative) appears in package.json/requirements.txt
  AUTO:   for lib in $(grep -rhoP "from ['\"]([^.'\"][^'\"]*)['\"]" src/ | grep -oP "(?<=['\"])[^'\"]+" | grep -v "^\." | cut -d/ -f1 | sort -u); do
            grep -q "\"$lib\"" package.json || echo "UNDECLARED IMPORT: $lib"
          done
  FAIL:   Block. Add to dependencies (with §A3 report) or remove the fabricated import.

[HALL02] CRITICAL HALLUCINATION — no unresolved ASSUMPTION outstanding (→ §A1, §A5)
  VERIFY: no "⚠️ ASSUMPTION" marker without a matching "RESOLVED", and no open ledger items
  AUTO:   grep -rn "⚠️ ASSUMPTION" src/ [API_DIR]/ | grep -v "RESOLVED"
  FAIL:   Verify & remove the marker, or explicitly report the remainder. Do not claim "done" while open.

[HALL03] CRITICAL HALLUCINATION — frontend calls no nonexistent endpoint (→ §A4, HX5)
  VERIFY: every path the frontend fetches has a matching case in the API router
  AUTO:   for ep in $(grep -rhoP "(?<=/api/)[a-z0-9/_-]+" src/ | sort -u); do
            grep -rq "$ep" [API_DIR]/ || echo "GHOST ENDPOINT: /api/$ep"
          done
  FAIL:   Implement the endpoint or fix the call. A missing endpoint is work, not an assumption.

[HALL04] CRITICAL HALLUCINATION — every queried column exists in the schema (→ §A4, HX3, Rule 1)
  VERIFY: column names in SQL code match the migration
  AUTO:   # semi-automatic: list columns in migrations, then reverse-grep unknown identifiers in SQL code
          grep -rhoP "(?<=SELECT |WHERE |INSERT INTO \w+ \()[a-z_, ]+" [API_DIR]/ | tr ',' '\n' | tr -d ' ' | sort -u > /tmp/used_cols
          # compare against columns declared in migrations/*.sql (manually review odd lines)
  FAIL:   Fix the column name to match the schema.
```

### 🔴 CRITICAL — Security & Data (maps §0a)
```
[C01] CRITICAL AUTH — every sensitive endpoint has a server-side role check (→ Rule 4)
  AUTO:   grep -rn "case '" [API_FILE]   # check each handler calls can(user,...) within a few lines
  FAIL:   Add can(user, roles).

[C02] CRITICAL AUTH — default role for a new user = lowest (→ Rule 4)
  AUTO:   grep -rn "role.*=.*['\"]CEO['\"]\|role.*=.*['\"]Admin['\"]" src/ [API_DIR]/
  FAIL:   Change the default role to the lowest.

[C03] CRITICAL AUTH — public webhook verifies a secret (→ Rule 4)
  AUTO:   grep -A5 "webhook" [API_FILE] | grep -c "secret\|verify\|token"
  FAIL:   Add secret verification at the top of the handler.

[C04] CRITICAL DATA — activity_log is append-only (→ §0.4)
  AUTO:   grep -rn "UPDATE.*activity_log\|DELETE.*activity_log" [API_DIR]/
  FAIL:   Remove that endpoint. The log is INSERT + SELECT only.

[C05] CRITICAL MONEY — money stored as INTEGER, not float (→ §0.5)
  AUTO:   grep -rn "REAL.*salary\|FLOAT.*bonus\|parseFloat.*amount" migrations/ src/
  FAIL:   Change schema to INTEGER; use parseInt/Math.round in code.

[C06] CRITICAL SCHEMA — types match the migration (→ Rule 1)
  AUTO:   for col in $(grep -oP '^\s+\w+' migrations/*.sql | sort -u); do
            grep -q "$col" [types_source] || echo "MISSING: $col"; done
  FAIL:   Sync types with the schema.
```

### 🟡 HIGH — Anti-drop on port (NEW GROUP, maps §B)
```
[PORT01] HIGH PORT-COMPLETENESS — a Logic Inventory exists per ported prototype (→ §B2)
  VERIFY: an inventory file exists for each prototype in §D prototype_files
  AUTO:   ls docs/logic-inventory/*.md 2>/dev/null | wc -l   # compare to prototype count in §D
  FAIL:   Build the Logic Inventory before merging ported code.

[PORT02] HIGH PORT-FORMULA — ported formulas have a same-input parity test (→ §B4 P4, §B5)
  VERIFY: each formula ported from the prototype has a test using the prototype's input → same output
  AUTO:   grep -rln "prototype-parity\|@port-test" [engine_dir]/*.test.* | wc -l
  FAIL:   Write a parity test. An untested ported formula is suspected drift.

[PORT03] HIGH PORT-DATA — no hardcoded business data copied from prototype into code (→ §B3, §0.1)
  VERIFY: large business-data arrays/objects are not embedded in src (must go to seed/DB)
  AUTO:   grep -rn "const .*=\s*\[" src/ | grep -iE "staff|user|level|price|customer|rate"
  FAIL:   Move into seed/settings/DB.
```

### 🟡 HIGH — Anti-Pattern (NEW GROUP, maps §0c — catches the error-hiding reflex)
```
[ANTI01] HIGH ANTI-PATTERN — no type-checker silencing (→ §0c Group A)
  AUTO:   grep -rn "as any\|@ts-ignore\|@ts-nocheck" src/ [API_DIR]/ | grep -v "// reason:"
  FAIL:   Fix the type. Allowed only with `// reason:` on the same line.

[ANTI02] HIGH ANTI-PATTERN — no empty catch blocks (→ §0c Group C, Rule 2)
  AUTO:   grep -rnP "catch\s*\([^)]*\)\s*\{\s*\}" src/ [API_DIR]/
  FAIL:   Handle or rethrow; never swallow.

[ANTI03] HIGH ANTI-PATTERN — no skipped/focused tests committed (→ §0c Group B)
  AUTO:   grep -rn "\.skip(\|\.only(\|xit(\|xdescribe(" --include="*.test.*" .
  FAIL:   Make the test pass or delete it with a recorded reason. Never commit .only/.skip.

[ANTI04] MEDIUM ANTI-PATTERN — no commented-out code paths left behind (→ §0c Group E, §B)
  AUTO:   grep -rnE "^\s*//\s*(if|for|while|return|await|const|let)\b" src/ [API_DIR]/
  FAIL:   Restore and fix the path, or remove it deliberately (not by commenting out).
```

### 🔴 CRITICAL — Secrets & Data Safety (NEW GROUP, maps §0d)
```
[SEC01] CRITICAL SECRETS — no secrets committed in code (→ §0d)
  AUTO:   grep -rnE "(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}" src/ [API_DIR]/
  FAIL:   Move to the secret store. Rotate the exposed secret.

[SEC02] HIGH SECRETS — no logging of obvious secrets/PII (→ §0d)
  AUTO:   grep -rnE "console\.log\(.*(token|password|secret|customer|phone)" src/ [API_DIR]/
  FAIL:   Remove the log or redact the field.

[SEC03] CRITICAL SECRETS — .env is gitignored (→ §0d)
  AUTO:   grep -q "\.env" .gitignore || echo "FAIL: .env not gitignored"
  FAIL:   Add .env to .gitignore.
```

### 🟡 HIGH — Business & Logic (maps §0a)
```
[H01] HIGH FAIL-CLOSED — DB error returns 503, no mock (→ Rule 2)
  AUTO:   grep -rn "catch.*{.*mock.*true\|catch.*{.*ok.*true" [API_FILE]
  FAIL:   return Response 503.

[H02] HIGH ERROR-PROP — router guards instanceof Response + result.error (→ Rule 3)
  AUTO:   grep -A3 "result instanceof Response" [API_FILE] | grep -c "result?.error"
  FAIL:   Add the guard. Mock fallback → 202.

[H03] HIGH SINGLE-SOURCE — the engine is the only place that computes (→ Rule 5)
  AUTO:   grep -rn "function.*calc\|function.*compute\|const.*formula" [API_DIR]/ | grep -v engine
  FAIL:   Move into engine/. The worker only fetches+formats.

[H04] HIGH CONSTANTS — hardcoded constants read from settings (→ Rule 5)
  AUTO:   grep -rn "\* 0\\.[0-9]\|\* [0-9]\+ " [engine_dir]/ | grep -v "// settings\|// config"
  FAIL:   Move to settings table/config.

[H05] HIGH ZERO-DIV — every division guards a zero denominator (→ §9, HX10)
  AUTO:   grep -rn "/ [a-zA-Z]" [engine_dir]/   # review the preceding guard
  FAIL:   Add a guard before the division.

[H06] HIGH STATE-MACHINE — advance one step only, guarded at the API (→ Rule 4 + §6)
  AUTO:   grep -rn "stage\|status" [API_FILE] | grep -c "canAdvance\|canTransition"
  FAIL:   Implement the state-machine guard.
```

### 🟢 MEDIUM — Quality (maps §0a)
```
[M01] MEDIUM UNIT-TEST — every engine function has ≥1 test (→ Rule 6)
  AUTO:   for f in [engine_dir]/*.{ts,js}; do t="${f%.*}.test.${f##*.}"; [ -f "$t" ] || echo "MISSING TEST: $t"; done
[M02] MEDIUM INTEGRATION — CRUD test before done (→ Rule 6)
  AUTO:   ls tests/integration/*.sh 2>/dev/null | wc -l
[M03] MEDIUM IDEMPOTENT — CREATE TABLE IF NOT EXISTS
  AUTO:   grep -L "IF NOT EXISTS" migrations/*.sql
[M04] MEDIUM INDEX — index for FK/token/date or frequent query columns
  AUTO:   grep -c "CREATE INDEX" migrations/*.sql
```

### ⚪ LOW — Style (maps §0.3)
```
[L01] LOW NAMING — code in English, no Vietnamese in identifiers (→ §0.3)
  AUTO:   grep -rn "[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]" --include="*.ts" --include="*.js" --include="*.sql" src/ [API_DIR]/ migrations/ | grep -v "//.*\|/\*.*\|'[^']*'"
[L02] LOW DEAD-CODE — no orphan files (→ Rule 7 Step 0)
  AUTO:   for f in $(find . -name "*.ts" -o -name "*.js" | grep -vE "node_modules|dist"); do grep -rq "$(basename $f .ts)" . || echo "UNUSED: $f"; done
```

### Running & thresholds
```bash
bash scripts/auto-review.sh
# ========================================
# AUTO-REVIEW REPORT — [PROJECT_NAME]
# HALLUCINATION: 4/4 PASS | 100%   ← new group, MUST be 100%
# SECRETS:       3/3 PASS | 100%   ← new group, MUST be 100%
# PORT:          3/3 PASS | 100%   ← if porting
# ANTI-PATTERN:  4/4 PASS | 100%   ← new group
# CRITICAL:      6/6 PASS | 100%
# HIGH:          6/6 PASS | 100%
# MEDIUM/LOW:    ...
# OVERALL:      .. PASS | ..%
# ========================================
```
> **Thresholds:** any `HALL-*` or `SEC-*` CRITICAL FAIL → **absolute MERGE BLOCK** (fabrication and leaked secrets are non-negotiable). Otherwise: <80% → BLOCK; 80–95% → MERGE-WITH-WARNINGS; ≥95% → APPROVED.

### CI integration (generic — see appendices per platform)
```yaml
# .github/workflows/auto-review.yml
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/auto-review.sh | tee review-report.txt
      - run: |
          grep -q "HALLUCINATION:.*PASS" review-report.txt || { echo "BLOCKED: hallucination check failed"; exit 1; }
          SCORE=$(grep "OVERALL" review-report.txt | grep -oP "\d+(?=%)")
          [ "$SCORE" -lt 80 ] && { echo "BLOCKED: $SCORE% < 80%"; exit 1; } || true
```

---

# §1. Build Planning — Dependency-First

> Identify dependencies between modules before ordering. No skipping ahead. Split into phases; each phase is a demoable feature set.

### 1.1 Build-order template for `[PROJECT_NAME]`
```
B0  Init project + toolchain config + CI/CD
B1  Auth: [OTP/Email/OAuth] + JWT/session + authorization middleware
B2  CRUD Settings: master data [staff/catalogs/parameters]
B3  Calculation engine: pure functions + unit tests
B4  [Main entity] CRUD + state machine
B5  Resource allocation/assignment (if any) → visualization
B6  [Domain module #1]
B7  Dashboard/Reports aggregation (read-only from B4–B6)
B8  Role-scoped data entry (multi-tab)
B9  Alert/notification engine
B10 Audit log UI
--- end Phase 1 (MVP) ---
B11..B15  Domain modules #2..#4 + Sandbox + multi-channel notifications
--- end Phase 2 ---
B16 External integrations + AI/automation (Phase 3)
```
> **If porting from a prototype:** insert a "B-port = Logic Inventory (§B2) + port formulas+rules" step *before* each corresponding B. UI port comes last (§B4 P6).

### 1.2 Example: 8H Portfolio Manager
```
B0 D1 schema + seed.sql · B1 OTP Telegram + JWT · B2 Settings nhân sự/level/manday
B3 Engine Manday + test · B4 Projects 8-stage + tasks + dependency · B5 Phân bổ → Heatmap
B6 Bench + approve · B7 Dashboard CEO · B8 Nhập liệu 8 tab · B9 Cảnh báo 6 loại · B10 Activity log
--- B11 Stakeholder 4 tầng · B12 Level+KPI · B13 Thưởng 3-Layer · B14 Sandbox ROI · B15 Telegram + cron ---
B16 JIRA sync + AI dự báo
```

---

# §2. Schema Design Checklist

> The migration file is truth (Rule 1). Design before coding, store in `migrations/`. Understand the DB engine's limits.

### 2.1 Before creating the schema
- [ ] Listed every entity + relationship?
- [ ] FKs correct? Self-ref FK (manager_id → users.id) handles NULL?
- [ ] Enum: TEXT + CHECK, or INTEGER map?
- [ ] Append-only audit table present?
- [ ] Key-value settings table present? (Rule 5)
- [ ] Index for frequently-queried columns (FK, token, entity_type+entity_id)?
- [ ] Money INTEGER, percent INTEGER (per §D)?

### 2.2 If using SQLite (D1/Turso/Bun/libSQL)
| Available | Not available → handle it |
|---|---|
| INTEGER/REAL/TEXT | BOOLEAN → INTEGER 0/1 + CHECK |
| CHECK constraint | ARRAY → TEXT JSON + parse |
| datetime() | uuid() → crypto.randomUUID() at app layer |
| FK + CASCADE | Row Level Security → check in middleware |
| | Realtime/Subscription → polling |

### 2.3 Example: 8H — main tables
`users` (manager_id self-ref), `projects` (pm_owner_id), `tasks` (project_id, depends_on_task_id), `task_allocations`, `bench_tasks`, `revenue`, `sessions`, `activity_log`, `settings`, `stakeholder_*` (cây 4 tầng), `ot_records`, `level_evaluations`, `kpi_evaluations`, `quarterly_bonus`.

---

# §3. Auth Design Checklist

> The first gate. Authorization middleware runs on the server (Rule 4). Public routes are login + webhook only.

### 3.1 Auth template for `[PROJECT_NAME]`
- [ ] Method: OTP/Email link/OAuth/Password
- [ ] Public endpoint: `POST /api/auth/login` (or request-otp + verify-otp)
- [ ] Session: JWT or opaque? Stored where (DB/KV/cookie)?
- [ ] Lifetime + refresh token?
- [ ] New-user onboarding (invite/admin-created)?
- [ ] Middleware: every `/api/*` (except auth+webhook) verifies token → attaches `req.user`
- [ ] Every sensitive endpoint: `can(user,[roles])`; GET too
- [ ] Webhook: verify secret (not the user JWT)
- [ ] New default role = lowest

```js
function can(user, ...roles) { return user && roles.includes(user.role); }
function deny(h, msg="Forbidden") { return new Response(JSON.stringify({error:msg}), {status:403, headers:h}); }
if (!PUBLIC.includes(path)) { user = await getUser(token, env); if (!user) return deny(h,"Unauthorized"); }
case "[endpoint]": if (!can(user,"Admin","Manager")) return deny(h); result = await handler(...);
```

### 3.2 Example: 8H — OTP Telegram → JWT 24h
```
POST /api/auth/request-otp {name} → tra users; sinh code 6 số; gửi Telegram bot; {ok:true}
POST /api/auth/verify-otp {name,otp} → khớp → session+token; sai → 401
POST /api/telegram/webhook (public, verify secret)
Phân quyền: CEO,PM_TONG → all · PM_OWNER → project của mình · TEAM → mywork
```

---

# §4. Business Logic Engine Checklist

> The engine is pure functions — NO DB/API calls, NO side effects. Exactly one place computes (Rule 5). The worker only fetches + calls the engine + formats. Unit-test with concrete numbers before coding.

### 4.1 Engine template for `[PROJECT_NAME]`
- [ ] Engine in its own dir (`[engine_dir]`)?
- [ ] Every function pure (input→output, no side effects)?
- [ ] Constants from `settings`, not hardcoded? (Rule 5)
- [ ] Zero-division guarded on every calc? (Rule 2)
- [ ] Unit tests with real spec numbers (≥1/function)?
- [ ] Worker calls the engine, doesn't recompute?
- [ ] Money integer, rounded on division?
> *When porting: copy the prototype formula VERBATIM → parity-test same input → refactor. §B4 P4.*

### 4.2 Example: 8H
```
[engine_dir]/manday.ts (suggestedManday, dailyRateFullCost, taskCost, projectMargin)
            /utilization.ts (weekUtilization, weekUtilizationPRD, utilColorClass)
            /compensation.ts (utilizationScore, calculateQuarterlyBonus, getBonusMultiplier)
            /alerts.ts
Test: assert(suggestedManday(5,'L3',0.6,100) === 2.1)  // SRS §5.1
```

---

# §5. Visualization / Heatmap Checklist

> Visualize allocation/resources. Clearly separate data layers (billable vs non-billable). Colors by clear thresholds.

### 5.1 Heatmap template for `[PROJECT_NAME]`
- [ ] Time unit (week/day/month)?
- [ ] Utilization formula consistent engine ↔ UI? (Rule 5)
- [ ] Denominator guarded against /0 (capacity=0, workingDays=0)?
- [ ] Allocation overlap: 60%+60% → >100%?
- [ ] Timezone: week starts which day? Holidays?
- [ ] Different work types distinguished by layer/color?

### 5.2 Example: 8H — 26-week rolling, cell = user×week; util = allocated/capacity×100; colors free→low(≤50)→mid(≤80)→high(≤100)→over(≤120)→crit(>120).

---

# §6. State Machine / Workflow Checklist

> Entities with a lifecycle → state machine. Guard at the API (Rule 4). Advance one step only. Side effects on transition.

### 6.1 Template for `[PROJECT_NAME]`
- [ ] Ordered state list (`STAGE_ORDER`)?
- [ ] `canAdvance(from,to)` — one step only?
- [ ] `canTransition(from,to,user)` — per-transition permission?
- [ ] Side effects per transition (unlock/log/notify)?
- [ ] API guard blocks invalid actions for the current state?
- [ ] Special states (On Hold/Pause/Archive)?
```js
const STATES = ['draft','review','approved','active','completed','archived'];
function canAdvance(from,to){ return STATES.indexOf(to) === STATES.indexOf(from)+1; }
function guard(action,state){ if(action==='allocate' && STATES.indexOf(state)<2) return false; return true; }
```
> *When porting: the step order in the prototype (DOM order, data-* attrs) often IS the state machine — don't make it loose and lose the constraint. §B3.*

### 6.2 Example: 8H — 8-stage lifecycle
```js
const STAGE_ORDER = ['prefeasibility','pitching','approval','signed','allocation','execution','golive','operation'];
isPipeline(s){ return STAGE_ORDER.indexOf(s) <= 2; }       // GĐ1-3
isRevenueLocked(s){ return STAGE_ORDER.indexOf(s) >= 3; }  // GĐ4+
canAllocateReal(s){ return STAGE_ORDER.indexOf(s) >= 4; }  // GĐ5+
```

---

# §7. Dashboard / Reporting Checklist

> Read-only aggregation from existing data. Progressive disclosure. Every number has a clear provenance (from where, filtered how).

### 7.1 Template for `[PROJECT_NAME]`
- [ ] The 4–6 most important metric cards?
- [ ] Each metric clearly filtered (no mixing unsettled data)?
- [ ] Realtime or polling? Interval?
- [ ] Charts use real data?
- [ ] Visual alert threshold (red if margin < X%)?
- [ ] "locked/settled" distinguished from "projected/pipeline"?

### 7.2 Example: 8H — CEO Dashboard
6 cards: dự án đang chạy, cảnh báo active, MD actual/plan, util team, biên LN YTD, Bench Pool. Filter: revenue locked = stage≥4; cost = cost_actual (không gồm bench).

---

# §8. Alert / Monitoring Checklist

> Detect early before it becomes a crisis. Each alert: trigger condition, severity (CRITICAL/RISK/WATCH), link to the handling screen.

### 8.1 Template for `[PROJECT_NAME]`
- [ ] Listed the alert types (each = one engine function)?
- [ ] Each alert: type, 3-level severity, title, detail, entity link?
- [ ] Cron or on-demand?
- [ ] Resolved alerts auto-hide or manual mark?
- [ ] Notification to an external channel (Email/Telegram/Slack)?
```
OVERLOAD → over threshold · DEADLINE → overdue · DEPENDENCY → blocked
STAKEHOLDER → external party late · MARGIN → below threshold · IDLE → unused
```

### 8.2 Example: 8H — `[engine_dir]/alerts.ts`
checkOverload (≥130% CRIT, ≥100% RISK), checkCascade, checkStakeholder, checkBuffer (gap<5 ngày), checkBenchIdle (<30% >4 tuần), checkLevelReview (bench>2 quý), checkMarginCompany (<15% CRIT).

---

# §9. Financial / Calculation Checklist

> The most sensitive part — a small error = lost trust. Round explicitly, guard division, test with concrete numbers.

### 9.1 Template for `[PROJECT_NAME]`
- [ ] Money INTEGER, no float?
- [ ] Percent INTEGER (0-100 or 0-10000), consistent?
- [ ] Pool split: do rounded parts sum back to the original pool? How is the remainder handled?
- [ ] Activation condition (only when a threshold is met)?
- [ ] Recipients: who gets it / who is excluded? Hardcoded list?
- [ ] Tested with spec numbers? (Rule 6)
> *When porting a financial formula from a prototype: this is the most dangerous place for numeric drift — verbatim copy + parity test are mandatory. §B4 P4, [PORT02].*

```js
function distributePool(pool, participants) {
  const sumCoef = participants.reduce((s,p)=>s+p.coef,0);
  if (sumCoef === 0) return participants;                  // zero-division guard
  const results = participants.map((p,i)=>({...p, _idx:i,
    amount: Math.floor(pool*p.coef/sumCoef), _raw: pool*p.coef/sumCoef }));
  let remainder = pool - results.reduce((s,r)=>s+r.amount,0);
  const sorted = [...results].sort((a,b)=>(b._raw-b.amount)-(a._raw-a.amount));
  for (let i=0; i<remainder; i++) results[sorted[i]._idx].amount += 1;  // distribute remainder
  return results;
}
```

### 9.2 Example: 8H — 3-Layer Bonus
```
L1 Lương cố định (không cần engine)
L2 Thưởng quý: kích hoạt khi revenue≥80% plan; pool=revenue×7%;
   contribution=0.7×(kpi/10)+0.3×util; finalCoef=levelCoef×contribution;
   bonus=pool×(finalCoef/ΣfinalCoef)
L3 Profit share (chỉ khi biên năm≥15%): margin≥30%→×1.0 | 20-29%→×0.5 | <20%→0
```

---

# §10. Acceptance Criteria Template ("done correctly")

> A feature is "done" only when it passes its checklist. Use it as the acceptance criterion with stakeholders.

### 10.1 Template for `[PROJECT_NAME]`
```
**[Module name]:**
- [ ] [Correct behavior #1] / [#2]
- [ ] [Edge case: boundary condition → expected result]
- [ ] [Permission: who can, who is blocked at the API]
```
**Common-module patterns:**
- **Auth:** login works · token expiry → redirect, no crash · auth channel unlinked → guided error, no hang · old OTP → reject.
- **Settings:** seed correct, all fields · edit one field → log → dependent calcs update · only Admin edits, lower roles blocked at the API.
- **Engine:** unit test with spec example passes · input 0/null/undefined → safe (no NaN) · matches hand calc.
- **State machine:** state X → can't do action Y (403) · skipping ahead → rejected · correct side effects.
- **Dashboard:** locked not mixed with pipeline · each metric clicks to detail · over-threshold changes color.
- **Financial:** spec example correct · rounded parts sum to pool (≤1 unit/person) · excluded parties don't appear.
- **Port (if any):** every Logic Inventory item done/n-a · formula same-input→same-output · no hardcoded business data remains. (§B5)

### 10.2 Example: 8H
```
Settings: seed 14+2 BO đúng · sửa lương → log → daily_rate đúng · chỉ CEO/PM_TONG sửa.
Engine Manday: suggestedManday(5,'L3',0.6,100)===2.1 · allocationPct=0 → 1.0 (không NaN).
Vòng đời: pitching → revenue KHÔNG vào locked · signed → vào locked, mở phân bổ.
Bench: chỉ ≥L3 vào Bench Mode · bench completed không output → util_score=0.4.
Thưởng: coef 1.245, pool 122tr, Σcoef 15.5 → 9.8tr · CEO+BO không chia.
```

### 10.3 Master checklist before "done" (every feature)
- [ ] **§A6** Anti-hallucination: 0 open assumptions, every reference anchored, "tested" has logs.
- [ ] **§B5** (if porting) Logic Inventory clear, formula parity.
- [ ] **R1** Schema ↔ SQL ↔ types match, grepped old columns.
- [ ] **R2** Catch fail-closed (503), no mock 200.
- [ ] **R3** Router guard + frontend error check.
- [ ] **R4** Server-side role check on every sensitive endpoint, GET too.
- [ ] **R5** Logic in one place, constants from settings.
- [ ] **R6** Full CRUD run + DB inspected.
- [ ] **§C** Ran PLAN→VERIFY→SELF-REVIEW.

---

# §11. Stack Migration Checklist

> When changing stacks (Supabase→D1, REST→GraphQL, JS→TS), build a "what the old had / what the new must build" table. Don't assume "it probably has it too" (that's a form of hallucination — §A).

### 11.1 Template `[OLD_STACK]` → `[NEW_STACK]`
- [ ] Auth: old built-in → new self-built? (§3)
- [ ] Realtime: old websocket → new polling?
- [ ] Permission: old RLS → new self-check in middleware? (Rule 4)
- [ ] Data types: uuid()/now()/boolean/array → present in the new engine?
- [ ] API layer: old auto-generated (PostgREST/Hasura) → new hand-written?
- [ ] New-stack limits (throughput, storage, cold start) — don't assume infinite scale.

### 11.2 Example: 8H — Supabase → Cloudflare D1
| Supabase built-in | D1 must build |
|---|---|
| Auth (email/OTP/social) | OTP Telegram + JWT + sessions |
| Realtime websocket | Polling (React Query refetchInterval) |
| Row Level Security | can(user,roles) in middleware |
| uuid()/now() SQL | crypto.randomUUID() / new Date().toISOString() |
| Array/JSON native | TEXT + JSON.parse/stringify |
| BOOLEAN | INTEGER 0/1 + CHECK |

---

# APPENDIX P1 — Cloudflare Stack (Pages + Workers/Functions + D1)
## Answering: "If CI/CD is entirely on Cloudflare, which principles apply?"

> This is 8H's primary stack. This appendix concretizes the Universal principles for Cloudflare specifically.

### P1.1 Two CI/CD models on Cloudflare — pick the right one

There are **two** ways to deploy, with different principles:

**Model A — Cloudflare Git Integration ("build & deploy entirely on Cloudflare")**
Cloudflare pulls the repo, builds, and deploys on each push. No GitHub Actions needed.
- ✅ Principles that apply:
  - **Auto-Review runs as a Git pre-push hook or a mandatory local script**, because the Cloudflare build does *not* run your `scripts/auto-review.sh`. → The quality gate must sit **before push** (client-side), not in CI.
  - **Preview Deployments are the real test environment.** Each PR/branch → Cloudflare creates a preview URL. Use it to run integration tests (Rule 6) instead of localhost.
  - **Migrations DON'T auto-run on deploy.** Cloudflare deploys code, it does *not* auto-apply D1 migrations. → You need a separate `wrangler d1 migrations apply` step, manual or via a hook. **This is the classic data-loss/schema-drift trap** (violates Rule 1 if forgotten).
  - **Secrets via dashboard/`wrangler secret put`**, never committed. The webhook secret (Rule 4, C03) goes here.

**Model B — GitHub Actions → deploy to Cloudflare (tighter control)**
GitHub Actions runs tests + auto-review + `wrangler deploy`.
- ✅ Principles: use the `.github/workflows/auto-review.yml` from §0b. The `HALL-*` + score gates run in CI, blocking the merge before deploy. **Recommended for projects with money/multiple people.**

> **Decision:** small/solo project → Model A + pre-push hook. Project with financial business logic (like 8H Portfolio) → **Model B**, because you need the `HALL-*`/`PORT-*`/financial tests to be *mandatory* before deploy.

### P1.2 Pre-push hook for Model A (when CI/CD is entirely Cloudflare)
```bash
# .git/hooks/pre-push  (chmod +x)
#!/bin/bash
echo "Running auto-review before push to Cloudflare..."
bash scripts/auto-review.sh | tee review-report.txt
grep -q "HALLUCINATION:.*PASS" review-report.txt || { echo "❌ BLOCKED: hallucination check"; exit 1; }
SCORE=$(grep "OVERALL" review-report.txt | grep -oP "\d+(?=%)")
[ "$SCORE" -lt 80 ] && { echo "❌ BLOCKED: $SCORE% < 80%"; exit 1; }
npm test || { echo "❌ BLOCKED: tests failed"; exit 1; }
echo "✅ Passed. Pushing → Cloudflare will build & deploy."
```
> A hook is client-side (bypassable with `--no-verify`) → for a team, still prefer Model B. The hook is only a safety net for solo work.

### P1.3 Migration discipline on D1 (against schema drift — Rule 1)
```bash
wrangler d1 migrations create [DB] [name]   # creates a numbered file
wrangler d1 migrations apply [DB] --local   # test locally first
wrangler d1 migrations apply [DB] --remote  # apply to production — A SEPARATE step, deploy won't do it
wrangler d1 execute [DB] --remote --command ".schema users"  # verify the real schema (G1/G4 for §A)
```
> **D1 + §A golden rule:** before the agent writes SQL touching any column, run `.schema [table]` to *see it firsthand* — don't trust memory about the schema (blocks HX3).

### P1.4 The real entry point on Cloudflare (against Rule 7 misreads)
```bash
cat wrangler.toml          # main = "..." → the REAL worker file
cat package.json           # which file the deploy script runs
# Pages Functions: the functions/ folder MAPS by route; but if there's a separate worker/, read wrangler.toml to know which is active
wc -l worker/index.js functions/api/*.js   # the longer file is usually real (the 2560-vs-130-line lesson)
```

### P1.5 Cloudflare-specific gotchas (don't assume — §A)
- **`crypto.randomUUID()`** exists in the Workers runtime; but many Node APIs do NOT (no `fs`, limited `Buffer`). Don't assume Node APIs are present (HX4).
- **D1 has no `NOW()`/`uuid()` SQL-side** → generate at the app layer.
- **Bindings** (`env.DB`, `env.KV`) exist only if declared in `wrangler.toml`. Calling an undeclared binding = runtime error (check first — §A4).
- **Subrequest limit / CPU time limit** per request — don't assume a heavy loop will run.
- **D1 read-replica eventual consistency** — don't assume instant read-after-write in every region.

---

# APPENDIX P2 — Multi-environment (Multi-stack / Hybrid)
## When a project mixes Cloudflare + Supabase + Vercel + n8n + Node...

### P2.1 Root principle: "Each boundary is a contract that must be anchored"
The more stacks, the more boundaries → the more places the agent can fabricate (§A) and drop logic (§B). Rules:
- **Each service publishes a clear contract** (OpenAPI/types/schema). Other services call only through that contract, never guess (§A4).
- **One source of truth per data type.** Don't let both Supabase and D1 "own" the same entity. Declare the owner in §D.
- **Business logic isn't duplicated across services** (Rule 5 at system scale). The engine lives in one place; n8n/other workers call it, they don't recompute.

### P2.2 Multi-environment CI/CD
- **Each service has its own pipeline** but **shares one quality gate** (auto-review §0b) — placed at the repo root or the mono-repo workspace.
- **Deploy order follows dependency** (§1): migration/schema first → backend → frontend. Don't deploy a frontend that calls a backend endpoint not yet live (creates a production "ghost endpoint" — [HALL03]).
- **n8n workflows:** version-control via JSON export; treat each workflow as code (through §A — don't assume a node/credential exists; §B — an old workflow holds hidden logic, inventory it when editing).
- **A clear environment matrix:** dev/staging/prod for *each* service, separate env vars, no mixed secrets.

### P2.3 Multi-service integration checklist
- [ ] Every service-to-service call anchored on both ends of the contract? (§A4)
- [ ] Every entity has exactly ONE owner service? (declared in §D)
- [ ] No business logic duplicated across services? (Rule 5)
- [ ] Deploy order respects dependencies? (§1)
- [ ] Each service fails closed when a dependency fails? (Rule 2 — circuit breaker/timeout)
- [ ] Secrets separated per service + environment, not committed?
- [ ] Cross-service trace/log for debugging? (correlation id)

---

## APPENDIX P3 — Agent kickoff commands (copy-paste)

**Starting a new project / new session with any agent:**
```
Follow AGENT_RULES.md and BUILD_STANDARD.md in this repo.
1. Read §A (anti-hallucination) and §C (working protocol) first.
2. Read the filled-in OWNER_DEFAULTS and PROJECT_CONTRACT (§D) for stack/entry-point/conventions — do NOT guess.
3. Run Rule 7 Step 0 (config-first) to find the real entry point.
4. For this task: output a PLAN (§C1) before coding, and wait for my approval.
If unsure about anything: STOP and ASK (§C3), don't fabricate.
```

**Assigning a prototype port:**
```
This is a PORT task: prototype → production. Follow §B.
1. Read the prototype exhaustively: [path].
2. Output a full Logic Inventory (§B2), all 7 sections. Flag every ambiguity (section 7).
3. STOP and let me confirm the ambiguities before writing any production line.
4. Port in §B4 order (data→formulas→rules→UI). Formulas must pass a parity test (same input → same output).
```

**Acceptance before merge:**
```
Before reporting "done," run SELF-REVIEW (§C1 phase 4):
- §A6 anti-hallucination (0 open assumptions, every reference sourced, "tested" has logs)
- §0a 7-Rules checklist
- §B5 if it's a port
- §10.3 master acceptance
Paste the result of each. If anything FAILs or stays open: do NOT report "complete".
```

---

> **BUILD STANDARD v4.1** — an agent-agnostic, stack-agnostic engineering contract. English instructions; Vietnamese business examples.
> Companion: `AGENT_RULES.md` (the short, always-load tier). This file is the on-demand reference.
> It inherits v3.0 (the 7 Rules + Auto-Review from 8H Portfolio Manager) and adds two new pillars:
> **§A Anti-Hallucination** (stop the agent fabricating) and **§B Prototype→Production** (stop logic being dropped on port).
> Dedicated appendices for Cloudflare (P1) and multi-environment (P2).
> Any "why" about business → consult OWNER_DEFAULTS + PROJECT_CONTRACT (§D) + the project's spec/SRS/PRD. **Don't guess business logic. Don't fabricate technical facts. Don't drop logic on port.**
