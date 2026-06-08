"""
Ajino v5 — Context Assembly for Telegram.
Merges 3 layers: short-term buffer + recent messages + canonical memory.
"""

from .context_buffer import get_short_term_buffer


async def assemble_telegram_context(telegram_id: str, query: str, db_pool) -> dict:
    """Assemble full context for a Telegram query."""

    # Layer 1: Short-term buffer from KV (instant, < 5ms)
    stbuf = await get_short_term_buffer(telegram_id)
    stbuf_text = "\n".join([f["fact"] for f in stbuf]) if stbuf else ""

    # Layer 2: Recent messages from the most recent completed session
    recent_msgs = []
    try:
        print(
            f"[context_assembly] Layer 2: searching sessions for telegram_id={telegram_id}"
        )
        # Get the most recent session. Since the current session is created AFTER
        # the pipeline returns, the most recent session IS the previous one.
        session_rows = await db_pool.fetch(
            "SELECT id FROM chat_sessions WHERE metadata->>'telegram_id' = $1 AND metadata->>'surface' = 'telegram' ORDER BY updated_at DESC LIMIT 1",
            telegram_id,
        )
        print(f"[context_assembly] Layer 2: found {len(session_rows)} sessions")
        if session_rows:
            prev_session_id = session_rows[0]["id"]
            msgs = await db_pool.fetch(
                "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10",
                prev_session_id,
            )
            if msgs:
                recent_msgs = [dict(m) for m in reversed(msgs)]
        print(
            f"[context_assembly] Layer 2: gathered {len(recent_msgs)} messages from previous session"
        )
    except Exception as e:
        print(f"[context_assembly] Layer 2 error: {e}")

    # Layer 3: Canonical memory via hybrid search
    from .memory_agent import retrieve_memories

    canonical = await retrieve_memories(query=query, top_k=5, db_pool=db_pool)
    canonical_text = "\n".join([m["content"] for m in canonical]) if canonical else ""

    # Build system prompt
    system = f"""Bạn là Ajino, executive AI assistant của CEO.

CONTEXT GẦN ĐÂY (30 phút qua):
{stbuf_text or "Không có"}

TRI THỨC CỐT LÕI:
{canonical_text or "Không có"}

Trả lời bằng tiếng Việt, ngắn gọn, đúng trọng tâm."""

    return {
        "system": system,
        "messages": recent_msgs,
        "stbuf_count": len(stbuf),
        "canonical_count": len(canonical),
    }
