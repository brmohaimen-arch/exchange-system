from typing import Any, Dict, Optional
from pydantic import BaseModel

class StandardResponse(BaseModel):
    success: bool
    message_ar: str
    message_en: str
    code: str
    data: Optional[Any] = None
    details: Optional[Dict[str, Any]] = None

def success_response(
    data: Any = None, 
    message_ar: str = "تمت العملية بنجاح", 
    message_en: str = "Operation successful", 
    code: str = "SUCCESS"
) -> StandardResponse:
    return StandardResponse(
        success=True,
        message_ar=message_ar,
        message_en=message_en,
        code=code,
        data=data
    )

def error_response(
    code: str, 
    message_ar: str, 
    message_en: str, 
    details: Optional[Dict[str, Any]] = None
) -> StandardResponse:
    return StandardResponse(
        success=False,
        message_ar=message_ar,
        message_en=message_en,
        code=code,
        details=details
    )
