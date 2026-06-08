# Ajino v5 — File Conversion: Technical Plan
# Module: Studio Upload (DOCX / PDF / XLSX / CSV → Markdown)
# Thư viện: Microsoft MarkItDown (MIT License)
# Tích hợp vào: services/agno/ — không tạo service mới

---

## 1. Tổng quan

Khi CEO upload file lên Studio, Agno tự động convert
sang Markdown rồi lưu vào studio_documents.content.
File gốc được backup lên R2.
Không có service riêng, không cần API key ngoài.

```
User upload file (Admin UI hoặc Telegram)
        │
        ▼
Agno POST /api/studio/documents (multipart)
        │
        ├── Lưu tạm /tmp/{uuid}.{ext}
        ├── MarkItDown.convert() → Markdown string
        ├── Xóa file tạm
        ├── INSERT studio_documents (content = Markdown)
        └── Upload file gốc → R2 (background)
                │
                ▼
        Sẵn sàng compile thành memory
```

---

## 2. Cài đặt

Thêm vào `services/agno/requirements.txt`:

```
markitdown[all]>=0.1.0
```

`[all]` bao gồm toàn bộ format support. Không cần
cài thêm gì khác. MarkItDown tự bundle các parser.

Verify sau khi install:

```bash
docker exec ajinov5-agno python -c \
  "from markitdown import MarkItDown; print('OK')"
```

---

## 3. File converter module

Tạo file mới: `services/agno/skills/file_converter.py`

```python
import os
import uuid
import tempfile
import logging
from pathlib import Path
from markitdown import MarkItDown

logger = logging.getLogger(__name__)

SUPPORTED_TYPES = {
    "application/pdf":                          "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/csv":                                 "csv",
    "text/plain":                               "txt",
    "text/markdown":                            "md",
}

MAX_FILE_SIZE_MB = 20
md_converter = MarkItDown()


def is_supported(content_type: str) -> bool:
    return content_type in SUPPORTED_TYPES


def get_extension(content_type: str) -> str:
    return SUPPORTED_TYPES.get(content_type, "bin")


async def convert_to_markdown(
    file_bytes: bytes,
    content_type: str,
    original_filename: str
) -> str:
    """
    Nhận binary file, trả về Markdown string.
    Không lưu file sau khi convert xong.
    Raise ValueError nếu format không support.
    Raise RuntimeError nếu convert thất bại.
    """

    # Validate
    if not is_supported(content_type):
        raise ValueError(
            f"Định dạng không hỗ trợ: {content_type}. "
            f"Hỗ trợ: {', '.join(SUPPORTED_TYPES.keys())}"
        )

    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(
            f"File quá lớn: {size_mb:.1f}MB. Giới hạn: {MAX_FILE_SIZE_MB}MB"
        )

    ext = get_extension(content_type)

    # txt và md không cần convert
    if ext in ("txt", "md"):
        return file_bytes.decode("utf-8", errors="replace")

    # Lưu tạm, convert, xóa ngay
    tmp_path = Path(tempfile.gettempdir()) / f"{uuid.uuid4()}.{ext}"
    try:
        tmp_path.write_bytes(file_bytes)
        result = md_converter.convert(str(tmp_path))

        if not result or not result.text_content.strip():
            raise RuntimeError("Convert thành công nhưng nội dung trống")

        logger.info(
            f"Converted {original_filename} ({ext}) → "
            f"{len(result.text_content)} chars"
        )
        return result.text_content

    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Convert failed: {original_filename} — {e}")
        raise RuntimeError(f"Không thể convert file: {str(e)}")
    finally:
        # Luôn xóa file tạm dù thành công hay thất bại
        if tmp_path.exists():
            tmp_path.unlink()
```

---

## 4. Endpoint upload Studio

Trong `services/agno/main.py`, thêm endpoint:

```python
from fastapi import UploadFile, File, Form, HTTPException
from skills.file_converter import convert_to_markdown, is_supported
import boto3  # hoặc cloudflare R2 SDK

@app.post("/api/studio/documents")
async def create_studio_document(
    title: str = Form(None),
    content: str = Form(None),
    file: UploadFile = File(None),
    user=Depends(get_user)
):
    """
    Hỗ trợ 2 mode:
    - JSON body: { title, content } — Markdown trực tiếp
    - multipart/form-data: file upload → auto-convert
    """

    markdown_content = None
    r2_key = None

    # Mode 1: Upload file
    if file:
        file_bytes = await file.read()
        content_type = file.content_type

        if not is_supported(content_type):
            raise HTTPException(
                status_code=415,
                detail={
                    "error": {
                        "code": "UNSUPPORTED_FORMAT",
                        "message": f"Định dạng {content_type} không hỗ trợ"
                    }
                }
            )

        # Convert → Markdown
        try:
            markdown_content = await convert_to_markdown(
                file_bytes,
                content_type,
                file.filename
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_FILE", "message": str(e)}})
        except RuntimeError as e:
            raise HTTPException(status_code=422, detail={"error": {"code": "CONVERT_FAILED", "message": str(e)}})

        # Upload file gốc lên R2 (background, không block)
        doc_id = uuid.uuid4()
        r2_key = f"studio/{user.id}/{doc_id}/{file.filename}"
        asyncio.create_task(upload_to_r2(file_bytes, r2_key))

        if not title:
            title = Path(file.filename).stem  # filename không có extension

    # Mode 2: Markdown trực tiếp
    elif content:
        markdown_content = content
        doc_id = uuid.uuid4()
    else:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "MISSING_CONTENT", "message": "Cần có file hoặc content"}}
        )

    # Insert DB
    await db.execute("""
        INSERT INTO studio_documents (id, user_id, title, content, r2_key, compile_status)
        VALUES ($1, $2, $3, $4, $5, 'draft')
    """, doc_id, user.id, title or "Untitled", markdown_content, r2_key)

    # Audit log
    await db.execute("""
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
        VALUES ($1, 'studio.upload', 'studio_document', $2, $3)
    """, user.id, doc_id, json.dumps({
        "title": title,
        "source": "file" if file else "text",
        "content_length": len(markdown_content)
    }))

    return {"data": {"id": str(doc_id), "title": title, "compile_status": "draft"}}
```

---

## 5. R2 upload helper

```python
async def upload_to_r2(file_bytes: bytes, r2_key: str):
    """Background task — không raise exception vào user flow"""
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_ENDPOINT"],
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        )
        s3.put_object(
            Bucket=os.environ["R2_BUCKET_NAME"],
            Key=r2_key,
            Body=file_bytes
        )
        logger.info(f"R2 upload OK: {r2_key}")
    except Exception as e:
        # Log nhưng không fail — file gốc là backup, không critical
        logger.error(f"R2 upload failed: {r2_key} — {e}")
        # Không raise — không block user flow
```

---

## 6. Compile → Memory

Endpoint đã có trong plan, bổ sung logic split:

```python
@app.post("/api/studio/documents/{doc_id}/compile")
async def compile_document(doc_id: str, user=Depends(get_user)):

    doc = await db.fetchrow(
        "SELECT * FROM studio_documents WHERE id=$1 AND user_id=$2",
        doc_id, user.id
    )
    if not doc:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND"}})

    # Update status
    await db.execute(
        "UPDATE studio_documents SET compile_status='compiling' WHERE id=$1",
        doc_id
    )

    # Split Markdown thành các đoạn có nghĩa
    chunks = split_markdown(doc["content"])

    memory_ids = []
    for chunk in chunks:
        if len(chunk.strip()) < 30:  # bỏ qua đoạn quá ngắn
            continue

        mem_id = uuid.uuid4()
        await db.execute("""
            INSERT INTO memory (id, content, status, source, source_ref, metadata)
            VALUES ($1, $2, 'pending', 'studio', $3, $4)
        """, mem_id, chunk, doc_id, json.dumps({"doc_title": doc["title"]}))
        memory_ids.append(str(mem_id))

    # Update studio_documents
    await db.execute("""
        UPDATE studio_documents
        SET compile_status='compiled', memory_ids=$1, updated_at=now()
        WHERE id=$2
    """, memory_ids, doc_id)

    await db.execute("""
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
        VALUES ($1, 'studio.compile', 'studio_document', $2, $3)
    """, user.id, doc_id, json.dumps({"chunks": len(memory_ids)}))

    return {"data": {"memory_ids": memory_ids, "count": len(memory_ids)}}


def split_markdown(content: str) -> list[str]:
    """
    Split Markdown thành chunks có nghĩa để lưu memory.
    Ưu tiên split theo heading, sau đó theo paragraph.
    Mỗi chunk tối đa 500 chars để phù hợp embedding context.
    """
    chunks = []
    current = []
    current_len = 0
    MAX_CHUNK = 500

    for line in content.split("\n"):
        is_heading = line.startswith("#")
        line_len = len(line)

        # Heading hoặc chunk quá dài → flush hiện tại
        if (is_heading or current_len + line_len > MAX_CHUNK) and current:
            chunk = "\n".join(current).strip()
            if chunk:
                chunks.append(chunk)
            current = []
            current_len = 0

        current.append(line)
        current_len += line_len

    # Flush chunk cuối
    if current:
        chunk = "\n".join(current).strip()
        if chunk:
            chunks.append(chunk)

    return chunks
```

---

## 7. Admin UI — file upload

File `apps/web/src/pages/Admin.tsx` (Studio tab), thêm upload handler:

```typescript
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
}

async function uploadFile(file: File) {
  const form = new FormData()
  form.append("file", file)
  // title optional — Agno tự lấy từ filename

  const res = await fetch("/api/studio/documents", {
    method: "POST",
    body: form,
    credentials: "include",
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || "Upload thất bại")
  }

  return res.json()
}
```

UI hiển thị:
- Drag & drop zone với danh sách format hỗ trợ
- Progress indicator khi đang convert (polling GET /api/studio/documents/{id})
- Sau khi upload: show "draft" badge + nút "Compile"
- Sau compile: show số memory chunks tạo ra

---

## 8. Telegram — upload file

Khi user gửi file vào Telegram bot:

```javascript
// messaging/handler.js
async function handleDocument(message) {
  const { document, from } = message

  // Telegram gửi file_id, cần download trước
  const fileInfo = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${document.file_id}`
  ).then(r => r.json())

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`
  const fileBytes = await fetch(fileUrl).then(r => r.arrayBuffer())

  // Forward lên Agno
  const form = new FormData()
  form.append("file", new Blob([fileBytes], { type: document.mime_type }), document.file_name)

  const res = await fetch("http://localhost:8000/api/studio/documents", {
    method: "POST",
    headers: { "X-User-Id": String(from.id), "X-User-Role": "ceo" },
    body: form,
  })

  if (!res.ok) {
    return sendMessage(from.id, "⚠️ Không thể xử lý file\\. Kiểm tra định dạng\\.")
  }

  const { data } = await res.json()
  await sendMessage(from.id,
    `✓ Đã nhận *${escapeMarkdown(document.file_name)}*\n\nĐang chuyển sang Markdown\\.\\.\\. Compile xong sẽ thông báo\\.\n\nID: \`${data.id}\``,
    { inline_keyboard: [[
        { text: "⚡ Compile ngay", callback_data: `studio_compile:${data.id}` }
    ]]}
  )
}
```

---

## 9. Tiêu chí nghiệm thu

### M-CONV1 — Format support

- [ ] Upload `test.docx` → studio_documents.content là Markdown có text
- [ ] Upload `report.pdf` → Markdown có text (không phải binary garbage)
- [ ] Upload `data.xlsx` → Markdown có bảng dạng `| col | col |`
- [ ] Upload `list.csv` → Markdown có bảng
- [ ] Upload `slides.pptx` → Markdown có nội dung slide
- [ ] Upload file `.exe` hoặc `.zip` → HTTP 415, message rõ ràng tiếng Việt
- [ ] Upload file > 20MB → HTTP 400, message rõ ràng

### M-CONV2 — File tạm không tồn tại sau convert

```bash
# Chạy upload, ngay sau đó check /tmp
docker exec ajinov5-agno ls /tmp/*.pdf /tmp/*.docx /tmp/*.xlsx 2>&1
# Phải không có file nào — đã bị xóa
```

### M-CONV3 — R2 backup

```bash
# Sau upload, verify R2
docker exec ajinov5-agno python -c "
import boto3, os
s3 = boto3.client('s3',
  endpoint_url=os.environ['R2_ENDPOINT'],
  aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
  aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'])
objs = s3.list_objects_v2(Bucket=os.environ['R2_BUCKET_NAME'], Prefix='studio/')
print([o['Key'] for o in objs.get('Contents',[])])
"
# File gốc phải xuất hiện trong list
```

### M-CONV4 — DB đúng thứ tự

```bash
docker exec ajinov5-postgres psql -U ajino -d ajino -c "
SELECT title, compile_status,
       r2_key IS NOT NULL as has_r2,
       LENGTH(content) as content_len
FROM studio_documents
ORDER BY created_at DESC LIMIT 5;"
# r2_key có thể NULL nếu R2 upload đang background
# content_len phải > 0
```

### M-CONV5 — Compile → memory

```bash
# Sau compile
docker exec ajinov5-postgres psql -U ajino -d ajino -c "
SELECT count(*), status
FROM memory
WHERE source='studio'
GROUP BY status;"
# Phải có rows với status='pending'
```

### M-CONV6 — Audit log

```bash
docker exec ajinov5-postgres psql -U ajino -d ajino -c "
SELECT action, payload->>'content_length' as size,
       payload->>'chunks' as chunks
FROM audit_log
WHERE action IN ('studio.upload','studio.compile')
ORDER BY created_at DESC LIMIT 5;"
```

### M-CONV7 — Không mock, không để file tạm

- [ ] `grep -r "mock\|fake\|hardcode" services/agno/skills/file_converter.py` → empty
- [ ] Convert fail → HTTP 422, không trả Markdown rỗng, không trả 200
- [ ] R2 fail → log error, nhưng document vẫn tạo được (R2 là backup, không critical)

---

## 10. Thứ tự implement

```
Bước 1: pip install markitdown[all], verify import OK
Bước 2: Viết file_converter.py + unit test với file thật
Bước 3: Thêm endpoint POST /api/studio/documents (multipart)
Bước 4: Test M-CONV1 → M-CONV3 bằng curl
Bước 5: Thêm compile endpoint + split_markdown()
Bước 6: Test M-CONV4 → M-CONV6
Bước 7: Admin UI drag & drop
Bước 8: Telegram document handler
```

---

## Self-test nhanh (paste vào terminal sau Bước 2)

```bash
# Test convert DOCX
docker exec ajinov5-agno python -c "
from markitdown import MarkItDown
md = MarkItDown()
# Dùng file seed có sẵn nếu có, hoặc tạo test file
import urllib.request
urllib.request.urlretrieve(
  'https://calibre-ebook.com/downloads/demos/demo.docx',
  '/tmp/test.docx'
)
result = md.convert('/tmp/test.docx')
print(f'OK — {len(result.text_content)} chars')
print(result.text_content[:200])
"
```

---

*Tài liệu này là spec đầy đủ cho file conversion.
Không tạo service mới — toàn bộ chạy trong Agno container hiện có.*
