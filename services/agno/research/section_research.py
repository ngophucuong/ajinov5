"""
Ajino v5 — Section Research
Research a single section: web search + memory + write.
"""

import asyncio
import json

import httpx

SECTION_PROMPT = """Viết một section trong báo cáo nghiên cứu.

Section: {section_title}
Mục tiêu: {objective}
Mô tả: {section_description}
Các câu hỏi section PHẢI trả lời:
{key_questions_formatted}

Các điểm chính cần đề cập: {key_points}

Dữ liệu web search:
{web_data}

Dữ liệu bộ nhớ doanh nghiệp:
{memory_data}

Ngữ cảnh từ các sections trước:
{previous_context}

Yêu cầu:
- Viết bằng tiếng Việt, giọng văn chuyên nghiệp
- Bắt đầu bằng "## {section_title}"
- Độ dài mục tiêu: khoảng {estimated_words} từ
- Format ưu tiên: {output_format}
- Có dẫn chứng cụ thể từ dữ liệu
- Định dạng Markdown: dùng bullet points, bold cho key terms khi phù hợp
- Nếu có số liệu, trình bày trong bảng nếu phù hợp
- Liên kết với ngữ cảnh từ sections trước nếu có
- Nếu không có dữ liệu xác nhận, ghi rõ "Chưa có dữ liệu xác nhận"

Chỉ trả về nội dung section, không thêm gì khác."""


def _format_list(values: list[str], empty: str) -> str:
    if not values:
        return empty
    return "\n".join(f"- {value}" for value in values)


async def research_section(
    section_plan: dict,
    completed_sections: list[dict],
    job_id: str,
    serper_key: str = "",
    db_pool=None,
    litellm_url: str = "http://litellm:4000",
    litellm_api_key: str = "",
) -> str:
    """Research and write a single section."""
    web_data = ""
    memory_data = ""
    key_questions = section_plan.get("key_questions") or []
    if not key_questions:
        fallback_question = (
            section_plan.get("objective")
            or section_plan.get("description")
            or section_plan.get("title")
            or "Section này cần trả lời điều gì?"
        )
        key_questions = [fallback_question]

    search_queries = section_plan.get("search_queries") or []
    memory_queries = section_plan.get("memory_queries") or []
    if not memory_queries and section_plan.get("memory_query"):
        memory_queries = [section_plan["memory_query"]]

    # Web search
    if serper_key and search_queries:
        try:
            for query in search_queries[:3]:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        "https://google.serper.dev/search",
                        json={"q": query, "gl": "vn", "hl": "vi"},
                        headers={"X-API-KEY": serper_key},
                    )
                    results = resp.json()
                    for r in results.get("organic", [])[:3]:
                        web_data += f"- {r.get('title', '')}: {r.get('snippet', '')}\n"
        except Exception as e:
            print(f"[section_research] web search error: {e}")
            web_data = "_Không có dữ liệu web._"

    if not web_data:
        web_data = "_Không có dữ liệu web search._"

    # Memory retrieval
    if db_pool and memory_queries:
        try:
            from agents.memory_agent import retrieve_memories

            for query in memory_queries[:2]:
                memories = await retrieve_memories(
                    query=query, top_k=3, db_pool=db_pool
                )
                for m in memories or []:
                    memory_data += f"- {m['content']}\n"
        except Exception as e:
            print(f"[section_research] memory error: {e}")

    if not memory_data:
        memory_data = "_Không có dữ liệu bộ nhớ doanh nghiệp._"

    # Previous sections context
    previous_context = ""
    preferred_previous_ids = set(section_plan.get("use_previous_sections") or [])
    selected_previous_sections = []
    if preferred_previous_ids:
        for prev in completed_sections:
            if prev.get("id") in preferred_previous_ids and prev.get("content"):
                selected_previous_sections.append(prev)
    if not selected_previous_sections:
        selected_previous_sections = [
            prev for prev in completed_sections[-2:] if prev.get("content")
        ]

    for prev in selected_previous_sections[:3]:
        content_preview = prev.get("content", "")[:500]
        previous_context += f"## {prev.get('title', '')}\n{content_preview}\n\n"

    if not previous_context:
        previous_context = "_Đây là section đầu tiên._"

    # Write section content
    from .llm_client import litellm_call

    prompt = SECTION_PROMPT.format(
        section_title=section_plan["title"],
        objective=section_plan.get("objective", section_plan.get("description", "")),
        section_description=section_plan.get("description", ""),
        key_questions_formatted=_format_list(
            key_questions, "- Chưa có câu hỏi cụ thể"
        ),
        key_points=", ".join(section_plan.get("key_points", [])),
        web_data=web_data,
        memory_data=memory_data,
        previous_context=previous_context,
        estimated_words=section_plan.get("estimated_words", 300),
        output_format=section_plan.get("output_format", "mixed"),
    )

    content = await litellm_call(
        model="deepseek-pro",
        prompt=prompt,
        max_tokens=1500,
        temperature=0.5,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
    )

    if db_pool:
        try:
            await db_pool.execute(
                "INSERT INTO audit_log (action, resource_type, payload) "
                "VALUES ('research.section_complete', 'research_section', $1)",
                json.dumps(
                    {
                        "job_id": job_id,
                        "section_id": section_plan.get("id"),
                        "section_title": section_plan.get("title"),
                        "key_questions_answered": len(key_questions),
                    }
                ),
            )
        except Exception as e:
            print(f"[section_research] audit warning: {e}")

    return content
