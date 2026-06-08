# Ajino v5 — Studio: UX & Chunking Spec
# Dev đọc file này để fix toàn bộ Studio module

---

## Vấn đề hiện tại

Giao diện Studio hiện tại "câm" — người dùng không biết:
- Nút ▶ để làm gì
- Nút ✏️ để làm gì  
- Sau khi bấm ▶ thì có chuyện gì xảy ra
- File đã compile hay chưa, compile được bao nhiêu
- Tại sao badge luôn là "bản nháp"

---

## 1. Đổi tên và tooltip tất cả các nút

### Hiện tại (sai)
```
▶   (play icon — gợi ý media player)
✏️  (edit icon — không rõ edit cái gì)
bản nháp (badge — không rõ trạng thái)
```

### Đổi thành

```
Nút compile:  icon: ti-brain  text: "Compile"
              tooltip: "Phân tích tài liệu và tạo memory để Ajino học"

Nút edit:     icon: ti-edit   text: "Sửa"
              tooltip: "Xem và chỉnh sửa nội dung Markdown"

Nút xem memory: icon: ti-list  (chỉ hiện khi đã compiled)
              tooltip: "Xem N memory đã tạo từ tài liệu này"
```

### Badge trạng thái — đổi text và màu

```
draft     → "Chưa xử lý"   màu: xám
compiling → "Đang xử lý"   màu: amber, có spinner animation
compiled  → "Đã compile"   màu: xanh lá + số memory: "✓ 12 memories"
failed    → "Lỗi"          màu: đỏ + tooltip hiện error message
```

---

## 2. Tên file — hiện thêm metadata

### Hiện tại
```
📄 Final DOCX Test          bản nháp  ✏️  ▶
```

### Đổi thành
```
📄 Final DOCX Test
   demo.docx · 11,139 ký tự · Vừa tải lên        Chưa xử lý  [Sửa] [Compile]

📄 202606_ChaLo_Logisics_ETP_v10
   ETP_v10.docx · 32,919 ký tự · 09/06/2026    ✓ 24 memories  [Sửa] [Xem memory]
```

Metadata cần hiện: tên file gốc, số ký tự, ngày upload.
Lấy từ `metadata.original_filename`, `len(content)`, `created_at`.

---

## 3. Compile flow — feedback từng bước

### Hiện tại
Bấm ▶ → im lặng → không biết gì xảy ra.

### Đổi thành

**Bước 1 — Khi bấm Compile:**
```
Nếu file > 20,000 ký tự → hiện confirm dialog trước:

┌─────────────────────────────────────────────┐
│ ⚠️  Tài liệu lớn                            │
│                                             │
│ "202606_ChaLo_Logisics_ETP_v10"             │
│ 32,919 ký tự → ước tính ~28 memory items   │
│                                             │
│ Tất cả sẽ vào Memory Review để bạn duyệt.  │
│                                             │
│ [Tiếp tục]  [Huỷ]                          │
└─────────────────────────────────────────────┘
```

**Bước 2 — Đang xử lý:**
```
Badge đổi → spinner + "Đang xử lý..."
Nút Compile bị disable
Nút Sửa bị disable
```

**Bước 3 — Hoàn thành:**
```
Badge đổi → "✓ 24 memories"
Toast xuất hiện 4 giây:
  ✓ Đã tạo 24 memory từ "ChaLo ETP v10"
  → Vào Memory Review để duyệt

Nút Compile → ẩn đi
Nút mới xuất hiện: [Xem memory] [Compile lại]
```

**Bước 4 — Nếu lỗi:**
```
Badge đổi → "Lỗi"
Toast đỏ:
  ✗ Không thể compile: [error message ngắn gọn]
  → Thử lại hoặc liên hệ hỗ trợ

Nút Compile → trở lại active để thử lại
```

---

## 4. Drop zone — thông minh hơn

### Hiện tại
```
↑
Kéo thả file vào đây hoặc click để chọn
Hỗ trợ: PDF, DOCX, XLSX, PPTX, CSV, TXT, MD
```

### Đổi thành — 3 trạng thái

**Idle:**
```
↑
Kéo thả tài liệu vào đây
hoặc click để chọn file

PDF · DOCX · XLSX · PPTX · CSV · TXT · MD
```

**Drag over (file đang kéo lơ lửng):**
```
[border đổi sang amber, background sáng nhẹ]

+ Thả file vào đây
```

**Uploading:**
```
[progress bar chạy]
Đang tải lên "demo.docx"...
```

**Upload xong + converting:**
```
[spinner]
Đang đọc nội dung "demo.docx"...
```

**Done:**
```
[biến mất, document xuất hiện trong list bên dưới]
Toast: ✓ Đã thêm "demo.docx" — 11,139 ký tự
```

**Error:**
```
[border đỏ]
✗ Không thể đọc file này
Định dạng .zip không được hỗ trợ
[Thử file khác]
```

---

## 5. Chunking Strategy — spec cho backend

### Nguyên tắc

```
Một chunk = một memory item
Chunk phải đủ nghĩa khi đứng độc lập
Chunk không quá dài (> 800 ký tự → khó embed chính xác)
Chunk không quá ngắn (< 50 ký tự → không có giá trị)
```

### Logic phân chunk theo kích thước file

```python
def chunk_markdown(content: str) -> list[str]:
    char_count = len(content)

    if char_count < 5_000:
        # Nhỏ → split theo paragraph (dòng trống)
        return chunk_by_paragraph(content)

    elif char_count < 20_000:
        # Vừa → split theo heading ## và ###
        return chunk_by_heading(content, levels=[2, 3])

    else:
        # Lớn → split theo heading # (level 1)
        chunks = chunk_by_heading(content, levels=[1, 2])
        # Hard cap: tối đa 50 chunks
        if len(chunks) > 50:
            chunks = chunks[:50]
            # Log warning để audit
        return chunks
```

### Implement chunk_by_paragraph

```python
def chunk_by_paragraph(content: str) -> list[str]:
    chunks = []
    current = []

    for line in content.split("\n"):
        if line.strip() == "" and current:
            chunk = "\n".join(current).strip()
            if len(chunk) >= 50:  # bỏ chunk quá ngắn
                chunks.append(chunk)
            current = []
        else:
            current.append(line)

    if current:
        chunk = "\n".join(current).strip()
        if len(chunk) >= 50:
            chunks.append(chunk)

    return chunks
```

### Implement chunk_by_heading

```python
import re

def chunk_by_heading(content: str, levels: list[int]) -> list[str]:
    # Tạo regex pattern cho các heading levels
    pattern = "^(" + "|".join("#" * l for l in levels) + r") .+"
    heading_re = re.compile(pattern, re.MULTILINE)

    # Split tại các heading
    positions = [m.start() for m in heading_re.finditer(content)]
    positions.append(len(content))

    chunks = []
    for i in range(len(positions) - 1):
        chunk = content[positions[i]:positions[i+1]].strip()
        if len(chunk) >= 50:
            # Nếu chunk > 800 ký tự → sub-split theo paragraph
            if len(chunk) > 800:
                sub_chunks = chunk_by_paragraph(chunk)
                chunks.extend(sub_chunks)
            else:
                chunks.append(chunk)

    # Phần trước heading đầu tiên (intro)
    if positions and positions[0] > 0:
        intro = content[:positions[0]].strip()
        if len(intro) >= 50:
            chunks.insert(0, intro)

    return chunks
```

### Compile endpoint — cập nhật

```python
@app.post("/api/studio/documents/{doc_id}/compile")
async def compile_document(doc_id: UUID, user=Depends(get_user)):
    doc = await db.get_studio_document(doc_id, user.id)
    if not doc:
        raise HTTPException(404, {"error": {"code": "NOT_FOUND"}})

    if doc["compile_status"] == "compiling":
        raise HTTPException(409, {"error": {"code": "ALREADY_COMPILING"}})

    # Set status compiling ngay — để UI cập nhật spinner
    await db.update_studio_document(doc_id, compile_status="compiling")

    try:
        chunks = chunk_markdown(doc["content"])

        if not chunks:
            raise ValueError("Không tách được nội dung có ý nghĩa")

        # Hard cap warning
        capped = len(chunks) > 50
        chunks = chunks[:50]

        # Insert memory items
        memory_ids = []
        for chunk in chunks:
            mem_id = await db.insert_memory(
                content=chunk,
                status="pending",
                source="studio",
                source_ref=doc_id,
                user_id=user.id,
                metadata={
                    "document_title": doc["title"],
                    "document_id": str(doc_id),
                }
            )
            memory_ids.append(str(mem_id))

        # Cập nhật document
        await db.update_studio_document(doc_id,
            compile_status="compiled",
            memory_ids=memory_ids
        )

        await write_audit_log(user.id, "studio.compile", "studio_documents", doc_id, {
            "chunk_count": len(chunks),
            "capped_at_50": capped,
            "char_count": len(doc["content"])
        })

        return {"data": {
            "memory_ids": memory_ids,
            "count": len(memory_ids),
            "capped": capped,
            "message": f"Đã tạo {len(memory_ids)} memory, vào Memory Review để duyệt"
        }}

    except Exception as e:
        await db.update_studio_document(doc_id,
            compile_status="failed",
            metadata={**doc.get("metadata", {}), "compile_error": str(e)}
        )
        raise HTTPException(422, {"error": {"code": "COMPILE_FAILED", "message": str(e)}})
```

---

## 6. Memory Review — liên kết ngược về Studio

Sau khi compile, mỗi pending memory cần hiện nguồn gốc:

```
🧠 Memory Review

● pending · studio · logistics
"Cửa khẩu Hữu Nghị xử lý 60–70% lưu lượng..."
Từ tài liệu: "202606_ChaLo_Logisics_ETP_v10"

[✅ Duyệt] [✏️ Sửa] [❌ Bỏ] [⏭ Bỏ qua]
```

Lấy từ `metadata.document_title` đã lưu khi compile.

---

## 7. Tiêu chí nghiệm thu

### UX
- [ ] Hover nút Compile → tooltip "Phân tích tài liệu và tạo memory để Ajino học"
- [ ] Hover nút Sửa → tooltip "Xem và chỉnh sửa nội dung Markdown"
- [ ] Badge hiện đúng 4 trạng thái với màu đúng
- [ ] File > 20,000 ký tự → confirm dialog xuất hiện trước khi compile
- [ ] Compile xong → toast xuất hiện 4 giây với số memory
- [ ] Drop zone đổi border khi drag file vào
- [ ] Upload lỗi định dạng → thông báo rõ ràng, không crash

### Chunking
- [ ] File < 5,000 ký tự → chunk theo paragraph
- [ ] File 5,000–20,000 ký tự → chunk theo ## heading
- [ ] File > 20,000 ký tự → chunk theo # heading, tối đa 50
- [ ] Chunk < 50 ký tự → bị bỏ qua, không tạo memory
- [ ] Chunk > 800 ký tự → bị sub-split thêm
- [ ] `SELECT count(*) FROM memory WHERE source_ref = DOC_ID` = số memory trả về trong response
- [ ] Compile file 32K chars (`202606_ChaLo...`) → ≤ 50 pending memories

**Self-test chunking:**
```bash
# Compile file thật và đếm memory
curl -s -b cookies.txt -X POST \
  https://ajinov5.cuong.ngo/api/studio/documents/DOC_ID/compile | jq '{count:.data.count, capped:.data.capped}'

# Verify DB
docker exec ajinov5-postgres psql -U ajino -d ajino -c \
  "SELECT count(*), avg(length(content))::int as avg_chars,
          min(length(content)) as min_chars,
          max(length(content)) as max_chars
   FROM memory WHERE source_ref='DOC_ID'::uuid;"
# avg_chars nên nằm trong 100–600
# min_chars phải >= 50
# max_chars nên <= 800
```

---

*Đọc cùng: AGENTS.md §5.5, studio-file-conversion.md*
