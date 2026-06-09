"""
Ajino v5 — Orchestrator Agent
Routes queries, coordinates agent pipeline.
"""

import time
from typing import Literal

# ─── Reasoning Mode Routes ─────────────────────────
REASONING_ROUTES = {
    "fast": "deepseek-flash",
    "deep": "deepseek-pro",
    "auto": None,  # orchestrator decides
}

ANALYTICAL_KEYWORDS = {
    "phân tích",
    "so sánh",
    "đánh giá",
    "chiến lược",
    "dự báo",
    "tại sao",
    "nguyên nhân",
    "rủi ro",
    "cơ hội",
    "xu hướng",
    "analyze",
    "compare",
    "strategy",
    "forecast",
    "why",
    "risk",
}

def query_complexity(text: str) -> Literal["fast", "deep"]:
    """Heuristic routing — NO ML, NO LLM call. Must run in microseconds."""
    word_count = len(text.split())
    has_analytical = any(kw in text.lower() for kw in ANALYTICAL_KEYWORDS)
    has_multiple_questions = text.count("?") >= 2

    if word_count > 30 or has_analytical or has_multiple_questions:
        return "deep"
    return "fast"


def determine_mode(text: str, requested_mode: str) -> tuple[str, str]:
    """Returns (reasoning_mode, model_name)"""
    if requested_mode == "auto":
        mode = query_complexity(text)
    else:
        mode = requested_mode

    model = REASONING_ROUTES.get(mode, "deepseek-flash")
    return mode, model


async def run_pipeline(
    message: str,
    mode: str,
    litellm_url: str,
    litellm_api_key: str = "",
    serper_key: str = "",
    db_pool=None,
    telegram_id: str = None,
    session_id: str = None,
) -> dict:
    """
    Full chat pipeline:
    0. Context assembly: fetch history → resolve_followup (if multi-turn) → resolved_query
    1. Determine mode from resolved_query
    2. Decompose (if deep mode) using resolved_query
    3. Web search + memory retrieval using resolved_query
    4. Synthesis with conversation_history as context
    Returns: {response, thinking_trace, model_used, tokens_used, memory_candidates}
    """
    thinking_trace = []
    start_time = time.time()

    # Stage 0: Context assembly — fetch latest history, resolve follow-up, build dialogue state
    session_messages = []
    recent_turns = []
    relevant_turns = []
    conversation_history = ""
    dialogue_state = {
        "active_topic": "",
        "user_intent": "new question",
        "resolved_query": message,
        "followup_type": "new_topic",
        "referenced_points": [],
        "should_reset_context": True,
    }
    resolved_query = message

    if session_id and db_pool:
        t_ctx = time.time()
        try:
            from .conversation_retrieval import build_context_windows
            from .followup_resolver import resolve_followup

            rows = await db_pool.fetch(
                "SELECT role, content FROM chat_messages "
                "WHERE session_id = $1 ORDER BY created_at DESC LIMIT 40",
                session_id,
            )
            if rows:
                session_messages = [dict(r) for r in reversed(rows)]
                context_windows = build_context_windows(
                    latest_user_message=message,
                    session_messages=session_messages,
                    recent_limit=6,
                    relevant_limit=8,
                )
                recent_turns = context_windows.get("recent_turns", [])
                relevant_turns = context_windows.get("relevant_turns", [])
                conversation_history = context_windows.get("conversation_history", "")

                dialogue_state = await resolve_followup(
                    latest_user_message=message,
                    recent_turns=recent_turns,
                    relevant_turns=relevant_turns,
                    litellm_url=litellm_url,
                    litellm_api_key=litellm_api_key,
                )
                resolved_query = (
                    dialogue_state.get("resolved_query", "").strip() or message
                )
        except Exception as e:
            print(f"[orchestrator] Session context error: {e}")
        thinking_trace.append(
            {
                "step": "context_resolution",
                "agent": "followup_resolver",
                "status": "done",
                "duration_ms": int((time.time() - t_ctx) * 1000),
                "result": (
                    f"{dialogue_state.get('followup_type', 'new_topic')} | "
                    f"recent={len(recent_turns)} relevant={len(relevant_turns)} -> "
                    f"{resolved_query[:120]}"
                ),
            }
        )
    else:
        thinking_trace.append(
            {
                "step": "context_resolution",
                "agent": "followup_resolver",
                "status": "skipped",
                "duration_ms": 0,
                "result": "no session context",
            }
        )

    if dialogue_state.get("should_reset_context"):
        conversation_history = ""

    # Stage 1: Determine mode from resolved_query
    mode, model = determine_mode(resolved_query, mode)

    # Stage 2: Decompose (skip in fast mode)
    if mode == "deep":
        t0 = time.time()
        from .reasoning import decompose

        sub_questions = await decompose(resolved_query, litellm_url, litellm_api_key)
        thinking_trace.append(
            {
                "step": "decompose",
                "agent": "reasoning",
                "status": "done",
                "duration_ms": int((time.time() - t0) * 1000),
                "result": sub_questions,
            }
        )
    else:
        sub_questions = [resolved_query]

    # Stage 3: Agentic Loop (search + memory) — use resolved_query
    t1 = time.time()
    search_results = []
    if serper_key and sub_questions:
        from .search import web_search

        for q in sub_questions[:2]:  # Max 2 searches
            result = await web_search(q, serper_key)
            if result:
                search_results.append({"query": q, "results": result[:3]})

    thinking_trace.append(
        {
            "step": "search",
            "agent": "search",
            "status": "done",
            "duration_ms": int((time.time() - t1) * 1000),
            "result": f"{len(search_results)} searches",
        }
    )

    # Stage 3: Memory Retrieval (canonical memories)
    t2 = time.time()
    memory_results = []
    memory_context = ""
    if db_pool:
        try:
            from .memory_agent import retrieve_memories

            memory_results = await retrieve_memories(
                query=resolved_query,
                top_k=7,
                db_pool=db_pool,
            )
            if memory_results:
                memory_context = "\n### Bộ nhớ doanh nghiệp (ký ức liên quan):\n"
                for i, m in enumerate(memory_results, 1):
                    memory_context += (
                        f"{i}. {m['content']} (độ liên quan: {m['score']:.2f})\n"
                    )
            thinking_trace.append(
                {
                    "step": "memory_retrieval",
                    "agent": "memory",
                    "status": "done",
                    "duration_ms": int((time.time() - t2) * 1000),
                    "result": f"{len(memory_results)} canonical memories",
                }
            )
        except Exception as e:
            print(f"Memory retrieval error: {e}")
            thinking_trace.append(
                {
                    "step": "memory_retrieval",
                    "agent": "memory",
                    "status": "error",
                    "duration_ms": int((time.time() - t2) * 1000),
                    "result": str(e),
                }
            )
    else:
        thinking_trace.append(
            {
                "step": "memory_retrieval",
                "agent": "memory",
                "status": "skipped",
                "duration_ms": 0,
                "result": "no db_pool",
            }
        )

    # Stage 3.5: Telegram context assembly (if applicable)
    telegram_context = None
    if telegram_id and db_pool:
        from .context_assembly import assemble_telegram_context

        print(
            f"[orchestrator] Stage 3.5: assembling Telegram context for {telegram_id}"
        )
        try:
            telegram_context = await assemble_telegram_context(
                telegram_id, message, db_pool
            )
            print(
                f"[orchestrator] context assembly result: stbuf={telegram_context.get('stbuf_count')}, msgs={len(telegram_context.get('messages', []))}, canonical={telegram_context.get('canonical_count')}"
            )
        except Exception as e:
            print(f"Context assembly error: {e}")

    # Stage 4: Synthesis
    t3 = time.time()
    from .synthesis import synthesize

    response = await synthesize(
        user_message=message,
        resolved_query=resolved_query,
        sub_questions=sub_questions,
        search_results=search_results,
        memory_context=memory_context,
        model=model,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
        telegram_context=telegram_context,
        conversation_history=conversation_history,
        dialogue_state=dialogue_state,
    )

    thinking_trace.append(
        {
            "step": "synthesis",
            "agent": "synthesis",
            "status": "done",
            "duration_ms": int((time.time() - t3) * 1000),
            "result": f"{response.get('tokens_used', 0)} tokens",
        }
    )

    total_latency = int((time.time() - start_time) * 1000)

    return {
        "response": response.get("content", ""),
        "thinking_trace": thinking_trace,
        "model_used": model,
        "tokens_used": response.get("tokens_used", 0),
        "latency_ms": total_latency,
        "reasoning_mode": mode,
        "memory_candidates": response.get("memory_candidates", []),
    }
