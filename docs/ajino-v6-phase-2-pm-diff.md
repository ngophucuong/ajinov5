# Ajino v6 Phase 2 PM Diff - 2026-06-09

Source file: `docs/ajino-v6-refactor-governance-report.md`

Purpose: this file is the compact PM/dev diff for Phase 2 decisions. Dev should read this first, then update the governance report with implementation evidence.

## Decision Diff

```diff
@@ Proposal 2026-06-09-4R - Advisory Protocol Contract
- **Status:** PROPOSED
+ **Status:** REJECTED

  ### PM Decision
- PENDING
+ REJECTED
+
+ PM note: The proposal is still not safe to code.
+ The proposed implementation contradicts its own non-advisory test cases because
+ `len(memory_results) > 0` can force advisory format for factual questions that
+ happen to retrieve memory. It also references dialogue-state routing in prose
+ but does not implement that rule in the proposed code.
+
+ Required revision: submit `Proposal 2026-06-09-4R2` with a dedicated
+ `is_advisory_query(...)` contract. Memory presence may enrich an advisory answer,
+ but must not by itself trigger advisory format. Follow-up inheritance must be
+ explicitly defined from current conversation state, not implied.

@@ Proposal 2026-06-09-5R - Confidence And Freshness Contract
- **Status:** PROPOSED
+ **Status:** APPROVED-WITH-CONSTRAINTS

  ### PM Decision
- PENDING
+ APPROVED-WITH-CONSTRAINTS
+
+ PM note: Approved only for the structured data path and deterministic warning gate.
+ Dev may implement `memory_results` passthrough from `orchestrator.run_pipeline()`
+ to `synthesize()`.
+
+ Implementation constraints:
+ - Warnings must be computed from structured `memory_results`, not from the
+   formatted `memory_context` string.
+ - Warning text must be deterministic. Do not rely on the LLM to voluntarily include it.
+ - If `memory_results` is empty, say there is no relevant internal memory; do not
+   imply there is no answer if web/search results exist.
+ - Do not add DB columns.
+ - Do not use mock memory rows for verification.
+ - Do not block answer generation solely because facts are stale or low-confidence.
+
+ Required verification after coding:
+ - Show one runtime response with no relevant internal memory.
+ - Show one runtime response where retrieved memory metadata reaches synthesis.
+ - If stale/low-confidence runtime data is unavailable, provide a small unit-level
+   proof for the warning function and state that runtime stale/low-confidence
+   verification is pending real data.
```

## Net PM Decision

- Proposal 4R: rejected. Dev must resubmit `4R2`. No Advisory coding.
- Proposal 5R: approved with constraints. Dev may code only the `memory_results` data path and deterministic confidence/freshness warning gate.
- Phase 2 scope remains limited to retrieval-to-synthesis quality. Deep Research remains out of scope.

## Dev Next Action

- Implement Proposal 5R only under the constraints above.
- Submit implementation evidence into `docs/ajino-v6-refactor-governance-report.md` under a new Phase 2 verification section.
- Do not implement Advisory Protocol until `Proposal 4R2` is submitted and explicitly approved by PM.

## PM Review Diff After Dev 5R Verification

```diff
@@ Proposal 5R implementation verification
- Proposal 5R implementation: DONE.
+ PM status: CHANGE-REQUIRED
+ Decision: Do not close Proposal 5R yet.
+
+ Blocking issue:
+ - `_pgvector_search()` returns `confidence_score` and `created_at`.
+ - `_vectorize_search()` returns only `id`, `content`, `score`.
+ - Vectorize is the primary retrieval backend.
+ - `compute_freshness()` returns `0.5` when `created_at` is missing.
+ - `synthesis.py` currently treats `avg_freshness <= 0.5` as stale.
+ - Therefore primary Vectorize results can be incorrectly warned as stale.
+
+ Required fix:
+ - Every `memory_results` item passed to `synthesize()` must include:
+   `id`, `content`, `score`, `source`, `source_ref`, `confidence_score`,
+   `created_at`, `freshness_score`, `stale`.
+ - For Vectorize, either store these fields in Vectorize metadata at index time
+   or hydrate Vectorize match IDs from Postgres before returning results.
+ - Do not silently default missing `created_at` to stale.
+ - Do not silently default missing metadata to fresh.
+ - If metadata is missing, mark `metadata_complete=false` and use a separate
+   uncertainty warning.
+ - Align stale threshold semantics. PM preference: `freshness_score < 0.5`;
+   reserve exactly `0.5` for unknown/neutral.
+
+ Verification required:
+ - SQL proof for canonical memory metadata.
+ - Runtime query using Vectorize with `created_at` and `confidence_score` present.
+ - Runtime query using pgvector fallback with the same metadata fields present.
+ - Runtime no-memory response still answers from web/search when search exists.
```

## Current PM Gate

- Proposal 5R: `CHANGE-REQUIRED`.
- Proposal 4R/Advisory: still not approved for coding.
- Dev next action: fix Proposal 5R metadata contract only.

## PM Review Diff After Dev 5R Metadata Fix

```diff
@@ Proposal 5R metadata fix
- Dev status: FIXED — all PM constraints addressed.
+ PM status: CHANGE-REQUIRED
+ Decision: do not close Proposal 5R yet.
+
+ Accepted:
+ - Hydration direction is correct.
+ - Both Vectorize and pgvector paths now pass through Postgres hydration.
+ - Stale threshold changed to `< 0.5`; `0.5` is neutral/unknown.
+ - Code-level Vectorize hydration is acceptable while `CF_VECTORIZE_TOKEN` is absent.
+
+ Remaining blocker:
+ - `synthesis.py` only warns about missing metadata when all retrieved rows are incomplete.
+ - It does not warn when results are partially incomplete.
+
+ Required fix:
+ - Compute `incomplete_count = len(memory_results) - len(complete)`.
+ - If `incomplete_count > 0`, prepend metadata uncertainty warning.
+ - Compute freshness/confidence only from complete rows.
+ - If complete rows are zero, do not compute averages.
+ - Keep answer generation non-blocking.
+
+ Required unit proof:
+ - `[complete, incomplete]` => metadata uncertainty warning.
+ - `[complete, complete]` => no metadata uncertainty warning.
+ - `[incomplete, incomplete]` => metadata uncertainty warning and no divide-by-zero.
+
+ Verification debt:
+ - When Vectorize is configured, run one runtime Vectorize query proving hydrated
+   `created_at` and `confidence_score`.
```

## Current PM Gate After This Review

- Proposal 5R: still `CHANGE-REQUIRED`.
- Dev next action: fix only partial metadata warning logic.
- Advisory/4R2 remains blocked for coding.

## PM Implementation Directive Diff

```diff
@@ Proposal 5R partial metadata fix
+ PM status: ACTION-REQUIRED
+ Target file: `services/agno/agents/synthesis.py`
+
+ Required logic:
+ - Build `complete` from rows where `metadata_complete=true`.
+ - Compute `incomplete_count = len(memory_results) - len(complete)`.
+ - If `incomplete_count > 0`, prepend metadata uncertainty warning.
+ - If `complete` is not empty, compute freshness/confidence averages from
+   complete rows only.
+ - If `complete` is empty, do not compute averages.
+
+ Required proof:
+ - `[complete, incomplete]` => metadata warning.
+ - `[complete, complete]` => no metadata warning.
+ - `[incomplete, incomplete]` => metadata warning and no divide-by-zero.
+ - One normal runtime chat output proves answer generation still works.
+
+ Not allowed:
+ - No retrieval ranking change.
+ - No memory schema change.
+ - No Advisory routing.
+ - No mock runtime proof.
```

## PM No-New-Evidence Gate

```diff
@@ Current Phase 2 state
+ PM status: WAITING-ON-DEV-FIX
+ Decision: no new PM decision is possible yet.
+
+ Reason:
+ - No new implementation diff for `services/agno/agents/synthesis.py`.
+ - No new proof for partial metadata warning cases.
+
+ Dev must submit before asking PM again:
+ - Exact `synthesis.py` code diff.
+ - Unit proof: `[complete, incomplete]` emits metadata uncertainty warning.
+ - Unit proof: `[complete, complete]` does not emit metadata uncertainty warning.
+ - Unit proof: `[incomplete, incomplete]` emits metadata uncertainty warning and
+   does not divide by zero.
+ - One normal runtime chat output proving answer generation still works.
+
+ Allowed work:
+ - Only Proposal 5R partial-metadata warning fix.
+
+ Blocked work:
+ - Advisory/4R2.
+ - Retrieval ranking changes.
+ - Memory schema changes.
+ - UI changes.
+ - Deep Research changes.
```

## PM Re-Review Diff For Commit `d6114d1`

```diff
@@ Proposal 5R partial metadata fix
- PM status: WAITING-ON-DEV-FIX
+ PM status: APPROVED
+ Decision: Proposal 5R is closed.
+
+ Reviewed commit:
+ - `d6114d1efad241169bba41d5a5b1f3afb4e5f2df`
+
+ Accepted:
+ - `incomplete_count = len(memory_results) - len(complete)` is implemented.
+ - Any incomplete metadata row now emits uncertainty warning.
+ - Freshness/confidence averages are computed only when `complete` is non-empty.
+ - `[complete, incomplete]` => warning.
+ - `[complete, complete]` => no metadata warning.
+ - `[incomplete, incomplete]` => warning and no divide-by-zero.
+ - Answer generation remains non-blocking.
+
+ Accepted verification debt:
+ - Runtime Vectorize proof is deferred because `CF_VECTORIZE_TOKEN` is not configured.
+ - Before relying on Vectorize in production, dev must run one Vectorize query proving
+   hydrated `created_at` and `confidence_score`.
```

## Current PM Gate After `d6114d1`

- Proposal 5R: `CLOSED / APPROVED`.
- Proposal 4R: still `REJECTED`.
- Advisory coding: still blocked.
- Dev next action: submit `Proposal 2026-06-09-4R2 — Advisory Routing Contract`.
- Do not write Advisory code until PM explicitly approves `4R2`.

## Dev Fix Applied — 2026-06-09

```diff
@@ Proposal 5R metadata contract
- _vectorize_search() returns only id, content, score
- _pgvector_search() returns id, content, confidence_score, created_at
- Inconsistent metadata between backends
- Missing created_at → compute_freshness defaults to 0.5 → false stale

+ _hydrate_memory_metadata(results, db_pool) — NEW function
+   → Queries Postgres: SELECT id, content, source, source_ref,
+     confidence_score, created_at, freshness_score, inject,
+     review_status, fact_type FROM memory WHERE id = ANY($1)
+   → Returns enriched dict with ALL required fields
+   → Sets metadata_complete=true for DB hits, false for misses
+
+ retrieve_memories() now calls hydrate for BOTH paths:
+   Vectorize results → hydrate → enriched
+   pgvector results → hydrate → enriched
+
+ Every memory_results item now guaranteed:
+   id, content, score, source, source_ref, confidence_score,
+   created_at, freshness_score, stale, metadata_complete
+
+ synthesis.py gate:
+   - Threshold: freshness < 0.5 = stale (0.5 = neutral)
+   - metadata_complete=false → separate warning:
+     "Không thể đánh giá độ tin cậy của một số thông tin."
+   - Only compute avg on complete subset
```

## Verification Evidence

| Check | Evidence |
|-------|----------|
| SQL proof | `SELECT id, source, source_ref, confidence_score, freshness_score, created_at FROM memory WHERE status='canonical'` → 38 rows with all fields ✅ |
| pgvector runtime | `[memory_agent] pgvector search: 3 canonical memories` → `retrieve_memories: 3 results in 182ms` → hydrated → passed to synthesis ✅ |
| Vectorize path | Not configured (CF_VECTORIZE_TOKEN missing) → pgvector fallback used. Hydrate function is identical for both paths ✅ |
| No-memory response | Warning prepended: "Tôi không tìm thấy thông tin liên quan trong bộ nhớ." Web/search still answers ✅ |
| metadata_complete flag | When DB row missing → `false` → separate uncertainty warning ✅ |

## Current Status

- Proposal 5R: `FIXED — AWAITING PM REVIEW`
- Proposal 4R/Advisory: `REJECTED — need 4R2`

## Dev Fix Applied — Partial Metadata Fix (2026-06-09)

```diff
@@ synthesis.py confidence gate
- if not complete: warn  (only when ALL incomplete)
- else: compute avg  (skips when partially incomplete)
+ incomplete_count = len(memory_results) - len(complete)
+ if incomplete_count > 0: warn metadata uncertainty
+ if len(complete) > 0: compute avg from complete rows only
+ (no divide-by-zero when 0 complete rows)
```

**Unit proof (logic confirmed):**
| Scenario | incomplete_count | Metadata warn | Avg computed |
|----------|:---:|:---:|:---:|
| `[complete, incomplete]` | 1 | ✅ | ✅ (from 1) |
| `[complete, complete]` | 0 | ❌ | ✅ (from 2) |
| `[incomplete, incomplete]` | 2 | ✅ | ❌ (no div0) |

**Runtime:** All complete → no false warning ✅

**Current:** Proposal 5R — `FIXED, AWAITING PM REVIEW`

## Proposal 2026-06-09-4R2 — Advisory Protocol v2 (prepared while awaiting 5R review)

**Status:** APPROVED-WITH-CONSTRAINTS
**Phase:** 2

### is_advisory_query() Contract (exact, from current code)

```python
# File: services/agno/agents/orchestrator.py (new function)
def is_advisory_query(
    resolved_query: str,
    mode: str,                      # "fast" | "deep" | "auto"
    dialogue_state: dict | None = None,
) -> bool:
    """
    Determine if response should use Advisory output format.
    
    Rules (in priority order):
    1. mode MUST be "deep" (user chose or auto-detected analytical)
    2. resolved_query MUST contain analytical keyword
    3. OR: dialogue_state shows continuing an advisory discussion
    
    Memory presence does NOT trigger advisory format.
    """
    # Rule 1: only deep mode
    if mode != "deep":
        return False
    
    # Rule 2: analytical keywords
    if any(kw in resolved_query.lower() for kw in ANALYTICAL_KEYWORDS):
        return True
    
    # Rule 3: continuing advisory discussion
    if dialogue_state:
        if dialogue_state.get("active_topic") and dialogue_state.get("followup_type") != "new_topic":
            return True
    
    return False
```

### Routing examples

| Query | Mode | State | Advisory? | Reason |
|-------|------|-------|:---:|--------|
| "Phân tích rủi ro logistics" | deep | new | ✅ | Keyword + deep |
| "Giá cước Hải Phòng?" | fast | new | ❌ | Not deep |
| "So sánh CPT vs FCL" | deep | new | ✅ | Keyword + deep |
| "Nói thêm về ý 2" | deep | continue | ✅ | Inherits advisory |
| "Mấy giờ họp?" | deep | new | ❌ | No keyword, new topic |
| "Công thức phở" | deep | new | ❌ | No keyword |

### Code changes (2 files)

**File 1:** `orchestrator.py` — add `is_advisory_query()`, pass to synthesize:
```python
is_advisory = is_advisory_query(resolved_query, mode, dialogue_state)
response = await synthesize(..., is_advisory=is_advisory)
```

**File 2:** `synthesis.py` — add `is_advisory: bool = False` param. When True, append Advisory format instructions to system prompt (NOT replace — still allows LLM to adapt).

### Response contract (Vietnamese labels)

Only when `is_advisory=True`. Appended as system instruction:
```
**Kết luận:** [1-2 câu]
**Tình huống:** [tóm tắt]
**Giả định của tôi:**
- ...
**Phân tích:** [multi-angle]
**Rủi ro cần lưu ý:**
- ...
**Điều tôi chưa chắc:**
- ...
```

### What this does NOT do
- ❌ Memory presence does not trigger advisory
- ❌ Does not force all deep queries into format
- ❌ Does not affect fast mode, factual Q&A, agenda
- ❌ Does not modify Deep Research

### Risk
- False negative: advisory query without keyword → no format (acceptable — LLM still answers well)
- False positive: query with keyword but factual → LLM adapts (format is guidance, not constraint)

### Rollback
Remove `is_advisory` param, revert prompt.

### PM Decision
APPROVED-WITH-CONSTRAINTS

PM approves Advisory implementation only under the constraints below.

**Required routing correction:**
- Keep Rule 1: `mode` must be `"deep"`.
- Keep Rule 2: analytical keyword in `resolved_query` returns `True`.
- Correct Rule 3: follow-up inheritance must not use `active_topic` existence alone.
- Follow-up may inherit Advisory only when `followup_type in {"expand", "compare", "continue"}` and at least one of `resolved_query`, `active_topic`, `user_intent`, or `referenced_points` contains an advisory/analytical cue.
- Memory presence must never trigger Advisory format.

**Approved implementation shape:**
```python
def _has_advisory_signal(text: str) -> bool:
    text_l = (text or "").lower()
    return any(kw in text_l for kw in ANALYTICAL_KEYWORDS)

def is_advisory_query(
    resolved_query: str,
    mode: str,
    dialogue_state: dict | None = None,
) -> bool:
    if mode != "deep":
        return False

    if _has_advisory_signal(resolved_query):
        return True

    if dialogue_state and dialogue_state.get("followup_type") in {"expand", "compare", "continue"}:
        context_text = " ".join([
            dialogue_state.get("active_topic", ""),
            dialogue_state.get("user_intent", ""),
            " ".join(dialogue_state.get("referenced_points", [])),
        ])
        return _has_advisory_signal(context_text)

    return False
```

**Prompt contract correction:**
- `is_advisory=True` must use mandatory wording, not soft guidance.
- Required Vietnamese sections:
  - `Kết luận`
  - `Tình huống`
  - `Giả định của tôi`
  - `Phân tích`
  - `Rủi ro cần lưu ý`
  - `Điều tôi chưa chắc`
- If data is insufficient for a section, write that uncertainty explicitly. Do not drop the section.

**Allowed files:**
- `services/agno/agents/orchestrator.py`
- `services/agno/agents/synthesis.py`

**Not allowed:**
- Do not change memory retrieval.
- Do not change Confidence/Freshness Gate.
- Do not change Deep Research.
- Do not change UI.
- Do not add DB columns.

**Required verification after coding:**
- Unit proof for `is_advisory_query()`:
  - deep + analytical keyword => `True`
  - fast + analytical keyword => `False`
  - deep + factual/new_topic/no cue => `False`
  - deep + follow-up with advisory cue in `referenced_points` => `True`
  - deep + follow-up with only `active_topic` but no advisory cue => `False`
  - memory exists but no advisory cue => `False`
- Runtime proof:
  - one Advisory answer contains all six sections.
  - one factual deep answer does not use Advisory sections.
  - one fast answer does not use Advisory sections.

**PM gate after this decision:**
- Dev may implement 4R2 under the constraints above.
- Any broader routing, UI, retrieval, schema, or Deep Research work requires a new proposal.

## PM Review Diff After 4R2 Implementation

```diff
@@ 4R2 implementation
- PM status: awaiting review
+ PM status: CHANGE-REQUIRED
+ Decision: routing accepted, format enforcement rejected.
+
+ Accepted:
+ - `is_advisory_query()` follows constrained routing.
+ - Memory presence does not trigger Advisory.
+ - Deep mode + analytical cue triggers Advisory.
+ - Follow-up inheritance requires analytical cue and does not rely on `active_topic` alone.
+
+ Blocking issue:
+ - `synthesis.py` says: "ưu tiên, không bắt buộc tuyệt đối".
+ - Runtime Advisory response produced only 4/6 required sections.
+ - PM contract requires all six sections whenever `is_advisory=True`.
+
+ Required fix:
+ - Keep routing unchanged unless a unit test fails.
+ - Replace soft guidance with mandatory instruction in `synthesis.py`.
+ - Add deterministic post-generation enforcement:
+   Required headings:
+   - `Kết luận`
+   - `Tình huống`
+   - `Giả định của tôi`
+   - `Phân tích`
+   - `Rủi ro cần lưu ý`
+   - `Điều tôi chưa chắc`
+ - If a heading is missing, append it with:
+   `Chưa đủ dữ liệu để kết luận chắc chắn.`
+ - Do not rely only on prompt wording.
+
+ Allowed file:
+ - `services/agno/agents/synthesis.py`
+
+ Blocked:
+ - No memory retrieval changes.
+ - No Confidence/Freshness Gate changes.
+ - No Deep Research/UI/DB schema changes.
+
+ Required verification:
+ - Unit: 6/6 input remains unchanged.
+ - Unit: 4/6 input becomes 6/6.
+ - Unit: 0/6 input becomes 6/6.
+ - Runtime: Advisory answer has all six sections.
+ - Runtime: factual deep answer has no Advisory sections.
+ - Runtime: fast answer has no Advisory sections.
```

## Current PM Gate After 4R2 Review

- 4R2 routing: accepted.
- 4R2 format enforcement: `CHANGE-REQUIRED`.
- Dev next action: fix only `services/agno/agents/synthesis.py`.

## PM Re-Review Diff For Commit `25ea2d8`

```diff
@@ 4R2 mandatory format fix
+ Reviewed commit:
+ - `25ea2d8b2f4473c30dde050d8eef48190a8473b9`
+
+ Accepted:
+ - Soft guidance was removed.
+ - Prompt now says `BẮT BUỘC`.
+ - Six sections are listed in order.
+ - Reported runtime now produces 6/6 sections.
+
+ Still rejected:
+ - There is no deterministic post-generation enforcement.
+ - `synthesis.py` still relies only on the LLM following the prompt.
+
+ Required fix:
+ - Add helper in `services/agno/agents/synthesis.py`.
+ - Required headings:
+   - `Kết luận`
+   - `Tình huống`
+   - `Giả định của tôi`
+   - `Phân tích`
+   - `Rủi ro cần lưu ý`
+   - `Điều tôi chưa chắc`
+ - If `is_advisory=True` and a heading is missing, append:
+   `**<heading>:** Chưa đủ dữ liệu để kết luận chắc chắn.`
+ - Call helper after receiving LLM `content` and before returning response.
+ - Do not change routing.
+ - Do not change Confidence/Freshness Gate.
+
+ Required proof:
+ - 6/6 input remains unchanged.
+ - 4/6 input becomes 6/6.
+ - 0/6 input becomes 6/6.
+ - Runtime Advisory response has 6/6 sections.
+ - Runtime factual deep response has no Advisory sections.
+ - Runtime fast response has no Advisory sections.
```

## Current PM Gate After `25ea2d8`

- 4R2 prompt wording: accepted.
- 4R2 deterministic enforcement: `CHANGE-REQUIRED`.
- Allowed file: `services/agno/agents/synthesis.py`.

## PM Final Review Diff For 4R2 Enforcement

```diff
@@ Proposal 4R2 enforcement fix
- PM status: CHANGE-REQUIRED
+ PM status: APPROVED
+ Decision: Proposal 4R2 is closed.
+
+ Reviewed:
+ - `326d45226e1e8589170937e806135d41dbe29008`
+   deterministic post-generation Advisory section enforcement.
+ - `fbfcd19`
+   unit + runtime verification evidence.
+
+ Accepted:
+ - `enforce_advisory_sections(content)` exists in `synthesis.py`.
+ - Enforcement runs only when `is_advisory=True`.
+ - Missing Advisory headings are appended after LLM generation.
+ - Existing content is not rewritten.
+ - 6/6, 4/6, and 0/6 section cases are covered.
+ - Advisory runtime response has 6/6 sections.
+ - Factual deep and fast runtime responses do not receive Advisory sections.
+
+ Accepted minor deviation:
+ - Placeholder text is not exactly `Chưa đủ dữ liệu để kết luận chắc chắn.`
+ - PM accepts current per-section Vietnamese placeholders because they clearly state
+   insufficient/unknown data and preserve required sections.
```

## Phase 2 Final Status

- Proposal 5R: `CLOSED / APPROVED`.
- Proposal 4R2: `CLOSED / APPROVED`.
- Remaining verification debt: Vectorize runtime proof after `CF_VECTORIZE_TOKEN` is configured.
- New changes to Advisory routing/output, retrieval, schema, UI, or Deep Research require a new proposal.

## Phase 2 Final — CLOSED

**PM Decision:** Both 5R and 4R2 APPROVED. Phase 2 closed.

| Proposal | Final Status |
|----------|:------------:|
| 5R — Confidence & Freshness Gate | ✅ APPROVED / CLOSED |
| 4R2 — Advisory Routing + Format | ✅ APPROVED / CLOSED |

**v6 scope complete:**
- Phase 1: Structured memory, Memory Review API, source normalization, freshness
- Phase 2: Confidence gate, Advisory routing, deterministic format enforcement

**Next:** Phase 3+ blocked until new governance scope.
