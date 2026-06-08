# Ajino v5 — UI Test Checklist
# Run: npx playwright test tests/admin-ui.spec.ts --headed

## Admin UI

### Navigation & Layout
- [ ] 01 Page loads without JS errors
- [ ] 02 Topbar logo "A" visible (Exo 2, amber color)
- [ ] 03 Sidebar: Dashboard, Memory Review, Studio, Agents, Skills, Audit Log
- [ ] 04 Click each nav → page switches correctly

### Dashboard
- [ ] 05 4 metric cards visible (canonical, pending, sessions, tokens)
- [ ] 06 Agent status card (6 agents with dots)
- [ ] 07 Recent audit card (5 entries)

### Memory Review
- [ ] 08 Tabs: Chờ duyệt / Canonical / Archived with counts
- [ ] 09 Memory list SCROLLS (scrollbar works)
- [ ] 10 Memory row: dot + content + domain tag + time + action buttons
- [ ] 11 Approve button → memory moves to canonical
- [ ] 12 Reject button → memory moves to archived
- [ ] 13 Bulk approve button → all pending processed
- [ ] 14 Filter tab click → list changes

### Studio
- [ ] 15 Document list with file type icons (Word/PDF/Excel/Text)
- [ ] 16 Metadata: filename · N ký tự · date below title
- [ ] 17 Badge: Chưa xử lý (gray) / Đang xử lý (amber spinner) / ✓ N memories (green)
- [ ] 18 Compile button (🧠 icon) → confirm dialog if >20K chars
- [ ] 19 Compile complete → toast + badge update
- [ ] 20 "Xem memory" button appears after compile
- [ ] 21 Drop zone: idle / drag-over (amber border) / uploading states
- [ ] 22 Upload Markdown button triggers file dialog

### Agents
- [ ] 23 6 agents: Orchestrator, Reasoning, Search, Memory, Knowledge, Synthesis
- [ ] 24 Activity bars with widths
- [ ] 25 Status dots: green animated (active) / gray (idle)

### Skills
- [ ] 26 Skills list with toggle switches
- [ ] 27 Toggle click changes skill enabled state

### Audit Log
- [ ] 28 Entries with: time, action, resource, model, tokens
- [ ] 29 "Export CSV" button works
- [ ] 30 "Tải thêm" loads more entries

### Chips Bar
- [ ] 31 Visible on all admin pages at bottom
- [ ] 32 Click "Chat" → navigates to main page

### Chat Page
- [ ] 33 Without JWT → login form (Telegram ID + OTP)
- [ ] 34 With JWT → chat interface
- [ ] 35 Chips bar visible
- [ ] 36 Send button with orbital rings visible
- [ ] 37 Textarea not covered by chips bar

### Cross-cutting
- [ ] 38 All buttons have tooltips (hover shows Vietnamese text)
- [ ] 39 No console errors on any page
- [ ] 40 Scroll works on all list pages

---

## Known Issues
1. Memory scroll: check `overflow-y: auto` on `.scroll` container
2. Chunking: verify no raw markdown (`##`, `**`, `![]`) in memory content
3. Agent status: currently hardcoded (no real agent status API)
