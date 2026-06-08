"""
Ajino v5 — Memory Retrieval Skill
Registered skill that the orchestrator can call during agentic loop.
Wraps memory_agent.retrieve_memories() for canonical memory injection.
"""

from typing import Optional

import asyncpg

# Skill metadata for registry
skill_info = {
    "name": "memory_retrieval",
    "description": "Retrieve canonical memories from pgvector hybrid vector+keyword search",
    "version": "1.0.0",
    "enabled": True,
    "config": {
        "default_top_k": 7,
        "only_canonical": True,
    },
}


async def execute(
    query: str,
    top_k: int = 7,
    db_pool: Optional[asyncpg.Pool] = None,
) -> list[dict]:
    """
    Execute memory retrieval skill.
    Called by orchestrator during agentic loop.

    Args:
        query: Search query for relevant memories
        top_k: Number of memories to retrieve
        db_pool: Database connection pool

    Returns:
        List of {id, content, score} — canonical memories sorted by relevance
    """
    from agents.memory_agent import retrieve_memories

    results = await retrieve_memories(
        query=query,
        top_k=top_k,
        db_pool=db_pool,
    )
    return results


async def get_context_for_prompt(
    query: str,
    top_k: int = 7,
    db_pool: Optional[asyncpg.Pool] = None,
) -> str:
    """
    Retrieve memories and format them as context for the LLM prompt.
    Returns formatted string of canonical memories.
    """
    results = await execute(query=query, top_k=top_k, db_pool=db_pool)

    if not results:
        return ""

    context_lines = ["\n### Bộ nhớ doanh nghiệp (ký ức liên quan):\n"]
    for i, r in enumerate(results, 1):
        context_lines.append(f"{i}. {r['content']} (độ liên quan: {r['score']:.2f})")

    return "\n".join(context_lines)
