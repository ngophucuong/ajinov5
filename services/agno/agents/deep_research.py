"""
Ajino v5 — Deep Research Agent
Generates structured 2000-5000 word reports from a topic.
Pipeline: plan questions → research each → compile Markdown report.
"""

import json
import re

import httpx

PLAN_PROMPT = """Bạn là chuyên gia nghiên cứu kinh doanh.
Cho chủ đề: "{topic}"

Tạo danh sách 10-12 câu hỏi nghiên cứu cụ thể, có chiều sâu để tổng hợp thành báo cáo hoàn chỉnh.
Bao gồm: tổng quan, thị trường, đối thủ, xu hướng, rủi ro, cơ hội, khuyến nghị chiến lược.
Trả về JSON array: ["câu hỏi 1", "câu hỏi 2", ...]
Chỉ trả về JSON, không có gì khác."""

REPORT_PROMPT = """Bạn là chuyên gia phân tích kinh doanh cấp cao.
Tổng hợp báo cáo nghiên cứu hoàn chỉnh từ các dữ liệu sau.

Chủ đề: {topic}

Dữ liệu nghiên cứu:
{findings}

Yêu cầu:
- Tiêu đề (H1) + ngày tháng hiện tại
- Mục lục
- Tóm tắt điều hành (200-300 từ)
- Các phần phân tích (H2) với dẫn chứng từ dữ liệu
- Bảng so sánh hoặc tóm tắt khi phù hợp
- Kết luận và khuyến nghị
- Nguồn tham khảo

Viết bằng tiếng Việt. Độ dài: 2000-5000 từ. Định dạng Markdown."""


async def generate_research_plan(
    topic: str, litellm_url: str, litellm_api_key: str = ""
) -> list[str]:
    """Generate 10-12 research questions for a topic via LLM."""
    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [
                        {
                            "role": "user",
                            "content": PLAN_PROMPT.format(topic=topic),
                        }
                    ],
                    "max_tokens": 800,
                    "temperature": 0.3,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if match:
                questions = json.loads(match.group(0))
                return [q for q in questions if isinstance(q, str)][:12]
    except Exception as e:
        print(f"[deep_research] plan error: {e}")

    return [
        f"Tổng quan thị trường: {topic}",
        f"Xu hướng và động lực tăng trưởng trong {topic}",
        f"Phân tích đối thủ cạnh tranh: {topic}",
        f"Cơ hội kinh doanh từ {topic}",
        f"Rủi ro và thách thức của {topic}",
        f"Khuyến nghị chiến lược cho {topic}",
    ]


async def research_single_question(
    question: str,
    serper_key: str = "",
    db_pool=None,
) -> dict:
    """Research a single question: web search + canonical memory retrieval."""
    findings = {"question": question, "web": [], "memory": []}

    if serper_key:
        from .search import web_search

        try:
            results = await web_search(question, serper_key)
            findings["web"] = results[:3] if results else []
        except Exception as e:
            print(f"[deep_research] web search error for '{question[:40]}': {e}")

    if db_pool:
        from .memory_agent import retrieve_memories

        try:
            memories = await retrieve_memories(query=question, top_k=5, db_pool=db_pool)
            findings["memory"] = [m["content"] for m in memories] if memories else []
        except Exception as e:
            print(f"[deep_research] memory error for '{question[:40]}': {e}")

    return findings


async def compile_research_report(
    topic: str,
    all_findings: list[dict],
    model: str,
    litellm_url: str,
    litellm_api_key: str = "",
) -> str:
    """Compile all research findings into a structured Markdown report."""
    findings_text = ""
    for i, f in enumerate(all_findings, 1):
        findings_text += f"\n### Câu hỏi {i}: {f['question']}\n"
        if f.get("web"):
            findings_text += "**Nguồn web:**\n"
            for w in f["web"]:
                findings_text += f"- {w.get('title', '')}: {w.get('snippet', '')}\n"
        if f.get("memory"):
            findings_text += "**Bộ nhớ doanh nghiệp:**\n"
            for m in f["memory"]:
                findings_text += f"- {m}\n"
        if not f.get("web") and not f.get("memory"):
            findings_text += "_Không có dữ liệu tìm kiếm._\n"

    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    prompt = REPORT_PROMPT.format(topic=topic, findings=findings_text)

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 8000,
                    "temperature": 0.6,
                },
                headers=headers,
            )
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[deep_research] compile error: {e}")
        return f"# Báo cáo nghiên cứu: {topic}\n\nLỗi tổng hợp báo cáo: {str(e)}"
