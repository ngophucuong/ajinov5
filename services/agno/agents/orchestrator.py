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
) -> dict:
    """
    Full chat pipeline:
    1. Decompose (if deep mode)
    2. Agentic Loop (web search + memory retrieval)
    3. Memory Retrieval (canonical memories)
    4. Synthesis (with memory context)
    Returns: {response, thinking_trace, model_used, tokens_used, memory_candidates}
    """
    thinking_trace = []
    start_time = time.time()

    mode, model = determine_mode(message, mode)

    # Stage 1: Decompose (skip in fast mode)
    if mode == "deep":
        t0 = time.time()
        from .reasoning import decompose

        sub_questions = await decompose(message, litellm_url, litellm_api_key)
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
        sub_questions = [message]

    # Stage 2: Agentic Loop (search + memory)
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
                query=message,
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

    # Stage 4: Synthesis
    t3 = time.time()
    from .synthesis import synthesize

    response = await synthesize(
        user_message=message,
        sub_questions=sub_questions,
        search_results=search_results,
        memory_context=memory_context,
        model=model,
        litellm_url=litellm_url,
        litellm_api_key=litellm_api_key,
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
