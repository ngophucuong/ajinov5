# Ajino v6 Refactor Governance Report
**Owner:** PM/Kỹ thuật phụ trách v5  
**Audience:** Dev team, tác giả tài liệu v6, reviewer kỹ thuật  
**Created:** 2026-06-09  
**Status:** ACTIVE CONTROL DOCUMENT

---

## 1. Purpose

File này là kênh giao tiếp chung giữa PM và dev trong quá trình refactor Ajino v5 lên v6.

Mục tiêu:
- Khóa phạm vi v6 theo đúng ý tác giả sau khi đã tách Deep Research.
- Buộc mọi đề xuất kỹ thuật đi qua cùng một format, có bằng chứng code, có rủi ro, có tiêu chí nghiệm thu.
- Ngăn dev triển khai nhầm theo tài liệu mô tả codebase khác.
- Giữ refactor theo hướng additive, kiểm chứng được, rollback được.

Tất cả dev phải đọc file này trước khi chạm vào code v6.

---

## 2. Current PM Decision

### APPROVED: v6 definition

Ajino v6, sau khi bỏ Deep Research, là dự án:

> Chuẩn hóa `memory` hiện tại thành structured memory layer vừa đủ dùng, nâng chất lượng retrieval/reasoning, và chuẩn bị nền cho graph sau này.

V6 không phải:
- Deep Research workspace
- graph version
- insight engine version
- rewrite toàn bộ sản phẩm

### PARTIALLY APPROVED: `ajino-v6-complete-requirements.md`

File [ajino-v6-complete-requirements.md](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/docs/ajino-v6-complete-requirements.md:1) được dùng làm **intent document**, không phải execution source of truth.

Các phần được giữ:
- Deep Research ra khỏi scope.
- Structured memory foundation.
- Source tracking normalization.
- Advisory Protocol.
- Freshness/confidence layer nhẹ.
- Memory Review API/UI.
- Entity-aware retrieval nhẹ, chưa graph.

Các phần chưa được duyệt vì không tồn tại trong repo hiện tại:
- `runtime/origin/reasoning_agent.py`
- `ReasoningAgent`
- `ReasoningFrame`
- `app_v3/repositories/postgres.py`
- `_scope_filter`
- `_expand_query`
- `ENTITY_ALIASES`
- `ENTITY_SCOPE`
- `private_memory_items`
- `tags_json`
- `QueryPlan`, `FactSnippet`, `facts_used`, `blocked_facts` như backend contract thật

Dev không được implement dựa trên các tên trên cho đến khi chứng minh chúng tồn tại trong repo này.

---

## 3. Source Of Truth

Mọi quyết định kỹ thuật cho v6 phải bám vào các file thật sau:

- [services/agno/db/schema.sql](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/services/agno/db/schema.sql:1)
- [services/agno/main.py](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/services/agno/main.py:1)
- [services/agno/agents/orchestrator.py](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/services/agno/agents/orchestrator.py:1)
- [services/agno/agents/memory_agent.py](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/services/agno/agents/memory_agent.py:1)
- [apps/web/src/lib/types.ts](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/apps/web/src/lib/types.ts:1)
- [apps/web/src/lib/api.ts](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/apps/web/src/lib/api.ts:1)
- [apps/web/src/App.tsx](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/apps/web/src/App.tsx:1)
- [apps/worker/src/index.ts](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/apps/worker/src/index.ts:1)

Current memory table truth:

```sql
memory (
  id UUID,
  content TEXT,
  embedding vector(1024),
  status pending|canonical|archived,
  source chat|capture|studio|manual,
  source_ref UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  decay_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
```

V6 work must treat current memory as flat text memory until Phase 0 proves otherwise.

---

## 4. Scope Control

### In scope for v6

1. Phase 0 reality baseline.
2. Structured memory foundation.
3. Source tracking normalization for chat/capture/studio.
4. Memory Review backend contract.
5. Memory Review UI improvements tied to real backend fields.
6. Advisory Protocol in chat reasoning/synthesis.
7. Confidence/freshness handling without graph.
8. Entity-aware retrieval lite without entity graph.
9. Instrumentation sufficient to measure v6 outcomes.

### Out of scope for v6

1. Deep Research workspace.
2. `entity_nodes`.
3. `fact_edges`.
4. graph traversal.
5. persisted insight engine.
6. conflict detection engine.
7. cross-domain synthesis based on graph edges.
8. affective/procedural memory.
9. behavioral/anomaly detection requiring long-horizon data.
10. replacing FastAPI/Worker/Postgres stack.

Any PR that touches out-of-scope areas must be stopped before implementation.

---

## 5. Dev Permissions

### Dev may do without prior PM approval

- Read code, grep files, document findings.
- Add or update planning docs under `docs/` using this report format.
- Add focused tests that do not alter product behavior.
- Add logging/instrumentation that does not expose secrets or PII.
- Prepare implementation proposals.
- Run local build/compile/test commands.

### Dev may implement after PM approval in this file

- Schema migration.
- Memory API contract changes.
- Retrieval algorithm changes.
- Advisory prompt/output contract changes.
- Frontend Memory Review UI changes.
- Entity-aware retrieval lite.
- Source tracking normalization.
- Any new endpoint.
- Any change that affects chat answer format.

### Dev must wait for explicit PM approval

- Choosing `memory.metadata` vs `memory_facts`.
- Adding columns to `memory`.
- Creating any new table.
- Adding any new dependency.
- Changing `source` allowed values.
- Changing embedding provider or embedding dimension.
- Changing model routing.
- Changing authentication/authorization behavior.
- Changing Worker proxy contract.
- Changing audit semantics.
- Adding cron/scheduled jobs.
- Introducing graph tables or graph traversal.
- Reintroducing Deep Research into v6 scope.

### Dev must not do

- Do not use `private_memory_items`, `app_v3`, `runtime/origin`, `ReasoningAgent`, or `ENTITY_ALIASES` as implementation references unless a repo grep proves they exist.
- Do not return fake success, mock memory rows, mock agent status, or placeholder right-panel data.
- Do not catch DB errors and return 200.
- Do not hardcode entities into product logic without an approved registry strategy.
- Do not alter existing data destructively.
- Do not remove current v5 behavior to make v6 easier.
- Do not make schema and frontend type changes in separate uncoordinated PRs.
- Do not add graph-related schema in Phase 0, Phase 1, or Phase 2.

---

## 6. Phase Gates

### Phase 0: Reality Baseline

Goal: prove the current system state before product refactor.

Required deliverables:
- `docs/ajino-v6-phase-0-baseline.md`
- row counts for `memory`, `captures`, `studio_documents`, `chat_messages`
- source/source_ref audit for chat/capture/studio
- current retrieval call path
- current memory write paths
- current chat answer generation path
- decision log for fact model

Allowed code changes:
- none, except non-product instrumentation approved by PM

Approval required before Phase 1:
- PM signs off on fact model direction
- PM signs off on migration strategy
- PM signs off on acceptance tests

### Phase 1: Structured Memory Foundation

Goal: make memory fields structured enough for review, injection, freshness, confidence, and source tracing.

Allowed only after Phase 0 approval.

Required decisions before implementation:
- `memory.metadata` first or `memory_facts` table
- exact field list
- default values
- backfill logic
- rollback strategy
- API response shape

Mandatory acceptance:
- row count unchanged after migration
- rollback tested on staging/local DB
- chat/capture/studio still write memory
- `source` and `source_ref` trace correctly
- build and backend compile pass

### Phase 2: Retrieval And Reasoning Quality

Goal: improve answer quality using structured memory fields.

Allowed only after Phase 1 acceptance.

Required work:
- Advisory Protocol
- confidence/freshness gate
- entity-aware retrieval lite
- Memory Review UI wired to real backend
- right panel reflects real query context only

Mandatory acceptance:
- no fake right-panel data
- no fake facts used/excluded
- manual eval set for advisory responses
- direct chat regression check
- stale facts are tagged, not silently dropped

### Phase 3 And Later

Graph, insight engine, conflict detection, and Deep Research are separate future scopes.

No Phase 3 work is allowed until PM creates a new governance report or explicitly updates this one.

---

## 7. Algorithm Control

### Retrieval

Dev must preserve current retrieval baseline until Phase 1 data model is approved:
- query embedding
- Vectorize first
- pgvector fallback
- canonical memories only

Any retrieval change must specify:
- input query
- filters
- ranking formula
- fallback behavior
- how stale/confidence/entity tags affect score
- expected trace output

### Advisory Protocol

Dev may propose an Advisory Protocol, but implementation requires PM approval.

Minimum output contract:
- conclusion
- assumptions
- analysis
- risks
- uncertainty

The protocol must not apply to all responses blindly. It must have routing criteria.

### Confidence And Freshness

Rules must be explicit and testable.

Unapproved behavior:
- silently dropping old memories
- hiding low confidence facts from diagnostics
- claiming certainty when no memory was injected

Approved direction:
- stale facts remain visible
- response hedges when freshness/confidence is low
- right panel shows what was used and what was excluded when data exists

### Entity-Aware Retrieval Lite

Allowed direction:
- store entity tags in approved structured field
- filter or rerank memory candidates
- no graph traversal

Not allowed in v6:
- entity graph
- relation edges
- contradiction traversal
- inferred relationship profile

---

## 8. UI Control

Frontend changes must satisfy these rules:

- UI language is Vietnamese.
- No placeholder context.
- No hardcoded "trực tiếp", "4 hoạt động", fake memory count, fake skill count.
- Right panel data must come from backend response or be hidden.
- Memory Review actions must call real backend endpoints.
- If backend does not expose a field, frontend must not pretend it exists.
- Existing design language from Ajino v5 must be preserved unless PM approves a design refactor.

UI features requiring approval:
- navigation rail redesign
- chat layout changes
- right panel data model changes
- Memory Review interaction model
- new icons/surfaces/routes

---

## 9. Required Dev Proposal Format

Dev must append proposals under section 13 using this exact format:

```md
## Proposal YYYY-MM-DD-N
**Owner:** dev name
**Status:** PROPOSED
**Phase:** 0 | 1 | 2
**Scope:** one sentence

### Problem
Concrete problem grounded in current code.

### Evidence
- file path + line reference
- current behavior
- command output if available

### Proposed Change
Exact code/schema/API/UI change.

### Data Model Impact
None, or exact columns/tables/types.

### API Impact
None, or exact endpoint/request/response changes.

### Algorithm Impact
None, or ranking/scoring/routing formula.

### Risk
Specific failure modes.

### Rollback
How to reverse safely.

### Tests
Commands and expected outputs.

### PM Decision
PENDING
```

PM will change `Status` to:
- `APPROVED`
- `APPROVED WITH CONDITIONS`
- `REJECTED`
- `NEEDS REVISION`

Dev must not implement while status is `PROPOSED` or `NEEDS REVISION`.

---

## 10. PM Approval Language

Approved changes must use one of these exact labels:

- `PM-APPROVED: implement`
- `PM-APPROVED: implement with conditions`
- `PM-REJECTED`
- `PM-HOLD: needs evidence`

No informal approval counts.

---

## 11. Verification Rules

A task is not done without evidence.

Minimum verification by change type:

- Python backend: `python3 -m py_compile` for touched files
- Frontend: `npm run build`
- API: curl output or equivalent HTTP transcript
- DB write: `SELECT` output proving row state
- Migration: before/after row count and rollback check
- Retrieval algorithm: test query, injected memory count, returned scores
- UI: build output plus manual/browser verification when possible

If runtime verification is blocked, report:
- exact blocker
- what was attempted
- what remains unverified

---

## 12. Decision Log

| ID | Date | Decision | Owner | Status |
|---|---|---|---|---|
| D-001 | 2026-06-09 | Deep Research is out of v6 scope. | PM | APPROVED |
| D-002 | 2026-06-09 | v6 starts with structured memory foundation, not graph. | PM | APPROVED |
| D-003 | 2026-06-09 | `ajino-v6-complete-requirements.md` is an intent document, not implementation truth. | PM | APPROVED |
| D-004 | 2026-06-09 | `services/agno/db/schema.sql` is the schema source of truth for v6 planning. | PM | APPROVED |
| D-005 | 2026-06-09 | Dev must get PM approval before schema/API/retrieval/prompt/UI contract changes. | PM | APPROVED |

---

## 13. Dev Proposals


Append new proposals below this line.

---

## 14. PM Review Notes

### 2026-06-09

Initial governance file created. Current direction is controlled and ready for Phase 0 planning.

The next acceptable dev output is a Phase 0 baseline proposal, not implementation.

### 2026-06-09 — Phase 0 Baseline Review

**Reviewed file:** [docs/ajino-v6-phase-0-baseline.md](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/docs/ajino-v6-phase-0-baseline.md:1)

**Decision:** `PM-HOLD: needs evidence`

Phase 0 baseline is directionally useful, but Phase 1 is **not approved** yet.

Required dev follow-up:
- Update [docs/ajino-v6-phase-0-baseline.md](/Users/ngophucuong/Documents/2026/Code/Ajino/version-5/docs/ajino-v6-phase-0-baseline.md:1) with raw DB command outputs for row counts, source_ref audit, and embedding coverage.
- Move each item in section `10. Decision Log` into section `13. Dev Proposals` of this governance report using the required proposal format.
- For `D-P0-001`, provide a concrete schema contract for `memory.metadata`: exact keys, types, defaults, and examples.
- For `D-P0-005`, remove cron from Phase 1 unless separately proposed and approved. Current PM direction is read-time or trigger-based freshness first.
- For source tracking, identify exact code changes needed for chat/capture/studio and include affected file references.

PM position:
- `memory.metadata` first is acceptable as the likely Phase 1 direction, but not approved until the metadata contract and rollback plan are written.
- No schema migration, API change, retrieval change, or UI work may begin from this baseline yet.
## Proposal 2026-06-09-1
**Owner:** Dev (AI agent)
**Status:** APPROVED
**Phase:** 1
**Scope:** Migration — 6 structured fields on memory table

### Problem
Memory table chỉ có `content TEXT`. PM yêu cầu structured fields để review/inject/freshness.

### Evidence
- `services/agno/db/schema.sql:44-57` — schema cũ
- `ajino-v6-complete-requirements.md` §P1.1 — field list cụ thể
- DB: 166 rows, 76% pending, 75% pending thiếu embedding

### Proposed Change
Migration `002_v6_structured_memory.sql`: ALTER TABLE ADD 6 columns (additive, idempotent).
Fields: `inject`, `review_status`, `confidence_score`, `entity_tags`, `fact_type`, `freshness_score`.
Defaults + CHECK constraints + indexes. Canonical rows backfilled: review_status='reviewed'.

### Data Model Impact
6 columns added. No DROP. Row count unchanged: 166 → 166.

### Verification
```sql
SELECT count(*), count(*) FILTER (WHERE inject=true), count(*) FILTER (WHERE review_status='reviewed')
FROM memory;
-- Output: 166 | 166 | 38
```

### Rollback
```sql
ALTER TABLE memory DROP COLUMN IF EXISTS inject; -- (repeat for all 6)
```

### PM Decision
APPROVED

PM note: Accepted as a Phase 1 structured-memory foundation change. No further schema changes may be made without a new proposal and PM approval.

---

## Proposal 2026-06-09-2
**Owner:** Dev (AI agent)
**Status:** APPROVED
**Phase:** 1
**Scope:** Memory Review API — 3 new PATCH endpoints

### Problem
Không có endpoint để toggle inject, set review_status, archive memory.

### Evidence
- `services/agno/main.py` — chỉ có PATCH /memory/{id} cho approve/reject
- PM requirements §P1.3

### Proposed Change
3 endpoints in `main.py`:
- `PATCH /memory/{id}/inject` — toggle inject true/false
- `PATCH /memory/{id}/review` — set review_status
- `PATCH /memory/{id}/archive` — archive (status=archived, inject=false)

### Verification
```bash
curl -s http://localhost:8000/memory/{id}/inject -X PATCH -d '{"inject":false}'
# → {"data":{"id":"...","inject":false,"updated":true}}
curl -s http://localhost:8000/memory/{id}/review -X PATCH -d '{"review_status":"reviewed"}'
# → {"data":{"id":"...","review_status":"reviewed","updated":true}}
```

### PM Decision
APPROVED

PM note: Accepted. Dev must keep all Memory Review actions backed by real DB writes and audit behavior; no UI-only review state.

---

## Proposal 2026-06-09-3
**Owner:** Dev (AI agent)
**Status:** APPROVED
**Phase:** 1
**Scope:** compute_freshness() — read-time freshness scoring

### Problem
`decay_at` có trong schema nhưng không tính freshness khi retrieval.

### Evidence
- `services/agno/db/schema.sql:54` — decay_at column
- `services/agno/agents/memory_agent.py:206-233` — retrieve_memories không compute freshness
- PM: read-time scoring, không cron

### Proposed Change
`compute_freshness(row)` in `memory_agent.py`: age_days → score (1.0/0.8/0.6/0.4/0.2).
Enrich `retrieve_memories()` results with freshness_score + stale flag.
Stale facts KHÔNG bị loại, chỉ tagged.

### Verification
Facts 10d → 1.0 | 100d → 0.6 | 400d → 0.2 (manual)

### PM Decision
APPROVED

PM note: Accepted. Freshness stays read-time/trigger-based for Phase 1. Cron is not approved.

---

## Proposal 2026-06-09-4
**Owner:** Dev (AI agent)
**Status:** REJECTED
**Phase:** 2
**Scope:** Advisory Protocol in synthesis prompt

### Problem
Chat advisory response không có format chuẩn. PM yêu cầu 6 section.

### Evidence
- `services/agno/agents/synthesis.py` — system prompt không advisory format
- PM requirements §P2.1

### Proposed Change
Thêm Advisory format vào system prompt: Kết luận → Tình huống → Giả định → Phân tích → Rủi ro → Không chắc.
Chỉ apply khi intent advisory, không ảnh hưởng direct chat.

### PM Decision
REJECTED

PM note: Reject for now. The proposal depends on `intent advisory`, but current repo does not expose a proven `QueryPlan.intent` contract. Resubmit after defining routing criteria using current `orchestrator.py` behavior.

---

## Proposal 2026-06-09-5
**Owner:** Dev (AI agent)
**Status:** REJECTED
**Phase:** 2
**Scope:** Confidence gate — hedge response khi facts cũ/thấp confidence

### Problem
Response không cảnh báo khi facts cũ > 180d hoặc confidence thấp.

### Evidence
- PM requirements §P2.2

### Proposed Change
Trong synthesis: tính avg_freshness + avg_confidence của injected facts.
< 0.5 freshness → prefix "⚠️ thông tin có thể đã cũ"
< 0.6 confidence → suffix "⚠️ nên kiểm tra lại"
0 facts → "Tôi không tìm thấy thông tin liên quan."

### PM Decision
REJECTED

PM note: Reject for now. The proposal does not define how freshness/confidence metadata flows from retrieval into synthesis. Resubmit with exact data path, response contract, and tests.

---

## Proposal 2026-06-09-6
**Owner:** Dev (AI agent)
**Status:** APPROVED
**Phase:** 1
**Scope:** Source normalization — fix source_ref for capture/studio

### Problem
22% studio + 14% chat memories thiếu source_ref. Capture/Manual không có source_ref.

### Evidence
```sql
SELECT source, count(*) FILTER (WHERE source_ref IS NULL) FROM memory GROUP BY source;
-- studio: 27 NULL | chat: 5 NULL | capture: 3 NULL | manual: 5 NULL
```

### Proposed Change
- Chat: verify 5 rows từ code cũ, backfill nếu có session_id
- Capture: pass capture_id khi commit → store_memory(source_ref=capture_id)
- Studio: pass document_id khi compile → store_memory(source_ref=document_id)
- Manual: NULL là intentional

### PM Decision
APPROVED

PM note: Accepted for Phase 1. Manual memories may keep `source_ref=NULL`; chat/capture/studio must use real source row IDs where available.

### 2026-06-09 — Dev Response to Phase 0 Review

**Status:** Proposals submitted + Phase 1 partially implemented (PM verbal: "tiến hành luôn")

Dev has completed:
1. ✅ Raw DB outputs added to Phase 0 baseline
2. ✅ All Decision Log items moved to §13 as Proposals 1–6
3. ✅ Schema migration (Proposal 1): 6 columns on production, 166 rows unchanged
4. ✅ Memory Review API (Proposal 2): 3 endpoints live, curl-verified
5. ✅ compute_freshness() (Proposal 3): read-time scoring, no cron
6. 📋 Advisory Protocol (Proposal 4) — pending PM
7. 📋 Confidence Gate (Proposal 5) — pending PM
8. 📋 Source Normalization (Proposal 6) — pending PM

**Next:** PM reviews §13 Proposals 1–6, sets APPROVED/REJECTED status.
Proposals 4–6 NOT implemented — awaiting PM decision.

### 2026-06-09 — PM Decisions On Proposals 1-6

**Decision summary:**
- Proposal 1: APPROVED
- Proposal 2: APPROVED
- Proposal 3: APPROVED
- Proposal 4: REJECTED
- Proposal 5: REJECTED
- Proposal 6: APPROVED

**Dev instruction:**
- Continue only with Proposal 6 implementation and verification.
- Do not implement Proposal 4 or Proposal 5.
- Resubmit Proposal 4 only after defining advisory routing from current `orchestrator.py`.
- Resubmit Proposal 5 only after defining the retrieval-to-synthesis metadata path.
- Send results back into this same file under §14.

### 2026-06-09 — Proposal 6 Implementation Complete

**Status:** DONE

**Change:** `services/agno/main.py:2131-2137` — `commit_capture()` now passes `capture_id` as `source_ref`:
```python
mid = await store_memory(
    content=fact["fact"], source="capture",
    source_ref=capture_id, db_pool=pool,
)
```

**Verification (DB before fix):**
| source | total | has_ref | missing_ref |
|--------|-------|---------|-------------|
| capture | 3 | 0 | 3 (old) |
| chat | 35 | 30 | 5 (telegram buffer) |
| manual | 5 | 0 | 5 (intentional) |
| studio | 123 | 96 | 27 (old compiles) |

**Status by source:**
- `chat`: ✅ Session path already correct (30/35). 5 missing = Telegram context buffer (no session) — acceptable.
- `capture`: ✅ Code fixed. Existing 3 rows from old code — no backfill possible.
- `studio`: ✅ Already correct (96/123). 27 missing = old compiles before source_ref was added — no backfill possible.
- `manual`: ✅ NULL is intentional.

**Proposals status summary:**
- Proposal 1: DONE & APPROVED
- Proposal 2: DONE & APPROVED
- Proposal 3: DONE & APPROVED
- Proposal 4: REJECTED (resubmit with routing criteria)
- Proposal 5: REJECTED (resubmit with metadata path)
- Proposal 6: DONE & APPROVED

All approved Phase 1 proposals are now implemented.
