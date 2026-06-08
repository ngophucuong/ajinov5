"""
Ajino v5 — File Converter Skill
Converts uploaded files to Markdown using Microsoft MarkItDown.
Supports: .docx, .pdf, .pptx, .xlsx, .csv, .html, .txt, .md, images (OCR),
          audio (transcription), .zip, .epub, and more.

Usage:
    from skills.file_converter import convert_to_markdown, is_supported, SUPPORTED_TYPES

    if is_supported(content_type):
        md_text = await convert_to_markdown(file_bytes, content_type, original_filename)
"""

import os
import tempfile
from typing import Optional

# Skill metadata for registry
skill_info = {
    "name": "file_converter",
    "description": "Convert uploaded files (docx, pdf, pptx, xlsx, html, images, audio, etc.) to Markdown using MarkItDown",
    "version": "1.0.0",
    "enabled": True,
    "config": {
        "max_file_size_mb": 20,
        "enable_plugins": True,
    },
}

# Maximum file size in bytes (20 MB)
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

# Supported MIME types mapped to file extensions
SUPPORTED_TYPES: dict[str, str] = {
    # Microsoft Office
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    # PDF
    "application/pdf": ".pdf",
    # Plain text & Markdown — no conversion needed
    "text/plain": ".txt",
    "text/markdown": ".md",
    # HTML
    "text/html": ".html",
    # CSV
    "text/csv": ".csv",
    # Images (OCR via MarkItDown)
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    # Audio (transcription via MarkItDown)
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    # Archives
    "application/zip": ".zip",
    # EPUB
    "application/epub+zip": ".epub",
    # XML / JSON (MarkItDown handles these)
    "application/xml": ".xml",
    "text/xml": ".xml",
    "application/json": ".json",
    # Others
    "application/rtf": ".rtf",
    "application/vnd.oasis.opendocument.text": ".odt",
}


def is_supported(content_type: Optional[str]) -> bool:
    """Check if a content type is supported for conversion."""
    if not content_type:
        return False
    # Strip charset suffix if present (e.g., "text/plain; charset=utf-8")
    content_type = content_type.split(";")[0].strip().lower()
    return content_type in SUPPORTED_TYPES


def _detect_content_type_from_ext(filename: str) -> Optional[str]:
    """Try to infer MIME type from file extension."""
    ext = os.path.splitext(filename)[1].lower()
    if not ext:
        return None
    # Build reverse mapping from extension to MIME type
    reverse_map = {}
    for mime, file_ext in SUPPORTED_TYPES.items():
        if file_ext not in reverse_map:
            reverse_map[file_ext] = mime
    return reverse_map.get(ext)


def get_extension(content_type: Optional[str]) -> Optional[str]:
    """Get the file extension for a given content type."""
    if not content_type:
        return None
    content_type = content_type.split(";")[0].strip().lower()
    return SUPPORTED_TYPES.get(content_type)


def _is_already_text(content_type: Optional[str]) -> bool:
    """Check if the content is already plain text or Markdown (no conversion needed)."""
    if not content_type:
        return False
    content_type = content_type.split(";")[0].strip().lower()
    return content_type in ("text/plain", "text/markdown")


async def convert_to_markdown(
    file_bytes: bytes,
    content_type: Optional[str],
    original_filename: str = "uploaded_file",
) -> str:
    """
    Convert uploaded file bytes to Markdown text.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        content_type: MIME type of the file (e.g., "application/pdf").
        original_filename: Original filename (used for extension if content_type missing).

    Returns:
        Converted Markdown string.

    Raises:
        ValueError: If file is too large, unsupported format, or conversion fails.
    """
    # 1. Validate size
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File quá lớn. Dung lượng tối đa là 20MB. File hiện tại: {len(file_bytes) / (1024 * 1024):.1f}MB"
        )

    # 2. Validate format
    content_type_clean = (
        content_type.split(";")[0].strip().lower() if content_type else None
    )

    # Fallback: if content_type is missing or octet-stream, try to detect from filename
    if not content_type_clean or content_type_clean == "application/octet-stream":
        detected = _detect_content_type_from_ext(original_filename)
        if detected:
            content_type_clean = detected

    if content_type_clean and content_type_clean not in SUPPORTED_TYPES:
        raise ValueError(
            f"Định dạng file '{content_type_clean}' không được hỗ trợ. "
            f"Các định dạng hỗ trợ: docx, pdf, pptx, xlsx, csv, html, txt, md, ảnh, audio, zip, epub"
        )

    # 3. Get extension
    ext = SUPPORTED_TYPES.get(content_type_clean) if content_type_clean else None
    if not ext:
        # Fallback: try to get extension from filename
        _, file_ext = os.path.splitext(original_filename)
        if file_ext:
            ext = file_ext.lower()
        else:
            ext = ".tmp"

    # 4. If already text/markdown, return directly
    if _is_already_text(content_type_clean):
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            # Try with latin-1 as fallback for plain text
            return file_bytes.decode("latin-1")

    # 5. Convert using MarkItDown
    tmp_path = None
    try:
        # Write bytes to a temporary file (MarkItDown works with file paths)
        with tempfile.NamedTemporaryFile(
            suffix=ext,
            delete=False,
        ) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        # Run MarkItDown conversion (blocking I/O — use asyncio-friendly call)
        from markitdown import MarkItDown

        md = MarkItDown()
        result = md.convert(tmp_path)
        markdown_text = result.text_content

        if not markdown_text or not markdown_text.strip():
            raise ValueError(
                "Không thể trích xuất nội dung từ file này. File có thể bị hỏng hoặc trống."
            )

        return markdown_text

    except ImportError:
        raise ValueError(
            "Thư viện MarkItDown chưa được cài đặt. Vui lòng cài 'markitdown[all]' trong container."
        )
    except Exception as e:
        raise ValueError(f"Lỗi chuyển đổi file: {str(e)}")

    finally:
        # Always clean up temporary file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass  # Best-effort cleanup


async def execute(
    file_bytes: bytes,
    content_type: Optional[str] = None,
    original_filename: str = "uploaded_file",
) -> dict:
    """
    Execute file conversion skill (standard skill interface).
    Called by orchestrator or directly from API.

    Returns:
        {"success": True, "markdown": "...", "metadata": {...}}
        or {"success": False, "error": "..."}
    """
    try:
        markdown_text = await convert_to_markdown(
            file_bytes=file_bytes,
            content_type=content_type,
            original_filename=original_filename,
        )
        return {
            "success": True,
            "markdown": markdown_text,
            "metadata": {
                "original_filename": original_filename,
                "content_type": content_type,
                "markdown_length": len(markdown_text),
                "converted": not _is_already_text(content_type),
            },
        }
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Lỗi không xác định: {str(e)}"}
