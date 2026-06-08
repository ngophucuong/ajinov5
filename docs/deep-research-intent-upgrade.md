# Ajino v5 — Deep Research: Multi-Angle Intent Analysis
# Upgrade cho services/agno/research/intent_analyzer.py
# Thay thế hoàn toàn analyze_intent() hiện tại

---

## Tổng quan thay đổi

```
Trước:  1 vòng (flash) → intent JSON đơn giản → plan
Sau:    2 vòng
        Vòng 1 (flash, ~3s)  → phân tích 7 góc
        Vòng 2 (pro,  ~10s)  → tổng hợp → plan phong phú
```

Tổng thêm ~13s. Đổi lại: plan sâu hơn, sections đúng trọng tâm hơn.

---

## Vòng 1 — Multi-Angle Decomposition (deepseek-v4-flash)

```python
# services/agno/research/intent_analyzer.py
# REPLACE toàn bộ file này

import json
import asyncio
from typing import Optional

ANGLE_PROMPT = """Bạn là chuyên gia phân tích chiến lược.
Phân tích yêu cầu nghiên cứu sau từ 7 góc độ khác nhau.
Trả về JSON ONLY, không markdown, không giải thích.

Yêu cầu: "{query}"

Schema:
{{
  "who": {{
    "primary": "Ai là người ra quyết định liên quan trực tiếp?",
    "stakeholders": ["stakeholder 1", "stakeholder 2"],
    "competitors": ["đối thủ 1", "đối thủ 2"]
  }},
  "what": {{
    "core_topic": "Chủ đề cốt lõi 1 câu",
    "dimensions": ["chiều phân tích 1", "chiều 2", "chiều 3"],
    "not_asking_about": ["thứ KHÔNG liên quan để tránh lạc đề"]
  }},
  "when": {{
    "timeframe": "khung thời gian cụ thể nếu có",
    "key_milestones": ["mốc quan trọng trong timeframe"],
    "urgency": "immediate" | "strategic" | "exploratory"
  }},
  "why": {{
    "underlying_goal": "Mục đích thật sự phía sau câu hỏi",
    "decision_to_make": "Quyết định nào sẽ được đưa ra sau nghiên cứu này?",
    "success_metric": "Nghiên cứu thành công khi nào?"
  }},
  "risk": {{
    "known_risks": ["rủi ro đã biết liên quan"],
    "unknown_risks": ["rủi ro tiềm ẩn cần tìm hiểu"],
    "blind_spots": ["góc khuất có thể bị bỏ qua"]
  }},
  "gap": {{
    "likely_knows": ["thông tin người hỏi có thể đã biết"],
    "likely_missing": ["thông tin quan trọng họ đang thiếu"],
    "assumptions_to_validate": ["giả định cần kiểm chứng"]
  }},
  "action": {{
    "output_type": "decision" | "strategy" | "analysis" | "report",
    "audience": "chỉ người hỏi" | "team" | "board" | "partner",
    "recommended_depth": "brief" | "standard" | "deep",
    "recommended_sections": 4 | 6 | 8
  }}
}}

Rules:
- recommended_depth=deep khi: có từ "toàn diện", "chiến lược", "2030", "dài hạn", hoặc urgency=strategic
- recommended_depth=brief khi: câu hỏi đơn giản, factual, urgency=immediate
- recommended_sections phải khớp depth: brief=4, standard=6, deep=8
- not_asking_about: quan trọng để tránh hallucination, tối đa 3 items
- competitors: chỉ điền nếu query liên quan cạnh tranh"""


SYNTHESIS_PROMPT = """Bạn là kiến trúc sư nghiên cứu chiến lược cấp cao.
Dựa trên phân tích 7 góc độ dưới đây, tạo kế hoạch nghiên cứu chi tiết.
Trả về JSON ONLY, không markdown, không giải thích.

Query gốc: "{query}"

Phân tích 7 góc:
{angles_json}

Context từ memory (canonical knowledge đã có):
{memory_context}

Schema output:
{{
  "title": "Tiêu đề báo cáo — cụ thể, không generic",
  "executive_summary_prompt": "Prompt để viết executive summary 1 đoạn",
  "sections": [
    {{
      "id": "s1",
      "title": "Tên section — cụ thể, không phải 'Tổng quan'",
      "objective": "Section này trả lời câu hỏi gì cụ thể?",
      "angle_source": ["who", "what"],
      "search_queries": ["query Serper 1", "query 2"],
      "memory_query": "query ngắn cho vector search",
      "use_previous_sections": [],
      "output_format": "paragraph" | "bullets" | "table" | "mixed",
      "estimated_words": 200 | 300 | 400 | 500,
      "key_questions": ["câu hỏi cụ thể section phải trả lời"]
    }}
  ],
  "synthesis_section": {{
    "title": "Khuyến nghị & Hành động",
    "objective": "Tổng hợp insights, đưa ra khuyến nghị cụ thể",
    "use_all_sections": true,
    "output_format": "mixed",
    "estimated_words": 400
  }},
  "research_meta": {{
    "total_estimated_minutes": 3 | 5 | 8,
    "confidence_level": "high" | "medium" | "low",
    "data_availability": "Nhận định về khả năng tìm được dữ liệu"
  }}
}}

Rules quan trọng:
- title phải phản ánh đúng query, không phải "Báo cáo Nghiên cứu"
- Mỗi section phải có objective là 1 câu hỏi cụ thể, không phải mô tả
- angle_source: section đó trả lời góc nào trong 7 góc
- sections cuối cùng (trừ synthesis) nên có use_previous_sections
- search_queries: viết như người thật search, mix tiếng Việt và tiếng Anh
- Tránh section trùng lặp — mỗi section phải có điểm phân biệt rõ
- key_questions: 2-3 câu hỏi cụ thể mà section PHẢI trả lời được
- Nếu memory_context có thông tin liên quan → ưu tiên khai thác, không chỉ search web"""


async def analyze_intent_multangle(query: str, user_id: str) -> dict:
    """
    2-vòng intent analysis.
    Vòng 1: Flash phân tích 7 góc (~3s)
    Vòng 2: Pro tổng hợp thành plan (~10s)

    Returns: full plan dict ready for job_manager
    """

    # ── Vòng 1: Multi-angle decomposition ──────────────────────
    angles_raw = await litellm_call(
        model="deepseek-v4-flash",
        prompt=ANGLE_PROMPT.format(query=query),
        max_tokens=800,
        temperature=0
    )

    try:
        angles = json.loads(angles_raw)
    except json.JSONDecodeError:
        # Flash fail → dùng fallback angles
        angles = _fallback_angles(query)

    # ── Lấy relevant memories để enrich context ─────────────────
    # Dùng core topic từ angles để search
    core_topic = angles.get("what", {}).get("core_topic", query)
    memories = await memory_search(
        query=core_topic,
        status="canonical",
        top_k=7
    )
    memory_context = _format_memory_context(memories)

    # ── Vòng 2: Synthesis → Plan ────────────────────────────────
    plan_raw = await litellm_call(
        model="deepseek-v4-pro",
        prompt=SYNTHESIS_PROMPT.format(
            query=query,
            angles_json=json.dumps(angles, ensure_ascii=False, indent=2),
            memory_context=memory_context
        ),
        max_tokens=2000,
        temperature=0.2
    )

    try:
        plan = json.loads(plan_raw)
    except json.JSONDecodeError:
        raise ValueError(f"Plan synthesis failed. Raw: {plan_raw[:300]}")

    # ── Validate plan structure ──────────────────────────────────
    plan = _validate_and_fix_plan(plan, angles)

    # ── Audit log ────────────────────────────────────────────────
    await write_audit_log(
        user_id=user_id,
        action="research.intent_analyzed",
        payload={
            "query": query[:200],
            "depth": angles.get("action", {}).get("recommended_depth"),
            "sections_count": len(plan.get("sections", [])),
            "angles_used": list(angles.keys()),
            "memory_hits": len(memories)
        }
    )

    return {"angles": angles, "plan": plan}


def _fallback_angles(query: str) -> dict:
    """Fallback khi Flash parse fail — không crash job."""
    return {
        "who": {"primary": "CEO", "stakeholders": [], "competitors": []},
        "what": {"core_topic": query[:100], "dimensions": ["tổng quan"], "not_asking_about": []},
        "when": {"timeframe": "hiện tại", "key_milestones": [], "urgency": "strategic"},
        "why": {"underlying_goal": query, "decision_to_make": "Chưa xác định", "success_metric": "Có insights rõ ràng"},
        "risk": {"known_risks": [], "unknown_risks": [], "blind_spots": []},
        "gap": {"likely_knows": [], "likely_missing": [], "assumptions_to_validate": []},
        "action": {"output_type": "analysis", "audience": "chỉ người hỏi", "recommended_depth": "standard", "recommended_sections": 6}
    }


def _format_memory_context(memories: list) -> str:
    """Format canonical memories để inject vào Vòng 2."""
    if not memories:
        return "Không có canonical memory liên quan."
    lines = []
    for m in memories[:7]:
        domain = m.get("metadata", {}).get("domain", "general")
        lines.append(f"[{domain}] {m['content']}")
    return "\n".join(lines)


def _validate_and_fix_plan(plan: dict, angles: dict) -> dict:
    """
    Validate và fix plan trước khi trả về job_manager.
    Không crash — chỉ fix và log warning.
    """
    sections = plan.get("sections", [])

    # Đảm bảo có sections
    if not sections:
        plan["sections"] = _generate_fallback_sections(angles)
        return plan

    # Đảm bảo mỗi section có id
    for i, s in enumerate(sections):
        if not s.get("id"):
            s["id"] = f"s{i+1}"

    # Cap sections: tối đa 8
    if len(sections) > 8:
        plan["sections"] = sections[:8]

    # Đảm bảo synthesis section có
    if not plan.get("synthesis_section"):
        plan["synthesis_section"] = {
            "title": "Khuyến nghị & Hành động",
            "objective": "Tổng hợp insights và đưa ra khuyến nghị cụ thể",
            "use_all_sections": True,
            "output_format": "mixed",
            "estimated_words": 400
        }

    # Đảm bảo search_queries không rỗng
    for s in plan["sections"]:
        if not s.get("search_queries"):
            s["search_queries"] = [s.get("title", "")]

    return plan


def _generate_fallback_sections(angles: dict) -> list:
    """Fallback sections khi Pro synthesis fail."""
    topic = angles.get("what", {}).get("core_topic", "chủ đề")
    return [
        {"id": "s1", "title": f"Tổng quan {topic}", "objective": f"Tổng quan về {topic}",
         "search_queries": [topic], "memory_query": topic,
         "use_previous_sections": [], "output_format": "paragraph",
         "estimated_words": 300, "key_questions": [f"{topic} là gì?"]},
        {"id": "s2", "title": "Phân tích hiện trạng", "objective": "Hiện trạng như thế nào?",
         "search_queries": [f"{topic} hiện tại 2026"], "memory_query": topic,
         "use_previous_sections": ["s1"], "output_format": "mixed",
         "estimated_words": 400, "key_questions": ["Hiện trạng ra sao?"]},
        {"id": "s3", "title": "Cơ hội và thách thức", "objective": "Cơ hội và rủi ro chính?",
         "search_queries": [f"{topic} opportunity risk"], "memory_query": f"rủi ro {topic}",
         "use_previous_sections": ["s1", "s2"], "output_format": "bullets",
         "estimated_words": 300, "key_questions": ["Cơ hội nào đáng chú ý?"]},
    ]
```

---

## Cập nhật job_manager.py

```python
# services/agno/research/job_manager.py
# THAY ĐỔI: update_job sau analyze_intent

async def run_job(job_id: str):
    try:
        job = _jobs[job_id]
        query = job["query"]

        # === STEP 1: Multi-angle intent analysis ===
        update_job(job_id, status="analyzing", progress=5,
                   current_step="Phân tích ý định (7 góc)...")

        result = await analyze_intent_multangle(query, job["user_id"])
        angles = result["angles"]
        plan = result["plan"]

        # Trả angles về frontend để hiện cho user thấy
        # (optional — xem phần Frontend bên dưới)
        update_job(job_id,
            angles=angles,          # NEW: lưu angles vào job state
            progress=20,
            current_step="Lập kế hoạch nghiên cứu..."
        )

        # === STEP 2: Plan đã có từ analyze_intent_multangle ===
        # KHÔNG cần gọi generate_plan() riêng nữa
        sections_init = [
            {"id": s["id"], "title": s["title"],
             "content": "", "status": "pending"}
            for s in plan["sections"]
        ]
        # Thêm synthesis section
        sections_init.append({
            "id": "synthesis",
            "title": plan["synthesis_section"]["title"],
            "content": "", "status": "pending"
        })

        update_job(job_id,
            plan=plan,
            sections=sections_init,
            progress=25
        )

        # === STEP 3: Research sections (giữ nguyên logic cũ) ===
        # ... (không thay đổi)

        # === STEP 4: Synthesis section (dùng synthesis_section từ plan) ===
        update_job(job_id, progress=88,
                   current_step=f"Viết: {plan['synthesis_section']['title']}...")

        synthesis_content = await research_synthesis_section(
            plan["synthesis_section"],
            completed_sections
        )
        # ... append và save như cũ

    except Exception as e:
        update_job(job_id, status="failed", error=str(e))
```

---

## Cập nhật section_writer.py

```python
# services/agno/research/section_writer.py
# THAY ĐỔI: prompt có thêm key_questions

SECTION_PROMPT = """Viết section "{section_title}" cho báo cáo nghiên cứu.

Mục tiêu: {objective}

Các câu hỏi PHẢI được trả lời trong section này:
{key_questions_formatted}

Thông tin từ web:
{web_results}

Thông tin từ memory:
{memory_results}

Context từ sections trước:
{previous_context}

Yêu cầu:
- Viết tiếng Việt, chuyên nghiệp, súc tích
- Độ dài ~{estimated_words} từ
- Format: {output_format}
- Bắt đầu bằng ## {section_title}
- Phải trả lời được các câu hỏi trong danh sách trên
- Dùng số liệu, tên, ngày tháng cụ thể khi có
- Nếu không có dữ liệu → ghi rõ "Chưa có dữ liệu xác nhận"
- KHÔNG viết "Kết luận" ở cuối (dành cho synthesis)"""


async def research_section(section: dict, previous_sections: list, job_id: str) -> str:
    # Format key_questions
    kqs = section.get("key_questions", [section.get("objective", "")])
    key_questions_formatted = "\n".join([f"- {q}" for q in kqs])

    # Web search
    web_results = ""
    for query in section.get("search_queries", [])[:3]:
        results = await serper_search(query, num=3)
        web_results += format_search_results(results)

    # Memory search
    memory_results = ""
    if section.get("memory_query"):
        memories = await memory_search(
            section["memory_query"], status="canonical", top_k=5
        )
        memory_results = "\n".join([m["content"] for m in memories])

    # Previous context
    previous_context = ""
    for prev_id in section.get("use_previous_sections", []):
        prev = next((s for s in previous_sections if s["id"] == prev_id), None)
        if prev and prev.get("content"):
            previous_context += f"### {prev['title']}\n{prev['content'][:500]}...\n\n"

    content = await asyncio.wait_for(
        litellm_call(
            model="deepseek-v4-pro",
            prompt=SECTION_PROMPT.format(
                section_title=section["title"],
                objective=section["objective"],
                key_questions_formatted=key_questions_formatted,
                web_results=web_results[:3000],
                memory_results=memory_results[:1500],
                previous_context=previous_context[:1000],
                estimated_words=section.get("estimated_words", 300),
                output_format=section.get("output_format", "paragraph")
            ),
            max_tokens=1200,
            temperature=0.3
        ),
        timeout=90.0
    )

    await write_audit_log(
        action="research.section_complete",
        payload={"job_id": job_id, "section_id": section["id"],
                 "section_title": section["title"],
                 "key_questions_answered": len(kqs)}
    )

    return content
```

---

## Frontend — Hiện angles cho user (optional nhưng đẹp)

Khi job đang ở phase "analyzing" → hiện angles để user thấy AI đang nghĩ gì.

```tsx
// Trong ResearchPanel, thêm AngleInsights component
function AngleInsights({ angles }: { angles: any }) {
  if (!angles) return null

  const items = [
    { icon: '👥', label: 'Stakeholders', value: angles.who?.stakeholders?.join(', ') },
    { icon: '🎯', label: 'Mục đích', value: angles.why?.underlying_goal },
    { icon: '❓', label: 'Quyết định', value: angles.why?.decision_to_make },
    { icon: '⚠️', label: 'Blind spots', value: angles.risk?.blind_spots?.join(', ') },
    { icon: '📊', label: 'Độ sâu', value: angles.action?.recommended_depth },
  ].filter(i => i.value)

  return (
    <div className="angle-insights">
      <div className="angle-label">
        Ajino đã phân tích từ {Object.keys(angles).length} góc độ
      </div>
      {items.map(item => (
        <div key={item.label} className="angle-item">
          <span className="angle-icon">{item.icon}</span>
          <span className="angle-key">{item.label}:</span>
          <span className="angle-val">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
```

```css
.angle-insights {
  background: var(--pu0);
  border: 0.5px solid rgba(139,114,240,0.2);
  border-radius: 10px;
  padding: 10px 13px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.angle-label {
  font-family: var(--fm);
  font-size: 9px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--pu);
  margin-bottom: 3px;
}
.angle-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.4;
}
.angle-icon { flex-shrink: 0; }
.angle-key {
  font-family: var(--fm);
  font-size: 10px;
  color: var(--mu);
  flex-shrink: 0;
  min-width: 70px;
}
.angle-val { color: var(--tx); }
```

---

## Tiêu chí nghiệm thu bổ sung

### M-RES-INTENT1 — Multi-angle

- [ ] Sau Vòng 1: `job.angles` có đủ 7 keys: who, what, when, why, risk, gap, action
- [ ] `angles.what.not_asking_about` không rỗng — có ít nhất 1 item
- [ ] `angles.action.recommended_depth` = "deep" với query có từ "chiến lược" hoặc "2030"
- [ ] Flash fail (mock bằng cách set timeout = 0.1s) → fallback angles, job tiếp tục

### M-RES-INTENT2 — Plan quality

- [ ] Sau Vòng 2: mỗi section có `key_questions` không rỗng
- [ ] Section cuối cùng có `use_previous_sections` chứa ít nhất 2 section trước
- [ ] `plan.title` khác với query gốc (không copy paste)
- [ ] `plan.research_meta.data_availability` không rỗng
- [ ] Memory context được inject: nếu có canonical memory liên quan → section `memory_query` không rỗng

### M-RES-INTENT3 — Audit

- [ ] audit_log có row `research.intent_analyzed` với `memory_hits` count
- [ ] Nếu memory_hits > 0 → sections có memory_query khác với search_queries

**Self-test:**
```bash
# Start research với query sâu
JOB=$(curl -s -b cookies.txt -X POST https://ajinov5.cuong.ngo/api/research/start \
  -H "Content-Type: application/json" \
  -d '{"query":"Phân tích toàn diện chiến lược mở rộng thị trường logistics Việt-Trung 2026-2030"}' \
  | jq -r .data.job_id)

# Đợi 15s cho 2 vòng intent
sleep 15

# Kiểm tra angles và plan
curl -s -b cookies.txt https://ajinov5.cuong.ngo/api/research/$JOB/status \
  | jq '{
      angles_keys: (.data.angles | keys),
      depth: .data.angles.action.recommended_depth,
      sections: [.data.sections[].title],
      first_section_kq: .data.plan.sections[0].key_questions
    }'
# angles_keys phải có 7 items
# sections count phải 7-8 với query "toàn diện"
# first_section_kq phải không rỗng
```

---

*Patch vào: deep-research-spec.md §3 và §5*
*Không thay đổi: job_manager step 3+4, frontend ResearchPanel structure*
