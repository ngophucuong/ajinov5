"""
Ajino v5 — Follow-up Resolver
Resolves ambiguous multi-turn follow-up messages into standalone queries.
Heuristic-first, LLM as fallback for complex cases.
"""

import json

import httpx

# ─── Heuristic keywords for follow-up detection ─────────
FOLLOWUP_KEYWORDS = [
    "thêm",
    "nói thêm",
    "ý đó",
    "ý này",
    "cái trên",
    "cái đó",
    "so với",
    "tiếp đi",
    "vì sao",
    "tại sao vậy",
    "nói rõ hơn",
    "giải thích thêm",
    "làm rõ",
    "chi tiết hơn",
    "còn cái",
    "ý số",
    "ý thứ",
    "điểm số",
    "điểm thứ",
    "phương án trên",
    "kế hoạch trên",
    "cách trên",
    "nó là gì",
    "nó hoạt động",
    "cái này",
    "còn nữa",
    "mục đó",
    "đoạn đó",
    "phần đó",
    "phần trên",
    "ý kia",
    "còn gì nữa",
]

# ─── LLM Resolver Prompt ─────────────────────────────
DIALOGUE_STATE_PROMPT = """Analyze the conversation and the user's latest follow-up message.
Return JSON ONLY, no markdown, no explanation.

Conversation (oldest → newest):
{conversation}

Latest user message: "{message}"

Schema:
{{
  "active_topic": "the actual topic being discussed (1 sentence)",
  "user_intent": "what the user really wants right now",
  "resolved_query": "a standalone, self-contained question that captures the full context",
  "followup_type": "clarification" | "expand" | "compare" | "continue" | "new_topic",
  "referenced_points": ["specific points/ideas from the assistant that the user is referring to"],
  "should_reset_context": true | false
}}

Rules:
- followup_type="expand": user wants more detail on a previous point
- followup_type="clarification": user asks "what do you mean by..."
- followup_type="compare": user says "so với cái trên", "compared to..."
- followup_type="continue": user says "tiếp đi", "go on"
- followup_type="new_topic": user has clearly switched to a completely different topic
- should_reset_context=true ONLY when the new topic is unrelated
- referenced_points: extract the ACTUAL content of assistant points the user is referencing
- resolved_query: MUST be a complete question that someone with NO context would understand
- Use the SAME language as the latest message"""


def detect_followup(message: str) -> bool:
    """Heuristic: check if message contains follow-up keywords."""
    msg_lower = message.lower()
    short_followup = len(msg_lower.split()) <= 8
    return short_followup and any(kw in msg_lower for kw in FOLLOWUP_KEYWORDS)


async def resolve_followup(
    latest_user_message: str,
    recent_messages: list[dict],
    litellm_url: str,
    litellm_api_key: str = "",
) -> dict:
    """
    Resolve a follow-up message into a structured dialogue_state.

    Args:
        latest_user_message: the most recent user message
        recent_messages: list of {role, content} dicts (oldest→newest)
        litellm_url: LiteLLM endpoint
        litellm_api_key: LiteLLM master key

    Returns:
        dialogue_state dict with resolved_query, followup_type, etc.
    """
    is_followup = detect_followup(latest_user_message)

    if not is_followup:
        return {
            "active_topic": "",
            "user_intent": "new question",
            "resolved_query": latest_user_message,
            "followup_type": "new_topic",
            "referenced_points": [],
            "should_reset_context": True,
        }

    # Build conversation transcript for LLM
    conversation_text = ""
    for msg in recent_messages:
        role_label = "User" if msg["role"] == "user" else "Assistant"
        # Keep enough assistant content so LLM can map numbered points / bullets.
        conversation_text += f"{role_label}: {msg['content'][:800]}\n"

    prompt = DIALOGUE_STATE_PROMPT.format(
        conversation=conversation_text,
        message=latest_user_message,
    )

    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"].strip()

            # Parse JSON (handle markdown code blocks)
            if raw.startswith("```"):
                lines = raw.split("\n")
                lines = lines[1:] if lines[0].startswith("```") else lines
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                raw = "\n".join(lines).strip()

            result = json.loads(raw)

            # Ensure minimum valid fields
            return {
                "active_topic": result.get("active_topic", ""),
                "user_intent": result.get("user_intent", "follow-up"),
                "resolved_query": result.get("resolved_query", latest_user_message),
                "followup_type": result.get("followup_type", "continue"),
                "referenced_points": result.get("referenced_points", []),
                "should_reset_context": result.get("should_reset_context", False),
            }
    except Exception as e:
        print(f"[followup_resolver] LLM error: {e}")

    # Fallback: heuristic
    last_assistant = ""
    for msg in reversed(recent_messages):
        if msg.get("role") == "assistant" and msg.get("content"):
            last_assistant = msg["content"][:400]
            break

    fallback_query = latest_user_message
    if last_assistant:
        fallback_query = (
            f"Dựa trên nội dung AI vừa trả lời: {last_assistant}\n\n"
            f"Người dùng đang hỏi tiếp: {latest_user_message}"
        )

    return {
        "active_topic": "",
        "user_intent": "follow-up",
        "resolved_query": fallback_query,
        "followup_type": "continue",
        "referenced_points": [],
        "should_reset_context": False,
    }
