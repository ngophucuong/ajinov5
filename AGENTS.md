# AGENTS.md — Ajino v5
> Load this file at the start of every session. Companion to AGENT_RULES.md and PROJECT_CONTRACT.yaml.
> UI reference: `design/ajino_v5_ui.html` — open and read it before touching any frontend file.
> When this file conflicts with instincts: this file wins.

---

## 0. Session Start Checklist

Before the first keystroke of any session:
- [ ] Read `PROJECT_CONTRACT.yaml` (stack, schemas, hard constraints)
- [ ] Read `AGENT_RULES.md` commandments 1–14
- [ ] Run `docker compose ps` — verify all services are UP before coding
- [ ] Identify which module you are touching (§4 below) and read its acceptance criteria
- [ ] If touching frontend: open `design/ajino_v5_ui.html` in browser — it is truth

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| Name | Ajino v5 |
| Type | Private Executive Intelligence Platform |
| Tenant model | 1 customer = 1 isolated box — no shared infra |
| Domain (CEO UI) | `ajinov5.cuong.ngo` |
| Admin path | `ajinov5.cuong.ngo/admin` |
| Auth | Passwordless OTP via Telegram only |
| UI language | Vietnamese — every label, toast, button, error message |
| Code language | English — all code, comments, SQL, commit messages |
| UI reference | `design/ajino_v5_ui.html` — pixel-faithful implementation required |

---

## 2. Architecture

```
Browser / Telegram Mini App
        │
Cloudflare Workers  (auth JWT verification, rate limit, thin routing)
        │
Cloudflare Tunnel   (no public IP on VPS — all traffic via tunnel)
        │
        ├── PostgreSQL    :5432  (pgvector extension, container riêng)
        ├── Agno Runtime  :8000  (orchestration + skill registry)
        ├── LiteLLM       :4000  (LLM routing + cost tracking)
        └── Messaging GW  :3000  (Telegram bot)

Cloudflare services (always-on, no VPS):
  Workers AI   → embedding @cf/baai/bge-m3 (1024 dim, Vietnamese-capable)
  Vectorize    → PRIMARY vector search (agent-kb, 1024d cosine)
  R2           → file storage + daily backup
  AI Gateway   → llm-observatory (LLM call logging + caching, wraps LiteLLM)
  KV           → OTP sessions (TTL 300s), rate limit counters

  pgvector     → fallback + structured queries (ivfflat, lists=100)

External APIs:
  Serper       → web search (agent skill)
  DeepSeek API → LLM provider via LiteLLM
```

**Request flow — chat message:**
```
POST /api/chat/message
  → Worker: verify JWT from cookie/header
  → Worker: rate limit check (KV)
  → Tunnel → Agno :8000 /chat
    → Agno: Decompose (DeepSeek Flash)
    → Agno: Memory retrieval (pgvector hybrid search)
    → Agno: Agentic Loop (may call Serper, may call more LLM)
    → Agno: Synthesis (DeepSeek Pro if Deep mode)
    → Agno: Write audit_log row
    → Agno: Extract memory candidates → pending
  → SSE stream back to browser
```

---

## 3. Services, Ports & Health Checks

```yaml
agno:
  internal_port: 8000
  health: GET http://localhost:8000/health  → {"status":"ok","db":"ok","version":"..."}
  start: docker compose up agno
  logs: docker compose logs -f agno

litellm:
  internal_port: 4000
  health: GET http://localhost:4000/health  → {"status":"healthy"}
  start: docker compose up litellm

messaging_gateway:
  internal_port: 3000
  health: GET http://localhost:3000/health  → {"status":"ok","telegram":"connected"}
  start: docker compose up messaging-gateway

cloudflared:
  no port — outbound tunnel only
  health: docker compose logs cloudflared | grep "Registered tunnel connection"
  start: docker compose up cloudflared
```

**Verify all services before writing code:**
```bash
docker compose ps
# All 4 services must show "Up" — if any is Down, fix it first
curl -s http://localhost:8000/health | jq .
curl -s http://localhost:4000/health | jq .
curl -s http://localhost:3000/health | jq .
```

---

## 4. Data Schemas — Single Source of Truth

All SQL lives in `services/agno/db/schema.sql`. Never write a column that isn't there.

### 4.1 users
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'ceo', -- 'ceo' | 'admin'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 chat_sessions
```sql
CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  title      TEXT,
  tags       TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 chat_messages
```sql
CREATE TABLE chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content        TEXT NOT NULL,
  thinking_trace JSONB,            -- [{step,agent,duration_ms,result}]
  model_used     TEXT,             -- 'deepseek-pro' | 'deepseek-flash'
  reasoning_mode TEXT,             -- 'auto' | 'fast' | 'deep'
  tokens_used    INTEGER,
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.4 memory
```sql
CREATE TABLE memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL,
  embedding     vector(1024),       -- bge-m3 via CF Workers AI
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','canonical','archived')),
  source        TEXT NOT NULL CHECK (source IN ('chat','capture','studio','manual')),
  source_ref    UUID,               -- chat_messages.id or captures.id
  approved_at   TIMESTAMPTZ,
  approved_by   UUID REFERENCES users(id),
  decay_at      TIMESTAMPTZ,        -- NULL = no decay; set on approval
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON memory (status);
```

### 4.5 captures
```sql
CREATE TABLE captures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('text','link','image')),
  content         TEXT,
  url             TEXT,
  raw_file_r2_key TEXT,
  extracted_facts JSONB,           -- [{fact: TEXT, confidence: FLOAT}]
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','extracted','committed','failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.6 studio_documents
```sql
CREATE TABLE studio_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,        -- Markdown source
  r2_key       TEXT,                 -- if uploaded file
  compile_status TEXT NOT NULL DEFAULT 'draft'
               CHECK (compile_status IN ('draft','compiling','compiled','failed')),
  memory_ids   UUID[] DEFAULT '{}',  -- memory rows created from this doc
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.7 audit_log
```sql
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  action        TEXT NOT NULL,        -- 'chat.message', 'memory.approve', 'capture.commit', etc.
  resource_type TEXT,
  resource_id   UUID,
  llm_model     TEXT,
  llm_tokens    INTEGER,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- APPEND-ONLY: no UPDATE, no DELETE ever
-- Every agent action must write a row here
```

### 4.8 skills
```sql
CREATE TABLE skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,   -- 'web_search', 'memory_retrieval', etc.
  description TEXT,
  version     TEXT NOT NULL DEFAULT '1.0.0',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.9 Cloudflare KV namespaces
```
KV_OTP_SESSIONS (agent-otp-sessions):
  id:   ffa7e82c943b4cbdb427d184a40e3989
  key:   "otp:{telegram_id}"
  value: JSON { otp: "123456", user_id: UUID|null, expires_at: ISO8601 }
  ttl:   300 seconds

KV_RATE_LIMIT (agent-rate-limits):
  id:   1ad9127dbf174f978c376b0ae91ba424
  key:   "rl:{user_id}:{window_minute}"
  value: integer (request count)
  ttl:   60 seconds
```

---

## 5. API Contracts

All endpoints return `{ data: ..., error: null }` on success, `{ data: null, error: { code, message } }` on failure.
Never return `{ ok: true }` without data. Never return 200 on error.

### 5.1 Auth — Cloudflare Worker

```
POST /auth/otp/request
  Body: { telegram_id: number }
  → sends 6-digit OTP to user's Telegram chat via bot
  → stores in KV_OTP_SESSIONS TTL 300s
  → 200 { data: { expires_in: 300 } }
  → 429 if more than 3 requests in 5 minutes for same telegram_id

POST /auth/otp/verify
  Body: { telegram_id: number, otp: string }
  → verifies against KV
  → on success: issues JWT (httpOnly cookie, 24h), deletes KV entry
  → 200 { data: { user: { id, name, role } } }
  → 401 { error: { code: "OTP_INVALID" } }
  → 401 { error: { code: "OTP_EXPIRED" } }

POST /auth/logout
  → clears httpOnly cookie
  → 200 { data: null }
```

**JWT payload:**
```json
{ "sub": "user_uuid", "role": "ceo|admin", "telegram_id": 123456, "iat": 0, "exp": 0 }
```
JWT_SECRET lives in Worker secrets (`wrangler secret put JWT_SECRET`). Never hardcode.

### 5.2 Chat — Worker proxies to Agno

```
POST /api/chat/sessions
  Auth: JWT required
  Body: { first_message: string, reasoning_mode: "auto"|"fast"|"deep" }
  → creates chat_sessions row
  → starts chat pipeline
  → 200 { data: { session_id: UUID } }
  → streams SSE on GET /api/chat/sessions/{id}/stream

GET /api/chat/sessions
  Auth: JWT required
  → 200 { data: [{ id, title, tags, updated_at }] }

GET /api/chat/sessions/{id}/messages
  Auth: JWT required, must own session
  → 200 { data: [{ id, role, content, thinking_trace, model_used, reasoning_mode, created_at }] }

POST /api/chat/sessions/{id}/messages
  Auth: JWT required, must own session
  Body: { content: string, reasoning_mode: "auto"|"fast"|"deep" }
  Response: SSE stream
    event: trace  data: { step, agent, status, duration_ms }
    event: token  data: { delta: string }
    event: done   data: { message_id: UUID, memory_candidates: [{content, confidence}] }
    event: error  data: { code, message }
```

### 5.3 Memory — Worker proxies to Agno

```
GET /api/memory?status=pending|canonical|archived&limit=20&offset=0
  Auth: JWT required
  → 200 { data: [{ id, content, status, source, created_at, approved_at }] }

PATCH /api/memory/{id}
  Auth: JWT required
  Body: { status: "canonical"|"archived", content?: string }
  → updates memory row; sets approved_at/approved_by if canonical
  → writes audit_log row
  → re-embeds if content changed
  → 200 { data: { id, status, updated: true } }

POST /api/memory
  Auth: JWT required
  Body: { content: string, source: "manual" }
  → inserts with status=pending
  → triggers embedding via CF Workers AI
  → 201 { data: { id, status: "pending" } }
```

### 5.4 Capture

```
POST /api/capture
  Auth: JWT required
  Body: { type: "text"|"link"|"image", content?: string, url?: string }
  For image: multipart/form-data with file field
  → inserts captures row (status=processing)
  → queues async fact extraction (Agno /extract-facts)
  → 202 { data: { id, status: "processing" } }

GET /api/capture?status=processing|extracted|committed&limit=20&offset=0
  Auth: JWT required
  → 200 { data: [...] }

POST /api/capture/{id}/commit
  Auth: JWT required
  → takes extracted_facts → inserts into memory (status=pending)
  → sets capture status=committed
  → 200 { data: { memory_ids: [UUID, ...] } }
```

### 5.5 Studio

```
GET /api/studio/documents
  Auth: JWT required
  → 200 { data: [{ id, title, compile_status, updated_at }] }

POST /api/studio/documents
  Auth: JWT required
  Body: { title: string, content: string } OR multipart with .md file
  → 201 { data: { id, title, compile_status: "draft" } }

PUT /api/studio/documents/{id}
  Auth: JWT required
  Body: { title?: string, content?: string }
  → 200 { data: { id, updated: true } }

POST /api/studio/documents/{id}/compile
  Auth: JWT required
  → splits document into facts → embeds each → inserts memory (status=pending)
  → sets compile_status=compiled
  → 200 { data: { memory_ids: [UUID, ...], count: N } }

DELETE /api/studio/documents/{id}
  Auth: JWT required
  → soft delete (add deleted_at column) — never hard delete
  → 200 { data: null }
```

### 5.6 Console

```
GET /api/console/agents
  Auth: JWT required, role: admin
  → 200 { data: [{ name, status: "active"|"idle", last_called_at, call_count_today }] }

GET /api/console/audit?limit=50&offset=0&action=&from=&to=
  Auth: JWT required, role: admin
  → 200 { data: [{ id, user_id, action, resource_type, resource_id, llm_model, llm_tokens, created_at }] }

GET /api/console/skills
  Auth: JWT required
  → 200 { data: [{ name, enabled, version, call_count_session }] }
```

### 5.7 Admin (role: admin only)

```
POST /admin/memory/bulk-approve
  Body: { ids: [UUID, ...] }
  → 200 { data: { approved: N, failed: 0 } }

GET /admin/audit/export?from=ISO&to=ISO
  → CSV download of audit_log rows

GET /admin/settings
  → 200 { data: { version, tenant_id, db_connected, pgvector_connected } }
```

---

## 6. Feature Modules & Acceptance Criteria

### M1 — Auth (OTP via Telegram)

**Done when:**
- [ ] `POST /auth/otp/request` sends a real Telegram message containing a 6-digit OTP
- [ ] OTP expires after 300s: verify by requesting, waiting 301s, then trying to verify → must get 401 OTP_EXPIRED
- [ ] 3 rapid requests for same `telegram_id` → 3rd gets 429
- [ ] Verified OTP → httpOnly JWT cookie set, `SELECT * FROM users WHERE telegram_id=...` returns a row
- [ ] Unverified/expired cookie → `GET /api/chat/sessions` returns 401
- [ ] Logout → cookie cleared, next request returns 401

**Self-test commands:**
```bash
# Request OTP
curl -s -X POST http://localhost:8787/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"telegram_id": YOUR_TELEGRAM_ID}' | jq .
# Check your Telegram — OTP message must appear

# Verify OTP
curl -s -c cookies.txt -X POST http://localhost:8787/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"telegram_id": YOUR_TELEGRAM_ID, "otp": "XXXXXX"}' | jq .

# Verify user in DB
docker exec ajino-postgres psql -U ajino -d ajino -c \
  "SELECT id, telegram_id, role, created_at FROM users;"
```

---

### M2 — Chat with 3-stage pipeline

**Done when:**
- [ ] Message with `reasoning_mode: "auto"` → SSE stream delivers `trace` events showing Decompose → Search → Synthesis steps
- [ ] `reasoning_mode: "fast"` → model_used in DB is `deepseek-flash`
- [ ] `reasoning_mode: "deep"` → model_used is `deepseek-pro`
- [ ] Each trace step has `duration_ms > 0` (not 0 or null — means it actually ran)
- [ ] After response: `SELECT extracted_facts FROM memory WHERE source='chat' AND status='pending'` returns rows
- [ ] Audit log has a row for the message: `SELECT * FROM audit_log WHERE action='chat.message'`
- [ ] UI renders thinking trace collapsible, markdown content, hover actions exactly as in `design/ajino_v5_ui.html`

**Self-test:**
```bash
# Send a chat message (after auth)
curl -s -b cookies.txt -N -X POST http://localhost:8787/api/chat/sessions \
  -H "Content-Type: application/json" \
  -d '{"first_message":"Phân tích thị trường logistics Q3","reasoning_mode":"deep"}' \
  --no-buffer
# SSE events must appear: trace, token, done
# done event must contain memory_candidates array

# Verify DB writes
docker exec ajino-postgres psql -U ajino -d ajino -c \
  "SELECT role, LEFT(content,80), model_used, reasoning_mode, latency_ms
   FROM chat_messages ORDER BY created_at DESC LIMIT 5;"
```

---

### M3 — Memory Review

**Done when:**
- [ ] Pending memories visible in GET /api/memory?status=pending
- [ ] PATCH with status=canonical → `approved_at` and `approved_by` set in DB
- [ ] Approved memory → embedding generated via CF Workers AI `@cf/baai/bge-m3`
- [ ] `SELECT count(*) FROM memory WHERE embedding IS NULL AND status='canonical'` returns 0
- [ ] PATCH with edited content → re-embedding triggered → embedding updated
- [ ] Archived memory → `status='archived'`, never returned in default list
- [ ] Admin UI shows pending badge count accurately (no cached count)

**Self-test:**
```bash
# List pending
curl -s -b cookies.txt http://localhost:8787/api/memory?status=pending | jq '.data | length'

# Approve one
curl -s -b cookies.txt -X PATCH http://localhost:8787/api/memory/MEMORY_UUID \
  -H "Content-Type: application/json" \
  -d '{"status":"canonical"}' | jq .

# Verify embedding written
docker exec ajino-postgres psql -U ajino -d ajino -c \
  "SELECT id, status, approved_at, embedding IS NOT NULL as has_embedding
   FROM memory WHERE id='MEMORY_UUID';"
```

---

### M4 — Capture

**Done when:**
- [ ] Text capture → inserts row, status=processing, then transitions to extracted after LLM fact extraction
- [ ] Link capture → fetches page content via Agno, extracts facts
- [ ] `extracted_facts` JSONB not empty after extraction
- [ ] Commit → each fact becomes a memory row with status=pending
- [ ] Verify: `SELECT count(*) FROM memory WHERE source='capture' AND source_ref=CAPTURE_UUID`

**Self-test:**
```bash
curl -s -b cookies.txt -X POST http://localhost:8787/api/capture \
  -H "Content-Type: application/json" \
  -d '{"type":"text","content":"Đối tác Hồng Kông yêu cầu tăng SLA lên 99.5% từ Q4"}' | jq .

sleep 5  # wait for async extraction

curl -s -b cookies.txt http://localhost:8787/api/capture?status=extracted | jq '.'
```

---

### M5 — Studio

**Done when:**
- [ ] Upload Markdown file → document row created, r2_key set, file in R2 bucket
- [ ] Compile → each paragraph/section becomes a pending memory with source=studio
- [ ] `compile_status` updates through: draft → compiling → compiled (or failed with error in metadata)
- [ ] Memory count matches paragraph count (±1 for front matter)

---

### M6 — Console & Audit

**Done when:**
- [ ] Agent status reflects real Agno agent activity (not hardcoded)
- [ ] Audit log shows real rows from M2, M3, M4 tests
- [ ] Pagination works: offset=0 and offset=50 return different rows
- [ ] Export endpoint returns valid CSV

---

### M7 — Telegram Operations

**Done when:**
- [ ] Bot responds to `/start` command
- [ ] Sending a message to bot → creates chat_message in active session (or prompts to start session)
- [ ] Scheduled reminder → Telegram message arrives at specified time
- [ ] OTP messages sent (M1) → arrive within 10 seconds

---

### M8 — UI faithful to reference

**Done when:**
- [ ] Side-by-side comparison with `design/ajino_v5_ui.html`:
  - Logo A: Exo 2, 26px, font-weight 600, color #00c8a4, no serifs
  - 3-column layout: 230px left / flex-1 middle / 222px right
  - Agent network SVG: 6 nodes, animated particles on active edges
  - Send button: circular 52px, orbital rings `.sr1` and `.sr2`, teal gradient
  - Reasoning toggle: Auto / Manual with depth sub-toggle
  - Thinking trace: collapsible, shows real steps from M2 trace data
  - Memory panel right: canonical (gold badge) vs pending (red badge)
- [ ] Telegram Mini App detection: `window.Telegram?.WebApp` → collapse sidebars

---

## 7. Environment Variables

All secrets from environment — never hardcoded. Verify each exists before running:

```bash
# Cloudflare Worker secrets (wrangler secret put NAME)
JWT_SECRET                  # min 32 chars random string
TELEGRAM_BOT_TOKEN          # from @BotFather
CF_ACCOUNT_ID               # Cloudflare account
CF_API_TOKEN                # Cloudflare API token with Workers AI read permission
KV_OTP_NAMESPACE_ID         # ffa7e82c943b4cbdb427d184a40e3989 (agent-otp-sessions)
KV_RATE_LIMIT_NAMESPACE_ID  # 1ad9127dbf174f978c376b0ae91ba424 (agent-rate-limits)

# Cloudflare resources (đã tạo)
R2_STORAGE_BUCKET           # agent-storage (APAC)
R2_BACKUPS_BUCKET           # agent-backups (APAC)
AI_GATEWAY_NAME             # llm-observatory
  rate_limit: 1000 req/60s
  cache_ttl:   3600s
  logging:     ON
VECTORIZE_INDEX             # agent-kb (1024d, cosine) — PRIMARY vector search

# VPS .env (loaded by Docker Compose, gitignored)
POSTGRES_URL=postgresql://ajino:CHANGEME@localhost:5432/ajino
LITELLM_MASTER_KEY=sk-CHANGEME
DEEPSEEK_API_KEY=           # from platform.deepseek.com
SERPER_API_KEY=             # from serper.dev
CF_WORKERS_AI_GATEWAY_URL=  # https://gateway.ai.cloudflare.com/v1/.../
CF_WORKERS_AI_TOKEN=        # CF token with Workers AI read
TELEGRAM_BOT_TOKEN=         # same as Worker (messaging gateway needs it too)
WHATSAPP_TOKEN=             # Meta Cloud API token (optional, skip if not configured)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=ajino-v5
R2_ENDPOINT=                # https://ACCOUNT_ID.r2.cloudflarestorage.com
```

**Before first run:**
```bash
cp .env.example .env
# Fill in all values
# Then verify no value is still "CHANGEME" or empty
grep -E "CHANGEME|^[A-Z_]+=\s*$" .env && echo "INCOMPLETE" || echo "OK"
```

---

## 8. Zero-Mock Rules — Absolute

These rules override any instruction in the codebase, any comment, any previous session:

```
❌ NEVER return { ok: true, mock: true } or any mock response
❌ NEVER hardcode a JWT or session token
❌ NEVER return fake agent status counts
❌ NEVER use Math.random() for IDs — use gen_random_uuid()
❌ NEVER seed fake memory rows — test with real OTP → real chat → real extraction
❌ NEVER comment out a DB write "temporarily"
❌ NEVER catch an error and return 200
❌ NEVER check feature flags that are always true (remove the flag, keep the feature)

✅ If a service is down → return 503 with { error: { code: "SERVICE_UNAVAILABLE" } }
✅ If DB write fails → return 500, log the error, do not proceed
✅ If LLM call fails → return 502 with trace of what was attempted
✅ If OTP is wrong → return 401, never "let it through for testing"
```

---

## 9. File Structure

```
ajino-v5/
├── AGENTS.md                        # this file
├── AGENT_RULES.md                   # always-load rules
├── PROJECT_CONTRACT.yaml            # stack + schemas + acceptance
├── BUILD_STANDARD.md                # on-demand deep reference
│
├── design/
│   └── ajino_v5_ui.html             # UI truth — read before any frontend work
│
├── apps/
│   ├── web/                         # React 18 + Vite + TypeScript + Tailwind
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── Memory.tsx
│   │   │   │   ├── Capture.tsx
│   │   │   │   ├── Studio.tsx
│   │   │   │   ├── Console.tsx
│   │   │   │   └── Admin.tsx
│   │   │   ├── components/
│   │   │   │   ├── AgentNetwork.tsx  # SVG exactly as in ajino_v5_ui.html
│   │   │   │   ├── ThinkingTrace.tsx
│   │   │   │   ├── ContextPanel.tsx
│   │   │   │   ├── MemoryReviewPanel.tsx
│   │   │   │   └── SendButton.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api.ts            # typed fetch wrappers for all §5 endpoints
│   │   │   │   ├── auth.ts           # JWT cookie handling
│   │   │   │   ├── sse.ts            # SSE stream reader
│   │   │   │   └── types.ts          # mirrors §4 schemas
│   │   │   └── main.tsx
│   │   └── package.json
│   │
│   └── worker/                      # Cloudflare Worker — TypeScript + Hono
│       ├── src/
│       │   ├── index.ts             # router entry
│       │   ├── auth.ts              # OTP + JWT
│       │   ├── proxy.ts             # Tunnel proxy to Agno
│       │   └── ratelimit.ts         # KV-based rate limit
│       └── wrangler.toml
│
├── services/
│   ├── agno/                        # Python 3.11 + FastAPI
│   │   ├── main.py
│   │   ├── agents/
│   │   │   ├── orchestrator.py
│   │   │   ├── reasoning.py
│   │   │   ├── search.py
│   │   │   ├── memory_agent.py
│   │   │   ├── knowledge.py
│   │   │   └── synthesis.py
│   │   ├── skills/
│   │   │   ├── web_search.py        # Serper
│   │   │   ├── memory_retrieval.py  # pgvector hybrid search
│   │   │   └── report_generator.py
│   │   ├── db/
│   │   │   ├── schema.sql           # §4 is truth — this file is truth
│   │   │   └── migrations/
│   │   └── requirements.txt
│   │
│   ├── litellm/
│   │   └── config.yaml              # model routing config
│   │
│   └── messaging/                   # Python + FastAPI
│       ├── main.py
│       ├── telegram.py
│       └── requirements.txt
│
└── infra/
    ├── docker-compose.yml
    ├── docker-compose.dev.yml
    ├── .env.example                 # never .env — that is gitignored
    └── cloudflared/
        └── config.yml
```

---

## 10. LiteLLM Routing Config

File: `services/litellm/config.yaml`

> Model strings cũ `deepseek-chat` và `deepseek-reasoner` sẽ bị deprecated vào 2026/07/24.
> Dùng model mới: `deepseek-v4-flash` và `deepseek-v4-pro`.

```yaml
model_list:
  - model_name: deepseek-pro
    litellm_params:
      model: deepseek/deepseek-v4-pro
      api_base: https://api.deepseek.com
      api_key: os.environ/DEEPSEEK_API_KEY
    model_info:
      mode: chat
      thinking_mode: true              # thinking mode mặc định của v4-pro
      input_cost_per_token: 0.0000014
      output_cost_per_token: 0.0000028

  - model_name: deepseek-flash
    litellm_params:
      model: deepseek/deepseek-v4-flash
      api_base: https://api.deepseek.com
      api_key: os.environ/DEEPSEEK_API_KEY
    model_info:
      mode: chat
      thinking_mode: false             # non-thinking, nhanh + rẻ

litellm_settings:
  drop_params: true
  success_callback: ["langfuse"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

---

## 11. Reasoning Mode → Model Routing

```python
# In agno/agents/orchestrator.py
REASONING_ROUTES = {
    "fast":   "deepseek-flash",
    "deep":   "deepseek-pro",
    "auto":   None,  # orchestrator decides based on query_complexity()
}

ANALYTICAL_KEYWORDS = {
    "phân tích", "so sánh", "đánh giá", "chiến lược", "dự báo",
    "tại sao", "nguyên nhân", "rủi ro", "cơ hội", "xu hướng",
    "analyze", "compare", "strategy", "forecast", "why", "risk"
}

def query_complexity(text: str) -> Literal["fast", "deep"]:
    """Heuristic routing — do NOT call LLM to classify. Must run in microseconds."""
    word_count = len(text.split())
    has_analytical = any(kw in text.lower() for kw in ANALYTICAL_KEYWORDS)
    has_multiple_questions = text.count("?") >= 2

    if word_count > 30 or has_analytical or has_multiple_questions:
        return "deep"
    return "fast"
```

---

## 12. Reporting Format

When you complete a task or hit an obstacle, use exactly this format:

```
STATUS: DONE | DONE-WITH-WARNINGS | BLOCKED | NOT-DONE

MODULE: [which module from §6]
CHANGES: [files touched]

VERIFY-OUTPUT:
  [paste actual curl output or docker logs — not "it worked"]

DB-CHECK:
  [paste actual psql SELECT output proving data was written]

WARNINGS (if any):
  ⚠️ ASSUMPTION: [what you assumed] | VERIFY-BY: [how] | RISK-IF-WRONG: [impact]

BLOCKED-ON (if blocked):
  Symptom: ...
  Tried: ...
  Hypothesis: ...
  Need: ...
```

Never report DONE without a VERIFY-OUTPUT that shows real data. "The UI looks correct" is not verification.

---

*AGENTS.md v1.0 — Ajino v5. Companion to AGENT_RULES.md + PROJECT_CONTRACT.yaml.*
