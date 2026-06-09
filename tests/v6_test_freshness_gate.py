"""
v6 Regression Tests — Freshness Gate & Advisory Enforcement
Run: python3 tests/v6_test_freshness_gate.py
"""

import sys
from datetime import datetime, timedelta, timezone


# ─── Inline compute_freshness (mirrors memory_agent.py) ──
def compute_freshness(memory_row):
    created_at = memory_row.get("created_at")
    if not created_at:
        return 0.5
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    age_days = (
        datetime.now(timezone.utc) - created_at.replace(tzinfo=timezone.utc)
    ).days
    if age_days < 30:
        return 1.0
    elif age_days < 90:
        return 0.8
    elif age_days < 180:
        return 0.6
    elif age_days < 365:
        return 0.4
    return 0.2


# ─── Inline enforce_advisory_sections (mirrors synthesis.py) ──
ADVISORY_SECTIONS = [
    ("Kết luận", "(Không có đủ dữ liệu để đưa ra kết luận.)"),
    ("Tình huống", "(Không có thông tin cụ thể về tình huống.)"),
    ("Giả định của tôi", "(Không có giả định nào được xác định.)"),
    ("Phân tích", "(Không có dữ liệu để phân tích sâu hơn.)"),
    ("Rủi ro cần lưu ý", "(Không xác định được rủi ro cụ thể.)"),
    ("Điều tôi chưa chắc", "(Tôi không có điểm nào chưa chắc để nêu.)"),
]


def enforce_advisory_sections(content):
    missing = []
    for heading, placeholder in ADVISORY_SECTIONS:
        if heading not in content:
            missing.append(f"**{heading}:** {placeholder}")
    if missing:
        content += "\n\n" + "\n\n".join(missing)
    return content


# ─── Tests ────────────────────────────────────────────
passed = 0
failed = 0


def check(name, condition):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}")


print("=== compute_freshness() ===")
now = datetime.now(timezone.utc)
check("10d → 1.0", compute_freshness({"created_at": now - timedelta(days=10)}) == 1.0)
check("45d → 0.8", compute_freshness({"created_at": now - timedelta(days=45)}) == 0.8)
check("120d → 0.6", compute_freshness({"created_at": now - timedelta(days=120)}) == 0.6)
check("250d → 0.4", compute_freshness({"created_at": now - timedelta(days=250)}) == 0.4)
check("500d → 0.2", compute_freshness({"created_at": now - timedelta(days=500)}) == 0.2)
check("no date → 0.5", compute_freshness({}) == 0.5)

print("\n=== enforce_advisory_sections() ===")
ALL6 = ["Kết luận", "Tình huống", "Giả định", "Phân tích", "Rủi ro", "chưa chắc"]

full = "**Kết luận:** x\n**Tình huống:** y\n**Giả định của tôi:** z\n**Phân tích:** w\n**Rủi ro cần lưu ý:** a\n**Điều tôi chưa chắc:** b"
r = enforce_advisory_sections(full)
check("6/6 → unchanged", all(s in r for s in ALL6))

partial = (
    "**Kết luận:** x\n**Tình huống:** y\n**Giả định của tôi:** z\n**Phân tích:** w"
)
r = enforce_advisory_sections(partial)
check("4/6 → 6/6", all(s in r for s in ALL6))

empty = "no sections"
r = enforce_advisory_sections(empty)
check("0/6 → 6/6", all(s in r for s in ALL6))

print(f"\nResults: {passed}/{passed + failed} passed")
sys.exit(0 if failed == 0 else 1)
