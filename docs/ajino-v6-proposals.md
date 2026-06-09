## Proposal 2026-06-09-1
**Owner:** Dev (AI agent)
**Status:** IMPLEMENTED
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
PENDING

---

## Proposal 2026-06-09-2
**Owner:** Dev (AI agent)
**Status:** IMPLEMENTED
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
PENDING

---

## Proposal 2026-06-09-3
**Owner:** Dev (AI agent)
**Status:** IMPLEMENTED
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
PENDING

---

## Proposal 2026-06-09-4
**Owner:** Dev (AI agent)
**Status:** PROPOSED
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
PENDING

---

## Proposal 2026-06-09-5
**Owner:** Dev (AI agent)
**Status:** PROPOSED
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
PENDING

---

## Proposal 2026-06-09-6
**Owner:** Dev (AI agent)
**Status:** PROPOSED
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
PENDING
