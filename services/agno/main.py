"""
Ajino v5 — Agno Runtime Main
FastAPI app with chat pipeline, health check, SSE streaming, memory endpoints.
"""

import asyncio
import json
import os

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ─── Config ─────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ajinov5:changeme@postgres:5432/ajinov5",
)
LITELLM_URL = os.getenv("LITELLM_API_BASE", "http://litellm:4000")
LITELLM_MASTER_KEY = os.getenv("LITELLM_MASTER_KEY", "")
SERPER_KEY = os.getenv("SERPER_API_KEY", "")

app = FastAPI(title="Ajino v5 — Agno Runtime")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ajinov5.cuong.ngo"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Database Pool ──────────────────────────────────────
db_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return db_pool


@app.on_event("startup")
async def startup():
    """Initialize DB schema on startup."""
    try:
        pool = await get_pool()
        # Read and execute schema
        schema_path = os.path.join(os.path.dirname(__file__), "db", "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path) as f:
                sql = f.read()
            # Execute each statement separately
            for stmt in sql.split(";"):
                stmt = stmt.strip()
                if stmt and not stmt.startswith("--"):
                    try:
                        await pool.execute(stmt)
                    except Exception as e:
                        if "already exists" not in str(e):
                            print(f"Schema warning: {e}")
        print("Database initialized")
    except Exception as e:
        print(f"Startup warning (DB not ready?): {e}")


@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()


# ─── Health ─────────────────────────────────────────────
@app.get("/health")
async def health():
    db_status = "disconnected"
    pgvector_status = "unknown"
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 as ok")
            db_status = "ok" if row else "error"
            # Check pgvector extension
            try:
                ext = await conn.fetchrow(
                    "SELECT installed_version FROM pg_available_extensions WHERE name = 'vector'"
                )
                pgvector_status = ext["installed_version"] if ext else "not_installed"
            except Exception:
                pgvector_status = "error"
    except Exception:
        db_status = "error"
        pgvector_status = "disconnected"

    return {
        "status": "ok",
        "service": "agno-runtime-v5",
        "db": db_status,
        "pgvector": pgvector_status,
        "version": "5.0.0",
    }


# ═══════════════════════════════════════════════════════════
# CHAT ENDPOINTS
# ═══════════════════════════════════════════════════════════


async def _persist_chat_and_extract_memory(
    message: str,
    result: dict,
    mode: str,
    user_id: str | None,
    session_id: str | None,
    pool: asyncpg.Pool,
):
    """
    Persist chat messages to DB and auto-extract memory candidates.
    Shared between /chat and /chat/stream.
    """
    user_uuid = None
    if user_id:
        try:
            row = await pool.fetchrow(
                "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') "
                "ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
                int(user_id),
            )
            user_uuid = row["id"]
        except Exception as e:
            print(f"User upsert warning: {e}")

    if user_uuid and not session_id:
        try:
            row = await pool.fetchrow(
                "INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id",
                user_uuid,
                message[:80],
            )
            session_id = str(row["id"])
        except Exception:
            session_id = None

    if not session_id or not user_uuid:
        print("[chat] Cannot persist — missing session_id or user_uuid")
        return

    try:
        # Save user message
        await pool.execute(
            "INSERT INTO chat_messages (session_id, role, content, reasoning_mode) "
            "VALUES ($1, 'user', $2, $3)",
            session_id,
            message,
            mode,
        )
        # Save assistant message
        await pool.execute(
            "INSERT INTO chat_messages (session_id, role, content, thinking_trace, "
            "model_used, reasoning_mode, tokens_used, latency_ms) "
            "VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7)",
            session_id,
            result.get("response", ""),
            json.dumps(result.get("thinking_trace", [])),
            result.get("model_used"),
            result.get("reasoning_mode"),
            result.get("tokens_used"),
            result.get("latency_ms"),
        )
        # Update session timestamp
        await pool.execute(
            "UPDATE chat_sessions SET updated_at = now() WHERE id = $1",
            session_id,
        )
        # Write audit log
        await pool.execute(
            "INSERT INTO audit_log (user_id, action, resource_type, resource_id, "
            "llm_model, llm_tokens, payload) "
            "VALUES ($1, 'chat.message', 'chat_message', $2, $3, $4, $5)",
            user_uuid,
            session_id,
            result.get("model_used"),
            result.get("tokens_used"),
            json.dumps({"reasoning_mode": mode}),
        )

        # ─── Auto-extract memory candidates ─────────────
        from agents.memory_agent import store_memory

        candidates = result.get("memory_candidates", [])
        stored_count = 0
        for c in candidates:
            memory_id = await store_memory(
                content=c["content"],
                source="chat",
                source_ref=session_id,
                db_pool=pool,
            )
            if memory_id:
                stored_count += 1
        if stored_count > 0:
            print(f"[chat] Auto-stored {stored_count} memory candidates from chat")

    except Exception as e:
        print(f"DB persist warning: {e}")


@app.post("/chat")
async def chat(request: dict):
    """Main chat endpoint — runs full pipeline, persists to DB."""
    message = request.get("message") or request.get("content") or ""
    mode = request.get("reasoning_mode", "auto")
    user_id = request.get("user_id")
    session_id = request.get("session_id")

    if not message:
        raise HTTPException(status_code=400, detail="Missing message")

    pool = await get_pool()

    from agents.orchestrator import run_pipeline

    result = await run_pipeline(
        message=message,
        mode=mode,
        litellm_url=LITELLM_URL,
        litellm_api_key=LITELLM_MASTER_KEY,
        serper_key=SERPER_KEY,
        db_pool=pool,
    )

    # Persist chat + auto-extract memory
    await _persist_chat_and_extract_memory(
        message=message,
        result=result,
        mode=mode,
        user_id=user_id,
        session_id=session_id,
        pool=pool,
    )

    return {"data": result}


# ─── Chat SSE Stream ────────────────────────────────────
@app.post("/chat/stream")
async def chat_stream(request: dict):
    """Chat endpoint with SSE streaming."""
    message = request.get("message") or request.get("content") or ""
    mode = request.get("reasoning_mode", "auto")
    user_id = request.get("user_id")
    session_id = request.get("session_id")

    if not message:
        raise HTTPException(status_code=400, detail="Missing message")

    pool = await get_pool()

    from agents.orchestrator import run_pipeline

    async def event_stream():
        # Send start event
        yield "event: start\ndata: {}\n\n"

        try:
            result = await run_pipeline(
                message=message,
                mode=mode,
                litellm_url=LITELLM_URL,
                litellm_api_key=LITELLM_MASTER_KEY,
                serper_key=SERPER_KEY,
                db_pool=pool,
            )

            # Send trace events
            for step in result.get("thinking_trace", []):
                yield f"event: trace\ndata: {json.dumps(step)}\n\n"
                await asyncio.sleep(0.05)

            # Send content as token events
            content = result.get("response", "")
            words = content.split()
            for i in range(0, len(words), 3):
                chunk = " ".join(words[i : i + 3])
                yield f"event: token\ndata: {json.dumps({'delta': chunk + ' '})}\n\n"
                await asyncio.sleep(0.01)

            # Send done event with metadata
            done_data = json.dumps(
                {
                    "message_id": None,
                    "model_used": result.get("model_used"),
                    "reasoning_mode": result.get("reasoning_mode"),
                    "tokens_used": result.get("tokens_used"),
                    "latency_ms": result.get("latency_ms"),
                    "memory_candidates": result.get("memory_candidates", []),
                }
            )
            yield f"event: done\ndata: {done_data}\n\n"

            # Persist + auto-extract after streaming
            await _persist_chat_and_extract_memory(
                message=message,
                result=result,
                mode=mode,
                user_id=user_id,
                session_id=session_id,
                pool=pool,
            )

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': 'CHAT_002', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Chat Sessions ──────────────────────────────────────
@app.get("/chat/sessions")
async def list_sessions():
    """List chat sessions."""
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id, title, tags, updated_at FROM chat_sessions "
            "ORDER BY updated_at DESC LIMIT 20"
        )
        return {"data": [dict(r) for r in rows]}
    except Exception:
        return {"data": []}


@app.get("/chat/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    """Get messages for a session."""
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id, role, content, thinking_trace, model_used, "
            "reasoning_mode, created_at FROM chat_messages "
            "WHERE session_id = $1 ORDER BY created_at",
            session_id,
        )
        return {"data": [dict(r) for r in rows]}
    except Exception:
        return {"data": []}


# ═══════════════════════════════════════════════════════════
# MEMORY ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.post("/memory")
async def create_memory(request: dict):
    """
    POST /memory — Create manual memory.
    Body: { content: string, source?: string }
    Triggers embedding via CF Workers AI (mock fallback).
    Returns 201 { data: { id, status: "pending" } }
    """
    content = request.get("content", "").strip()
    source = request.get("source", "manual")

    if not content:
        raise HTTPException(status_code=400, detail="Missing content")

    pool = await get_pool()
    from agents.memory_agent import store_memory

    memory_id = await store_memory(
        content=content,
        source=source,
        db_pool=pool,
    )

    if not memory_id:
        raise HTTPException(status_code=500, detail="Failed to store memory")

    # Write audit log
    try:
        await pool.execute(
            "INSERT INTO audit_log (action, resource_type, resource_id, payload) "
            "VALUES ('memory.create', 'memory', $1, $2)",
            memory_id,
            json.dumps({"content": content[:200], "source": source}),
        )
    except Exception as e:
        print(f"Audit log warning: {e}")

    return {
        "data": {"id": memory_id, "status": "pending"},
        "error": None,
    }


@app.get("/memory")
async def list_memories(
    status: str = Query(None, description="Filter: pending, canonical, archived"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    GET /memory?status=pending|canonical|archived&limit=20&offset=0
    List memories with optional status filter.
    """
    pool = await get_pool()
    from agents.memory_agent import list_memories as list_mem

    results = await list_mem(
        status=status if status else None,
        limit=limit,
        offset=offset,
        db_pool=pool,
    )

    return {"data": results, "error": None}


@app.patch("/memory/{memory_id}")
async def update_memory(memory_id: str, request: dict):
    """
    PATCH /memory/{id}
    Body: { status?: "canonical"|"archived", content?: string }
    - status=canonical  → approve (pending→canonical)
    - status=archived   → reject  (pending→archived)
    - content changed   → edit + re-embed
    """
    new_status = request.get("status")
    new_content = request.get("content")
    user_id = request.get("user_id")  # for audit log

    pool = await get_pool()

    # Handle status change (approve/reject)
    if new_status:
        if new_status not in ("canonical", "archived"):
            raise HTTPException(
                status_code=400,
                detail="Invalid status. Must be 'canonical' or 'archived'.",
            )

        from agents.memory_agent import approve_memory, reject_memory

        if new_status == "canonical":
            result = await approve_memory(
                memory_id=memory_id,
                approved_by=user_id,
                db_pool=pool,
            )
            action = "memory.approve"
        else:
            result = await reject_memory(
                memory_id=memory_id,
                db_pool=pool,
            )
            action = "memory.reject"

        if result.get("status") == "not_found":
            raise HTTPException(status_code=404, detail="Memory not found")

        if not result.get("updated"):
            return {
                "data": {
                    "id": result["id"],
                    "status": result["status"],
                    "updated": False,
                },
                "error": None,
            }

        # Write audit log
        try:
            await pool.execute(
                "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) "
                "VALUES ($1, $2, 'memory', $3, $4)",
                user_id,
                action,
                memory_id,
                json.dumps({"new_status": new_status}),
            )
        except Exception as e:
            print(f"Audit log warning: {e}")

        return {
            "data": {
                "id": result["id"],
                "status": result["status"],
                "updated": True,
            },
            "error": None,
        }

    # Handle content edit
    if new_content:
        from agents.memory_agent import edit_memory_content

        result = await edit_memory_content(
            memory_id=memory_id,
            new_content=new_content.strip(),
            db_pool=pool,
        )

        if not result.get("updated"):
            raise HTTPException(
                status_code=404, detail="Memory not found or update failed"
            )

        # Write audit log
        try:
            await pool.execute(
                "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) "
                "VALUES ($1, 'memory.edit', 'memory', $2, $3)",
                user_id,
                memory_id,
                json.dumps({"new_content": new_content[:200]}),
            )
        except Exception as e:
            print(f"Audit log warning: {e}")

        return {
            "data": {
                "id": result["id"],
                "content": result.get("content", ""),
                "updated": True,
            },
            "error": None,
        }

    # No valid action
    raise HTTPException(
        status_code=400,
        detail="Provide 'status' (canonical|archived) or 'content' to update.",
    )


@app.get("/memory/search")
async def search_memory(
    q: str = Query(..., description="Search query"),
    top_k: int = Query(7, ge=1, le=20),
):
    """
    GET /memory/search?q=...&top_k=7
    Search canonical memories by semantic similarity.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Missing query 'q'")

    pool = await get_pool()
    from agents.memory_agent import retrieve_memories

    results = await retrieve_memories(
        query=q.strip(),
        top_k=top_k,
        db_pool=pool,
    )

    return {"data": results, "error": None}


@app.get("/memory/{memory_id}")
async def get_memory(memory_id: str):
    """
    GET /memory/{id} — Get a single memory by ID.
    """
    pool = await get_pool()
    from agents.memory_agent import get_memory_by_id

    result = await get_memory_by_id(
        memory_id=memory_id,
        db_pool=pool,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Memory not found")

    return {"data": result, "error": None}


# ═══════════════════════════════════════════════════════════
# SKILLS & UTILITY ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.get("/embed/proxy")
async def proxy_embedding(text: str):
    """Test embedding generation (uses mock if CF token not set)."""
    from agents.memory_agent import get_embedding

    embedding = await get_embedding(text)
    return {
        "dimensions": len(embedding),
        "model": "cf/baai/bge-m3 (mock fallback if CF token not set)",
        "text_preview": text[:100],
        "embedding_preview": embedding[:5],
    }


@app.get("/skills")
async def list_skills():
    """List registered skills."""
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT name, description, version, enabled FROM skills ORDER BY name"
        )
        return {"data": [dict(r) for r in rows]}
    except Exception:
        return {"data": []}
