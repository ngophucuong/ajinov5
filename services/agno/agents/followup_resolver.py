"""
Ajino v5 — Follow-up Resolver
Resolves the latest user turn using prior dialogue from both user and assistant.
"""

import json

import httpx


def _format_turns(turns: list[dict]) -> str:
    lines = []
    for turn in turns:
        role = "User" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{role}: {(turn.get('content') or '')[:900]}")
    return "\n".join(lines)


# ─── LLM Resolver Prompt ─────────────────────────────
DIALOGUE_STATE_PROMPT = """Analyze the conversation context and the user's latest message.
Return JSON ONLY, no markdown, no explanation.

Recent turns (closest continuity):
{recent_turns}

Relevant prior turns (older but semantically related):
{relevant_turns}

Latest user message:
"{message}"

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
- Use both user and assistant turns to infer what the latest message refers to.
- referenced_points: extract the ACTUAL content of assistant points the user is referencing.
- resolved_query: MUST be a complete standalone question that someone with NO context would understand.
- If the latest message still relates to the ongoing topic, do NOT mark it as new_topic.
- should_reset_context=true ONLY when the user has clearly moved to an unrelated topic.
- followup_type="compare" when the user compares a new case to a prior recommendation.
- followup_type="clarification" when the user is correcting or narrowing the reference.
- Use the SAME language as the latest message"""


async def resolve_followup(
    latest_user_message: str,
    recent_turns: list[dict],
    relevant_turns: list[dict],
    litellm_url: str,
    litellm_api_key: str = "",
) -> dict:
    """
    Resolve a follow-up message into a structured dialogue_state.

    Args:
        latest_user_message: the most recent user message
        recent_turns: latest nearby turns (oldest→newest)
        relevant_turns: semantically related older turns (oldest→newest)
        litellm_url: LiteLLM endpoint
        litellm_api_key: LiteLLM master key

    Returns:
        dialogue_state dict with resolved_query, followup_type, etc.
    """
    if not recent_turns and not relevant_turns:
        return {
            "active_topic": "",
            "user_intent": "new question",
            "resolved_query": latest_user_message,
            "followup_type": "new_topic",
            "referenced_points": [],
            "should_reset_context": True,
        }

    prompt = DIALOGUE_STATE_PROMPT.format(
        recent_turns=_format_turns(recent_turns) or "(none)",
        relevant_turns=_format_turns(relevant_turns) or "(none)",
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
    last_user = ""
    for msg in reversed(recent_turns or relevant_turns):
        if not last_assistant and msg.get("role") == "assistant" and msg.get("content"):
            last_assistant = msg["content"][:500]
        if not last_user and msg.get("role") == "user" and msg.get("content"):
            last_user = msg["content"][:300]
        if last_assistant and last_user:
            break

    fallback_query = latest_user_message
    if last_assistant or last_user:
        fallback_query = (
            "Dựa trên cuộc trao đổi trước đó, hãy trả lời tiếp cho yêu cầu sau.\n\n"
            f"Ngữ cảnh trước đó của người dùng: {last_user or '(không có)'}\n"
            f"Nội dung AI vừa trả lời: {last_assistant or '(không có)'}\n"
            f"Yêu cầu mới nhất của người dùng: {latest_user_message}"
        )

    return {
        "active_topic": "",
        "user_intent": "continue previous discussion",
        "resolved_query": fallback_query,
        "followup_type": "continue",
        "referenced_points": [],
        "should_reset_context": False,
    }
