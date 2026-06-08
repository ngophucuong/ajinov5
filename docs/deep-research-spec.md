# Ajino v5 — Deep Research Mode: Spec & Refactor Guide
# Dev đọc file này để implement từ đầu đến cuối

---

## Tổng quan

Deep Research là chế độ nghiên cứu chuyên sâu, khác hoàn toàn với chat thường.

```
Chat thường:   1 câu hỏi → 1 response → xong (~20s)
Deep Research: 1 chủ đề → plan → N vòng search+write → báo cáo (~3-8 phút)
```

Output hiện trực tiếp trong chat, không mở tab mới.
Render theo Option B+C: sections accordion + full-screen reading mode.

---

## 1. Trigger

Nút riêng trong input area, không phải slash command.

```
[  Hỏi bất cứ điều gì...           ] [◉ Research] [⊙]
```

Khi tap "◉ Research":
- Input placeholder đổi thành "Nhập chủ đề cần nghiên cứu..."
- Nút đổi màu amber (active state)
- Gửi tin → trigger research pipeline, không phải chat pipeline

---

## 2. Architecture — Đơn giản nhất có thể

```
Frontend (React)
    │ POST /api/research/start
    ▼
Worker (CF) → proxy → Agno
    │
    ▼
Agno: research_jobs dict (in-memory)
    │ asyncio.create_task
    ▼
ResearchJob chạy background:
    Step 1: Intent Analysis
    Step 2: Plan Generation
    Step 3: N × Section Research
    Step 4: Final Synthesis
    │ mỗi step → update job state
    ▼
Frontend poll GET /api/research/{job_id}/status mỗi 3s
    │ nhận updates → render dần
```

**Không dùng:** Celery, Redis, RQ, WebSocket, SSE cho research.
**Lý do:** Single-tenant, 1 user, asyncio.create_task + polling là đủ và dễ debug nhất.

---

## 3. Intent Analysis — Vòng đầu tiên

Trước khi plan, AI cần hiểu **thật sự user muốn gì**.

```python
# services/agno/research/intent_analyzer.py

INTENT_PROMPT = """Phân tích yêu cầu nghiên cứu sau và trả về JSON ONLY.

Yêu cầu: {query}

Schema:
{
  "topic": "chủ đề cốt lõi ngắn gọn",
  "research_type": "competitive" | "market" | "strategic" | "technical" | "general",
  "depth": "brief" | "standard" | "deep",
  "key_questions": ["câu hỏi 1", "câu hỏi 2", ...],  // 3-7 câu
  "suggested_sections": ["tên section 1", ...],        // 4-8 sections
  "search_keywords": ["từ khóa 1", ...],               // 5-10 từ khóa
  "context_from_memory": true | false,                 // có cần tìm trong memory không
  "estimated_sections": 4 | 6 | 8                     // dự kiến số sections
}

Rules:
- depth=brief: 4 sections, phù hợp câu hỏi đơn giản
- depth=standard: 6 sections, mặc định
- depth=deep: 8 sections, khi query có từ "toàn diện", "chi tiết", "2030", "chiến lược dài hạn"
- key_questions: đây là các câu hỏi AI cần TỰ TRẢ LỜI trong quá trình research
- search_keywords: dùng cho Serper search, viết bằng tiếng Anh hoặc tiếng Việt tùy ngữ cảnh"""

async def analyze_intent(query: str) -> dict:
    response = await litellm_call(
        model="deepseek-v4-flash",
        prompt=INTENT_PROMPT.format(query=query),
        max_tokens=500,
        temperature=0
    )
    try:
        return json.loads(response)
    except:
        # Fallback nếu JSON parse fail
        return {
            "topic": query[:100],
            "research_type": "general",
            "depth": "standard",
            "key_questions": [query],
            "suggested_sections": ["Tổng quan", "Phân tích", "Kết luận"],
            "search_keywords": [query],
            "context_from_memory": True,
            "estimated_sections": 3
        }
```

---

## 4. Plan Generation — Vòng thứ hai

Dùng intent để tạo plan chi tiết cho từng section.

```python
# services/agno/research/planner.py

PLAN_PROMPT = """Tạo kế hoạch nghiên cứu chi tiết dựa trên intent sau.
Trả về JSON ONLY.

Intent: {intent_json}

Schema:
{
  "title": "Tiêu đề báo cáo",
  "sections": [
    {
      "id": "s1",
      "title": "Tên section",
      "objective": "Mục tiêu của section này là gì",
      "search_queries": ["query 1 cho Serper", "query 2"],  // 1-3 queries
      "memory_query": "query để tìm trong canonical memory",
      "use_previous_sections": [],  // ["s1"] nếu section này cần context từ s1
      "output_format": "paragraph" | "bullets" | "table" | "mixed",
      "estimated_words": 200 | 400 | 600
    }
  ],
  "final_synthesis": {
    "objective": "Tổng hợp và kết luận từ tất cả sections",
    "output_format": "mixed"
  }
}

Rules:
- section đầu tiên KHÔNG có use_previous_sections
- section cuối cùng (trước final_synthesis) thường dùng tất cả sections trước
- search_queries: viết như người dùng thật tìm kiếm
- memory_query: viết ngắn, phù hợp semantic search"""

async def generate_plan(intent: dict) -> dict:
    response = await litellm_call(
        model="deepseek-v4-flash",
        prompt=PLAN_PROMPT.format(intent_json=json.dumps(intent, ensure_ascii=False)),
        max_tokens=1500,
        temperature=0.1
    )
    try:
        return json.loads(response)
    except:
        raise ValueError(f"Plan generation failed: {response[:200]}")
```

---

## 5. Section Research — Vòng lặp chính

Mỗi section chạy tuần tự (không song song — dễ debug, tránh rate limit).

```python
# services/agno/research/section_writer.py

SECTION_PROMPT = """Viết section "{section_title}" cho báo cáo nghiên cứu.

Mục tiêu section: {objective}

Thông tin tìm được từ web:
{web_results}

Thông tin từ memory:
{memory_results}

Context từ các section trước:
{previous_context}

Yêu cầu:
- Viết bằng tiếng Việt, chuyên nghiệp, súc tích
- Độ dài khoảng {estimated_words} từ
- Format: {output_format}
- Bắt đầu bằng ## {section_title}
- Không viết "Kết luận" ở cuối section (dành cho section cuối)
- Dùng dữ liệu cụ thể khi có (số liệu, tên công ty, ngày tháng)
- Nếu không có dữ liệu đủ tin cậy, ghi rõ "Chưa có dữ liệu xác nhận" """

async def research_section(
    section: dict,
    previous_sections: list[dict],
    job_id: str
) -> str:
    # 1. Web search
    web_results = ""
    for query in section.get("search_queries", []):
        results = await serper_search(query, num=3)
        web_results += format_search_results(results)

    # 2. Memory search
    memory_results = ""
    if section.get("memory_query"):
        memories = await memory_search(
            section["memory_query"],
            status="canonical",
            top_k=5
        )
        memory_results = "\n".join([m["content"] for m in memories])

    # 3. Previous context (chỉ lấy summary để tiết kiệm tokens)
    previous_context = ""
    for prev_id in section.get("use_previous_sections", []):
        prev = next((s for s in previous_sections if s["id"] == prev_id), None)
        if prev:
            # Lấy 500 ký tự đầu của section trước
            previous_context += f"### {prev['title']}\n{prev['content'][:500]}...\n\n"

    # 4. Generate section content
    content = await litellm_call(
        model="deepseek-v4-pro",
        prompt=SECTION_PROMPT.format(
            section_title=section["title"],
            objective=section["objective"],
            web_results=web_results[:3000],    # cap để tránh overflow
            memory_results=memory_results[:1500],
            previous_context=previous_context[:1000],
            estimated_words=section.get("estimated_words", 300),
            output_format=section.get("output_format", "paragraph")
        ),
        max_tokens=1200,
        temperature=0.3
    )

    # 5. Audit log
    await write_audit_log(
        action="research.section_complete",
        payload={"job_id": job_id, "section_id": section["id"],
                 "section_title": section["title"]}
    )

    return content
```

---

## 6. Job Manager — Trái tim của hệ thống

```python
# services/agno/research/job_manager.py
import asyncio, uuid
from datetime import datetime

# In-memory store — đủ cho single-tenant
# Key: job_id, Value: ResearchJob dict
_jobs: dict[str, dict] = {}

def create_job(user_id: str, query: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "user_id": user_id,
        "query": query,
        "status": "queued",     # queued → analyzing → planning → researching → done | failed
        "progress": 0,          # 0-100
        "current_step": "",
        "plan": None,
        "sections": [],         # [{id, title, content, status: pending|done|failed}]
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None
    }
    return job_id

def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)

def update_job(job_id: str, **kwargs):
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)

async def run_job(job_id: str):
    """Main research pipeline. Chạy trong asyncio.create_task."""
    try:
        job = _jobs[job_id]
        query = job["query"]

        # === STEP 1: Intent Analysis ===
        update_job(job_id, status="analyzing", progress=5,
                   current_step="Phân tích yêu cầu...")
        intent = await analyze_intent(query)
        update_job(job_id, progress=15)

        # === STEP 2: Plan Generation ===
        update_job(job_id, status="planning", progress=20,
                   current_step="Lập kế hoạch nghiên cứu...")
        plan = await generate_plan(intent)
        sections_init = [
            {"id": s["id"], "title": s["title"],
             "content": "", "status": "pending"}
            for s in plan["sections"]
        ]
        update_job(job_id, plan=plan, sections=sections_init, progress=25)

        # === STEP 3: Research sections ===
        update_job(job_id, status="researching")
        total = len(plan["sections"])
        completed_sections = []

        for i, section_plan in enumerate(plan["sections"]):
            # Update progress
            pct = 25 + int((i / total) * 60)
            update_job(job_id,
                progress=pct,
                current_step=f"Nghiên cứu: {section_plan['title']} ({i+1}/{total})")

            # Mark section as running
            secs = _jobs[job_id]["sections"]
            secs[i]["status"] = "running"
            update_job(job_id, sections=secs)

            try:
                content = await asyncio.wait_for(
                    research_section(section_plan, completed_sections, job_id),
                    timeout=90.0  # tối đa 90s mỗi section
                )
                secs[i]["content"] = content
                secs[i]["status"] = "done"
                completed_sections.append({**section_plan, "content": content})

            except asyncio.TimeoutError:
                secs[i]["status"] = "failed"
                secs[i]["content"] = f"## {section_plan['title']}\n\n_Section này mất quá nhiều thời gian. Vui lòng thử lại._"
                completed_sections.append({**section_plan, "content": secs[i]["content"]})

            update_job(job_id, sections=secs)

        # === STEP 4: Final Synthesis ===
        update_job(job_id, progress=88,
                   current_step="Tổng hợp và kết luận...")

        synthesis = await asyncio.wait_for(
            write_final_synthesis(plan, completed_sections),
            timeout=90.0
        )

        # Compile full document
        full_content = f"# {plan['title']}\n\n"
        for sec in completed_sections:
            full_content += sec["content"] + "\n\n"
        full_content += synthesis

        # Save to Studio as draft
        doc_id = await save_to_studio(
            user_id=job["user_id"],
            title=plan["title"],
            content=full_content
        )

        update_job(job_id,
            status="done",
            progress=100,
            current_step="Hoàn thành",
            completed_at=datetime.utcnow().isoformat(),
            document_id=str(doc_id)
        )

        await write_audit_log(
            user_id=job["user_id"],
            action="research.complete",
            payload={"job_id": job_id, "sections": total,
                     "document_id": str(doc_id)}
        )

    except Exception as e:
        update_job(job_id,
            status="failed",
            error=str(e),
            current_step="Lỗi"
        )
        await write_audit_log(
            user_id=_jobs[job_id]["user_id"],
            action="research.failed",
            payload={"job_id": job_id, "error": str(e)}
        )
```

---

## 7. API Endpoints

```python
# services/agno/main.py — thêm vào

from research.job_manager import create_job, get_job, run_job

@app.post("/api/research/start")
async def start_research(body: ResearchRequest, user=Depends(get_user)):
    job_id = create_job(user.id, body.query)
    asyncio.create_task(run_job(job_id))
    return {"data": {"job_id": job_id, "status": "queued"}}

@app.get("/api/research/{job_id}/status")
async def get_research_status(job_id: str, user=Depends(get_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, {"error": {"code": "JOB_NOT_FOUND"}})
    if job["user_id"] != str(user.id):
        raise HTTPException(403, {"error": {"code": "UNAUTHORIZED"}})

    return {"data": {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "current_step": job["current_step"],
        "plan_title": job["plan"]["title"] if job["plan"] else None,
        "sections": [
            {"id": s["id"], "title": s["title"],
             "status": s["status"],
             # Chỉ trả content khi done — tránh gửi partial content
             "content": s["content"] if s["status"] == "done" else None}
            for s in job["sections"]
        ],
        "error": job["error"],
        "document_id": job.get("document_id"),
        "completed_at": job["completed_at"]
    }}

# Pydantic model
class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=10, max_length=500)
```

---

## 8. Frontend — React Component

### 8.1 ResearchPanel component

```tsx
// apps/web/src/components/ResearchPanel.tsx

import { useState, useEffect, useRef } from 'react'

interface Section {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed'
  content: string | null
}

interface ResearchJob {
  job_id: string
  status: 'queued' | 'analyzing' | 'planning' | 'researching' | 'done' | 'failed'
  progress: number
  current_step: string
  plan_title: string | null
  sections: Section[]
  error: string | null
  document_id: string | null
}

export function ResearchPanel({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['s1']))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const pollRef = useRef<NodeJS.Timeout>()

  // Poll every 3 seconds until done/failed
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/research/${jobId}/status`, {
        credentials: 'include'
      })
      const { data } = await res.json()
      setJob(data)

      if (data.status !== 'done' && data.status !== 'failed') {
        pollRef.current = setTimeout(poll, 3000)
      }
    }

    poll()
    return () => clearTimeout(pollRef.current)
  }, [jobId])

  if (!job) return <ResearchSkeleton />

  return (
    <div className="research-panel">

      {/* Progress header */}
      <ResearchHeader job={job} onFullscreen={() => setIsFullscreen(true)} />

      {/* Plan outline — hiện ngay khi có plan */}
      {job.plan_title && (
        <div className="research-title">{job.plan_title}</div>
      )}

      {/* Sections list */}
      <div className="sections-list">
        {job.sections.map(section => (
          <SectionCard
            key={section.id}
            section={section}
            isExpanded={expandedSections.has(section.id)}
            onToggle={() => {
              setExpandedSections(prev => {
                const next = new Set(prev)
                next.has(section.id) ? next.delete(section.id) : next.add(section.id)
                return next
              })
            }}
          />
        ))}
      </div>

      {/* Done state */}
      {job.status === 'done' && (
        <ResearchDoneBar
          documentId={job.document_id!}
          onFullscreen={() => setIsFullscreen(true)}
        />
      )}

      {/* Error state */}
      {job.status === 'failed' && (
        <ResearchError message={job.error} />
      )}

      {/* Full-screen reading mode */}
      {isFullscreen && (
        <ResearchFullscreen
          job={job}
          onClose={() => setIsFullscreen(false)}
        />
      )}

    </div>
  )
}
```

### 8.2 SectionCard — accordion

```tsx
function SectionCard({ section, isExpanded, onToggle }) {
  return (
    <div className={`section-card status-${section.status}`}>

      {/* Header — always visible, tappable */}
      <button className="section-header" onClick={onToggle}>
        <SectionStatusIcon status={section.status} />
        <span className="section-title">{section.title}</span>
        <ChevronIcon expanded={isExpanded} />
      </button>

      {/* Content — visible when expanded AND done */}
      {isExpanded && section.status === 'done' && section.content && (
        <div className="section-content">
          {/* Dùng react-markdown */}
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}

      {/* Running state */}
      {section.status === 'running' && (
        <div className="section-running">
          <Spinner size="small" />
          <span>Đang nghiên cứu...</span>
        </div>
      )}

      {/* Pending state */}
      {section.status === 'pending' && isExpanded && (
        <div className="section-pending">Chờ xử lý</div>
      )}

    </div>
  )
}

function SectionStatusIcon({ status }) {
  if (status === 'done')    return <span className="icon-done">✓</span>
  if (status === 'running') return <Spinner size="tiny" />
  if (status === 'failed')  return <span className="icon-failed">✗</span>
  return <span className="icon-pending">○</span>
}
```

### 8.3 ResearchHeader — progress bar

```tsx
function ResearchHeader({ job, onFullscreen }) {
  const isActive = !['done', 'failed'].includes(job.status)

  return (
    <div className="research-header">
      <div className="research-meta">
        <span className="research-badge">◉ Deep Research</span>
        {isActive && (
          <span className="research-step">{job.current_step}</span>
        )}
        {job.status === 'done' && (
          <span className="research-done">✓ Hoàn thành</span>
        )}
      </div>

      {/* Progress bar — chỉ show khi đang chạy */}
      {isActive && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${job.progress}%`, transition: 'width 0.5s ease' }}
          />
        </div>
      )}
    </div>
  )
}
```

### 8.4 ResearchDoneBar

```tsx
function ResearchDoneBar({ documentId, onFullscreen }) {
  return (
    <div className="done-bar">
      <button className="btn-outline" onClick={onFullscreen}>
        <i className="ti ti-book-open" /> Đọc toàn bộ
      </button>
      <button className="btn-outline" onClick={() => navigate(`/admin/studio/${documentId}`)}>
        <i className="ti ti-books" /> Mở trong Studio
      </button>
      <button className="btn-primary" onClick={() => compileToMemory(documentId)}>
        <i className="ti ti-brain" /> Compile → Memory
      </button>
    </div>
  )
}
```

### 8.5 ResearchFullscreen — reading mode

```tsx
function ResearchFullscreen({ job, onClose }) {
  return (
    <div className="fullscreen-overlay">
      <div className="fullscreen-header">
        <span className="fullscreen-title">{job.plan_title}</span>
        <button onClick={onClose}><i className="ti ti-x" /></button>
      </div>

      <div className="fullscreen-content">
        {/* Table of contents */}
        <div className="toc">
          {job.sections.filter(s => s.status === 'done').map(s => (
            <a key={s.id} href={`#${s.id}`} className="toc-item">
              {s.title}
            </a>
          ))}
        </div>

        {/* Full content */}
        <div className="full-document">
          {job.sections.filter(s => s.status === 'done').map(s => (
            <div key={s.id} id={s.id} className="full-section">
              <ReactMarkdown>{s.content!}</ReactMarkdown>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## 9. CSS — tối thiểu cần có

```css
/* research-panel */
.research-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
}

.research-header {
  padding: 10px 12px;
  background: var(--s1);
  border-radius: 10px;
  border: 0.5px solid var(--b1);
}

.research-badge {
  font-family: var(--fm);
  font-size: 10px;
  color: var(--pu);
  letter-spacing: 0.06em;
}

.research-step {
  font-family: var(--fm);
  font-size: 10px;
  color: var(--mu);
  margin-left: 8px;
}

.progress-bar {
  height: 2px;
  background: var(--b2);
  border-radius: 1px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--pu);
  border-radius: 1px;
}

/* sections */
.section-card {
  border: 0.5px solid var(--b1);
  border-radius: 10px;
  overflow: hidden;
  background: var(--s1);
}

.section-card.status-running {
  border-color: rgba(139,114,240,0.3);
}

.section-card.status-done {
  border-color: var(--b2);
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.section-header:hover { background: var(--am0); }

.icon-done { color: var(--gr); font-size: 12px; }
.icon-pending { color: var(--mu); font-size: 12px; }
.icon-failed { color: var(--re); font-size: 12px; }

.section-title {
  flex: 1;
  font-size: 13px;
  color: var(--tx);
}

.section-content {
  padding: 0 13px 13px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--tx);
  border-top: 0.5px solid var(--b1);
}

/* react-markdown styles bên trong section-content */
.section-content h2 { display: none; } /* title đã hiện trong header */
.section-content p { margin-bottom: 8px; }
.section-content strong { color: var(--am); font-weight: 500; }
.section-content code {
  font-family: var(--fm);
  font-size: 11px;
  background: var(--s2);
  padding: 1px 5px;
  border-radius: 3px;
}
.section-content ul, .section-content ol {
  padding-left: 16px;
  margin-bottom: 8px;
}
.section-content li { margin-bottom: 4px; }
.section-content table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 8px;
}
.section-content th, .section-content td {
  border: 0.5px solid var(--b2);
  padding: 6px 8px;
  text-align: left;
}
.section-content th {
  background: var(--s2);
  color: var(--am);
  font-family: var(--fm);
  font-size: 10px;
}

/* fullscreen */
.fullscreen-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.fullscreen-header {
  height: 50px;
  background: var(--s1);
  border-bottom: 0.5px solid var(--b1);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  flex-shrink: 0;
}

.fullscreen-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  gap: 0;
}

/* TOC sidebar */
.toc {
  width: 200px;
  flex-shrink: 0;
  padding: 16px;
  border-right: 0.5px solid var(--b1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: fit-content;
}

.toc-item {
  font-family: var(--fm);
  font-size: 10px;
  color: var(--mu);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.12s;
  letter-spacing: 0.03em;
}

.toc-item:hover {
  background: var(--am0);
  color: var(--am);
}

.full-document {
  flex: 1;
  padding: 20px 24px;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.8;
}

/* done bar */
.done-bar {
  display: flex;
  gap: 6px;
  padding: 10px 0 4px;
}
```

---

## 10. Package cần install

```bash
# Frontend
npm install react-markdown

# Không cần thêm gì khác
# Virtual scrolling KHÔNG cần vì dùng accordion
# react-window, react-virtualized — SKIP
```

---

## 11. Tiêu chí nghiệm thu

### M-RES1 — Intent & Plan

- [ ] POST `/api/research/start` trả job_id trong < 1s
- [ ] Sau 10s: `GET /api/research/{job_id}/status` có `plan_title` và `sections[]`
- [ ] Sections count: query đơn giản → 4 sections, query phức tạp → 6-8 sections
- [ ] Intent analysis với query tiếng Việt → `search_keywords` có nghĩa

**Self-test:**
```bash
# Start job
curl -s -b cookies.txt -X POST https://ajinov5.cuong.ngo/api/research/start \
  -H "Content-Type: application/json" \
  -d '{"query":"Phân tích chiến lược cạnh tranh logistics xuyên biên giới Việt-Trung 2026-2030"}' | jq .data.job_id

# Poll sau 10s
curl -s -b cookies.txt https://ajinov5.cuong.ngo/api/research/JOB_ID/status | jq '{status:.data.status, sections:(.data.sections|length), title:.data.plan_title}'
```

### M-RES2 — Section research

- [ ] Sections chạy tuần tự — không song song
- [ ] Section `status` thay đổi: pending → running → done
- [ ] Section done có `content` không null, bắt đầu bằng `## {title}`
- [ ] Section timeout (> 90s) → status=failed, content có thông báo lỗi, job tiếp tục
- [ ] audit_log có row `research.section_complete` cho mỗi section

### M-RES3 — Frontend render

- [ ] ResearchPanel xuất hiện ngay trong chat khi job bắt đầu
- [ ] Progress bar tăng dần, không nhảy
- [ ] Section mới done → accordion tự expand
- [ ] Tap header section → toggle content
- [ ] ReactMarkdown render đúng: table, bold, list, code
- [ ] Fullscreen: TOC sidebar clickable, scroll đến đúng section

### M-RES4 — Done state

- [ ] Khi done: document_id có trong response
- [ ] Nút "Mở trong Studio" → navigate đến `/admin/studio/{document_id}`
- [ ] Nút "Compile → Memory" → POST `/api/studio/documents/{document_id}/compile`
- [ ] document content trong Studio = concat tất cả sections + synthesis

### M-RES5 — Không mock

```bash
grep -rn "mock\|fake\|hardcode" services/agno/research/
# Phải empty
```

---

## 12. Debug guide — khi có vấn đề

```bash
# Xem job state hiện tại
curl -s -b cookies.txt https://ajinov5.cuong.ngo/api/research/JOB_ID/status | jq .

# Xem Agno logs để tìm lỗi trong pipeline
docker compose logs -f ajinov5-agno | grep "research"

# Kiểm tra section nào bị timeout
docker compose logs ajinov5-agno | grep "TimeoutError"

# Kiểm tra audit log
docker exec ajinov5-postgres psql -U ajino -d ajino -c \
  "SELECT action, payload->>'section_title', created_at
   FROM audit_log WHERE action LIKE 'research.%'
   ORDER BY created_at DESC LIMIT 20;"
```

---

*Đọc cùng: AGENTS.md §3, studio-file-conversion.md, studio-ux-chunking.md*
