# Ajino v5 — Telegram Bot: Technical Plan & Acceptance Criteria

**Gửi:** Dev team  
**Ngày:** 09/06/2026  
**Phạm vi:** Messaging Gateway — Telegram Bot (port 3000)  
**Tham chiếu:** `AGENTS.md §7`, `PROJECT_CONTRACT.yaml §messaging`, `telegram-script.md`

---

## 1. Tổng quan kiến trúc

```
Telegram API
    │ webhook POST /telegram/webhook
    │
Messaging Gateway (port 3000)
    │
    ├── Intent Classifier (gọi Agno)
    │       ↓ intent + params
    ├── State Machine (Cloudflare KV)
    │       ↓ context
    ├── Handler Router
    │       ↓
    │   ├── ChatHandler      → Agno /chat
    │   ├── CaptureHandler   → Agno /capture
    │   ├── RemindHandler    → Scheduler
    │   ├── TripHandler      → Scheduler
    │   ├── MemoryHandler    → Agno /memory
    │   ├── OpsHandler       → Scheduler
    │   └── NotifyService    → Proactive push
    │
Telegram sendMessage API
```

---

## 2. Intent Detection

### 2.1 Nguyên tắc

- Mọi tin nhắn không phải slash đều qua Intent Classifier trước
- Dùng `deepseek-v4-flash` — không dùng Pro cho bước này
- Classifier trả về JSON, không trả prose
- Timeout 3s — nếu quá → fallback intent `QUERY`

### 2.2 System prompt cho classifier

```
Bạn là intent classifier cho một executive AI assistant.
Phân tích tin nhắn và trả về JSON, KHÔNG có markdown, KHÔNG có giải thích.

Schema:
{
  "intent": "QUERY" | "CAPTURE" | "REMIND" | "TRIP" | "MEMORY_REVIEW" | "OPS" | "STATUS" | "UNKNOWN",
  "complexity": "fast" | "deep",
  "params": {}
}

Rules:
- QUERY: câu hỏi, phân tích, tìm kiếm thông tin
- CAPTURE: ghi nhanh fact, thông tin mới vừa biết, kết quả cuộc họp
- REMIND: đặt nhắc nhở, nhắc tôi, reminder
- TRIP: lịch công tác, chuyến đi, đi [địa điểm]
- MEMORY_REVIEW: xem memory, duyệt memory, pending
- OPS: xem lịch, quản lý nhắc nhở, xem cron
- STATUS: health check, hệ thống thế nào
- UNKNOWN: không thuộc nhóm nào trên
- complexity fast: câu đơn, fact đơn giản, dưới 15 từ
- complexity deep: phân tích, so sánh, chiến lược, nhiều khía cạnh

Params extraction:
- REMIND: { "content": string, "time_raw": string }
- TRIP: { "destination": string, "dates_raw": string, "note": string }
- CAPTURE: { "content": string }
```

### 2.3 Ví dụ kết quả classifier

```json
"SF Express đang làm gì ở Lạng Sơn?"
→ {"intent":"QUERY","complexity":"fast","params":{}}

"phân tích rủi ro cạnh tranh Q3 với SF Express và Viettel"
→ {"intent":"QUERY","complexity":"deep","params":{}}

"Mr. Hồ xác nhận ngân sách LSS Project B là 2 tỷ"
→ {"intent":"CAPTURE","complexity":"fast","params":{"content":"Mr. Hồ xác nhận ngân sách LSS Project B là 2 tỷ"}}

"nhắc tôi gọi XC lúc 3 giờ chiều mai"
→ {"intent":"REMIND","complexity":"fast","params":{"content":"Gọi XC","time_raw":"3 giờ chiều mai"}}

"tôi đi Lạng Sơn 15-17/6 gặp Mr. Hồ"
→ {"intent":"TRIP","complexity":"fast","params":{"destination":"Lạng Sơn","dates_raw":"15-17/6","note":"gặp Mr. Hồ"}}
```

---

## 3. State Machine

### 3.1 KV Schema

```
Namespace: KV_OTP_SESSIONS (dùng chung, prefix khác)

key:   "tgstate:{telegram_id}"
value: JSON (xem bên dưới)
TTL:   300 giây (5 phút không tương tác → xóa tự động)
```

```typescript
interface TelegramState {
  intent: string          // flow đang chờ: "REMIND" | "TRIP" | ...
  step: string            // bước hiện tại trong flow
  data: Record<string, unknown>  // data đã thu thập
  message_id?: number     // message_id của prompt hiện tại (để edit)
  expires_at: number      // timestamp ms
}
```

### 3.2 State transitions

```
[No state] + text message
    → Intent Classify
    → if single-step intent (QUERY, CAPTURE, STATUS): handle immediately
    → if multi-step intent (REMIND, TRIP): set state, send prompt

[Has state] + text message
    → continue current flow (fill next required field)

[Has state] + /lệnh_khác
    → clear old state
    → start new flow
    → notify: "✗ Đã huỷ [flow cũ]. [Bắt đầu flow mới]"

[Has state] + /cancel
    → clear state
    → notify: "✗ Đã huỷ."

[Has state] + TTL expired (KV tự xóa)
    → next message treated as no state
```

### 3.3 Multi-step flows

**REMIND flow:**
```
Step 1 [waiting_content]: "Nhắc gì?"
  → user trả lời → lưu content → step 2

Step 2 [waiting_time]: "Lúc mấy giờ? (VD: 15:00 ngày mai)"
  → user trả lời → parse time → confirm → save → done

Shortcut: nếu classifier extract được cả content + time_raw
  → skip cả 2 bước, confirm ngay
```

**TRIP flow:**
```
Step 1 [waiting_destination]: "Đến đâu?"
  → user trả lời → lưu destination → step 2

Step 2 [waiting_dates]: "Ngày nào? (VD: 15-17/06)"
  → user trả lời → parse dates → step 3

Step 3 [confirm]: show summary → inline keyboard [✅ Xác nhận] [✏️ Sửa] [❌ Huỷ]
  → confirm → save → done

Shortcut: nếu classifier extract đủ destination + dates_raw
  → skip step 1+2, chuyển thẳng step 3
```

---

## 4. Handlers

### 4.1 ChatHandler

```typescript
// Gọi Agno /api/chat/sessions/{id}/messages
// Dùng session Telegram riêng — không mix với web session

async function handleQuery(telegram_id: number, text: string, complexity: "fast"|"deep") {
  // 1. Lấy hoặc tạo telegram_session cho user
  // 2. Gửi "đang xử lý..." (edit sau)
  // 3. POST Agno với reasoning_mode = complexity
  // 4. Stream SSE → khi done, gửi response lên Telegram
  // 5. Attach inline keyboard: [🔖 To memory] [🔄 Hỏi tiếp]
}

// Message format:
// [⚡ Fast · model · Xs] hoặc [◉ Deep · model · Xs]
// \n
// {content markdown → convert sang Telegram MarkdownV2}
// \n
// 📎 N memory đã dùng (nếu > 0)
```

**Giới hạn Telegram:** Message tối đa 4096 ký tự. Nếu response dài hơn → split thành nhiều message, message cuối mới có inline keyboard.

### 4.2 CaptureHandler

```typescript
async function handleCapture(telegram_id: number, content: string) {
  // 1. POST Agno /api/capture { type: "text", content }
  // 2. Agno trả về extracted_facts (async ~2-5s)
  // 3. Gửi facts lên Telegram với inline keyboard confirm
  // 4. Nếu user tap ✅ → POST /api/capture/{id}/commit
  // 5. Ghi audit_log
}
```

### 4.3 RemindHandler

```typescript
async function handleRemind(telegram_id: number, content: string, time_raw: string) {
  // 1. Parse time_raw → timestamp tuyệt đối
  //    Dùng deepseek-v4-flash với prompt parse time (tiếng Việt)
  //    VD: "3 giờ chiều mai" → 2026-06-10T08:00:00Z
  // 2. Lưu vào DB reminders table
  // 3. Xác nhận lên Telegram
  // 4. Cron job check reminders mỗi phút → gửi khi đến giờ
}

// DB table (thêm vào schema.sql):
// CREATE TABLE reminders (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id UUID REFERENCES users(id),
//   telegram_id BIGINT NOT NULL,
//   content TEXT NOT NULL,
//   remind_at TIMESTAMPTZ NOT NULL,
//   notified_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
```

### 4.4 TripHandler

```typescript
async function handleTrip(telegram_id: number, destination: string, dates_raw: string, note: string) {
  // 1. Parse dates_raw → {start_date, end_date}
  // 2. Generate trip schedule (Agno /trip/generate)
  // 3. Lưu vào DB trips table
  // 4. Tạo reminders tự động: D-1 20:00, D0 06:30
  // 5. Confirm lên Telegram với summary
}

// DB table:
// CREATE TABLE trips (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id UUID REFERENCES users(id),
//   destination TEXT NOT NULL,
//   start_date DATE NOT NULL,
//   end_date DATE NOT NULL,
//   note TEXT,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
```

### 4.5 MemoryHandler

```typescript
async function handleMemoryReview(telegram_id: number) {
  // 1. GET /api/memory?status=pending&limit=1
  // 2. Gửi item đầu tiên với inline keyboard
  //    [✅ Duyệt] [✏️ Sửa] [❌ Bỏ] [⏭ Bỏ qua]
  // 3. Callback query handler:
  //    - approve → PATCH /api/memory/{id} {status:"canonical"}
  //    - reject  → PATCH /api/memory/{id} {status:"archived"}
  //    - skip    → tăng offset, lấy item tiếp theo
  //    - edit    → set state MEMORY_EDIT, hỏi nội dung mới
  // 4. Sau mỗi action → hiển thị item tiếp theo tự động
}
```

---

## 5. Notification Service

### 5.1 Cron schedule

```typescript
// Chạy trong Messaging Gateway hoặc Agno (dùng node-cron hoặc python-crontab)

"0 7 * * *"     → dailyBriefing()
"30 7 * * *"    → syncGapCheck()
"0 8 * * 1"     → weeklyMemoryReminder()
"0 20 * * 5"    → memoryDecayWarning()
"0 1 * * *"     → backupCheck()
"* * * * *"     → reminderCheck()   // mỗi phút
```

### 5.2 dailyBriefing()

```typescript
async function dailyBriefing(telegram_id: number) {
  // 1. GET /api/memory?status=pending → count
  // 2. GET /api/console/audit?from=yesterday → token usage
  // 3. GET reminders WHERE remind_at::date = today
  // 4. GET trips WHERE start_date = today OR start_date = tomorrow
  // 5. Compose message + send
  // KHÔNG gửi nếu không có gì đáng chú ý (pending=0, no reminders, no trips)
}
```

### 5.3 syncGapCheck()

```typescript
async function syncGapCheck() {
  // 1. GET Control Tower API → avg sync gap 24h
  // 2. Nếu > 45 phút → send alert với inline keyboard
  // 3. Ghi audit_log action="notification.sync_gap_alert"
  // Skip nếu không có CT API — KHÔNG mock data
}
```

### 5.4 Giới hạn proactive

```
MAX_PROACTIVE_PER_DAY = 2 (không tính cron nhắc nhở đã đặt trước)
Alert khẩn cấp (sync gap, security) = exempt, không tính giới hạn

Lưu count trong KV:
key: "notif_count:{telegram_id}:{date}"
TTL: 86400s
```

---

## 6. Message Format Standards

### 6.1 Cấu trúc chuẩn

```
━━━━━━━━━━━━━━━━━━━━━━━   ← header separator (nếu có tiêu đề)
[icon] Tiêu đề
━━━━━━━━━━━━━━━━━━━━━━━
Nội dung (tối đa 10 dòng)
[action buttons]
━━━━━━━━━━━━━━━━━━━━━━━   ← footer separator (optional)
```

### 6.2 Parse mode

- Dùng `parse_mode: "MarkdownV2"` cho tất cả message
- Escape các ký tự đặc biệt: `. ! ( ) - = + { } | > #`
- Code block dùng ` ``` ` cho monospace (số liệu, timestamps)

### 6.3 Inline keyboard

```
Tối đa 3 nút mỗi hàng
Nút action chính: hàng đầu tiên
Nút huỷ/bỏ qua: hàng cuối

VD:
[✅ Duyệt] [✏️ Sửa] [❌ Bỏ]
[⏭ Bỏ qua (3 còn lại)]
```

### 6.4 Response time UX

```
< 3s (fast query): gửi thẳng kết quả
3-30s (deep query): gửi "đang phân tích..." → edit message khi có kết quả
> 30s: gửi progress update mỗi 10s
```

---

## 7. Webhook Setup

```bash
# Set webhook
curl "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -d "url=https://ajinov5.cuong.ngo/telegram/webhook" \
  -d "secret_token={WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"

# Verify
curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"
# pending_update_count phải là 0
# last_error_message phải trống
```

Secret token lưu trong `.env` là `TELEGRAM_WEBHOOK_SECRET`. Validate trong handler:

```typescript
const secret = req.headers['x-telegram-bot-api-secret-token']
if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(403).end()
```

---

## 8. Schema bổ sung vào schema.sql

```sql
CREATE TABLE reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  telegram_id BIGINT NOT NULL,
  content     TEXT NOT NULL,
  remind_at   TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON reminders (remind_at) WHERE notified_at IS NULL;

CREATE TABLE trips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  destination TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 9. Tiêu chí nghiệm thu

### M-TG1 — Intent Detection

- [ ] Gõ "SF Express đang làm gì?" → trả lời tiếng Việt, không hỏi lại
- [ ] Gõ "phân tích rủi ro cạnh tranh logistics Q3" → nhận diện deep, pipeline đầy đủ
- [ ] Gõ "nhắc tôi gọi XC lúc 3h chiều mai" → tạo reminder, không cần slash
- [ ] Gõ "Mr. Hồ xác nhận 2 tỷ Project B" → nhận diện CAPTURE, extract facts
- [ ] Gõ "đi Lạng Sơn 15-17/6" → nhận diện TRIP, hỏi thêm nếu thiếu
- [ ] 10 intent test cases → tỷ lệ đúng ≥ 90%

**Self-test:**
```bash
# Chạy intent test suite
curl -s -X POST http://localhost:3000/test/intent \
  -H "Content-Type: application/json" \
  -d '{"cases":[
    {"text":"SF Express đang làm gì?","expected":"QUERY"},
    {"text":"nhắc tôi họp lúc 9h mai","expected":"REMIND"},
    {"text":"Mr. Hồ xác nhận 2 tỷ","expected":"CAPTURE"}
  ]}' | jq '.accuracy'
# Phải >= 0.9
```

---

### M-TG2 — State Machine

- [ ] `/remind` → bot hỏi nội dung → gõ tiếp → bot hỏi giờ → gõ tiếp → confirm
- [ ] Đang ở giữa `/remind` flow → gõ `/trip` → bot huỷ remind, bắt đầu trip flow
- [ ] Đang ở giữa flow → gõ `/cancel` → bot huỷ, state cleared
- [ ] Không tương tác 5 phút → state tự xóa (verify bằng KV get sau 301s)
- [ ] State không bị shared giữa các users (verify với 2 telegram_id khác nhau)

**Self-test:**
```bash
# Verify state TTL
docker exec ajinov5-worker wrangler kv:key get \
  --namespace-id=KV_OTP_ID "tgstate:5250339472"
# Sau 301 giây không tương tác → lệnh trên phải trả "null" hoặc error
```

---

### M-TG3 — Chat qua Telegram

- [ ] Fast query trả lời trong < 5s (bao gồm network)
- [ ] Deep query gửi "đang phân tích..." trong < 1s, kết quả trong < 30s
- [ ] Response có model + latency ở header message
- [ ] Nút [🔖 To memory] → tạo pending memory, verify bằng GET /api/memory?status=pending
- [ ] Nút [🔄 Hỏi tiếp] → set state FOLLOWUP, câu hỏi tiếp theo dùng cùng session
- [ ] audit_log có row với action="chat.message" sau mỗi query

---

### M-TG4 — Capture

- [ ] Gửi fact → Agno extract → bot hiện facts với inline keyboard trong < 5s
- [ ] Tap ✅ → `SELECT count(*) FROM memory WHERE source='capture' AND status='pending'` tăng
- [ ] Tap ❌ → capture row status='failed', không tạo memory
- [ ] Capture image (gửi ảnh) → bot nhận, gửi vào Agno, extract text facts

---

### M-TG5 — Remind

- [ ] Tạo reminder → `SELECT * FROM reminders WHERE notified_at IS NULL` có row
- [ ] Đúng giờ → Telegram message đến (test với giờ gần = now + 2 phút)
- [ ] Tap ✅ Đã xong → notified_at set, không nhắc lại
- [ ] Tap ⏰ Nhắc lại 30' → remind_at cập nhật + 30 phút
- [ ] remind_at trong quá khứ → bot từ chối, yêu cầu giờ hợp lệ

---

### M-TG6 — Notification

- [ ] Daily briefing gửi lúc 07:00 (test bằng cách trigger thủ công)
- [ ] Briefing KHÔNG gửi nếu pending=0 và không có lịch nào hôm nay
- [ ] Proactive count trong ngày ≤ 2 (verify KV counter)
- [ ] Alert nhắc nhở không bị tính vào giới hạn 2/ngày

---

### M-TG7 — Memory Review qua Bot

- [ ] `/mem` → hiện item pending đầu tiên với inline keyboard
- [ ] Tap ✅ → `SELECT status FROM memory WHERE id=...` = 'canonical', embedding IS NOT NULL
- [ ] Tap ❌ → status = 'archived'
- [ ] Tap ⏭ → item tiếp theo hiện ra
- [ ] Hết pending → bot thông báo "Không còn memory nào cần duyệt"
- [ ] [✅ Duyệt tất cả] → tất cả pending → canonical + embed

---

### M-TG8 — Không mock

- [ ] Tắt Agno → query trả lỗi rõ ràng, KHÔNG trả fake answer
- [ ] Tắt DeepSeek API → intent classifier fail → fallback xử lý, thông báo lỗi
- [ ] Reminder check cron không có data → không gửi gì, không crash
- [ ] `grep -r "mock\|fake\|hardcode" services/messaging/` trả empty

---

## 10. Reporting format khi báo kết quả

```
STATUS: DONE | DONE-WITH-WARNINGS | BLOCKED

MODULE: M-TG[N] — [tên]
CHANGES: [files touched]

VERIFY-OUTPUT:
  [paste kết quả test command thật]

DB-CHECK:
  [paste SELECT output]

WARNINGS:
  ⚠️ [nếu có]

BLOCKED-ON (nếu blocked):
  Symptom / Tried / Hypothesis / Need
```

---

*Tài liệu này là spec duy nhất cho Telegram bot. Mọi thay đổi thiết kế phải cập nhật tài liệu này trước khi code.*
