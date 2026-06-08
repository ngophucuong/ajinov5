"""
Ajino v5 — Memory Agent
Handles memory storage, retrieval, embedding, and lifecycle.
Vectorize = PRIMARY vector search (agent-kb, 1024d, cosine)
pgvector = fallback + structured queries
Embedding: Cloudflare Workers AI @cf/baai/bge-m3 (1024 dim)
"""

import hashlib
import json
import os
import struct
import time
from typing import Optional
from uuid import UUID

import asyncpg
import httpx

# ⚠️ ASSUMPTION: CF Workers AI token may not be set yet.
# Embedding falls back to deterministic hash-based mock vector (1024d).
# VERIFY-BY: Set CF_WORKERS_AI_TOKEN in .env, test embedding API call.
# RISK-IF-WRONG: Mock embeddings produce lower-quality semantic search vs real bge-m3.
CF_WORKERS_AI_TOKEN = os.getenv("CF_WORKERS_AI_TOKEN", "")
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "")
CF_VECTORIZE_TOKEN = os.getenv("CF_VECTORIZE_TOKEN", "")
VECTORIZE_INDEX_NAME = os.getenv("VECTORIZE_INDEX_NAME", "agent-kb")

EMBEDDING_MODEL = "@cf/baai/bge-m3"
EMBEDDING_DIM = 1024

# ─── Embedding ───────────────────────────────────────────


def _mock_embedding(text: str) -> list[float]:
    """
    ⚠️ MOCK EMBEDDING — Deterministic hash-based 1024d vector.
    Replaced by real CF Workers AI call when CF_WORKERS_AI_TOKEN is set.
    Produces consistent vectors for identical text (cosine-friendly).
    """
    # Use SHA-256 to generate deterministic seed bytes
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Generate 1024 floats from hash bytes
    vec = []
    for i in range(EMBEDDING_DIM):
        # Use 4 bytes per float, cycling through hash
        idx = (i * 4) % len(h)
        # Combine 4 bytes into a float in [-1, 1]
        val = struct.unpack(
            "f",
            bytes(
                [
                    h[(idx) % len(h)],
                    h[(idx + 1) % len(h)],
                    h[(idx + 2) % len(h)],
                    h[(idx + 3) % len(h)],
                ]
            ),
        )[0]
        # Normalize to [-1, 1]
        val = max(-1.0, min(1.0, val))
        vec.append(val)
    # L2 normalize
    norm = sum(v * v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


async def get_embedding(text: str) -> list[float]:
    """
    Get embedding vector for text.
    Tries CF Workers AI first, falls back to mock.
    Returns 1024-dim float list.
    """
    if CF_WORKERS_AI_TOKEN and CF_ACCOUNT_ID:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{EMBEDDING_MODEL}",
                    headers={
                        "Authorization": f"Bearer {CF_WORKERS_AI_TOKEN}",
                        "Content-Type": "application/json",
                    },
                    json={"text": [text]},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("success") and data.get("result", {}).get("data"):
                        embedding = data["result"]["data"][0]
                        print(
                            f"[memory_agent] CF Workers AI embedding: {len(embedding)}d"
                        )
                        return embedding
                print(
                    f"[memory_agent] CF Workers AI failed: {resp.status_code} — using mock"
                )
        except Exception as e:
            print(f"[memory_agent] CF Workers AI error: {e} — using mock")

    print(
        "[memory_agent] ⚠️ Using MOCK embedding (hash-based 1024d). Set CF_WORKERS_AI_TOKEN for real bge-m3."
    )
    return _mock_embedding(text)


# ─── Vectorize (Primary) ─────────────────────────────────


async def _vectorize_search(embedding: list[float], top_k: int = 7) -> list[dict]:
    """
    Search Cloudflare Vectorize index (PRIMARY).
    Returns list of {id, content, score}.
    Falls back to pgvector on any error.
    """
    if not (CF_VECTORIZE_TOKEN and CF_ACCOUNT_ID):
        print("[memory_agent] Vectorize not configured — skipping")
        return []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/vectorize/v2/indexes/{VECTORIZE_INDEX_NAME}/query",
                headers={
                    "Authorization": f"Bearer {CF_VECTORIZE_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "vector": embedding,
                    "topK": top_k,
                    "returnValues": True,
                    "returnMetadata": True,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                matches = data.get("result", {}).get("matches", [])
                results = []
                for m in matches:
                    results.append(
                        {
                            "id": m.get("id"),
                            "content": m.get("metadata", {}).get("content", ""),
                            "score": m.get("score", 0),
                        }
                    )
                print(f"[memory_agent] Vectorize search: {len(results)} results")
                return results
            else:
                print(
                    f"[memory_agent] Vectorize query failed: {resp.status_code} — fallback to pgvector"
                )
    except Exception as e:
        print(f"[memory_agent] Vectorize error: {e} — fallback to pgvector")

    return []


# ─── pgvector (Fallback) ─────────────────────────────────


async def _pgvector_search(
    embedding: list[float], top_k: int, db_pool: asyncpg.Pool
) -> list[dict]:
    """
    Fallback vector search using pgvector cosine distance.
    Only returns canonical memories.
    """
    try:
        # Format vector as pgvector literal string
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"

        async with db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, content,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM memory
                WHERE status = 'canonical'
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector
                LIMIT $2
                """,
                vec_str,
                top_k,
            )
            results = []
            for row in rows:
                results.append(
                    {
                        "id": str(row["id"]),
                        "content": row["content"],
                        "score": float(row["similarity"]),
                    }
                )
            print(f"[memory_agent] pgvector search: {len(results)} canonical memories")
            return results
    except Exception as e:
        print(f"[memory_agent] pgvector search error: {e}")
        return []


# ─── Retrieve Memories ───────────────────────────────────


async def retrieve_memories(
    query: str,
    top_k: int = 7,
    db_pool: Optional[asyncpg.Pool] = None,
) -> list[dict]:
    """
    Retrieve canonical memories relevant to query.
    1. Get embedding for query
    2. Try Vectorize (PRIMARY)
    3. Fallback to pgvector
    Returns list of {id, content, score}
    """
    t0 = time.time()

    # Get query embedding
    embedding = await get_embedding(query)

    # Try Vectorize first (PRIMARY)
    results = await _vectorize_search(embedding, top_k)

    # Fallback to pgvector
    if not results and db_pool:
        results = await _pgvector_search(embedding, top_k, db_pool)

    elapsed = int((time.time() - t0) * 1000)
    print(f"[memory_agent] retrieve_memories: {len(results)} results in {elapsed}ms")

    return results


# ─── Store Memory ────────────────────────────────────────


async def store_memory(
    content: str,
    source: str = "manual",
    source_ref: Optional[str] = None,
    db_pool: Optional[asyncpg.Pool] = None,
) -> Optional[str]:
    """
    Insert a new memory row with status='pending'.
    Generates embedding and stores it.
    Returns memory UUID string, or None on failure.
    """
    if not db_pool:
        print("[memory_agent] No DB pool — cannot store memory")
        return None

    try:
        embedding = await get_embedding(content)
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"

        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO memory (content, embedding, status, source, source_ref, metadata)
                VALUES ($1, $2::vector, 'pending', $3, $4::uuid, '{}')
                RETURNING id
                """,
                content,
                vec_str,
                source,
                source_ref,
            )
            memory_id = str(row["id"])
            print(f"[memory_agent] Stored memory {memory_id}: {content[:60]}...")
            return memory_id
    except Exception as e:
        print(f"[memory_agent] store_memory error: {e}")
        return None


# ─── Memory Lifecycle ────────────────────────────────────


async def approve_memory(
    memory_id: str,
    approved_by: Optional[str] = None,
    db_pool: Optional[asyncpg.Pool] = None,
) -> dict:
    """
    Approve a pending memory → canonical.
    Sets approved_at, approved_by (if valid), and decay_at.
    Returns {id, status, updated: true/false}
    """
    if not db_pool:
        return {"id": memory_id, "status": "pending", "updated": False}

    try:
        async with db_pool.acquire() as conn:
            if approved_by:
                row = await conn.fetchrow(
                    """
                    UPDATE memory
                    SET status = 'canonical',
                        approved_at = now(),
                        approved_by = $2::uuid,
                        decay_at = now() + INTERVAL '730 days'
                    WHERE id = $1::uuid
                      AND status = 'pending'
                    RETURNING id, status
                    """,
                    memory_id,
                    approved_by,
                )
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE memory
                    SET status = 'canonical',
                        approved_at = now(),
                        decay_at = now() + INTERVAL '730 days'
                    WHERE id = $1::uuid
                      AND status = 'pending'
                    RETURNING id, status
                    """,
                    memory_id,
                )
            if row:
                print(f"[memory_agent] Approved memory {memory_id} → canonical")
                return {
                    "id": str(row["id"]),
                    "status": row["status"],
                    "updated": True,
                }
            else:
                # Check if already canonical/archived
                row = await conn.fetchrow(
                    "SELECT id, status FROM memory WHERE id = $1::uuid",
                    memory_id,
                )
                if row:
                    return {
                        "id": str(row["id"]),
                        "status": row["status"],
                        "updated": False,
                    }
                return {"id": memory_id, "status": "not_found", "updated": False}
    except Exception as e:
        print(f"[memory_agent] approve_memory error: {e}")
        return {"id": memory_id, "status": "error", "updated": False}


async def reject_memory(
    memory_id: str,
    db_pool: Optional[asyncpg.Pool] = None,
) -> dict:
    """
    Reject a pending memory → archived.
    Returns {id, status, updated: true/false}
    """
    if not db_pool:
        return {"id": memory_id, "status": "pending", "updated": False}

    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE memory
                SET status = 'archived'
                WHERE id = $1::uuid
                  AND status = 'pending'
                RETURNING id, status
                """,
                memory_id,
            )
            if row:
                print(f"[memory_agent] Rejected memory {memory_id} → archived")
                return {
                    "id": str(row["id"]),
                    "status": row["status"],
                    "updated": True,
                }
            return {
                "id": memory_id,
                "status": "not_found_or_not_pending",
                "updated": False,
            }
    except Exception as e:
        print(f"[memory_agent] reject_memory error: {e}")
        return {"id": memory_id, "status": "error", "updated": False}


async def edit_memory_content(
    memory_id: str,
    new_content: str,
    db_pool: Optional[asyncpg.Pool] = None,
) -> dict:
    """
    Edit memory content and re-embed.
    Returns {id, content, updated: true/false}
    """
    if not db_pool:
        return {"id": memory_id, "updated": False}

    try:
        embedding = await get_embedding(new_content)
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"

        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE memory
                SET content = $2, embedding = $3::vector
                WHERE id = $1::uuid
                RETURNING id, content
                """,
                memory_id,
                new_content,
                vec_str,
            )
            if row:
                print(
                    f"[memory_agent] Edited memory {memory_id}: {new_content[:60]}..."
                )
                return {
                    "id": str(row["id"]),
                    "content": row["content"][:200],
                    "updated": True,
                }
            return {"id": memory_id, "updated": False}
    except Exception as e:
        print(f"[memory_agent] edit_memory_content error: {e}")
        return {"id": memory_id, "updated": False}


async def list_memories(
    status: Optional[str] = None,
    source_ref: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db_pool: Optional[asyncpg.Pool] = None,
) -> list[dict]:
    """List memories with optional status and source_ref filters."""
    if not db_pool:
        return []

    try:
        async with db_pool.acquire() as conn:
            if status and source_ref:
                rows = await conn.fetch(
                    """
                    SELECT id, content, status, source, source_ref, approved_at,
                           created_at
                    FROM memory
                    WHERE status = $1 AND source_ref = $4::uuid
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    status,
                    limit,
                    offset,
                    source_ref,
                )
            elif status:
                rows = await conn.fetch(
                    """
                    SELECT id, content, status, source, source_ref, approved_at,
                           created_at
                    FROM memory
                    WHERE status = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    status,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT id, content, status, source, source_ref, approved_at,
                           created_at
                    FROM memory
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                    """,
                    limit,
                    offset,
                )
            results = []
            for row in rows:
                d = dict(row)
                # Convert UUIDs and datetimes to strings for JSON
                for k, v in d.items():
                    if isinstance(v, UUID):
                        d[k] = str(v)
                d["approved_at"] = (
                    d["approved_at"].isoformat() if d["approved_at"] else None
                )
                d["created_at"] = (
                    d["created_at"].isoformat() if d["created_at"] else None
                )
                results.append(d)
            return results
    except Exception as e:
        print(f"[memory_agent] list_memories error: {e}")
        return []


async def get_memory_by_id(
    memory_id: str,
    db_pool: Optional[asyncpg.Pool] = None,
) -> Optional[dict]:
    """Get a single memory by ID."""
    if not db_pool:
        return None

    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, content, status, source, source_ref, approved_at,
                       approved_by, decay_at, metadata, created_at
                FROM memory
                WHERE id = $1::uuid
                """,
                memory_id,
            )
            if row:
                d = dict(row)
                for k, v in d.items():
                    if isinstance(v, UUID):
                        d[k] = str(v)
                d["approved_at"] = (
                    d["approved_at"].isoformat() if d["approved_at"] else None
                )
                d["created_at"] = (
                    d["created_at"].isoformat() if d["created_at"] else None
                )
                d["decay_at"] = d["decay_at"].isoformat() if d["decay_at"] else None
                return d
            return None
    except Exception as e:
        print(f"[memory_agent] get_memory_by_id error: {e}")
        return None


# ─── Memory Candidate Extraction ─────────────────────────


def extract_memory_candidates(text: str) -> list[dict]:
    """
    Extract factual statements from text as memory candidates.
    Simple heuristic: sentences with business keywords and sufficient length.
    Returns [{content, confidence}]
    """
    candidates = []
    business_keywords = [
        "tỷ",
        "triệu",
        "%",
        "tăng",
        "giảm",
        "dự báo",
        "chiến lược",
        "sla",
        "doanh thu",
        "lợi nhuận",
        "thị trường",
        "đối tác",
        "hợp đồng",
        "rủi ro",
        "cơ hội",
        "xu hướng",
        "chỉ số",
        "ngân sách",
        "đầu tư",
        "sản phẩm",
        "khách hàng",
        "đối thủ",
    ]

    sentences = text.replace("!", ".").replace("?", ".").split(".")
    for sentence in sentences:
        s = sentence.strip()
        if len(s) < 30:
            continue
        if any(kw in s.lower() for kw in business_keywords):
            confidence = 0.7
            if len(s) > 80:
                confidence = 0.8
            candidates.append({"content": s + ".", "confidence": confidence})

    return candidates[:10]  # Max 10 candidates
