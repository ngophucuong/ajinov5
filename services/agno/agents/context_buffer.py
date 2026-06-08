"""
Ajino v5 — Short-term context buffer for Telegram.
Extracts facts from messages and stores in KV with 30min TTL.
"""

import json
import os
import re

import httpx

KV_BASE = os.getenv("WORKER_URL", "https://agent-gateway.ngophucuong.workers.dev")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "dev-secret-change-in-production")
LITELLM_URL = os.getenv("LITELLM_API_BASE", "http://litellm:4000")
LITELLM_KEY = os.getenv("LITELLM_MASTER_KEY", "sk-ajinov5-litellm-master-2026")


async def extract_and_buffer(telegram_id: str, text: str, db_pool=None):
    """Extract facts from message and store in short-term buffer (KV, 30min TTL)."""
    try:
        # Extract facts using LLM
        prompt = f"""Extract key facts from this message. Return ONLY a JSON array.
Format: [{{"fact": "string", "confidence": 0.0-1.0}}]
Only include factual, reusable information. Skip opinions, greetings, questions.
Max 3 facts. If nothing factual, return empty array [].

Message: {text}"""

        headers = {"Content-Type": "application/json"}
        if LITELLM_KEY:
            headers["Authorization"] = f"Bearer {LITELLM_KEY}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{LITELLM_URL}/chat/completions",
                json={
                    "model": "deepseek-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0,
                },
                headers=headers,
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]

            # Parse facts
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            facts = json.loads(match.group(0)) if match else []

        if not facts:
            return

        # Read existing buffer from KV
        existing = []
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{KV_BASE}/internal/kv/stbuf/{telegram_id}",
                    headers={"X-Internal-Secret": INTERNAL_SECRET},
                )
                if r.status_code == 200:
                    existing = r.json()
        except Exception:
            pass

        # Merge: new facts first, keep max 20
        merged = facts + existing
        merged = merged[:20]

        # Store back to KV (TTL 30min = 1800s handled by Worker)
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.put(
                    f"{KV_BASE}/internal/kv/stbuf/{telegram_id}",
                    json=merged,
                    headers={
                        "X-Internal-Secret": INTERNAL_SECRET,
                        "Content-Type": "application/json",
                    },
                )
        except Exception:
            pass

        # Also create pending memory for high-confidence facts
        if db_pool:
            from .memory_agent import store_memory

            for fact in facts:
                if fact.get("confidence", 0) >= 0.7:
                    try:
                        await store_memory(
                            content=fact["fact"],
                            source="chat",
                            db_pool=db_pool,
                        )
                    except Exception:
                        pass

    except Exception as e:
        print(f"extract_and_buffer error: {e}")


async def get_short_term_buffer(telegram_id: str) -> list[dict]:
    """Read short-term buffer from KV."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{KV_BASE}/internal/kv/stbuf/{telegram_id}",
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return []
