from pydantic import BaseModel
from app.models.account import AccountType


class AccountCreate(BaseModel):
    name: str
    account_type: AccountType
    bank_name: str | None = None
    account_number_masked: str | None = None
    balance: int = 0  # paise


class AccountUpdate(BaseModel):
    name: str | None = None
    bank_name: str | None = None
    balance: int | None = None
    is_active: bool | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    account_type: str
    bank_name: str | None
    account_number_masked: str | None
    balance: int
    is_active: bool

    class Config:
        from_attributes = True
