# Ajino v6 — Phase 0: Reality Baseline
**Created:** 2026-06-09
**Phase:** 0 — Reality Baseline
**Status:** PROPOSED
**Owner:** Dev (AI agent)

---

## 1. Database Row Counts

| Table | Rows |
|-------|------|
| `memory` | 166 |
| `captures` | 3 |
| `studio_documents` | 22 |
| `chat_messages` | 50 |
| `chat_sessions` | 32 |
| `users` | 3 |
| `audit_log` | 88 |

---

## 2. Memory Status Distribution

| Status | Count | % |
|--------|-------|---|
| `pending` | 126 | 76% |
| `canonical` | 38 | 23% |
| `archived` | 2 | 1% |

> ⚠️ **76% pending** — majority of memory is not injectable into chat responses.

---

## 3. Memory Source Tracking Audit

| Source | Total | Has `source_ref` | Missing `source_ref` |
|--------|-------|------------------|-----------------------|
| `studio` | 123 | 96 (78%) | 27 (22%) |
| `chat` | 35 | 30 (86%) | 5 (14%) |
| `manual` | 5 | 0 (0%) | 5 (100%) |
| `capture` | 3 | 0 (0%) | 3 (100%) |

> ⚠️ **GAP**: 22% of studio memories and 14% of chat memories have NULL `source_ref`. Manual and capture memories never have source_ref.

---

## 4. Embedding Status

| Status | Has Embedding | No Embedding |
|--------|:------------:|:------------:|
| `canonical` | 38 | 0 |
| `pending` | 32 | 94 |
| `archived` | 2 | 0 |

> ⚠️ **GAP**: 94/126 pending memories (75%) have NO embedding. Only canonical and archived rows have 100% embedding coverage.

---

## 5. Related Tables Status

### Captures
| Status | Count |
|--------|-------|
| `extracted` | 2 |
| `committed` | 1 |
| `processing` | 0 |
| `failed` | 0 |

### Studio Documents
| Compile Status | Count |
|---------------|-------|
| `draft` | 16 |
| `compiled` | 5 |
| `failed` | 1 |

---

## 6. Current Memory Write Paths

### 6.1 Chat → Memory (auto-extraction)
- **Path:** `orchestrator.run_pipeline()` → synthesis returns `memory_candidates`
- **Persist:** `main.py:_persist_chat_and_extract_memory()` → calls `memory_agent.store_memory(source='chat', source_ref=session_id)`
- **File:** `services/agno/main.py:667-681`
- **Status:** ✅ Working. source_ref linked to chat_session UUID.

### 6.2 Capture → Memory (manual commit)
- **Path:** `POST /capture/{id}/commit` → inserts extracted facts as memory
- **File:** `services/agno/main.py` (capture routes)
- **Status:** ⚠️ Need verification — only 3 captures exist.

### 6.3 Studio → Memory (compile)
- **Path:** `POST /studio/documents/{id}/compile` → splits doc into facts → stores as memory
- **File:** `services/agno/main.py` (studio compile routes)
- **Status:** ⚠️ 16/22 documents still in draft. 1 failed.

### 6.4 Manual Memory
- **Path:** `POST /memory` → `memory_agent.store_memory(source='manual')`
- **File:** `services/agno/main.py:965-1005`
- **Status:** ✅ Working. 5 manual memories exist.

---

## 7. Current Retrieval Path

```
orchestrator.run_pipeline()
  → Stage 3: Memory Retrieval
    → memory_agent.retrieve_memories(query=resolved_query, top_k=7)
      → get_embedding(query) → CF Workers AI @cf/baai/bge-m3 (mock fallback)
      → _vectorize_search() → PRIMARY (Vectorize agent-kb)
      → _pgvector_search() → FALLBACK (pgvector cosine, canonical only)
    → Returns [{id, content, score}]
  → memory_context formatted as markdown list
  → Injected into synthesis prompt
```

**Files:** `services/agno/agents/orchestrator.py:198-240`, `services/agno/agents/memory_agent.py:206-233`

**Filter:** Only `status='canonical'` memories are retrieved.

---

## 8. Current Chat Answer Generation Path

```
POST /chat/stream
  → orchestrator.run_pipeline()
    → Stage 0: followup_resolver → resolved_query
    → Stage 1: query_complexity() → fast/deep mode
    → Stage 2: decompose (deep only)
    → Stage 3: web_search (Serper) + memory_retrieval (pgvector)
    → Stage 4: synthesis (DeepSeek Pro/Flash via LiteLLM)
      → system prompt + conversation_history + dialogue_state + memory_context + search_results
  → SSE stream: trace → token → done
  → _persist_chat_and_extract_memory()
    → INSERT chat_messages (user + assistant)
    → UPDATE chat_sessions
    → INSERT audit_log
    → store_memory candidates (best-effort)
```

**Files:** `services/agno/main.py:740-818`, `services/agno/agents/orchestrator.py:62-270`, `services/agno/agents/synthesis.py`

---

## 9. Current Facts Model

**Current state:** Flat text memory. Each row is a free-text `content` string with no structured fields for facts/entities/relations.

**Schema truth (`services/agno/db/schema.sql`):**
```sql
memory (
  id UUID,
  content TEXT,              -- free-text fact
  embedding vector(1024),     -- bge-m3 embedding
  status pending|canonical|archived,
  source chat|capture|studio|manual,
  source_ref UUID,            -- links to source row
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  decay_at TIMESTAMPTZ,       -- set on approval (now + 730 days)
  metadata JSONB DEFAULT '{}', -- unused
  created_at TIMESTAMPTZ
)
```

**Available fields usable for structured memory without schema change:**
- `metadata` (JSONB) — can store structured fact fields
- `decay_at` — already present but no decay logic
- `content` — free text (current)
- `status` — lifecycle state machine

---

## 10. Decision Log

| ID | Decision | Status |
|----|----------|--------|
| D-P0-001 | Use `memory.metadata` JSONB for structured fact fields (not new table) | PROPOSED |
| D-P0-002 | Embeddings exist for all canonical, missing for 75% of pending — must backfill | PROPOSED |
| D-P0-003 | `source_ref` missing for 22% studio, 14% chat — needs audit | PROPOSED |
| D-P0-004 | Advisory Protocol goes into `synthesis.py` system prompt | PROPOSED |
| D-P0-005 | Freshness uses existing `decay_at` column + cron job | PROPOSED |
| D-P0-006 | Entity-aware retrieval uses `metadata` JSONB field, no new table | PROPOSED |

---

## 11. Verification Commands

```bash
# Row counts
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -c \
  "SELECT 'memory', count(*) FROM memory UNION ALL SELECT 'captures', count(*) FROM captures ..."

# Source tracking audit
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -c \
  "SELECT source, source_ref IS NOT NULL as has_ref, count(*) FROM memory GROUP BY source, has_ref"

# Embedding coverage
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -c \
  "SELECT embedding IS NOT NULL as has_embedding, status, count(*) FROM memory GROUP BY has_embedding, status"
```

---

*Phase 0 baseline complete. Ready for PM review and Phase 1 planning.*
