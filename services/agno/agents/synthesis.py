"""
Ajino v5 — Synthesis Agent
Generates final response using DeepSeek via LiteLLM.
"""

import httpx

SYSTEM_PROMPT = """Bạn là Ajino, trợ lý AI cho lãnh đạo doanh nghiệp.
Trả lời bằng tiếng Việt, ngắn gọn, chính xác.
Sử dụng dữ liệu tìm kiếm và bộ nhớ doanh nghiệp được cung cấp nếu có.
Định dạng Markdown khi cần thiết."""


async def synthesize(
    user_message: str,
    sub_questions: list[str],
    search_results: list[dict],
    model: str,
    litellm_url: str,
    litellm_api_key: str = "",
    memory_context: str = "",
) -> dict:
    """Generate final response with context."""
    context = ""
    if search_results:
        for sr in search_results:
            context += f"\n### Kết quả tìm kiếm cho: {sr['query']}\n"
            for r in sr["results"]:
                context += f"- {r['title']}: {r['snippet']}\n"

    if memory_context:
        context += f"\n{memory_context}"

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if context:
        messages.append({"role": "system", "content": f"Dữ liệu tham khảo:\n{context}"})

    if sub_questions and len(sub_questions) > 1:
        questions_text = "\n".join(f"- {q}" for q in sub_questions)
        messages.append(
            {
                "role": "user",
                "content": f"Câu hỏi gốc: {user_message}\n\nCác khía cạnh cần phân tích:\n{questions_text}",
            }
        )
    else:
        messages.append({"role": "user", "content": user_message})

    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": 2000,
                    "temperature": 0.7,
                },
                headers=headers,
            )
            data = resp.json()

            content = data["choices"][0]["message"]["content"]
            tokens = data.get("usage", {}).get("total_tokens", 0)

            memory_candidates = []
            for sentence in content.split("."):
                s = sentence.strip()
                if len(s) > 30 and any(
                    kw in s.lower()
                    for kw in [
                        "tỷ",
                        "triệu",
                        "%",
                        "tăng",
                        "giảm",
                        "dự báo",
                        "chiến lược",
                        "sla",
                    ]
                ):
                    memory_candidates.append({"content": s + ".", "confidence": 0.7})

            return {
                "content": content,
                "tokens_used": tokens,
                "memory_candidates": memory_candidates,
            }
    except Exception as e:
        print(f"Synthesis error: {e}")
        return {
            "content": f"Xin lỗi, tôi gặp lỗi khi xử lý: {str(e)}",
            "tokens_used": 0,
            "memory_candidates": [],
        }
