"""
Ajino v5 — Deep Research Job Manager
In-memory job store + asyncio background task.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone

# In-memory store — đủ cho single-tenant
_jobs: dict[str, dict] = {}


def create_job(user_id: str, query: str) -> str:
    """Create a new research job. Returns job_id."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "user_id": user_id,
        "query": query,
        "status": "queued",  # queued → analyzing → planning → researching → done | failed
        "progress": 0,
        "current_step": "",
        "plan": None,
        "sections": [],
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "document_id": None,
    }
    return job_id


async def get_job(job_id: str, db_pool=None) -> dict | None:
    """Get job state. Falls back to DB if not in memory."""
    if job_id in _jobs:
        return _jobs[job_id]

    # Fallback: query studio_documents by research_job_id in metadata
    if db_pool:
        try:
            row = await db_pool.fetchrow(
                "SELECT id, title, created_at FROM studio_documents "
                "WHERE metadata->>'research_job_id' = $1 AND deleted_at IS NULL",
                job_id,
            )
            if row:
                return {
                    "id": job_id,
                    "status": "done",
                    "progress": 100,
                    "plan_title": row["title"],
                    "document_id": str(row["id"]),
                    "sections": [],
                    "error": None,
                    "query": "",
                    "user_id": "",
                    "current_step": "Hoàn thành",
                    "plan": None,
                    "created_at": row["created_at"].isoformat(),
                    "completed_at": row["created_at"].isoformat(),
                }
        except Exception:
            pass

    return None


def update_job(job_id: str, **kwargs):
    """Update job state in memory."""
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)


async def run_job(
    job_id: str,
    litellm_url: str,
    litellm_api_key: str = "",
    serper_key: str = "",
    db_pool=None,
):
    """Main research pipeline. Runs in asyncio.create_task."""
    try:
        job = _jobs[job_id]
        query = job["query"]

        # === STEP 1: Intent Analysis ===
        update_job(
            job_id,
            status="analyzing",
            progress=5,
            current_step="Phân tích yêu cầu...",
        )
        from .intent_analyzer import analyze_intent

        intent = await analyze_intent(query, litellm_url, litellm_api_key)
        update_job(job_id, progress=15, intent=intent)

        # === STEP 2: Plan Generation ===
        update_job(
            job_id,
            status="planning",
            progress=20,
            current_step="Lập kế hoạch nghiên cứu...",
        )
        from .plan_generator import generate_plan

        plan = await generate_plan(intent, litellm_url, litellm_api_key)
        sections_init = [
            {
                "id": s["id"],
                "title": s["title"],
                "content": "",
                "status": "pending",
            }
            for s in plan["sections"]
        ]
        update_job(job_id, plan=plan, sections=sections_init, progress=25)

        # === STEP 3: Research sections ===
        update_job(job_id, status="researching")
        total = len(plan["sections"])
        completed_sections = []

        from .section_research import research_section

        for i, section_plan in enumerate(plan["sections"]):
            pct = 25 + int((i / total) * 60)
            update_job(
                job_id,
                progress=pct,
                current_step=f"Nghiên cứu: {section_plan['title']} ({i + 1}/{total})",
            )

            # Mark section as running
            secs = list(_jobs[job_id]["sections"])
            secs[i]["status"] = "running"
            update_job(job_id, sections=secs)

            try:
                content = await asyncio.wait_for(
                    research_section(
                        section_plan,
                        completed_sections,
                        job_id,
                        serper_key=serper_key,
                        db_pool=db_pool,
                        litellm_url=litellm_url,
                        litellm_api_key=litellm_api_key,
                    ),
                    timeout=90.0,
                )
                secs[i]["content"] = content
                secs[i]["status"] = "done"
                completed_section = {**section_plan, "content": content}
                completed_sections.append(completed_section)

            except asyncio.TimeoutError:
                secs[i]["status"] = "failed"
                secs[i]["content"] = (
                    f"## {section_plan['title']}\n\n_Section này mất quá nhiều thời gian. Vui lòng thử lại._"
                )
                completed_sections.append(
                    {**section_plan, "content": secs[i]["content"]}
                )

            update_job(job_id, sections=secs)

        # === STEP 4: Final Synthesis ===
        update_job(
            job_id,
            progress=88,
            current_step="Tổng hợp và kết luận...",
        )
        from .synthesis import write_final_synthesis

        synthesis = await asyncio.wait_for(
            write_final_synthesis(
                plan, completed_sections, litellm_url, litellm_api_key
            ),
            timeout=90.0,
        )

        # Compile full document
        full_content = f"# {plan['title']}\n\n"
        for sec in completed_sections:
            full_content += sec.get("content", "") + "\n\n"
        full_content += synthesis

        # Save to Studio — must provide user_id (NOT NULL)
        doc_id = None
        save_error = None
        saved_user_uuid = None
        if db_pool:
            try:
                doc_id = str(uuid.uuid4())
                # Resolve user_uuid from telegram_id
                user_uuid = None
                user_id_str = job.get("user_id")
                if user_id_str:
                    try:
                        row = await db_pool.fetchrow(
                            "SELECT id FROM users WHERE telegram_id = $1",
                            int(user_id_str),
                        )
                        if row:
                            user_uuid = row["id"]
                        else:
                            row = await db_pool.fetchrow(
                                "INSERT INTO users (telegram_id, role) VALUES ($1, 'ceo') RETURNING id",
                                int(user_id_str),
                            )
                            user_uuid = row["id"]
                    except Exception:
                        pass

                if not user_uuid:
                    raise Exception("Cannot resolve user for studio_documents save")

                await db_pool.execute(
                    "INSERT INTO studio_documents (id, user_id, title, content, metadata) "
                    "VALUES ($1, $2, $3, $4, $5::jsonb)",
                    doc_id,
                    user_uuid,
                    plan["title"],
                    full_content,
                    json.dumps(
                        {
                            "research_job_id": job_id,
                            "source_type": "research",
                            "word_count": len(full_content.split()),
                        }
                    ),
                )
                saved_user_uuid = user_uuid
                print(f"[job_manager] Saved doc {doc_id}: {plan['title'][:50]}")

                await db_pool.execute(
                    "INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload) "
                    "VALUES ($1, 'research.complete', 'studio_document', $2, $3)",
                    user_uuid,
                    doc_id,
                    json.dumps(
                        {
                            "job_id": job_id,
                            "sections": total,
                            "chars": len(full_content),
                        }
                    ),
                )
            except Exception as e:
                print(f"[job_manager] Save failed: {e}")
                save_error = str(e)
                doc_id = None

        if doc_id:
            update_job(
                job_id,
                status="done",
                progress=100,
                current_step="Hoàn thành",
                completed_at=datetime.now(timezone.utc).isoformat(),
                document_id=doc_id,
                error=None,
            )
        else:
            update_job(
                job_id,
                status="failed",
                progress=100,
                current_step="Lỗi khi lưu vào Studio",
                completed_at=datetime.now(timezone.utc).isoformat(),
                document_id=None,
                error=save_error or "Không lưu được tài liệu vào Studio",
            )
            # Write audit for failed research
            if db_pool:
                try:
                    await db_pool.execute(
                        "INSERT INTO audit_log (user_id, action, resource_type, payload) "
                        "VALUES ($1, 'research.failed', 'research_job', $2)",
                        saved_user_uuid or None,
                        json.dumps(
                            {
                                "job_id": job_id,
                                "error": save_error or "studio save failed",
                            }
                        ),
                    )
                except Exception:
                    pass

    except Exception as e:
        update_job(
            job_id,
            status="failed",
            error=str(e),
            current_step="Lỗi",
        )
        if db_pool:
            try:
                await db_pool.execute(
                    "INSERT INTO audit_log (user_id, action, resource_type, payload) "
                    "VALUES ($1, 'research.failed', 'research_job', $2)",
                    None,
                    json.dumps({"job_id": job_id, "error": str(e)}),
                )
            except Exception:
                pass
