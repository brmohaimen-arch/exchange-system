from fastapi import HTTPException
from .responses import error_response

class APIError(HTTPException):
    def __init__(self, code: str, message_ar: str, message_en: str, status_code: int = 400, details: dict = None):
        super().__init__(status_code=status_code, detail=error_response(code, message_ar, message_en, details).dict())

class InsufficientBalanceError(APIError):
    def __init__(self):
        super().__init__(
            code="INSUFFICIENT_BALANCE",
            message_ar="الرصيد غير كافٍ لإتمام العملية",
            message_en="Insufficient balance",
            status_code=400
        )

class MissingExchangeRateError(APIError):
    def __init__(self):
        super().__init__(
            code="MISSING_EXCHANGE_RATE",
            message_ar="لا يوجد سعر صرف نشط لهذه العملة",
            message_en="Missing active exchange rate",
            status_code=400
        )

class UserNotAllowedError(APIError):
    def __init__(self):
        super().__init__(
            code="USER_NOT_ALLOWED",
            message_ar="لا تملك صلاحية تنفيذ هذا الإجراء",
            message_en="User not allowed",
            status_code=403
        )
