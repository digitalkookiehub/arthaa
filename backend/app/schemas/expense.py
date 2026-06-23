from datetime import date as Date
from pydantic import BaseModel
from app.models.expense import PaymentMethod, RecurringInterval


class ExpenseCategoryResponse(BaseModel):
    id: int
    name: str
    icon: str | None
    color: str | None
    is_system: bool

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    account_id: int | None = None
    category_id: int
    date: Date
    amount: int  # paise
    description: str | None = None
    subcategory: str | None = None
    payment_method: PaymentMethod | None = None
    location: str | None = None
    tags: list[str] = []
    is_recurring: bool = False
    recurring_interval: RecurringInterval | None = None
    bill_attachment_url: str | None = None


class ExpenseUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    date: Date | None = None
    amount: int | None = None
    description: str | None = None
    payment_method: PaymentMethod | None = None
    location: str | None = None
    tags: list[str] | None = None


class ExpenseResponse(BaseModel):
    id: int
    account_id: int | None
    category_id: int
    category: ExpenseCategoryResponse | None = None
    date: str
    amount: int
    description: str | None
    subcategory: str | None
    payment_method: str | None
    location: str | None
    tags: list[str]
    is_recurring: bool
    bill_attachment_url: str | None
    created_at: str

    model_config = {"from_attributes": True}


class ExpenseFilters(BaseModel):
    page: int = 1
    limit: int = 20
    month: int | None = None
    year: int | None = None
    category_id: int | None = None
    account_id: int | None = None
    search: str | None = None
