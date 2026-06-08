-- ============================================================
-- AJINO V5 — SEED DATA
-- Run: docker exec -i ajinov5-postgres psql -U ajino -d ajino < seed.sql
-- ============================================================

-- ── USERS ────────────────────────────────────────────────────
INSERT INTO users (id, telegram_id, name, role)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  5250339472,
  'Ngô Phú Cường',
  'ceo'
) ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name;

-- ── SKILLS ───────────────────────────────────────────────────
INSERT INTO skills (name, description, version, enabled, config) VALUES
  ('web_search',        'Tìm kiếm web qua Serper API',                    '1.0.0', true,  '{"provider":"serper","max_results":5}'),
  ('memory_retrieval',  'Tìm kiếm hybrid keyword + vector trong memory',  '1.0.0', true,  '{"top_k":7,"min_score":0.72}'),
  ('report_generator',  'Tạo báo cáo Markdown từ context đã tổng hợp',   '1.0.0', true,  '{}'),
  ('competitive_intel', 'Phân tích đối thủ cạnh tranh theo domain',       '1.0.0', true,  '{"domain":"logistics"}'),
  ('capture_extractor', 'Trích xuất facts từ text/link/image',            '1.0.0', true,  '{"model":"deepseek-v4-flash"}')
ON CONFLICT (name) DO NOTHING;

-- ── CANONICAL MEMORY — 8H OPERATIONS ─────────────────────────
INSERT INTO memory (id, content, status, source, approved_at, approved_by, decay_at, metadata) VALUES

('b1000000-0000-0000-0000-000000000001',
 '8H (Công ty Cổ phần Giải pháp 8 Giờ) có 17 người, vận hành theo mô hình Embedded Technology Partner (ETP). Doanh thu 2026 ở mức 10.69–10.79 tỷ VND, biên lợi nhuận 13.2%.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"8h","category":"company_profile","importance":"high"}'),

('b1000000-0000-0000-0000-000000000002',
 '8H có 3 luồng doanh thu: Outsourcing 58%, Hybrid (fixed + per-transaction) 33%, SaaS 0% năm 2026. Mục tiêu 2030 đạt 41–50 tỷ VND, biên 20–25%.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"8h","category":"revenue_model","importance":"high"}'),

('b1000000-0000-0000-0000-000000000003',
 '8H có 5 nhóm nhân sự: BGĐ (2), PM (3), BA-Design (5), Dev (5), BO (2). Hệ thống level 4 chiều L1–L5 với hệ số 1.0–2.2. AI tool investment 20 triệu/tháng, đo thực tế: Dev +1.6x, BA +1.4x productivity.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"8h","category":"team_structure","importance":"medium"}'),

('b1000000-0000-0000-0000-000000000004',
 'XC (Xuân Cương) sở hữu 40% cổ phần 8H và là anchor client chiếm ~70% doanh thu. XC là logistics operator lớn tại cửa khẩu Hữu Nghị, Lạng Sơn.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"8h","category":"key_relationship","entity":"XC","importance":"critical"}'),

('b1000000-0000-0000-0000-000000000005',
 'Biên lợi nhuận 8H hiện tại 13.2% — dưới ngưỡng 15% để kích hoạt thưởng công ty. Đây là KPI ưu tiên cần cải thiện trong 2026.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '1 year',
 '{"domain":"8h","category":"kpi","importance":"high","alert":true}'),

-- ── CANONICAL MEMORY — LOGISTICS DOMAIN ──────────────────────

('b2000000-0000-0000-0000-000000000001',
 'Cửa khẩu Hữu Nghị (Lạng Sơn) là cửa khẩu quốc tế đường bộ lớn nhất Việt Nam tiếp giáp Trung Quốc, xử lý khoảng 60–70% lưu lượng hàng hóa đường bộ Việt–Trung. Giờ thông quan: 7h–22h hàng ngày.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"logistics","category":"infrastructure","location":"Hữu Nghị","importance":"high"}'),

('b2000000-0000-0000-0000-000000000002',
 'Thời gian thông quan nội bộ của XC trung bình 4.2 giờ/lô hàng, thấp hơn mức trung bình ngành 6–8 giờ. Lợi thế cạnh tranh chính đến từ xử lý hồ sơ song song và quan hệ với cơ quan hải quan.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '1 year',
 '{"domain":"logistics","category":"competitive_advantage","entity":"XC","importance":"high"}'),

('b2000000-0000-0000-0000-000000000003',
 'Các đối thủ logistics xuyên biên giới Việt–Trung đáng chú ý: Viettel Post (đang mở rộng cửa khẩu phụ từ Q2/2026), SF Express (đầu tư hạ tầng kho bãi tại Lạng Sơn), Bảo Nguyên, Tân Đại Dương.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '1 year',
 '{"domain":"logistics","category":"competitors","importance":"high"}'),

('b2000000-0000-0000-0000-000000000004',
 'KPI cốt lõi của hệ thống Smart Control Tower: "sync gap" — khoảng thời gian giữa lúc cả 2 xe (Việt Nam và Trung Quốc) sẵn sàng và lúc transfer thực sự bắt đầu. Sync gap thấp = hiệu quả cao.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"logistics","category":"kpi","product":"smart_control_tower","importance":"critical"}'),

('b2000000-0000-0000-0000-000000000005',
 'Hàng hóa Việt–Trung phân 3 luồng chính: (1) Nông sản tươi — thời vụ, cần thông quan nhanh dưới 4h; (2) Linh kiện/hàng công nghiệp — ổn định, giá trị cao; (3) Hàng thương mại điện tử — tăng trưởng nhanh, cần fulfillment linh hoạt.',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"logistics","category":"cargo_types","importance":"medium"}'),

('b2000000-0000-0000-0000-000000000006',
 'LSS là JV với đối tác Trung Quốc (Lishi), cấu trúc 30/70. Mr. Hồ là đối tác cấp cao phía TQ. Đang xử lý 2 projects: Project A (bonded warehouse linh kiện ôtô), Project B (e-commerce fulfillment).',
 'canonical', 'manual', now(), 'a1000000-0000-0000-0000-000000000001',
 now() + interval '2 years',
 '{"domain":"logistics","category":"partnership","entity":"LSS","importance":"high"}')

ON CONFLICT (id) DO NOTHING;

-- ── CHAT SESSION MẪU ─────────────────────────────────────────
INSERT INTO chat_sessions (id, user_id, title, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Phân tích vị thế cạnh tranh logistics Q3',
  ARRAY['logistics','strategy','competitive']
) ON CONFLICT (id) DO NOTHING;

-- ── AUDIT LOG — SEED ACTIONS ─────────────────────────────────
INSERT INTO audit_log (user_id, action, resource_type, payload)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'system.seed',
  'memory',
  '{"count":11,"source":"initial_seed","version":"1.0"}'
);

-- ── VERIFY ────────────────────────────────────────────────────
SELECT 'users'   AS tbl, count(*) FROM users
UNION ALL
SELECT 'skills',        count(*) FROM skills
UNION ALL
SELECT 'memory',        count(*) FROM memory
UNION ALL
SELECT 'chat_sessions', count(*) FROM chat_sessions
UNION ALL
SELECT 'audit_log',     count(*) FROM audit_log;
