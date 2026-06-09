"""
v6 Regression Tests — Advisory Routing
Tests: is_advisory_query() 6 routing cases
Run: python3 tests/v6_test_advisory_routing.py
"""

import sys

# ─── Inline ANALYTICAL_KEYWORDS (mirrors orchestrator.py) ──
ANALYTICAL_KEYWORDS = {
    "phân tích",
    "so sánh",
    "đánh giá",
    "chiến lược",
    "dự báo",
    "tại sao",
    "nguyên nhân",
    "rủi ro",
    "cơ hội",
    "xu hướng",
    "analyze",
    "compare",
    "strategy",
    "forecast",
    "why",
    "risk",
}
ADVISORY_FOLLOWUP_TYPES = {"expand", "compare", "continue"}


def is_advisory_query(resolved_query, mode, dialogue_state=None):
    if mode != "deep":
        return False
    if any(kw in resolved_query.lower() for kw in ANALYTICAL_KEYWORDS):
        return True
    if dialogue_state:
        ft = dialogue_state.get("followup_type", "")
        if ft in ADVISORY_FOLLOWUP_TYPES:
            fields = [
                dialogue_state.get("resolved_query", ""),
                dialogue_state.get("active_topic", ""),
                dialogue_state.get("user_intent", ""),
                " ".join(dialogue_state.get("referenced_points", [])),
            ]
            combined = " ".join(fields).lower()
            if any(kw in combined for kw in ANALYTICAL_KEYWORDS):
                return True
    return False


# ─── Tests ────────────────────────────────────────────
passed = 0
failed = 0


def test(name, query, mode, state, expected):
    global passed, failed
    result = is_advisory_query(query, mode, state)
    if result == expected:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}: expected {expected}, got {result}")


print("=== v6 Advisory Routing — 6 Cases ===")
test("Case 1: deep+keyword", "Phân tích rủi ro logistics Campuchia", "deep", None, True)
test("Case 2: fast mode", "Giá cước Hải Phòng?", "fast", None, False)
test("Case 3: deep+keyword (so sánh)", "So sánh CPT vs FCL", "deep", None, True)
test(
    "Case 4: follow-up inherit",
    "Nói thêm về ý 2",
    "deep",
    {
        "followup_type": "expand",
        "active_topic": "chiến lược logistics",
        "user_intent": "continue",
        "referenced_points": ["phân tích rủi ro"],
    },
    True,
)
test("Case 5: no keyword new topic", "Mấy giờ họp?", "deep", None, False)
test("Case 6: no keyword", "Công thức phở bò", "deep", None, False)

print(f"\nResults: {passed}/{passed + failed} passed")
sys.exit(0 if failed == 0 else 1)
