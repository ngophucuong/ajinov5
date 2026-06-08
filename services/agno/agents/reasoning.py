"""
Ajino v5 — Reasoning Agent
Decomposes complex queries into sub-questions.
"""

import httpx


async def decompose(
    message: str, litellm_url: str, litellm_api_key: str = ""
) -> list[str]:
    """Break down a complex query into sub-questions (max 3)."""
    prompt = f"""Phân tích câu hỏi sau thành các câu hỏi con (tối đa 3).
Chỉ trả lời bằng danh sách, mỗi dòng 1 câu, không giải thích.

Câu hỏi: {message}

Các câu hỏi con:"""

    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.3,
                },
                headers=headers,
            )
            data = resp.json()

            content = data["choices"][0]["message"]["content"]
            lines = [
                line.strip("- 0123456789. ")
                for line in content.strip().split("\n")
                if line.strip()
            ]
            return lines[:3]
    except Exception as e:
        print(f"Decompose error: {e}")
        return [message]
