"""
Ajino v5 — Final Synthesis
Writes the conclusion and executive summary for the research report.
"""

import httpx

SYNTHESIS_PROMPT = """Viết phần tổng kết và khuyến nghị cho báo cáo nghiên cứu sau.

Tiêu đề: {title}

Tóm tắt các sections đã nghiên cứu:
{section_summaries}

Yêu cầu:
- Viết bằng tiếng Việt
- ## Tổng kết: 200-400 từ, tóm lược findings chính
- ## Khuyến nghị: 3-5 khuyến nghị actionable, có bullet points
- ## Bước tiếp theo: 2-3 hành động cụ thể
- Định dạng Markdown
- Không lặp lại nội dung sections"""


async def write_final_synthesis(
    plan: dict,
    completed_sections: list[dict],
    litellm_url: str,
    litellm_api_key: str = "",
) -> str:
    """Write the final synthesis section."""
    section_summaries = ""
    for sec in completed_sections:
        content = sec.get("content", "")
        # Extract first 200 chars as summary
        summary = content[:200].replace("\n", " ").strip()
        section_summaries += f"- **{sec.get('title', '')}**: {summary}...\n"

    from .llm_client import litellm_call

    prompt = SYNTHESIS_PROMPT.format(
        title=plan.get("title", "Báo cáo nghiên cứu"),
        section_summaries=section_summaries,
    )

    return await litellm_call(
        model="deepseek-pro",
        prompt=prompt,
        max_tokens=1000,
        temperature=0.5,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
    )
