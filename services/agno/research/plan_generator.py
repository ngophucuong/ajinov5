"""
Ajino v5 — Plan Generator
Creates structured research plan from intent analysis.
"""

import json
import uuid

import httpx

PLAN_PROMPT = """Tạo kế hoạch nghiên cứu chi tiết từ phân tích sau. Trả về JSON ONLY.

Intent: {intent_json}

Tạo {section_count} sections, mỗi section có:
- id: unique string
- title: tiêu đề section (tiếng Việt)
- description: mô tả ngắn section này sẽ viết về gì
- search_queries: 1-3 câu query để tìm trên web (tiếng Anh hoặc Việt)
- memory_queries: 1-2 câu query để tìm trong bộ nhớ doanh nghiệp
- key_points: 2-4 điểm chính cần đề cập

Schema:
{{
  "title": "Tiêu đề báo cáo",
  "sections": [
    {{
      "id": "sec-1",
      "title": "Tên section",
      "description": "Mô tả",
      "search_queries": ["query 1", "query 2"],
      "memory_queries": ["memory query 1"],
      "key_points": ["điểm 1", "điểm 2"]
    }}
  ]
}}

Viết tiêu đề sections bằng tiếng Việt. Search queries bằng tiếng Anh nếu chủ đề quốc tế."""


async def generate_plan(
    intent: dict, litellm_url: str, litellm_api_key: str = ""
) -> dict:
    """Generate a structured research plan from intent."""
    section_count = intent.get("estimated_sections", 6)

    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [
                        {
                            "role": "user",
                            "content": PLAN_PROMPT.format(
                                intent_json=json.dumps(intent, ensure_ascii=False),
                                section_count=section_count,
                            ),
                        }
                    ],
                    "max_tokens": 1000,
                    "temperature": 0.2,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            plan = json.loads(raw)

            # Ensure each section has an id
            for i, s in enumerate(plan.get("sections", [])):
                if "id" not in s:
                    s["id"] = f"sec-{i + 1}"

            return plan
    except Exception as e:
        print(f"[plan_generator] error: {e}")

    # Fallback
    titles = intent.get("suggested_sections", ["Tổng quan", "Phân tích", "Kết luận"])
    return {
        "title": intent.get("topic", "Báo cáo nghiên cứu"),
        "sections": [
            {
                "id": f"sec-{i + 1}",
                "title": t,
                "description": f"Phân tích về {t.lower()}",
                "search_queries": [intent.get("topic", "")],
                "memory_queries": [intent.get("topic", "")],
                "key_points": ["Điểm chính 1", "Điểm chính 2"],
            }
            for i, t in enumerate(titles)
        ],
    }
