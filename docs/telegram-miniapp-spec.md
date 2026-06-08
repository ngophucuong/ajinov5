# Ajino v5 — Telegram Mini App: Spec & Acceptance
# Dev đọc cùng ajino_telegram_miniapp.html

---

## 1. Tổng quan

Mini App chạy trong Telegram WebView.
Không phải bot chat — là full web app embedded.
URL: https://ajinov5.cuong.ngo (cùng domain với web app)
Detect context: `window.Telegram?.WebApp` → true = Mini App mode

---

## 2. Khởi động Mini App

```javascript
// Bắt buộc khi load
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();          // báo Telegram app đã sẵn sàng
  tg.expand();         // fullscreen
  tg.enableClosingConfirmation(); // hỏi trước khi đóng nếu có form đang điền
}
```

Lấy user info từ Telegram (không cần login thêm):
```javascript
const tgUser = tg?.initDataUnsafe?.user;
// { id: 5250339472, first_name: "Cường", username: "..." }
// 🔴 Verify initData server-side trước khi tin tưởng
```

---

## 3. Adaptive Mode — Logic đầy đủ

### DB table cần thêm

```sql
CREATE TABLE user_behavior_patterns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) UNIQUE,
  open_log     JSONB NOT NULL DEFAULT '[]',
  -- [{timestamp, had_meeting_soon: bool, duration_seconds: int}]
  dominant_mode TEXT,
  -- 'briefing' | 'premeeting' | 'capture' | 'chat' | null
  pattern_confidence FLOAT DEFAULT 0,
  -- 0.0 → 1.0, dưới 0.5 = dùng default
  last_calculated_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### API endpoint

```
GET /api/user/adaptive-mode
Headers: X-User-Id, X-User-Role (từ Worker JWT)

Response:
{
  "data": {
    "mode": "briefing" | "premeeting" | "capture" | "chat",
    "reason": "morning_routine" | "meeting_soon" | "post_meeting" | "default",
    "confidence": 0.0 - 1.0,
    "meeting": { ... } | null  (nếu mode=premeeting hoặc capture)
  }
}
```

### Server-side logic

```python
async def get_adaptive_mode(user_id: str) -> dict:
    now = datetime.utcnow()
    hour = now.hour  # UTC+7 cho VN

    # 1. Lấy lịch họp hôm nay
    # 🔴 MOCK-05: thay bằng GET /api/ops/schedule?date=today khi có
    schedule = await get_today_schedule(user_id)
    next_meeting = get_next_meeting(schedule, now)

    # 2. Lấy behavior pattern
    pattern = await db.get_user_behavior_pattern(user_id)

    # === RULES (theo thứ tự ưu tiên) ===

    # Rule 1: Trong 30 phút trước họp → PRE_MEETING
    if next_meeting and minutes_until(next_meeting) <= 30:
        return {"mode": "premeeting", "reason": "meeting_soon",
                "confidence": 1.0, "meeting": next_meeting}

    # Rule 2: Trong 30 phút sau họp kết thúc → CAPTURE
    last_meeting = get_last_finished_meeting(schedule, now)
    if last_meeting and minutes_since_end(last_meeting) <= 30:
        return {"mode": "capture", "reason": "post_meeting",
                "confidence": 1.0, "meeting": last_meeting}

    # Rule 3: Chưa đủ data (< 7 lần dùng) → DEFAULT CHAT
    if not pattern or pattern["pattern_confidence"] < 0.5:
        return {"mode": "chat", "reason": "default", "confidence": 0.0}

    # Rule 4: Buổi sáng sớm (6:30–9:00 VN) → BRIEFING
    vn_hour = (hour + 7) % 24
    if 6 <= vn_hour <= 9:
        return {"mode": "briefing", "reason": "morning_routine",
                "confidence": 0.8}

    # Rule 5: Dùng pattern học được
    if pattern["dominant_mode"] and pattern["pattern_confidence"] >= 0.7:
        return {"mode": pattern["dominant_mode"],
                "reason": "learned_pattern",
                "confidence": pattern["pattern_confidence"]}

    # Fallback
    return {"mode": "chat", "reason": "default", "confidence": 0.0}
```

### Pattern learning (chạy weekly)

```python
# Cron: mỗi tuần vào CN 00:00 UTC
async def recalculate_behavior_patterns():
    users = await db.fetch("SELECT id FROM users")
    for user in users:
        logs = await db.get_open_logs(user.id, days=30)
        if len(logs) < 7:
            continue  # chưa đủ data

        # Tính dominant opening hour
        hours = [log["vn_hour"] for log in logs]
        dominant_hour = max(set(hours), key=hours.count)

        # Tính mode phổ biến nhất
        modes = [log.get("mode_selected") for log in logs if log.get("mode_selected")]
        dominant_mode = max(set(modes), key=modes.count) if modes else None

        confidence = len([h for h in hours if abs(h - dominant_hour) <= 1]) / len(hours)

        await db.upsert_behavior_pattern(user.id, {
            "dominant_mode": dominant_mode,
            "pattern_confidence": confidence,
            "last_calculated_at": datetime.utcnow()
        })
```

---

## 4. MOCK → Real: Mapping đầy đủ

| ID | Vị trí trong HTML | Mock value | API thật |
|----|-------------------|------------|----------|
| MOCK-01 | JS: `ADAPTIVE_MODE` | `'briefing'` | `GET /api/user/adaptive-mode` |
| MOCK-02 | `clockDisplay`, `greet-time` | `'07:12'` | `new Date()` + format |
| MOCK-03 | Tên user trong greeting | `'Cường'` | JWT payload `user.name` |
| MOCK-04 | `pend-cnt` = 26 | 26 | `GET /api/memory?status=pending&count=true` → `data.count` |
| MOCK-04b | Sources breakdown | hardcoded | same endpoint + `breakdown=source` |
| MOCK-05 | Schedule items | 3 rows hardcoded | `GET /api/ops/schedule?date=today` |
| MOCK-06 | KPI sync gap = 38 | 38 | `GET /api/kpi/sync-gap` (skip nếu CT unavailable) |
| MOCK-07 | Countdown = 18:32 | hardcoded | `GET /api/ops/schedule?next=true` → countdown từ `start_time` |
| MOCK-07b | Meeting meta | hardcoded | same endpoint |
| MOCK-07c | Meeting title for capture | hardcoded | same endpoint, lấy last finished meeting |
| MOCK-08 | Context cards | 3 hardcoded | `GET /api/memory/search?q={meeting_title}&top_k=3&status=canonical` |
| MOCK-09 | Suggested questions | 3 chips hardcoded | AI: generate từ meeting context, `deepseek-v4-flash` |
| MOCK-09b | Suggested tags | chips hardcoded | extract từ last 10 messages + meeting title |
| MOCK-10 | Chat messages | 2 rows hardcoded | `GET /api/chat/sessions/{tg_session_id}/messages?limit=5` |
| MOCK-11 | Thinking trace | rotating text | SSE: `event:trace data:{...}` |
| MOCK-11b | AI response | hardcoded text | SSE: `event:token` stream + `event:done` |
| MOCK-12 | Memory review item | 1 item hardcoded | `GET /api/memory?status=pending&limit=1&offset={n}` |
| MOCK-12 actions | Approve/reject buttons | `() => {}` | `PATCH /api/memory/{id} {status:...}` |
| MOCK-13 | Reasoning mode | `'auto'` | persist in `localStorage` hoặc user settings |

---

## 5. Telegram WebApp API — Tích hợp

### BackButton

```javascript
// Khi navigate sâu (memory detail, edit) → hiện nút Back của Telegram
function navigateDeep(page) {
  tg?.BackButton.show();
  tg?.BackButton.onClick(() => {
    navigateBack();
    tg?.BackButton.hide();
  });
}
```

### MainButton (Telegram's primary CTA)

```javascript
// Trong Capture mode: dùng Telegram MainButton thay vì custom button
function activateCaptureMainBtn() {
  if (!tg) return;
  tg.MainButton.setText('Gửi vào Memory Review');
  tg.MainButton.show();
  tg.MainButton.onClick(submitCapture);
}

// Khi rời capture mode
function deactivateCaptureMainBtn() {
  tg?.MainButton.hide();
}
```

### HapticFeedback

```javascript
// Dùng cho các actions quan trọng
function haptic(type = 'light') {
  // type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  tg?.HapticFeedback.impactOccurred(type);
}

// Ví dụ:
// Approve memory → haptic('medium')
// Send message → haptic('light')
// Error → haptic('heavy')
```

### Theme sync

```javascript
// Lấy màu từ Telegram theme (dark/light)
const isDark = tg?.colorScheme === 'dark';
// Ajino luôn dùng dark theme → không cần sync
// Nhưng cần respect safe area:
document.documentElement.style.setProperty(
  '--safe-bottom',
  tg?.viewportHeight ? '0px' : 'env(safe-area-inset-bottom, 16px)'
);
```

---

## 6. Chat trong Mini App

### Session management

Mini App dùng **cùng session Telegram** đã có từ bot chat.
Không tạo session mới khi mở Mini App.

```javascript
// Lấy telegram_session_id từ user
async function getTelegramSessionId() {
  const res = await fetch('/api/chat/sessions/telegram', {
    headers: { 'X-Telegram-Id': String(tg.initDataUnsafe.user.id) }
  });
  const { data } = await res.json();
  return data.session_id; // existing or newly created
}
```

### SSE trong Mini App

Telegram WebView support SSE. Dùng như web bình thường.
Nhưng khi Mini App bị minimize (user switch app) → SSE bị đứt.
Cần detect và reconnect:

```javascript
function createSSEConnection(sessionId, messageContent) {
  const eventSource = new EventSource(
    `/api/chat/sessions/${sessionId}/stream?content=${encodeURIComponent(messageContent)}`
  );

  eventSource.addEventListener('token', e => appendToken(e.data));
  eventSource.addEventListener('done', e => {
    const data = JSON.parse(e.data);
    finalizeMessage(data);
    eventSource.close();
  });
  eventSource.addEventListener('error', () => {
    eventSource.close();
    showRetryButton(); // không tự retry vô hạn
  });
}
```

---

## 7. Memory Review trong Mini App

Flow swipe (optional enhancement, Phase 2):
```
Swipe right → Approve (haptic medium)
Swipe left  → Skip
Long press  → Edit
```

Phase 1: chỉ cần 3 nút (Duyệt / Sửa / Bỏ) là đủ.

---

## 8. DB additions cần thiết

```sql
-- Thêm vào schema.sql

-- 1. Behavior patterns
CREATE TABLE user_behavior_patterns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) UNIQUE,
  open_log            JSONB NOT NULL DEFAULT '[]',
  dominant_mode       TEXT,
  pattern_confidence  FLOAT DEFAULT 0,
  last_calculated_at  TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Open log (ghi mỗi lần mở Mini App)
-- Thêm vào bảng audit_log với action='miniapp.open':
-- payload: {mode_shown, vn_hour, had_meeting_soon, platform: 'telegram_miniapp'}
```

---

## 9. Acceptance Criteria

### M-MA1 — Khởi động

- [ ] Mở trong Telegram → `tg.ready()` và `tg.expand()` được gọi
- [ ] Mở lần đầu (< 7 lần dùng) → mode = Chat (default)
- [ ] Mở lúc 07:00–09:00 VN, đã dùng > 7 lần → mode = Briefing
- [ ] `GET /api/user/adaptive-mode` trả đúng mode, không mock
- [ ] audit_log ghi `miniapp.open` với mode_shown

### M-MA2 — Briefing mode

- [ ] pending_count lấy từ API thật, không hardcode
- [ ] schedule lấy từ API thật (nếu chưa có endpoint → hiện "Chưa có lịch hôm nay")
- [ ] KPI sync gap: nếu CT API không có → ẩn card, không hiện 0 hay mock
- [ ] Nút "Duyệt ngay" → navigate sang Memory Review tab

### M-MA3 — Pre-meeting mode

- [ ] Countdown đếm ngược realtime (setInterval 1s)
- [ ] Context cards lấy từ vector search thật
- [ ] Khi meeting bắt đầu (countdown = 0) → mode tự chuyển sang Chat

### M-MA4 — Capture mode

- [ ] Submit → `POST /api/capture {type:'text', content, tags}`
- [ ] Telegram MainButton hiện khi vào Capture mode
- [ ] Haptic medium khi submit thành công
- [ ] Sau submit → toast "✓ Đã gửi vào Memory Review" + clear textarea

### M-MA5 — Chat mode

- [ ] Gửi tin → SSE stream hoạt động
- [ ] Thinking trace hiện đúng steps từ SSE events
- [ ] Nút 🔖 Lưu → tạo pending memory, verify DB
- [ ] Reasoning mode cycle: Auto → Fast → Deep → Auto

### M-MA6 — Memory Review tab

- [ ] Approve → `PATCH /api/memory/{id}` → embedding triggered
- [ ] Pending count badge cập nhật sau mỗi action
- [ ] Hết pending → hiện "Đã duyệt hết 🎉"
- [ ] Haptic medium khi approve, light khi skip

### M-MA7 — Không mock

```bash
# Grep tất cả MOCK còn sót trong production code
grep -rn "🔴 MOCK" apps/web/src/ services/ | grep -v ".html"
# Phải trả empty — không còn MOCK nào trong production code
```

---

## 10. Thứ tự implement

```
Ngày 1:
  - Telegram WebApp init (tg.ready, expand, user info)
  - Adaptive mode endpoint + default = chat
  - Chat mode: SSE + existing pipeline
  - Bottom tabs navigation

Ngày 2:
  - Memory Review tab: CRUD + badge count
  - Capture mode: submit + MainButton
  - Briefing mode: pending + schedule cards

Ngày 3:
  - Pre-meeting mode: countdown + context search
  - Behavior pattern logging (open_log)
  - Pattern learning cron (basic version)
  - Acceptance criteria full pass
```

---

*Đọc cùng: telegram-bot-plan.md, telegram-context-memory.md, AGENTS.md §7*
