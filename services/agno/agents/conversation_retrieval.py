"""
Ajino v5 — Conversation Retrieval
Selects recent and semantically relevant turns from a chat session.
"""

from __future__ import annotations

import re


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "cho",
    "có",
    "của",
    "cũng",
    "đã",
    "đang",
    "đây",
    "đi",
    "đó",
    "được",
    "em",
    "for",
    "from",
    "gì",
    "hay",
    "hơn",
    "in",
    "is",
    "it",
    "khi",
    "không",
    "là",
    "lại",
    "mà",
    "mỗi",
    "một",
    "này",
    "nhé",
    "như",
    "of",
    "on",
    "sao",
    "sẽ",
    "so",
    "tại",
    "thì",
    "the",
    "to",
    "trên",
    "tôi",
    "trong",
    "và",
    "về",
    "với",
    "what",
    "why",
    "you",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"\w+", (text or "").lower(), flags=re.UNICODE)
    return [token for token in tokens if len(token) > 1 and token not in STOPWORDS]


def _score_turn(
    query_tokens: set[str],
    turn_content: str,
    turn_index: int,
    total_turns: int,
) -> float:
    if not query_tokens:
        return 0.0

    turn_tokens = set(_tokenize(turn_content))
    if not turn_tokens:
        return 0.0

    overlap = len(query_tokens & turn_tokens)
    if overlap == 0:
        return 0.0

    lexical_score = overlap / max(len(query_tokens), 1)
    density_bonus = overlap / max(len(turn_tokens), 1)
    recency_bonus = (turn_index + 1) / max(total_turns, 1) * 0.25
    return lexical_score + density_bonus + recency_bonus


def _find_last_turn(session_messages: list[dict], role: str) -> dict | None:
    for turn in reversed(session_messages):
        if turn.get("role") == role and turn.get("content"):
            return turn
    return None


def _format_turns(turns: list[dict]) -> str:
    lines = []
    for turn in turns:
        role = "User" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{role}: {(turn.get('content') or '')[:700]}")
    return "\n".join(lines)


def build_context_windows(
    latest_user_message: str,
    session_messages: list[dict],
    recent_limit: int = 6,
    relevant_limit: int = 6,
) -> dict:
    """
    Build recent and relevant context windows from a session transcript.

    session_messages must be chronological (oldest -> newest) and exclude
    the latest in-flight user message.
    """
    if not session_messages:
        return {
            "recent_turns": [],
            "relevant_turns": [],
            "context_turns": [],
            "conversation_history": "",
        }

    recent_indices = list(range(max(len(session_messages) - recent_limit, 0), len(session_messages)))
    recent_turns = [session_messages[i] for i in recent_indices]

    seed_parts = [latest_user_message]
    last_assistant = _find_last_turn(session_messages, "assistant")
    if last_assistant:
        seed_parts.append(last_assistant.get("content", "")[:700])

    prior_user_turns = [
        turn for turn in reversed(session_messages) if turn.get("role") == "user"
    ]
    for turn in prior_user_turns[:2]:
        seed_parts.append(turn.get("content", "")[:300])

    query_tokens = set(_tokenize("\n".join(seed_parts)))
    scored_indices = []
    total_turns = len(session_messages)
    for index, turn in enumerate(session_messages):
        score = _score_turn(query_tokens, turn.get("content", ""), index, total_turns)
        if turn.get("role") == "assistant" and score > 0:
            score += 0.1
        if score > 0:
            scored_indices.append((score, index))

    scored_indices.sort(reverse=True)
    selected_indices = set()

    for _, index in scored_indices[: max(relevant_limit // 2, 2)]:
        selected_indices.add(index)
        if index - 1 >= 0:
            selected_indices.add(index - 1)
        if index + 1 < total_turns:
            selected_indices.add(index + 1)

    if not selected_indices:
        if total_turns >= 2:
            selected_indices.update(range(max(total_turns - 4, 0), total_turns))
        else:
            selected_indices.add(total_turns - 1)

    relevant_indices = sorted(selected_indices)
    relevant_turns = [session_messages[i] for i in relevant_indices]
    if len(relevant_turns) > relevant_limit:
        relevant_turns = relevant_turns[-relevant_limit:]
        relevant_indices = relevant_indices[-relevant_limit:]

    merged_indices = sorted(set(relevant_indices) | set(recent_indices))
    merged_turns = [session_messages[i] for i in merged_indices]

    conversation_history = _format_turns(merged_turns)
    return {
        "recent_turns": recent_turns,
        "relevant_turns": relevant_turns,
        "context_turns": merged_turns,
        "conversation_history": conversation_history,
    }
