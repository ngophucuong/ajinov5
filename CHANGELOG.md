# Nhật ký thay đổi — Ajino v5

## 2026-06-08

### 15:55 - Triển khai chức năng chuyển đổi file trong Studio (MarkItDown)
- **File:** `services/agno/skills/file_converter.py` (mới), `services/agno/main.py`, `services/agno/requirements.txt`
- **Thay đổi:**
  - **file_converter.py (mới):** Module chuyển đổi file sang Markdown dùng Microsoft MarkItDown. Hỗ trợ 30+ định dạng: docx, pdf, pptx, xlsx, csv, html, txt, md, ảnh (OCR), audio (transcription), zip, epub, xml, json, rtf, odt. Có `SUPPORTED_TYPES`, `is_supported()`, `get_extension()`, `convert_to_markdown()`, `execute()`
  - **main.py:** Cập nhật `POST /studio/documents` hỗ trợ 2 chế độ: JSON body (tương thích ngược) và multipart form (upload file). Khi upload file: tự động chuyển đổi sang Markdown, auto-title từ tên file nếu không có title, ghi audit log. Tích hợp upload R2 (best-effort). Sửa lỗi user lookup (dùng `int()` thay vì `str()` cho BIGINT column). Seed skill `file_converter` vào DB khi startup.
  - **requirements.txt:** Thêm `markitdown[all]>=0.1.0`
  - **docker-compose.yml (VPS):** Thêm `markitdown[all]` vào lệnh `pip install`
- **Lý do:** Yêu cầu — triển khai chuyển đổi file trong Studio, cho phép user upload file Word/PDF/Excel/ảnh/audio và tự động trích xuất nội dung thành Markdown để lưu vào bộ nhớ
- **Kiểm tra:** Test 5 trường hợp thành công: health check, JSON body, upload markdown (auto-title), upload DOCX (chuyển đổi 11,139 ký tự), định dạng không hỗ trợ (400 lỗi tiếng Việt). DB xác nhận content được lưu, audit log có bản ghi `studio.create` cho mỗi thao tác.

### 23:00 - Thêm API nội bộ cho Worker để Messaging Gateway đọc/ghi trạng thái Telegram qua KV
- **File:** `apps/worker/src/index.ts`
- **Thay đổi:**
  - Thêm `INTERNAL_SECRET` vào Bindings type (dòng 29)
  - Thêm middleware `internalAuth` kiểm tra header `X-Internal-Secret`
  - Thêm 3 route `/internal/kv/tgstate/:id` (GET, PUT, DELETE) — bảo vệ bằng shared secret
  - Dữ liệu lưu trong KV namespace OTP_KV với prefix `tgstate:`, TTL 300 giây
- **Lý do:** Messaging Gateway trên VPS cần đọc/ghi trạng thái hội thoại Telegram (step, data) qua KV của Cloudflare. Không có public IP nên phải gọi qua Worker tunnel.
- **Kiểm tra:** Đã deploy lên agent-gateway, test cả 6 trường hợp (thiếu secret → 403, sai secret → 403, PUT/GET/DELETE với secret đúng → 200/200/200, GET sau DELETE → 404).
- **Secret:** Đã set `INTERNAL_SECRET` qua `wrangler secret put`, cần thêm vào `.env` trên VPS.

### 15:00 - Triển khai Short-term Buffer cho Telegram Context Memory
- **File:** `apps/worker/src/index.ts`, `services/agno/agents/context_buffer.py`, `services/agno/main.py`
- **Thay đổi:**
  - **Worker:** Thêm 3 route `/internal/kv/stbuf/:id` (GET, PUT, DELETE) dùng OTP_KV với prefix `stbuf:`, TTL 1800 giây (30 phút)
  - **context_buffer.py:** Viết đầy đủ module `extract_and_buffer` - dùng DeepSeek Flash trích xuất facts từ tin nhắn, lưu vào KV buffer, đồng thời lưu facts độ tin cậy cao (>70%) vào bộ nhớ dài hạn (DB pgvector)
  - **main.py:** Tích hợp background extraction vào endpoint `/chat` — khi `surface=telegram`, sau khi trả lời sẽ chạy ngầm `extract_and_buffer` qua `asyncio.create_task`
  - Sửa lỗi `INTERNAL_SECRET` và `WORKER_URL` thiếu trong docker-compose agno service
  - Sửa lỗi circular import — truyền `db_pool` qua tham số thay vì `from ..main import get_pool`
- **Lý do:** Triển khai bộ nhớ ngắn hạn cho Telegram — facts từ tin nhắn được trích xuất và lưu tạm 30 phút trong KV, giúp context assembly đọc lại khi cần
- **Kiểm tra:** Deploy worker + upload VPS + restart agno. Test chat surface=telegram thành công, KV buffer có 4 facts (2 mới + 2 cũ), DB có 2 memory entries với embedding đầy đủ.

### 22:00 - Tạo CHANGELOG.md
- **File:** `CHANGELOG.md`
- **Thay đổi:** Tạo file nhật ký thay đổi đầu tiên
- **Lý do:** Chuẩn hóa quy trình ghi log thay đổi code

### 23:30 - Xây dựng Admin Backend API (Bulk Approve, Audit, Metrics)
- **File:** `services/agno/main.py`
- **Thay đổi:**
  - Sửa `PATCH /memory/{id}`: Khi duyệt (status=canonical), tạo embedding đồng bộ trước, nếu lỗi → trả 500
  - Thêm `POST /admin/memory/bulk-approve`: Duyệt hàng loạt tối đa 20 memory, xử lý tuần tự, có audit log
  - Thêm `GET /admin/audit`: Phân trang audit log theo cursor (WHERE created_at < cursor), tối đa 100 dòng/lần
  - Thêm `GET /admin/audit/export`: Xuất CSV audit log (tối đa 1000 dòng gần nhất)
  - Thêm `GET /admin/metrics`: Thống kê số memory canonical/pending, sessions/messages/tokens hôm nay
  - Sửa lỗi cursor pagination: chuyển string cursor thành datetime object để asyncpg nhận đúng kiểu
- **Lý do:** Yêu cầu từ PM — cần Admin API để quản lý memory, audit log, và metrics
