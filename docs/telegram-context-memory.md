# Ajino v5 — Telegram Context Memory Architecture
# Addendum to: telegram-bot-plan.md
# Không sửa file gốc — dev đọc file này bổ sung vào implementation

---

## Vấn đề

Telegram không có trigger "New chat" như Web UI.
Toàn bộ conversation là 1 luồng liên tục per user.

Yêu cầu: Ajino phải trả lời được câu hỏi liên quan
dù cách nhau vài phút, vài ngày, hay vài tháng.

---

## Thiết kế 3 lớp context

```
┌─────────────────────────────────────────────────┐
│  Câu hỏi của user                               │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│  Context Assembly (Agno)                        │
│                                                 │
│  [1] Short-term buffer  ← KV, TTL 30 phút      │
│  [2] Recent messages    ← 10 messages gần nhất  │
│  [3] Canonical memory   ← pgvector hybrid search│
│                                                 │
│  → Merge → inject vào LLM context              │
└─────────────────────────────────────────────────┘
```

---

## Lớp 1 — Short-term Buffer (KV, 30 phút)

### Mục đích
Giữ facts vừa xuất hiện trong conversation gần đây,
inject vào context ngay lập tức dù chưa approve.

### KV Schema

```
key:   "stbuf:{telegram_id}"
value: JSON array of facts
TTL:   1800 giây (30 phút, reset mỗi lần có fact mới)
```

```typescript
interface ShortTermFact {
  fact: string
  confidence: number      // 0.0 - 1.0
  extracted_at: number    // timestamp ms
  source_text: string     // đoạn text gốc
}
```

### Trigger

Sau mỗi tin nhắn user → Agno extract facts song song
với việc generate response (không block response):

```python
async def handle_telegram_message(telegram_id: int, text: str):
    # Song song:
    response_task = asyncio.create_task(generate_response(telegram_id, text))
    extract_task  = asyncio.create_task(extract_and_buffer(telegram_id, text))

    response = await response_task
    # extract_task chạy background, không await ở đây
    return response

async def extract_and_buffer(telegram_id: int, text: str):
    facts = await extract_facts_llm(text)  # deepseek-v4-flash
    if not facts:
        return

    # Đọc buffer hiện tại
    existing = await kv_get(f"stbuf:{telegram_id}") or []

    # Merge, giữ tối đa 20 facts, mới nhất lên đầu
    merged = facts + existing
    merged = merged[:20]

    # Lưu lại với TTL reset
    await kv_set(f"stbuf:{telegram_id}", merged, ttl=1800)

    # Đồng thời tạo pending memory để user review
    for fact in facts:
        if fact["confidence"] >= 0.7:
            await create_pending_memory(telegram_id, fact["fact"], source="chat")
```

### Ví dụ minh họa

```
14:00 — User: "Quán cà phê gần công ty là Katinat"
  → extract: [{fact: "Katinat là quán cà phê gần công ty", confidence: 0.95}]
  → KV stbuf:5250339472 = [{fact: "Katinat...", extracted_at: 14:00}]
  → pending memory tạo (chờ approve)

14:05 — User: "Gần công ty có chỗ ngồi nói chuyện với bạn bè không?"
  → Context assembly lấy KV buffer → thấy "Katinat gần công ty"
  → Response: "Các anh chị có thể ngồi ở Katinat"

14:31 — TTL vẫn còn, buffer vẫn sống

15:00 — User approve memory "Katinat gần công ty" → canonical

Tháng sau — KV đã expire nhưng canonical memory vẫn có
  → User: "Gần công ty ngồi được ở đâu?"
  → Vector search tìm canonical "Katinat gần công ty"
  → Response: "Anh có thể ngồi ở Katinat"
```

---

## Lớp 2 — Recent Messages (10 messages gần nhất)

### Mục đích
Short-term conversational context trong phiên hiện tại.
Không phân session — lấy 10 messages cuối cùng của user đó trên Telegram.

### Implementation

```python
async def get_telegram_context(telegram_id: int) -> list[dict]:
    messages = await db.fetch("""
        SELECT role, content
        FROM chat_messages
        WHERE session_id = (
            SELECT id FROM chat_sessions
            WHERE metadata->>'telegram_id' = $1
            ORDER BY updated_at DESC
            LIMIT 1
        )
        ORDER BY created_at DESC
        LIMIT 10
    """, str(telegram_id))

    return list(reversed(messages))  # chronological order
```

### Chat session Telegram

1 user Telegram = 1 `chat_session` duy nhất, không bao giờ tạo session mới.
Cần thêm cột vào `chat_sessions`:

```sql
-- Migration: thêm vào schema.sql
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Khi tạo session Telegram:
-- metadata = {"telegram_id": "5250339472", "surface": "telegram"}

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_chat_sessions_telegram
ON chat_sessions ((metadata->>'telegram_id'))
WHERE metadata->>'surface' = 'telegram';
```

---

## Lớp 3 — Canonical Memory (vĩnh viễn)

Không thay đổi so với thiết kế hiện tại.
Hybrid search: keyword (tsvector) + vector cosine (pgvector + bge-m3).

Chỉ canonical memories (đã approve) mới được inject.
Pending và archived không bao giờ inject.

---

## Context Assembly — Agno

```python
async def assemble_telegram_context(telegram_id: int, query: str) -> dict:

    # 1. Short-term buffer từ KV (instant, < 5ms)
    stbuf = await kv_get(f"stbuf:{telegram_id}") or []
    stbuf_text = "\n".join([f["fact"] for f in stbuf]) if stbuf else ""

    # 2. Recent messages (DB query, < 20ms)
    recent_msgs = await get_telegram_context(telegram_id)

    # 3. Canonical memory search (vector, < 100ms)
    canonical = await memory_search(query, status="canonical", top_k=5)
    canonical_text = "\n".join([m["content"] for m in canonical])

    # 4. System prompt với context đầy đủ
    system = f"""Bạn là Ajino, executive AI assistant của CEO.

CONTEXT GẦN ĐÂY (30 phút qua):
{stbuf_text or "Không có"}

TRI THỨC CỐT LÕI:
{canonical_text or "Không có"}

Trả lời bằng tiếng Việt, ngắn gọn, đúng trọng tâm."""

    return {
        "system": system,
        "messages": recent_msgs,  # lịch sử 10 messages
    }
```

---

## Tiêu chí nghiệm thu bổ sung

### M-TG-CTX1 — Short-term buffer

- [ ] Gửi "Katinat gần công ty" → sau 30 giây hỏi "gần công ty ngồi đâu được?" → response đề cập Katinat
- [ ] Verify KV: `GET stbuf:{telegram_id}` có fact "Katinat"
- [ ] Sau 31 phút không tương tác → KV expire → fact biến mất (test với TTL ngắn hơn khi dev)
- [ ] Fact có confidence < 0.7 → KHÔNG vào buffer, KHÔNG tạo pending memory

### M-TG-CTX2 — Cross-session (long-term)

- [ ] Approve "Katinat gần công ty" thành canonical
- [ ] Xóa KV buffer thủ công (simulate hết TTL)
- [ ] Hỏi lại "gần công ty ngồi đâu?" → vẫn đề cập Katinat (từ canonical memory)
- [ ] `SELECT content FROM memory WHERE status='canonical' AND content ILIKE '%Katinat%'` có row

### M-TG-CTX3 — Recent messages

- [ ] Hỏi "câu trước tôi hỏi gì?" → bot trả lời đúng nội dung câu hỏi trước
- [ ] `SELECT count(*) FROM chat_messages WHERE session_id = (telegram session)` tăng sau mỗi Q&A
- [ ] Chỉ có 1 chat_session per telegram_id (không tạo duplicate)

### M-TG-CTX4 — Không inject pending/archived

- [ ] Tạo pending memory "Katinat gần công ty" (KHÔNG approve)
- [ ] Xóa KV buffer
- [ ] Hỏi "gần công ty ngồi đâu?" → KHÔNG đề cập Katinat (chưa canonical)
- [ ] Approve → hỏi lại → đề cập Katinat

---

## Thứ tự implement

```
Bước 1: DB migration (thêm metadata vào chat_sessions)
Bước 2: Tạo/lấy telegram session (1 per user)
Bước 3: get_telegram_context() — 10 messages gần nhất
Bước 4: extract_and_buffer() — chạy background sau mỗi message
Bước 5: assemble_telegram_context() — merge 3 lớp
Bước 6: Test M-TG-CTX1 → CTX4
```

---

## Self-test commands

```bash
# Test buffer sau khi gửi fact
# (thay TELEGRAM_ID và KV_NAMESPACE_ID)
wrangler kv:key get --namespace-id=KV_ID "stbuf:5250339472"

# Test canonical memory
docker exec ajinov5-postgres psql -U ajino -d ajino -c \
  "SELECT content, status FROM memory WHERE content ILIKE '%Katinat%';"

# Test telegram session unique
docker exec ajinov5-postgres psql -U ajino -d ajino -c \
  "SELECT count(*) FROM chat_sessions WHERE metadata->>'telegram_id'='5250339472';"
# Phải là 1, không bao giờ > 1
```

---

*Addendum v1.0 — đọc cùng telegram-bot-plan.md. Implement sau khi M-TG1 → M-TG4 done.*
