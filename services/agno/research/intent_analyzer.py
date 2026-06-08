"""
Ajino v5 — Intent Analyzer
Two-step intent analysis for Deep Research while preserving the legacy
intent contract consumed by the existing planner and job manager.
"""

import json
from typing import Any

from .llm_client import litellm_call

ANGLE_PROMPT = """Phân tích yêu cầu nghiên cứu sau từ 7 góc độ khác nhau.
Trả về JSON ONLY, không markdown, không giải thích.

Yêu cầu: "{query}"

Schema:
{{
  "who": {{
    "primary": "Ai là người ra quyết định liên quan trực tiếp?",
    "stakeholders": ["stakeholder 1", "stakeholder 2"],
    "competitors": ["đối thủ 1", "đối thủ 2"]
  }},
  "what": {{
    "core_topic": "Chủ đề cốt lõi 1 câu",
    "dimensions": ["chiều phân tích 1", "chiều 2", "chiều 3"],
    "not_asking_about": ["thứ KHÔNG liên quan để tránh lạc đề"]
  }},
  "when": {{
    "timeframe": "khung thời gian cụ thể nếu có",
    "key_milestones": ["mốc quan trọng trong timeframe"],
    "urgency": "immediate" | "strategic" | "exploratory"
  }},
  "why": {{
    "underlying_goal": "Mục đích thật sự phía sau câu hỏi",
    "decision_to_make": "Quyết định nào sẽ được đưa ra sau nghiên cứu này?",
    "success_metric": "Nghiên cứu thành công khi nào?"
  }},
  "risk": {{
    "known_risks": ["rủi ro đã biết liên quan"],
    "unknown_risks": ["rủi ro tiềm ẩn cần tìm hiểu"],
    "blind_spots": ["góc khuất có thể bị bỏ qua"]
  }},
  "gap": {{
    "likely_knows": ["thông tin người hỏi có thể đã biết"],
    "likely_missing": ["thông tin quan trọng họ đang thiếu"],
    "assumptions_to_validate": ["giả định cần kiểm chứng"]
  }},
  "action": {{
    "output_type": "decision" | "strategy" | "analysis" | "report",
    "audience": "chỉ người hỏi" | "team" | "board" | "partner",
    "recommended_depth": "brief" | "standard" | "deep",
    "recommended_sections": 4 | 6 | 8
  }}
}}

Rules:
- recommended_depth=deep khi: có từ "toàn diện", "chiến lược", "2030", "dài hạn", hoặc urgency=strategic
- recommended_depth=brief khi: câu hỏi đơn giản, factual, urgency=immediate
- recommended_sections phải khớp depth: brief=4, standard=6, deep=8
- not_asking_about tối đa 3 items
- competitors chỉ điền nếu query liên quan cạnh tranh"""

INTENT_SYNTHESIS_PROMPT = """Dựa trên query gốc, phân tích 7 góc độ và context canonical memory,
hãy tạo intent JSON cho pipeline nghiên cứu hiện tại.
Trả về JSON ONLY, không markdown, không giải thích.

Query gốc: "{query}"

Phân tích 7 góc:
{angles_json}

Canonical memory liên quan:
{memory_context}

Schema output:
{{
  "topic": "chủ đề cốt lõi ngắn gọn",
  "research_type": "competitive" | "market" | "strategic" | "technical" | "general",
  "depth": "brief" | "standard" | "deep",
  "key_questions": ["câu hỏi 1", "câu hỏi 2", "..."],
  "suggested_sections": ["tên section 1", "..."],
  "search_keywords": ["từ khóa 1", "..."],
  "context_from_memory": true | false,
  "estimated_sections": 4 | 6 | 8
}}

Rules:
- depth phải khớp với recommended_depth nếu phân tích 7 góc đã chỉ ra rõ
- estimated_sections chỉ được là 4, 6 hoặc 8
- suggested_sections phải cụ thể, tránh "Tổng quan", "Phân tích", "Kết luận" nếu có thể
- key_questions là các câu AI phải tự trả lời trong research
- search_keywords phải usable cho Serper, mix Việt/Anh nếu hợp lý
- context_from_memory=true nếu canonical memory có ích rõ ràng
- phản ánh blind_spots, assumptions_to_validate, decision_to_make vào intent"""

SECTION_COUNT_BY_DEPTH = {
    "brief": 4,
    "standard": 6,
    "deep": 8,
}


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


def _parse_json_payload(raw: str) -> dict[str, Any] | None:
    text = _strip_code_fence(raw)
    if not text:
        return None

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


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


def _fallback_angles(query: str) -> dict[str, Any]:
    return {
        "who": {"primary": "CEO", "stakeholders": [], "competitors": []},
        "what": {
            "core_topic": query[:100],
            "dimensions": ["tổng quan"],
            "not_asking_about": ["chi tiết ngoài phạm vi chưa nêu"],
        },
        "when": {
            "timeframe": "hiện tại",
            "key_milestones": [],
            "urgency": "strategic",
        },
        "why": {
            "underlying_goal": query[:160],
            "decision_to_make": "Xác định định hướng tiếp theo",
            "success_metric": "Có insights đủ để ra quyết định",
        },
        "risk": {
            "known_risks": [],
            "unknown_risks": ["Giả định chưa được kiểm chứng"],
            "blind_spots": ["Phạm vi nghiên cứu có thể chưa đầy đủ"],
        },
        "gap": {
            "likely_knows": [],
            "likely_missing": ["Dữ liệu định lượng xác nhận"],
            "assumptions_to_validate": ["Những nhận định hiện tại có thể chưa đúng"],
        },
        "action": {
            "output_type": "analysis",
            "audience": "chỉ người hỏi",
            "recommended_depth": "standard",
            "recommended_sections": 6,
        },
    }


def _fallback_intent(query: str, angles: dict[str, Any], memory_hits: int) -> dict[str, Any]:
    depth = angles.get("action", {}).get("recommended_depth", "standard")
    if depth not in SECTION_COUNT_BY_DEPTH:
        depth = "standard"

    topic = angles.get("what", {}).get("core_topic", query[:100]).strip() or query[:100]
    dimensions = _clean_string_list(
        angles.get("what", {}).get("dimensions", []),
        limit=4,
    )
    risks = _clean_string_list(
        angles.get("risk", {}).get("blind_spots", []),
        limit=3,
    )
    key_questions = dimensions or [topic]
    if risks:
        key_questions.extend(risks[:2])

    stakeholders = _clean_string_list(
        angles.get("who", {}).get("stakeholders", []),
        limit=3,
    )
    section_seed = dimensions + stakeholders + ["Khuyến nghị hành động"]
    suggested_sections = section_seed[: SECTION_COUNT_BY_DEPTH[depth]]
    if not suggested_sections:
        suggested_sections = [
            f"Tổng quan {topic}",
            "Hiện trạng",
            "Cơ hội và rủi ro",
            "Khuyến nghị",
        ][: SECTION_COUNT_BY_DEPTH[depth]]

    return {
        "topic": topic,
        "research_type": "strategic" if depth == "deep" else "general",
        "depth": depth,
        "key_questions": key_questions[:6],
        "suggested_sections": suggested_sections,
        "search_keywords": [topic] + dimensions[:2],
        "context_from_memory": memory_hits > 0,
        "estimated_sections": SECTION_COUNT_BY_DEPTH[depth],
        "angles": angles,
        "memory_hits": memory_hits,
    }


def _normalize_intent(
    intent: dict[str, Any],
    query: str,
    angles: dict[str, Any],
    memory_hits: int,
) -> dict[str, Any]:
    depth = intent.get("depth")
    if depth not in SECTION_COUNT_BY_DEPTH:
        depth = angles.get("action", {}).get("recommended_depth", "standard")
    if depth not in SECTION_COUNT_BY_DEPTH:
        depth = "standard"

    estimated_sections = intent.get("estimated_sections")
    if estimated_sections not in {4, 6, 8}:
        estimated_sections = SECTION_COUNT_BY_DEPTH[depth]

    topic = str(intent.get("topic") or "").strip() or (
        angles.get("what", {}).get("core_topic", query[:100]).strip() or query[:100]
    )

    research_type = intent.get("research_type")
    if research_type not in {
        "competitive",
        "market",
        "strategic",
        "technical",
        "general",
    }:
        research_type = "strategic" if depth == "deep" else "general"

    key_questions = _clean_string_list(intent.get("key_questions"), limit=6)
    if not key_questions:
        key_questions = _fallback_intent(query, angles, memory_hits)["key_questions"]

    suggested_sections = _clean_string_list(
        intent.get("suggested_sections"),
        limit=estimated_sections,
    )
    if not suggested_sections:
        suggested_sections = _fallback_intent(query, angles, memory_hits)[
            "suggested_sections"
        ]

    search_keywords = _clean_string_list(intent.get("search_keywords"), limit=8)
    if not search_keywords:
        search_keywords = [topic]
        search_keywords.extend(key_questions[:3])

    context_from_memory = bool(intent.get("context_from_memory")) if memory_hits else False

    return {
        "topic": topic,
        "research_type": research_type,
        "depth": depth,
        "key_questions": key_questions,
        "suggested_sections": suggested_sections,
        "search_keywords": search_keywords,
        "context_from_memory": context_from_memory,
        "estimated_sections": estimated_sections,
        "angles": angles,
        "memory_hits": memory_hits,
    }


async def _retrieve_memory_context(query: str, db_pool) -> tuple[str, int]:
    if not db_pool or not query:
        return "Không có canonical memory liên quan.", 0

    try:
        from agents.memory_agent import retrieve_memories

        memories = await retrieve_memories(query=query, top_k=5, db_pool=db_pool)
    except Exception as exc:
        print(f"[intent_analyzer] memory lookup error: {exc}")
        return "Không có canonical memory liên quan.", 0

    if not memories:
        return "Không có canonical memory liên quan.", 0

    lines = []
    for memory in memories[:5]:
        content = str(memory.get("content") or "").strip()
        if content:
            lines.append(f"- {content}")

    if not lines:
        return "Không có canonical memory liên quan.", 0

    return "\n".join(lines), len(lines)


async def analyze_intent(
    query: str,
    litellm_url: str,
    litellm_api_key: str = "",
    db_pool=None,
) -> dict[str, Any]:
    """
    Two-step intent analysis:
    1. Flash derives seven analytical angles.
    2. Pro synthesizes those angles into the legacy intent schema.
    """
    angles_raw = await litellm_call(
        model="deepseek-flash",
        prompt=ANGLE_PROMPT.format(query=query),
        max_tokens=900,
        temperature=0,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
    )
    angles = _parse_json_payload(angles_raw) or _fallback_angles(query)

    topic_for_memory = (
        str(angles.get("what", {}).get("core_topic") or "").strip() or query
    )
    memory_context, memory_hits = await _retrieve_memory_context(topic_for_memory, db_pool)

    intent_raw = await litellm_call(
        model="deepseek-pro",
        prompt=INTENT_SYNTHESIS_PROMPT.format(
            query=query,
            angles_json=json.dumps(angles, ensure_ascii=False, indent=2),
            memory_context=memory_context,
        ),
        max_tokens=1200,
        temperature=0.2,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
    )
    parsed_intent = _parse_json_payload(intent_raw)

    if not parsed_intent:
        print("[intent_analyzer] synthesis parse failed, using fallback intent")
        return _fallback_intent(query, angles, memory_hits)

    return _normalize_intent(parsed_intent, query, angles, memory_hits)
