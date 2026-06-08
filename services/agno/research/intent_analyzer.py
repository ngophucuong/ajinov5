"""
Ajino v5 — Intent Analyzer
Analyzes user query to determine research type, depth, and key questions.
"""

import json

import httpx

INTENT_PROMPT = """Phân tích yêu cầu nghiên cứu sau và trả về JSON ONLY.
JSON phải hợp lệ, không có markdown code block, không có comment.

Yêu cầu: {query}

Schema:
{{
  "topic": "chủ đề cốt lõi ngắn gọn",
  "research_type": "competitive" | "market" | "strategic" | "technical" | "general",
  "depth": "brief" | "standard" | "deep",
  "key_questions": ["câu hỏi 1", "câu hỏi 2", ...],
  "suggested_sections": ["tên section 1", ...],
  "search_keywords": ["từ khóa 1", ...],
  "context_from_memory": true | false,
  "estimated_sections": 4 | 6 | 8
}}

Rules:
- depth=brief: 4 sections, phù hợp câu hỏi đơn giản
- depth=standard: 6 sections, mặc định
- depth=deep: 8 sections, khi query có từ "toàn diện", "chi tiết", "2030", "chiến lược dài hạn"
- key_questions: đây là các câu hỏi AI cần TỰ TRẢ LỜI trong quá trình research
- search_keywords: dùng cho Serper search, viết bằng tiếng Anh hoặc tiếng Việt tùy ngữ cảnh"""


async def analyze_intent(
    query: str, litellm_url: str, litellm_api_key: str = ""
) -> dict:
    """Analyze user intent via LLM. Returns structured intent dict."""
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
                            "content": INTENT_PROMPT.format(query=query),
                        }
                    ],
                    "max_tokens": 500,
                    "temperature": 0,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]
            # Extract JSON from response (may have markdown code block)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            return json.loads(raw)
    except Exception as e:
        print(f"[intent_analyzer] error: {e}")

    # Fallback
    return {
        "topic": query[:100],
        "research_type": "general",
        "depth": "standard",
        "key_questions": [query],
        "suggested_sections": ["Tổng quan", "Phân tích", "Kết luận"],
        "search_keywords": [query],
        "context_from_memory": True,
        "estimated_sections": 3,
    }
