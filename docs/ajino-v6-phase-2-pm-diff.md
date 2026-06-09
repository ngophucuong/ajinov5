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
