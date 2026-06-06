from pydantic import BaseModel

class CurrencyBase(BaseModel):
    code: str
    name: str

class CurrencyCreate(CurrencyBase):
    pass

class CurrencyResponse(CurrencyBase):
    is_active: bool

    class Config:
        from_attributes = True
