"""
Ajino v5 — Section Research
Research a single section: web search + memory + write.
"""

import asyncio

import httpx

SECTION_PROMPT = """Viết một section trong báo cáo nghiên cứu.

Section: {section_title}
Mô tả: {section_description}
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
- Tối thiểu 300 từ, tối đa 800 từ
- Có dẫn chứng cụ thể từ dữ liệu
- Định dạng Markdown: dùng bullet points, bold cho key terms
- Nếu có số liệu, trình bày trong bảng nếu phù hợp
- Liên kết với ngữ cảnh từ sections trước nếu có

Chỉ trả về nội dung section, không thêm gì khác."""


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

    # Web search
    if serper_key and section_plan.get("search_queries"):
        try:
            for query in section_plan["search_queries"][:2]:
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
    if db_pool and section_plan.get("memory_queries"):
        try:
            from agents.memory_agent import retrieve_memories

            for query in section_plan["memory_queries"][:1]:
                memories = await retrieve_memories(
                    query=query, top_k=3, db_pool=db_pool
                )
                for m in memories or []:
                    memory_data += f"- {m['content']}\n"
        except Exception as e:
            print(f"[section_research] memory error: {e}")

    if not memory_data:
        memory_data = "_Không có dữ liệu bộ nhớ doanh nghiệp._"

    # Previous sections context (first 500 chars each)
    previous_context = ""
    for prev in completed_sections[-2:]:  # Last 2 sections only
        content_preview = prev.get("content", "")[:500]
        previous_context += f"## {prev.get('title', '')}\n{content_preview}\n\n"

    if not previous_context:
        previous_context = "_Đây là section đầu tiên._"

    # Write section content
    from .llm_client import litellm_call

    prompt = SECTION_PROMPT.format(
        section_title=section_plan["title"],
        section_description=section_plan.get("description", ""),
        key_points=", ".join(section_plan.get("key_points", [])),
        web_data=web_data,
        memory_data=memory_data,
        previous_context=previous_context,
    )

    content = await litellm_call(
        model="deepseek-pro",
        prompt=prompt,
        max_tokens=1500,
        temperature=0.5,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
    )

    return content
