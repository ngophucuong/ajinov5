"""
v6 Regression Tests — Production Code Import
Tests call real orchestrator.py / memory_agent.py / synthesis.py
Run on VPS: python3 tests/v6_test_regression.py
"""

import os
import sys

# Try multiple paths for production imports (local + Docker)
for p in [
    os.path.join(os.path.dirname(__file__), "..", "services", "agno", "agents"),
    "/app/agents",
]:
    if os.path.isdir(p):
        sys.path.insert(0, p)
        break

from datetime import datetime, timedelta, timezone

from memory_agent import compute_freshness
from orchestrator import is_advisory_query
from synthesis import enforce_advisory_sections

p = f = 0


def t(n, ok):
    global p, f
    if ok:
        p += 1
        print(f"  ✅ {n}")
    else:
        f += 1
        print(f"  ❌ {n}")


print("=== is_advisory_query() — 6 cases ===")
t("deep+keyword", is_advisory_query("Phân tích rủi ro logistics", "deep"))
t("fast", not is_advisory_query("Giá cước?", "fast"))
t("deep+keyword(so sánh)", is_advisory_query("So sánh CPT", "deep"))
t(
    "follow-up cue",
    is_advisory_query(
        "Nói thêm ý 2",
        "deep",
        {
            "followup_type": "expand",
            "active_topic": "chiến lược",
            "user_intent": "continue",
            "referenced_points": ["phân tích rủi ro"],
        },
    ),
)
t("no keyword", not is_advisory_query("Mấy giờ họp?", "deep"))
t("no keyword 2", not is_advisory_query("Công thức phở", "deep"))

print("\n=== compute_freshness() — 6 cases ===")
now = datetime.now(timezone.utc)
t("10d", compute_freshness({"created_at": now - timedelta(days=10)}) == 1.0)
t("45d", compute_freshness({"created_at": now - timedelta(days=45)}) == 0.8)
t("120d", compute_freshness({"created_at": now - timedelta(days=120)}) == 0.6)
t("250d", compute_freshness({"created_at": now - timedelta(days=250)}) == 0.4)
t("500d", compute_freshness({"created_at": now - timedelta(days=500)}) == 0.2)
t("no date", compute_freshness({}) == 0.5)

print("\n=== enforce_advisory_sections() — 3 cases ===")
ALL6 = ["Kết luận", "Tình huống", "Giả định", "Phân tích", "Rủi ro", "chưa chắc"]
full = "**Kết luận:** x\n**Tình huống:** y\n**Giả định của tôi:** z\n**Phân tích:** w\n**Rủi ro cần lưu ý:** a\n**Điều tôi chưa chắc:** b"
r = enforce_advisory_sections(full)
t("6/6 unchanged", all(s in r for s in ALL6))
partial = (
    "**Kết luận:** x\n**Tình huống:** y\n**Giả định của tôi:** z\n**Phân tích:** w"
)
r = enforce_advisory_sections(partial)
t("4/6→6/6", all(s in r for s in ALL6))
r = enforce_advisory_sections("no sections")
t("0/6→6/6", all(s in r for s in ALL6))

print(f"\nResults: {p}/{p + f} passed")
sys.exit(0 if f == 0 else 1)
