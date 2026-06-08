"""
Ajino v5 — Plan Generator
Creates structured research plans from intent analysis.
"""

import json
from typing import Any

import httpx

PLAN_PROMPT = """Tạo kế hoạch nghiên cứu chi tiết từ intent sau. Trả về JSON ONLY.

Intent: {intent_json}

Tạo {section_count} sections, mỗi section có:
- id: unique string
- title: tiêu đề section (tiếng Việt)
- description: mô tả ngắn section này sẽ viết về gì
- objective: section này phải trả lời câu hỏi gì
- search_queries: 1-3 câu query để tìm trên web (tiếng Anh hoặc Việt)
- memory_queries: 1-2 câu query để tìm trong bộ nhớ doanh nghiệp
- use_previous_sections: danh sách id section trước cần tham chiếu
- output_format: "paragraph" | "bullets" | "table" | "mixed"
- estimated_words: 200 | 300 | 400 | 500
- key_questions: 2-3 câu hỏi section này PHẢI trả lời
- key_points: 2-4 điểm chính cần đề cập

Schema:
{{
  "title": "Tiêu đề báo cáo",
  "sections": [
    {{
      "id": "sec-1",
      "title": "Tên section",
      "description": "Mô tả",
      "objective": "Mục tiêu cụ thể",
      "search_queries": ["query 1", "query 2"],
      "memory_queries": ["memory query 1"],
      "use_previous_sections": [],
      "output_format": "mixed",
      "estimated_words": 300,
      "key_questions": ["câu hỏi 1", "câu hỏi 2"],
      "key_points": ["điểm 1", "điểm 2"]
    }}
  ]
}}

Rules:
- Viết tiêu đề sections bằng tiếng Việt.
- Search queries bằng tiếng Anh nếu chủ đề quốc tế.
- Nếu intent có trường "angles", hãy phản ánh blind spots, decision_to_make,
  timeframe và stakeholders vào các sections.
- Nếu intent.context_from_memory=true, ít nhất 1-2 sections phải tận dụng memory_queries.
- Tránh title generic kiểu "Tổng quan", "Phân tích", "Kết luận" nếu có thể.
- Ít nhất 1 section cuối nên dùng use_previous_sections để nối logic với sections trước."""


def _strip_code_fence(raw: str) -> str:
    text = (raw or "").strip()
    if not text.startswith("```"):
        return text

    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _clean_string_list(values: Any, *, limit: int) -> list[str]:
    if not isinstance(values, list):
        return []

    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        key = cleaned.lower()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
        if len(result) >= limit:
            break
    return result


def _normalize_plan(plan: dict[str, Any], intent: dict[str, Any], section_count: int) -> dict:
    sections = plan.get("sections")
    if not isinstance(sections, list):
        sections = []

    normalized_sections = []
    for i, section in enumerate(sections[:section_count]):
        if not isinstance(section, dict):
            continue

        title = str(section.get("title") or "").strip() or f"Góc phân tích {i + 1}"
        description = str(section.get("description") or "").strip()
        objective = str(section.get("objective") or "").strip() or description or (
            f"Trả lời câu hỏi trọng tâm của section {title}"
        )
        search_queries = _clean_string_list(section.get("search_queries"), limit=3)
        memory_queries = _clean_string_list(section.get("memory_queries"), limit=2)
        use_previous_sections = _clean_string_list(
            section.get("use_previous_sections"), limit=4
        )
        key_questions = _clean_string_list(section.get("key_questions"), limit=3)
        key_points = _clean_string_list(section.get("key_points"), limit=4)

        output_format = section.get("output_format")
        if output_format not in {"paragraph", "bullets", "table", "mixed"}:
            output_format = "mixed"

        estimated_words = section.get("estimated_words")
        if estimated_words not in {200, 300, 400, 500}:
            estimated_words = 300

        normalized_sections.append(
            {
                "id": str(section.get("id") or f"sec-{i + 1}"),
                "title": title,
                "description": description or objective,
                "objective": objective,
                "search_queries": search_queries or [title],
                "memory_queries": memory_queries or [intent.get("topic", title)],
                "use_previous_sections": use_previous_sections,
                "output_format": output_format,
                "estimated_words": estimated_words,
                "key_questions": key_questions or [objective],
                "key_points": key_points or [objective],
            }
        )

    return {
        "title": str(plan.get("title") or intent.get("topic") or "Báo cáo nghiên cứu"),
        "sections": normalized_sections,
    }


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
            plan = json.loads(_strip_code_fence(raw))
            return _normalize_plan(plan, intent, section_count)
    except Exception as e:
        print(f"[plan_generator] error: {e}")

    # Fallback
    titles = intent.get(
        "suggested_sections",
        [
            "Bối cảnh & phạm vi",
            "Hiện trạng",
            "Rủi ro & cơ hội",
            "Khuyến nghị",
        ],
    )
    if len(titles) < section_count:
        for i in range(len(titles), section_count):
            titles.append(f"Góc phân tích {i + 1}")

    return {
        "title": intent.get("topic", "Báo cáo nghiên cứu"),
        "sections": [
            {
                "id": f"sec-{i + 1}",
                "title": t,
                "description": f"Phân tích về {t.lower()}",
                "objective": f"Trả lời câu hỏi trọng tâm của phần {t.lower()}",
                "search_queries": [intent.get("topic", "")],
                "memory_queries": [intent.get("topic", "")],
                "use_previous_sections": [f"sec-{i}"] if i > 0 else [],
                "output_format": "mixed",
                "estimated_words": 300,
                "key_questions": [f"{t} cho thấy điều gì quan trọng?"],
                "key_points": ["Điểm chính 1", "Điểm chính 2"],
            }
            for i, t in enumerate(titles[:section_count])
        ],
    }
