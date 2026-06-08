"""
Ajino v5 — Agno Runtime Main
FastAPI app with chat pipeline, health check, SSE streaming, memory endpoints.
"""

import asyncio
import json
import os
import re
import uuid
from datetime import datetime

import asyncpg
import httpx
from agents.context_buffer import extract_and_buffer as _extract_and_buffer
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse


async def _extract_and_buffer_background(telegram_id: str, text: str, db_pool=None):
    await _extract_and_buffer(telegram_id, text, db_pool=db_pool)


# ─── Config ────────────────────────────────────────────────
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


# ─── Telegram Session Helpers ────────────────────────────


async def get_or_create_telegram_session(telegram_id: str) -> str:
    """Get or create the single chat_session for a Telegram user."""
    pool = await get_pool()

    # Find existing telegram session
    row = await pool.fetchrow(
        "SELECT id FROM chat_sessions WHERE metadata->>'telegram_id' = $1 AND metadata->>'surface' = 'telegram' LIMIT 1",
        telegram_id,
    )
    if row:
        return str(row["id"])

    # Create new session
    sid = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO chat_sessions (id, user_id, title, metadata) VALUES ($1, (SELECT id FROM users WHERE telegram_id = $2 LIMIT 1), $3, $4)",
        sid,
        int(telegram_id),
        f"Telegram Chat - {telegram_id}",
        json.dumps({"telegram_id": telegram_id, "surface": "telegram"}),
    )
    return sid


async def get_telegram_context(telegram_id: str) -> list[dict]:
    """Get 10 most recent messages for a Telegram user."""
    pool = await get_pool()

    # Find telegram session
    row = await pool.fetchrow(
        "SELECT id FROM chat_sessions WHERE metadata->>'telegram_id' = $1 AND metadata->>'surface' = 'telegram' ORDER BY updated_at DESC LIMIT 1",
        telegram_id,
    )
    if not row:
        return []

    messages = await pool.fetch(
        "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10",
        row["id"],
    )
    return [dict(m) for m in reversed(messages)]


# ─── Adaptive Mode Logic ─────────────────────────────────

# Vietnamese timezone offset
VN_OFFSET_HOURS = 7

# Keywords that indicate complex analytical queries
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


async def get_adaptive_mode(telegram_id: str) -> dict:
    """
    Determine which mode the Mini App should open in.
    Priority order: meeting_soon > post_meeting > learned_pattern > morning_routine > default (chat)
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    vn_hour = (now.hour + VN_OFFSET_HOURS) % 24

    pool = await get_pool()

    # Rule 1 & 2: Schedule-based meeting detection from reminders table
    # Check if there's a reminder within the next 30 minutes
    next_reminder = await pool.fetchrow(
        "SELECT id, content, remind_at FROM reminders "
        "WHERE telegram_id = $1 AND notified_at IS NULL AND remind_at > $2 "
        "ORDER BY remind_at ASC LIMIT 1",
        int(telegram_id),
        now,
    )

    if next_reminder:
        remind_at = next_reminder["remind_at"]
        minutes_until = (remind_at - now).total_seconds() / 60

        if 0 < minutes_until <= 30:
            # Rule 1: Within 30 minutes before a meeting -> premeeting
            return {
                "mode": "premeeting",
                "reason": "meeting_soon",
                "confidence": 1.0,
                "meeting": {
                    "title": next_reminder["content"],
                    "start_time": remind_at.isoformat(),
                    "duration_min": 30,
                },
            }

        if -30 <= minutes_until <= 0:
            # Rule 2: Within 30 minutes after meeting ended -> capture
            return {
                "mode": "capture",
                "reason": "post_meeting",
                "confidence": 1.0,
                "meeting": {
                    "title": next_reminder["content"],
                    "start_time": remind_at.isoformat(),
                    "duration_min": 30,
                },
            }

    # Try to get behavior pattern
    try:
        user_row = await pool.fetchrow(
            "SELECT id FROM users WHERE telegram_id = $1",
            int(telegram_id),
        )
        user_uuid = str(user_row["id"]) if user_row else None
    except Exception:
        user_uuid = None

    if user_uuid:
        pattern = await pool.fetchrow(
            "SELECT dominant_mode, pattern_confidence, open_log "
            "FROM user_behavior_patterns WHERE user_id = $1",
            user_uuid,
        )
    else:
        pattern = None

    # Rule 3: Not enough data (< 7 opens) → default chat
    if (
        not pattern
        or not pattern["pattern_confidence"]
        or pattern["pattern_confidence"] < 0.5
    ):
        return {
            "mode": "chat",
            "reason": "default",
            "confidence": 0.0,
            "meeting": None,
        }

    open_log = pattern["open_log"] or []
    if len(open_log) < 7:
        return {
            "mode": "chat",
            "reason": "default",
            "confidence": 0.0,
            "meeting": None,
        }

    # Rule 4: Early morning (6:30–9:00 VN) → briefing
    if 6 <= vn_hour <= 9:
        return {
            "mode": "briefing",
            "reason": "morning_routine",
            "confidence": 0.8,
            "meeting": None,
        }

    # Rule 5: Learned pattern with high confidence
    if pattern["dominant_mode"] and (pattern["pattern_confidence"] or 0) >= 0.7:
        return {
            "mode": pattern["dominant_mode"],
            "reason": "learned_pattern",
            "confidence": pattern["pattern_confidence"],
            "meeting": None,
        }

    # Fallback: chat
    return {
        "mode": "chat",
        "reason": "default",
        "confidence": 0.0,
        "meeting": None,
    }


async def recalculate_behavior_patterns():
    """
    Cron: runs every Sunday at 00:00 UTC.
    Analyzes open_log data to compute dominant_mode and pattern_confidence per user.
    """
    try:
        pool = await get_pool()
        users = await pool.fetch("SELECT id FROM users")

        for user in users:
            user_id = user["id"]
            row = await pool.fetchrow(
                "SELECT open_log FROM user_behavior_patterns WHERE user_id = $1",
                user_id,
            )
            if not row or not row["open_log"]:
                continue

            logs = row["open_log"]
            if not isinstance(logs, list):
                logs = json.loads(logs) if isinstance(logs, str) else []

            if len(logs) < 7:
                continue

            # Calculate dominant opening hour (VN time)
            hours = [
                entry.get("vn_hour", 0)
                for entry in logs
                if entry.get("vn_hour") is not None
            ]
            if not hours:
                continue

            from collections import Counter

            hour_counts = Counter(hours)
            dominant_hour = hour_counts.most_common(1)[0][0]

            # Calculate most common mode
            modes = [
                entry.get("mode_shown") for entry in logs if entry.get("mode_shown")
            ]
            dominant_mode = Counter(modes).most_common(1)[0][0] if modes else None

            # Confidence: ratio of opens within 1 hour of dominant hour
            confidence = len([h for h in hours if abs(h - dominant_hour) <= 1]) / len(
                hours
            )

            await pool.execute(
                "INSERT INTO user_behavior_patterns (user_id, dominant_mode, pattern_confidence, open_log, last_calculated_at) "
                "VALUES ($1, $2, $3, $4, now()) "
                "ON CONFLICT (user_id) DO UPDATE SET "
                "dominant_mode = EXCLUDED.dominant_mode, "
                "pattern_confidence = EXCLUDED.pattern_confidence, "
                "last_calculated_at = EXCLUDED.last_calculated_at, "
                "updated_at = now()",
                user_id,
                dominant_mode,
                confidence,
                json.dumps(logs),
            )

        print(f"Behavior patterns recalculated for {len(users)} users")
    except Exception as e:
        print(f"Behavior pattern recalculation error: {e}")


async def behavior_pattern_cron_loop():
    """
    Background task: recalculate behavior patterns every Sunday at 00:00 UTC.
    Also runs once on startup to seed initial data if needed.
    """
    import time as _time
    from datetime import datetime, timezone

    while True:
        try:
            await recalculate_behavior_patterns()
        except Exception as e:
            print(f"Cron error: {e}")

        # Sleep until next Sunday 00:00 UTC
        now = datetime.now(timezone.utc)
        days_until_sunday = (6 - now.weekday()) % 7
        if days_until_sunday == 0 and now.hour == 0:
            days_until_sunday = 7  # Already Sunday 00:xx, wait for next week
        next_sunday = now.replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta

        next_sunday += timedelta(days=days_until_sunday)
        if next_sunday <= now:
            next_sunday += timedelta(days=7)

        sleep_seconds = max(60, (next_sunday - now).total_seconds())
        print(
            f"Behavior pattern cron: next run at {next_sunday.isoformat()} (sleep {sleep_seconds:.0f}s)"
        )
        await asyncio.sleep(sleep_seconds)


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

        # Seed skill records (upsert — won't overwrite if exists)
        seed_skills = [
            (
                "file_converter",
                "Convert uploaded files (docx, pdf, pptx, xlsx, html, images, audio, etc.) to Markdown using MarkItDown",
                "1.0.0",
            ),
            (
                "memory_retrieval",
                "Retrieve canonical memories from pgvector hybrid vector+keyword search",
                "1.0.0",
            ),
            (
                "web_search",
                "Search the web using Serper API for real-time information",
                "1.0.0",
            ),
        ]
        for name, desc, ver in seed_skills:
            try:
                await pool.execute(
                    "INSERT INTO skills (name, description, version) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
                    name,
                    desc,
                    ver,
                )
            except Exception:
                pass  # Table may not exist yet on first run
        print("Skills seeded")

        # Launch behavior pattern cron (background task, never awaited)
        asyncio.create_task(behavior_pattern_cron_loop())
        print("Behavior pattern cron started")
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
# USER & ADAPTIVE MODE ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.get("/user/adaptive-mode")
async def user_adaptive_mode(
    request: Request,
    telegram_id: str = Query(None, description="Telegram user ID"),
):
    """
    GET /user/adaptive-mode?telegram_id=...
    Returns the recommended mode for the Mini App.
    """
    # Get telegram_id from query param or X-Telegram-Id header
    tid = telegram_id or request.headers.get("X-Telegram-Id", "")
    if not tid:
        raise HTTPException(status_code=400, detail="Missing telegram_id")

    result = await get_adaptive_mode(tid)
    return {"data": result, "error": None}


@app.post("/user/adaptive-mode/open-log")
async def user_adaptive_mode_open_log(request: dict):
    """
    POST /user/adaptive-mode/open-log
    Body: { telegram_id: string, mode_shown: string, vn_hour: number, had_meeting_soon: bool, duration_seconds: number }
    Logs a Mini App open event for behavior pattern learning.
    """
    telegram_id = str(request.get("telegram_id", ""))
    mode_shown = request.get("mode_shown", "chat")
    vn_hour = request.get("vn_hour", 0)
    had_meeting_soon = request.get("had_meeting_soon", False)
    duration_seconds = request.get("duration_seconds", 0)

    if not telegram_id:
        raise HTTPException(status_code=400, detail="Missing telegram_id")

    pool = await get_pool()

    # Get or create user behavior pattern row
    user_row = await pool.fetchrow(
        "SELECT id FROM users WHERE telegram_id = $1",
        int(telegram_id),
    )
    if not user_row:
        # Create user if not exists (Telegram Mini App first open)
        user_row = await pool.fetchrow(
            "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') "
            "ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
            int(telegram_id),
        )

    user_uuid = user_row["id"]

    # Upsert behavior pattern row
    await pool.execute(
        "INSERT INTO user_behavior_patterns (user_id, open_log) "
        "VALUES ($1, '[]'::jsonb) "
        "ON CONFLICT (user_id) DO NOTHING",
        user_uuid,
    )

    # Append to open_log (keep last 90 days of entries)
    new_entry = {
        "timestamp": datetime.now().isoformat(),
        "vn_hour": vn_hour,
        "mode_shown": mode_shown,
        "had_meeting_soon": had_meeting_soon,
        "duration_seconds": duration_seconds,
    }

    await pool.execute(
        "UPDATE user_behavior_patterns SET "
        "open_log = (open_log || $1::jsonb), "
        "updated_at = now() "
        "WHERE user_id = $2",
        json.dumps([new_entry]),
        user_uuid,
    )

    # Trim old entries (> 90 days)
    cutoff = (datetime.now() - __import__("datetime").timedelta(days=90)).isoformat()
    await pool.execute(
        "UPDATE user_behavior_patterns SET open_log = ("
        "  SELECT jsonb_agg(elem) FROM jsonb_array_elements(open_log) AS elem "
        "  WHERE (elem->>'timestamp') >= $1"
        ") WHERE user_id = $2",
        cutoff,
        user_uuid,
    )

    # Write audit log
    try:
        await pool.execute(
            "INSERT INTO audit_log (user_id, action, resource_type, payload) "
            "VALUES ($1, 'miniapp.open', 'user_behavior_patterns', $2)",
            user_uuid,
            json.dumps(
                {
                    "mode_shown": mode_shown,
                    "vn_hour": vn_hour,
                    "had_meeting_soon": had_meeting_soon,
                }
            ),
        )
    except Exception as e:
        print(f"Audit log warning: {e}")

    return {"data": {"recorded": True}, "error": None}


@app.get("/chat/sessions/telegram")
async def get_telegram_session(
    request: Request,
    telegram_id: str = Query(None),
):
    """
    GET /chat/sessions/telegram?telegram_id=...
    Returns the Telegram chat session for Mini App context.
    """
    tid = telegram_id or request.headers.get("X-Telegram-Id", "")
    if not tid:
        raise HTTPException(status_code=400, detail="Missing telegram_id")

    session_id = await get_or_create_telegram_session(tid)
    # Schedule endpoint is defined below
    return {"data": {"session_id": session_id}, "error": None}


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
    surface: str = "web",
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
            metadata = (
                json.dumps(
                    {
                        "telegram_id": str(user_id),
                        "surface": surface,
                    }
                )
                if surface == "telegram"
                else "{}"
            )
            row = await pool.fetchrow(
                "INSERT INTO chat_sessions (user_id, title, metadata) VALUES ($1, $2, $3::jsonb) RETURNING id",
                user_uuid,
                message[:80],
                metadata,
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
    surface = request.get("surface", "web")

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
        telegram_id=str(user_id) if surface == "telegram" and user_id else None,
    )

    # Persist chat + auto-extract memory
    await _persist_chat_and_extract_memory(
        message=message,
        result=result,
        mode=mode,
        user_id=user_id,
        session_id=session_id,
        pool=pool,
        surface=surface,
    )

    # Background: extract facts for Telegram short-term buffer
    if surface == "telegram" and user_id:
        asyncio.create_task(_extract_and_buffer_background(str(user_id), message, pool))

    return {"data": result}


# ─── Chat SSE Stream ────────────────────────────────────
@app.post("/chat/stream")
async def chat_stream(request: dict):
    """Chat endpoint with SSE streaming."""
    message = request.get("message") or request.get("content") or ""
    mode = request.get("reasoning_mode", "auto")
    user_id = request.get("user_id")
    session_id = request.get("session_id")
    surface = request.get("surface", "web")

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
                telegram_id=str(user_id) if surface == "telegram" and user_id else None,
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
                surface=surface,
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
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, title, tags, updated_at FROM chat_sessions "
        "ORDER BY updated_at DESC LIMIT 20"
    )
    return {"data": [dict(r) for r in rows]}


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


@app.post("/chat/sessions")
async def create_empty_session(request: dict):
    """
    POST /chat/sessions — Create a new empty chat session.
    Body: { title?: string, user_id?: string }
    """
    title = (request.get("title") or "").strip()[:80]
    user_id = request.get("user_id")

    pool = await get_pool()

    user_uuid = None
    if user_id:
        try:
            row = await pool.fetchrow(
                "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') "
                "ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
                int(user_id),
            )
            user_uuid = row["id"]
        except Exception:
            pass

    sid = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO chat_sessions (id, user_id, title) VALUES ($1, $2, $3)",
        sid,
        user_uuid,
        title or "Cuộc trò chuyện mới",
    )

    return {"data": {"id": sid, "title": title or "Cuộc trò chuyện mới"}}


@app.patch("/chat/sessions/{session_id}")
async def update_session(session_id: str, request: dict):
    """
    PATCH /chat/sessions/{id} — Rename a chat session.
    Body: { title: string }
    """
    title = (request.get("title") or "").strip()[:80]
    if not title:
        raise HTTPException(status_code=400, detail="Missing title")

    pool = await get_pool()
    await pool.execute(
        "UPDATE chat_sessions SET title = $1, updated_at = now() WHERE id = $2",
        title,
        session_id,
    )
    return {"data": {"id": session_id, "title": title, "updated": True}}


@app.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    DELETE /chat/sessions/{id} — Delete a chat session and its messages.
    """
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM chat_messages WHERE session_id = $1",
        session_id,
    )
    await pool.execute(
        "DELETE FROM chat_sessions WHERE id = $1",
        session_id,
    )
    return {"data": None}


# ═══════════════════════════════════════════════════════════
# MEMORY ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.get("/memory/summary")
async def memory_summary():
    """
    GET /memory/summary
    Returns pending count + breakdown by source for Mini App Briefing mode.
    """
    pool = await get_pool()

    try:
        total_row = await pool.fetchrow(
            "SELECT COUNT(*) as cnt FROM memory WHERE status = 'pending'"
        )
        total = total_row["cnt"] if total_row else 0

        breakdown_rows = await pool.fetch(
            "SELECT source, COUNT(*) as cnt FROM memory "
            "WHERE status = 'pending' GROUP BY source"
        )
        breakdown = {"chat": 0, "capture": 0, "studio": 0, "manual": 0}
        for row in breakdown_rows:
            src = row["source"]
            if src in breakdown:
                breakdown[src] = row["cnt"]

        return {
            "data": {
                "count": total,
                "breakdown": breakdown,
            },
            "error": None,
        }
    except Exception:
        return {
            "data": {
                "count": 0,
                "breakdown": {"chat": 0, "capture": 0, "studio": 0, "manual": 0},
            },
            "error": None,
        }


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
    source_ref: str = Query(
        None, description="Filter by source_ref (document/capture ID)"
    ),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    GET /memory?status=pending|canonical|archived&source_ref=UUID&limit=20&offset=0
    List memories with optional status and source_ref filters.
    """
    pool = await get_pool()
    from agents.memory_agent import list_memories as list_mem

    results = await list_mem(
        status=status if status else None,
        source_ref=source_ref if source_ref else None,
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

        from agents.memory_agent import approve_memory, get_embedding, reject_memory

        if new_status == "canonical":
            # Ensure embedding exists synchronously before approving
            row = await pool.fetchrow(
                "SELECT content, embedding FROM memory WHERE id = $1::uuid AND status = 'pending'",
                memory_id,
            )
            if not row:
                raise HTTPException(
                    status_code=404, detail="Memory not found or not pending"
                )

            if row["embedding"] is None:
                try:
                    embedding = await get_embedding(row["content"])
                    vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
                    await pool.execute(
                        "UPDATE memory SET embedding = $1::vector WHERE id = $2::uuid",
                        vec_str,
                        memory_id,
                    )
                except Exception as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Embedding failed: {str(e)}",
                    )

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


# ═══════════════════════════════════════════════════════════
# DEEP RESEARCH ENDPOINT
# ═══════════════════════════════════════════════════════════


@app.post("/research/stream")
async def research_stream(request: dict):
    """
    POST /research/stream — Deep Research mode SSE.
    1. LLM generates 10-12 research questions
    2. Each question: web search + memory retrieval (with 45s timeout)
    3. LLM compiles structured Markdown report (with 60s timeout)
    4. Report saved to studio_documents
    SSE events: start → plan → progress → heartbeat → warning → done | error
    """
    topic = (request.get("topic") or request.get("message", "")).strip()
    user_id = request.get("user_id")

    if not topic:
        raise HTTPException(status_code=400, detail="Missing topic")

    pool = await get_pool()

    async def event_stream():
        import time as time_mod

        start_time = time_mod.time()
        last_yield = start_time

        async def maybe_heartbeat():
            nonlocal last_yield
            now = time_mod.time()
            elapsed = int(now - start_time)
            if now - last_yield > 25:
                yield f"data: {json.dumps({'event': 'heartbeat', 'elapsed': elapsed})}\n\n"
                last_yield = now
                # Warning at ~80s
                if elapsed > 80:
                    yield f"data: {json.dumps({'event': 'warning', 'elapsed': elapsed, 'message': 'Nghiên cứu đang mất nhiều thời gian hơn dự kiến...'})}\n\n"

        yield f"data: {json.dumps({'event': 'start'})}\n\n"

        try:
            from agents.deep_research import (
                compile_research_report,
                generate_research_plan,
                research_single_question,
            )

            # Stage 1: Generate research plan (with 30s timeout)
            yield f"data: {json.dumps({'event': 'progress', 'step': 'planning', 'message': 'Đang lập kế hoạch nghiên cứu...'})}\n\n"
            try:
                questions = await asyncio.wait_for(
                    generate_research_plan(topic, LITELLM_URL, LITELLM_MASTER_KEY),
                    timeout=30.0,
                )
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'event': 'error', 'message': 'Timeout khi lập kế hoạch nghiên cứu (>30s)'})}\n\n"
                return
            yield f"data: {json.dumps({'event': 'plan', 'questions': questions})}\n\n"
            async for hb in maybe_heartbeat():
                yield hb

            # Stage 2: Research each question (with 45s timeout per question)
            all_findings = []
            for i, question in enumerate(questions):
                yield f"data: {json.dumps({'event': 'progress', 'step': 'researching', 'question': question, 'index': i + 1, 'total': len(questions)})}\n\n"
                try:
                    findings = await asyncio.wait_for(
                        research_single_question(
                            question=question,
                            serper_key=SERPER_KEY,
                            db_pool=pool,
                        ),
                        timeout=45.0,
                    )
                    all_findings.append(findings)
                except asyncio.TimeoutError:
                    all_findings.append(
                        {
                            "question": question,
                            "web": [],
                            "memory": [],
                            "timeout": True,
                        }
                    )
                    yield f"data: {json.dumps({'event': 'progress', 'step': 'researching', 'question': question, 'index': i + 1, 'total': len(questions), 'warning': 'Timeout sau 45s, bỏ qua câu hỏi này'})}\n\n"
                await asyncio.sleep(0.05)
                async for hb in maybe_heartbeat():
                    yield hb

            # Stage 3: Compile report (with 60s timeout)
            yield f"data: {json.dumps({'event': 'progress', 'step': 'compiling', 'message': 'Đang tổng hợp báo cáo...'})}\n\n"
            try:
                report_content = await asyncio.wait_for(
                    compile_research_report(
                        topic=topic,
                        all_findings=all_findings,
                        model="deepseek-pro",
                        litellm_url=LITELLM_URL,
                        litellm_api_key=LITELLM_MASTER_KEY,
                    ),
                    timeout=60.0,
                )
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'event': 'error', 'message': 'Timeout khi tổng hợp báo cáo (>60s)'})}\n\n"
                return

            # Stage 4: Save to Studio
            doc_id = str(uuid.uuid4())
            report_title = f"Nghiên cứu: {topic[:80]}"

            user_uuid = None
            if user_id:
                try:
                    row = await pool.fetchrow(
                        "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') "
                        "ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
                        int(user_id),
                    )
                    user_uuid = row["id"]
                except Exception:
                    pass

            await pool.execute(
                "INSERT INTO studio_documents (id, user_id, title, content) VALUES ($1, $2, $3, $4)",
                doc_id,
                user_uuid,
                report_title,
                report_content,
            )

            try:
                await pool.execute(
                    "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) "
                    "VALUES ($1, 'research.complete', 'studio_document', $2, $3)",
                    user_uuid,
                    doc_id,
                    json.dumps(
                        {
                            "topic": topic,
                            "questions": len(questions),
                            "chars": len(report_content),
                        }
                    ),
                )
            except Exception:
                pass

            word_count = len(report_content.split())
            total_elapsed = int(time_mod.time() - start_time)
            yield f"data: {json.dumps({'event': 'done', 'doc_id': doc_id, 'title': report_title, 'word_count': word_count, 'question_count': len(questions), 'elapsed': total_elapsed})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════
# DEEP RESEARCH V2 — Async Job Pattern
# ═══════════════════════════════════════════════════════════

from pydantic import BaseModel, Field


class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=10, max_length=500)


@app.post("/research/start")
async def start_research_v2(body: dict, req: Request):
    """
    POST /research/start — Start a deep research job (V2 async pattern).
    Header: X-Telegram-Id (set by worker from JWT payload)
    """
    query = (body.get("query") or body.get("topic", "")).strip()
    # Use X-Telegram-Id (integer) for user lookup
    user_id = req.headers.get("X-Telegram-Id", "")
    if not user_id:
        user_id = str(body.get("user_id", ""))

    if not query or len(query) < 10:
        raise HTTPException(
            status_code=400, detail="Query must be at least 10 characters"
        )

    from research.job_manager import create_job, run_job

    pool = await get_pool()

    # Create a chat_session for left panel history (user_id optional)
    session_id = None
    try:
        session_id = str(uuid.uuid4())
        # Get or create user for user_id
        user_uuid = None
        if user_id:
            try:
                row = await pool.fetchrow(
                    "SELECT id FROM users WHERE telegram_id = $1",
                    int(user_id),
                )
                if row:
                    user_uuid = row["id"]
                else:
                    row = await pool.fetchrow(
                        "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') RETURNING id",
                        int(user_id),
                    )
                    user_uuid = row["id"]
            except Exception:
                pass

        await pool.execute(
            "INSERT INTO chat_sessions (id, user_id, title) VALUES ($1, $2, $3)",
            session_id,
            user_uuid,
            query[:80],
        )
    except Exception as e:
        print(f"[research] Failed to create chat_session: {e}")
        session_id = None

    job_id = create_job(str(user_id), query)
    asyncio.create_task(
        run_job(
            job_id,
            litellm_url=LITELLM_URL,
            litellm_api_key=LITELLM_MASTER_KEY,
            serper_key=SERPER_KEY,
            db_pool=pool,
        )
    )

    return {"data": {"job_id": job_id, "status": "queued", "session_id": session_id}}


@app.get("/research/{job_id}/status")
async def get_research_status(job_id: str):
    """
    GET /research/{job_id}/status — Poll research job progress.
    Returns: { job_id, status, progress, current_step, plan_title, sections[], error }
    """
    from research.job_manager import get_job

    pool = await get_pool()
    job = await get_job(job_id, db_pool=pool)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "data": {
            "job_id": job_id,
            "status": job["status"],
            "progress": job["progress"],
            "current_step": job["current_step"],
            "plan_title": job["plan"]["title"] if job.get("plan") else None,
            "angles": job.get("angles"),
            "intent_meta": {
                "depth": (job.get("intent") or {}).get("depth"),
                "memory_hits": (job.get("intent") or {}).get("memory_hits", 0),
                "estimated_sections": (job.get("intent") or {}).get(
                    "estimated_sections"
                ),
            },
            "plan": job.get("plan"),
            "sections": [
                {
                    "id": s["id"],
                    "title": s["title"],
                    "status": s["status"],
                    "content": s["content"] if s["status"] == "done" else None,
                }
                for s in job.get("sections", [])
            ],
            "error": job.get("error"),
            "document_id": job.get("document_id"),
            "completed_at": job.get("completed_at"),
        }
    }


# ═══════════════════════════════════════════════════════════
# STUDIO ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.post("/studio/documents")
async def create_document(request: Request):
    """POST /studio/documents — Create a Markdown document.

    Supports two modes:
    1. JSON body: { title, content, user_id? }
    2. Multipart form: file (UploadFile) + title? (optional, defaults to filename)

    When a file is uploaded, it is automatically converted to Markdown
    using the file_converter skill (MarkItDown).
    """
    content_type_header = request.headers.get("content-type", "")
    is_multipart = "multipart/form-data" in content_type_header

    title = ""
    content = ""
    user_ref = "1"
    r2_key = None

    if is_multipart:
        # ── Multipart file upload mode ─────────────────────────────────
        form = await request.form()
        file: UploadFile | None = form.get("file")
        if file is None:
            raise HTTPException(status_code=400, detail="Missing file in form data")

        # Read form fields
        title = (
            form.get("title") if isinstance(form.get("title"), str) else ""
        ).strip()
        if isinstance(form.get("user_id"), str):
            user_ref = form.get("user_id")

        # Get content type from uploaded file
        file_content_type = file.content_type
        original_filename = file.filename or "uploaded_file"

        # Auto-title from filename if not provided
        if not title:
            title = os.path.splitext(original_filename)[0]

        # Read file bytes
        file_bytes = await file.read()

        # Validate that we have content
        if not file_bytes:
            raise HTTPException(status_code=400, detail="File trống")

        # Convert to Markdown using the file_converter skill
        try:
            from skills.file_converter import convert_to_markdown

            content = await convert_to_markdown(
                file_bytes=file_bytes,
                content_type=file_content_type,
                original_filename=original_filename,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Lỗi chuyển đổi file: {str(e)}",
            )

        # Optionally upload original to R2 as background task
        # (only if R2 credentials are configured)
        r2_key = None
        r2_endpoint = os.environ.get("R2_ENDPOINT")
        r2_bucket = os.environ.get("R2_BUCKET_NAME")
        if r2_endpoint and r2_bucket:
            try:
                import boto3
                from botocore.config import Config as BotoConfig

                s3 = boto3.client(
                    "s3",
                    endpoint_url=r2_endpoint,
                    aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
                    aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
                    config=BotoConfig(
                        region_name="auto",
                        signature_version="s3v4",
                    ),
                )
                import uuid as _uuid_inner

                r2_key = f"studio/{_uuid_inner.uuid4()}_{original_filename}"
                s3.put_object(
                    Bucket=r2_bucket,
                    Key=r2_key,
                    Body=file_bytes,
                    ContentType=file_content_type or "application/octet-stream",
                )
            except Exception as e:
                # R2 upload is best-effort — log but don't fail the request
                print(f"R2 upload warning (non-fatal): {e}")
                r2_key = None
    else:
        # ── JSON body mode (backward compatible) ──────────────────────
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        title = body.get("title", "").strip()
        content = body.get("content", "").strip()
        user_ref = body.get("user_id", "1")

        if not title or not content:
            raise HTTPException(status_code=400, detail="Missing title or content")

    # ── Common: insert studio_documents row ───────────────────────────
    import uuid as _uuid

    pool = await get_pool()

    # Resolve user UUID from telegram_id
    user_uuid = None
    try:
        telegram_id_int = int(user_ref)
        row = await pool.fetchrow(
            "SELECT id FROM users WHERE telegram_id = $1", telegram_id_int
        )
        if not row:
            row = await pool.fetchrow(
                "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
                telegram_id_int,
            )
        user_uuid = row["id"]
    except Exception:
        user_uuid = None

    doc_id = str(_uuid.uuid4())
    await pool.execute(
        "INSERT INTO studio_documents (id, user_id, title, content, r2_key) VALUES ($1, $2, $3, $4, $5)",
        doc_id,
        user_uuid,
        title,
        content,
        r2_key,
    )

    # Audit log
    try:
        await pool.execute(
            "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) VALUES ($1, 'studio.create', 'studio_document', $2, $3)",
            user_uuid,
            doc_id,
            json.dumps(
                {
                    "title": title,
                    "char_count": len(content),
                    "source": "file_upload" if is_multipart else "manual",
                    "original_filename": original_filename if is_multipart else None,
                    "r2_key": r2_key,
                },
                default=str,
            ),
        )
    except Exception as e:
        print(f"Audit log warning: {e}")

    return {
        "data": {
            "id": doc_id,
            "title": title,
            "compile_status": "draft",
            "r2_key": r2_key,
        },
        "error": None,
    }


@app.put("/studio/documents/{doc_id}")
async def update_document(doc_id: str, request: dict):
    """
    PUT /studio/documents/{id} — Update document title or content.
    """
    title = request.get("title")
    content = request.get("content")
    if not title and not content:
        raise HTTPException(status_code=400, detail="Nothing to update")

    pool = await get_pool()
    if title:
        await pool.execute(
            "UPDATE studio_documents SET title = $1, updated_at = now() WHERE id = $2",
            title[:200],
            doc_id,
        )
    if content:
        await pool.execute(
            "UPDATE studio_documents SET content = $1, updated_at = now() WHERE id = $2",
            content,
            doc_id,
        )
    return {"data": {"id": doc_id, "updated": True}}


@app.delete("/studio/documents/{doc_id}")
async def delete_document(doc_id: str):
    """
    DELETE /studio/documents/{id} — Soft delete (set deleted_at).
    """
    pool = await get_pool()
    await pool.execute(
        "UPDATE studio_documents SET deleted_at = now() WHERE id = $1",
        doc_id,
    )
    return {"data": None}


@app.post("/studio/documents/{doc_id}/compile")
async def compile_document(doc_id: str, request: dict):
    """Compile document into memory with smart chunking."""
    pool = await get_pool()
    user_ref = request.get("user_id", "1")

    row = await pool.fetchrow(
        "SELECT id, title, content, compile_status FROM studio_documents WHERE id = $1",
        doc_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    if row["compile_status"] == "compiling":
        raise HTTPException(status_code=409, detail="Already compiling")

    await pool.execute(
        "UPDATE studio_documents SET compile_status = 'compiling', updated_at = now() WHERE id = $1",
        doc_id,
    )

    try:
        content_text = row["content"]
        char_count = len(content_text)

        # Smart chunking based on file size
        chunks = chunk_markdown_v2(content_text)

        if not chunks:
            raise ValueError("Không tách được nội dung có ý nghĩa từ tài liệu")

        capped = len(chunks) > 50
        chunks = chunks[:50]

        memory_ids = []
        for chunk in chunks:
            mid = str(uuid.uuid4())
            await pool.execute(
                "INSERT INTO memory (id, content, status, source, source_ref, metadata) VALUES ($1, $2, 'pending', 'studio', $3, $4)",
                mid,
                chunk,
                doc_id,
                json.dumps({"document_title": row["title"], "document_id": doc_id}),
            )
            memory_ids.append(mid)

        await pool.execute(
            "UPDATE studio_documents SET compile_status = 'compiled', memory_ids = $1, updated_at = now() WHERE id = $2",
            memory_ids,
            doc_id,
        )

        # Audit
        try:
            await pool.execute(
                "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) VALUES ($1, 'studio.compile', 'studio_document', $2, $3)",
                user_ref,
                doc_id,
                json.dumps(
                    {"chunks": len(memory_ids), "chars": char_count, "capped": capped}
                ),
            )
        except:
            pass

        return {
            "data": {
                "memory_ids": memory_ids,
                "count": len(memory_ids),
                "capped": capped,
                "char_count": char_count,
            },
            "error": None,
        }

    except Exception as e:
        await pool.execute(
            "UPDATE studio_documents SET compile_status = 'failed', updated_at = now() WHERE id = $1",
            doc_id,
        )
        raise HTTPException(status_code=422, detail=f"Compile failed: {str(e)}")


@app.get("/studio/documents")
async def list_documents():
    """GET /studio/documents — List non-deleted studio documents."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, title, compile_status, updated_at, created_at, r2_key, "
        "memory_ids, metadata "
        "FROM studio_documents WHERE deleted_at IS NULL "
        "ORDER BY updated_at DESC LIMIT 50"
    )
    result = []
    for r in rows:
        d = dict(r)
        d["memory_ids_count"] = len(r["memory_ids"]) if r["memory_ids"] else 0
        result.append(d)
    return {"data": result}


@app.get("/studio/documents/{doc_id}")
async def get_document(doc_id: str):
    """GET /studio/documents/{id} — Get full document detail."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, title, content, compile_status, memory_ids, "
        "r2_key, created_at, updated_at, metadata "
        "FROM studio_documents WHERE id = $1 AND deleted_at IS NULL",
        doc_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"data": dict(row)}


# ═══════════════════════════════════════════════════════════
# CAPTURE ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.post("/capture")
async def create_capture(request: dict):
    """POST /capture — Create a capture and trigger async fact extraction."""
    content = request.get("content", "").strip()
    capture_type = request.get("type", "text")
    user_ref = request.get("user_id", "1")
    url = request.get("url")

    if not content:
        raise HTTPException(status_code=400, detail="Missing content")

    pool = await get_pool()

    # Resolve user
    user_uuid = None
    try:
        row = await pool.fetchrow(
            "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') "
            "ON CONFLICT (telegram_id) DO UPDATE SET name = users.name RETURNING id",
            int(user_ref),
        )
        user_uuid = row["id"]
    except Exception as e:
        print(f"User upsert warning in capture: {e}")
        user_uuid = None

    if not user_uuid:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    capture_id = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO captures (id, user_id, type, content, url) VALUES ($1, $2, $3, $4, $5)",
        capture_id,
        user_uuid,
        capture_type,
        content,
        url,
    )

    # Async fact extraction
    asyncio.create_task(_extract_facts(capture_id, content, pool))

    return {"data": {"id": capture_id, "status": "processing"}, "error": None}


async def _extract_facts(capture_id: str, content: str, pool):
    """Background task: extract facts from capture content using LLM."""
    try:
        prompt = f"""Extract key business facts from this text. Return ONLY a JSON array.
Format: [{{"fact": "string", "confidence": 0.0-1.0}}]
Include only factual, actionable items. Skip opinions and greetings.
Max 5 facts.

Text: {content}"""

        headers = {"Content-Type": "application/json"}
        if LITELLM_MASTER_KEY:
            headers["Authorization"] = f"Bearer {LITELLM_MASTER_KEY}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{LITELLM_URL}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]

            # Parse JSON from response
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            facts = json.loads(match.group(0)) if match else []

            await pool.execute(
                "UPDATE captures SET status = 'extracted', extracted_facts = $1 WHERE id = $2",
                json.dumps(facts),
                capture_id,
            )
    except Exception as e:
        print(f"Fact extraction error for {capture_id}: {e}")
        try:
            await pool.execute(
                "UPDATE captures SET status = 'failed' WHERE id = $1", capture_id
            )
        except Exception:
            pass


@app.get("/capture/{capture_id}")
async def get_capture(capture_id: str):
    """GET /capture/{id} — Get capture status and extracted facts."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, type, content, extracted_facts, status, created_at FROM captures WHERE id = $1",
        capture_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Capture not found")
    return {"data": dict(row), "error": None}


@app.post("/capture/{capture_id}/commit")
async def commit_capture(capture_id: str, request: dict):
    """POST /capture/{id}/commit — Commit extracted facts to memory."""
    pool = await get_pool()
    from agents.memory_agent import store_memory

    row = await pool.fetchrow(
        "SELECT extracted_facts FROM captures WHERE id = $1 AND status = 'extracted'",
        capture_id,
    )
    if not row:
        raise HTTPException(
            status_code=404, detail="Capture not found or not extracted yet"
        )

    facts = (
        json.loads(row["extracted_facts"])
        if isinstance(row["extracted_facts"], str)
        else row["extracted_facts"] or []
    )
    memory_ids = []

    for fact in facts:
        mid = await store_memory(content=fact["fact"], source="capture", db_pool=pool)
        if mid:
            memory_ids.append(mid)

    await pool.execute(
        "UPDATE captures SET status = 'committed' WHERE id = $1", capture_id
    )

    # Audit
    try:
        await pool.execute(
            "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) VALUES ($1, 'capture.commit', 'capture', $2, $3)",
            request.get("user_id", "1"),
            capture_id,
            json.dumps({"memory_ids": memory_ids}),
        )
    except Exception:
        pass

    return {"data": {"memory_ids": memory_ids}, "error": None}


# ═══════════════════════════════════════════════════════════
# REMINDERS ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.post("/reminders")
async def create_reminder(request: dict):
    """POST /reminders — Create a reminder."""
    content = request.get("content", "").strip()
    remind_at = request.get("remind_at")  # ISO timestamp
    telegram_id = request.get("telegram_id")
    user_ref = request.get("user_id", "1")

    if not content or not remind_at:
        raise HTTPException(status_code=400, detail="Missing content or remind_at")

    pool = await get_pool()

    # Resolve user
    user_uuid = None
    try:
        row = await pool.fetchrow(
            "SELECT id FROM users WHERE telegram_id = $1", str(telegram_id or user_ref)
        )
        if row:
            user_uuid = row["id"]
    except Exception:
        pass

    rid = str(uuid.uuid4())
    remind_dt = datetime.fromisoformat(remind_at.replace("Z", "+00:00"))
    await pool.execute(
        "INSERT INTO reminders (id, user_id, telegram_id, content, remind_at) VALUES ($1, $2, $3, $4, $5)",
        rid,
        user_uuid,
        int(telegram_id or 0),
        content,
        remind_dt,
    )

    # Audit
    try:
        await pool.execute(
            "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) VALUES ($1, 'reminder.create', 'reminder', $2, $3)",
            user_uuid,
            rid,
            json.dumps({"content": content[:100], "remind_at": remind_at}),
        )
    except Exception:
        pass

    return {"data": {"id": rid, "status": "created"}, "error": None}


@app.get("/reminders/pending")
async def get_pending_reminders():
    """GET /reminders/pending — Get reminders that are due but not yet notified."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, telegram_id, content, remind_at FROM reminders WHERE remind_at <= now() AND notified_at IS NULL ORDER BY remind_at LIMIT 10"
    )
    return {"data": [dict(r) for r in rows], "error": None}


@app.post("/reminders/{reminder_id}/notify")
async def mark_reminder_notified(reminder_id: str):
    """POST /reminders/{id}/notify — Mark reminder as notified."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE reminders SET notified_at = now() WHERE id = $1", reminder_id
    )
    return {"data": {"id": reminder_id, "notified": True}, "error": None}


# ═══════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════


@app.post("/admin/memory/bulk-approve")
async def bulk_approve_memory(request: dict):
    """Bulk approve memories (max 20). Sequential embedding."""
    ids = request.get("ids", [])
    if len(ids) > 20:
        raise HTTPException(status_code=400, detail="Max 20 items per batch")

    pool = await get_pool()
    from agents.memory_agent import get_embedding

    approved, failed = 0, 0
    for mid in ids:
        try:
            # Get memory content
            row = await pool.fetchrow(
                "SELECT content, embedding FROM memory WHERE id = $1::uuid AND status = 'pending'",
                mid,
            )
            if not row:
                failed += 1
                continue
            # Generate embedding if missing
            if row["embedding"] is None:
                embedding = await get_embedding(row["content"])
                vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
                await pool.execute(
                    "UPDATE memory SET embedding = $1::vector WHERE id = $2::uuid",
                    vec_str,
                    mid,
                )
            # Approve
            await pool.execute(
                "UPDATE memory SET status = 'canonical', approved_at = now(), decay_at = now() + interval '730 days' WHERE id = $1::uuid",
                mid,
            )
            approved += 1
        except Exception as e:
            print(f"[admin] bulk_approve error for {mid}: {e}")
            failed += 1

    # Audit log
    try:
        await pool.execute(
            "INSERT INTO audit_log (action, resource_type, payload) VALUES ('admin.bulk_approve', 'memory', $1)",
            json.dumps({"approved": approved, "failed": failed}),
        )
    except Exception:
        pass

    return {"data": {"approved": approved, "failed": failed}, "error": None}


@app.get("/admin/audit")
async def list_audit(
    cursor: str = Query(None, description="Cursor (created_at ISO) for pagination"),
    limit: int = Query(50, ge=1, le=100),
):
    """Cursor-based paginated audit log."""
    pool = await get_pool()
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)
        rows = await pool.fetch(
            "SELECT id, user_id, action, resource_type, resource_id, llm_model, llm_tokens, created_at "
            "FROM audit_log WHERE created_at < $1::timestamptz ORDER BY created_at DESC LIMIT $2",
            cursor_dt,
            min(limit, 100),
        )
    else:
        rows = await pool.fetch(
            "SELECT id, user_id, action, resource_type, resource_id, llm_model, llm_tokens, created_at "
            "FROM audit_log ORDER BY created_at DESC LIMIT $1",
            min(limit, 100),
        )
    result = []
    for r in rows:
        d = dict(r)
        d["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
        result.append(d)
    next_cursor = result[-1]["created_at"] if result else None
    return {"data": result, "cursor": next_cursor, "error": None}


@app.get("/admin/audit/export")
async def export_audit():
    """Export audit log as CSV."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT created_at, action, resource_type, llm_model, llm_tokens "
        "FROM audit_log ORDER BY created_at DESC LIMIT 1000"
    )
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["created_at", "action", "resource_type", "llm_model", "llm_tokens"]
    )
    for r in rows:
        writer.writerow(
            [
                r["created_at"],
                r["action"],
                r["resource_type"],
                r["llm_model"],
                r["llm_tokens"],
            ]
        )
    from fastapi.responses import Response

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


@app.get("/admin/metrics")
async def admin_metrics():
    """Admin dashboard metrics."""
    pool = await get_pool()
    canonical = await pool.fetchval(
        "SELECT COUNT(*) FROM memory WHERE status = 'canonical'"
    )
    pending = await pool.fetchval(
        "SELECT COUNT(*) FROM memory WHERE status = 'pending'"
    )
    sessions_today = await pool.fetchval(
        "SELECT COUNT(*) FROM chat_sessions WHERE created_at::date = CURRENT_DATE"
    )
    messages_today = await pool.fetchval(
        "SELECT COUNT(*) FROM chat_messages WHERE created_at::date = CURRENT_DATE"
    )
    tokens_today = await pool.fetchval(
        "SELECT COALESCE(SUM(llm_tokens),0) FROM audit_log WHERE created_at::date = CURRENT_DATE"
    )
    return {
        "data": {
            "canonical_count": canonical,
            "pending_count": pending,
            "sessions_today": sessions_today,
            "messages_today": messages_today,
            "tokens_today": tokens_today,
        },
        "error": None,
    }


# ─── Smart Chunking ──────────────────────────────────────


def chunk_markdown_v2(content: str) -> list:
    """Split markdown into meaningful chunks based on size."""
    char_count = len(content)

    if char_count < 5000:
        return chunk_by_paragraph(content)
    elif char_count < 20000:
        return chunk_by_heading(content, [2, 3])
    else:
        chunks = chunk_by_heading(content, [1, 2])
        return chunks[:50]  # Hard cap


def chunk_by_paragraph(content: str) -> list:
    chunks = []
    current = []
    for line in content.split("\n"):
        if line.strip() == "" and current:
            chunk = "\n".join(current).strip()
            if len(chunk) >= 50:
                if len(chunk) > 800:
                    # Sub-split long paragraphs by sentence
                    sentences = re.split(r"(?<=[.!?])\s+", chunk)
                    sub = []
                    for s in sentences:
                        sub.append(s)
                        if len(" ".join(sub)) > 400:
                            chunks.append(" ".join(sub))
                            sub = []
                    if sub:
                        chunks.append(" ".join(sub))
                else:
                    chunks.append(chunk)
            current = []
        else:
            current.append(line)
    if current:
        chunk = "\n".join(current).strip()
        if len(chunk) >= 50:
            chunks.append(chunk)
    return chunks


def chunk_by_heading(content: str, levels: list) -> list:
    pattern = "^(" + "|".join("#" * l + " " for l in levels) + ")"
    heading_re = re.compile(pattern, re.MULTILINE)

    positions = [m.start() for m in heading_re.finditer(content)]
    positions.append(len(content))

    chunks = []
    for i in range(len(positions) - 1):
        chunk = content[positions[i] : positions[i + 1]].strip()
        if len(chunk) >= 50:
            if len(chunk) > 800:
                chunks.extend(chunk_by_paragraph(chunk))
            else:
                chunks.append(chunk)

    # Intro before first heading
    if positions and positions[0] > 0:
        intro = content[: positions[0]].strip()
        if len(intro) >= 50:
            chunks.insert(0, intro)

    return chunks


@app.get("/ops/schedule")
async def ops_schedule(
    request: Request,
    date: str = Query(None),
    next: bool = Query(False),
):
    """GET /ops/schedule?date=today&next=true - returns schedule from reminders."""
    from datetime import date as dt_date
    from datetime import datetime, timedelta, timezone

    today = dt_date.today()
    if date and date != "today":
        try:
            today = dt_date.fromisoformat(date)
        except ValueError:
            pass

    pool = await get_pool()
    now = datetime.now(timezone.utc)

    if next:
        row = await pool.fetchrow(
            "SELECT id, content, remind_at FROM reminders "
            "WHERE notified_at IS NULL AND remind_at > $1 "
            "ORDER BY remind_at ASC LIMIT 1",
            now,
        )
        if row:
            remind_at = row["remind_at"]
            diff_min = max(0, (remind_at - now).total_seconds() / 60)
            return {
                "data": {
                    "items": [],
                    "next": {
                        "id": str(row["id"]),
                        "title": row["content"],
                        "start_time": remind_at.isoformat(),
                        "duration_min": 30,
                        "minutes_until": round(diff_min),
                    },
                },
                "error": None,
            }
        return {"data": {"items": [], "next": None}, "error": None}

    day_start = datetime(
        today.year, today.month, today.day, 0, 0, 0, tzinfo=timezone.utc
    )
    day_end = day_start + timedelta(days=1)

    rows = await pool.fetch(
        "SELECT id, content, remind_at FROM reminders "
        "WHERE remind_at >= $1 AND remind_at < $2 AND notified_at IS NULL "
        "ORDER BY remind_at ASC",
        day_start,
        day_end,
    )

    tz_vn = timezone(timedelta(hours=VN_OFFSET_HOURS))
    items = []
    for r in rows:
        remind_at_vn = r["remind_at"].astimezone(tz_vn)
        items.append(
            {
                "id": str(r["id"]),
                "title": r["content"],
                "time": remind_at_vn.strftime("%H:%M"),
                "duration_min": 30,
                "tag": "30'",
            }
        )

    return {"data": {"items": items, "next": None}, "error": None}
