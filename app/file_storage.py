"""Local-disk storage for uploaded customer/asset documents.

This deployment has no object-storage service configured, so uploads are
written to a plain directory next to sql_app.db. Fine at this scale — KYC
and asset documents for a currency exchange office, not user-facing media
at any real volume. If this ever needs to survive a server migration
cleanly or scale past single-server disk, swap this module for an S3-style
backend without touching the callers (they only see save_upload/resolve_path).
"""
import os

from fastapi import UploadFile

from .core.errors import APIError

UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB — comfortably above a scanned ID/invoice, well under anything that'd strain shared hosting
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}


def _safe_ext(filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise APIError(
            code="INVALID_FILE_TYPE",
            message_ar="نوع الملف غير مدعوم. الأنواع المسموحة: PDF, JPG, PNG, DOC, DOCX",
            message_en="Unsupported file type",
            status_code=400,
        )
    return ext


async def save_upload(subfolder: str, doc_id: str, file: UploadFile) -> str:
    """Saves the upload under uploads/<subfolder>/<doc_id><ext> — the doc_id
    is already a server-generated unique id, so it doubles as a collision-free
    filename with no path-traversal risk from the original filename."""
    ext = _safe_ext(file.filename or "")
    folder = os.path.join(UPLOAD_ROOT, subfolder)
    os.makedirs(folder, exist_ok=True)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise APIError(
            code="FILE_TOO_LARGE",
            message_ar="حجم الملف أكبر من الحد المسموح (10 ميغابايت)",
            message_en="File exceeds the 10MB limit",
            status_code=400,
        )
    relative_path = os.path.join(subfolder, f"{doc_id}{ext}")
    with open(os.path.join(UPLOAD_ROOT, relative_path), "wb") as f:
        f.write(content)
    return relative_path


def resolve_path(stored_path: str) -> str:
    return os.path.join(UPLOAD_ROOT, stored_path)
