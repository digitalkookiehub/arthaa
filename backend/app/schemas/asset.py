from datetime import date
from pydantic import BaseModel
from app.models.asset import AssetType


class AssetCreate(BaseModel):
    asset_type: AssetType
    name: str
    purchase_value: int     # paise
    current_value: int      # paise
    purchase_date: date | None = None
    notes: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    current_value: int | None = None
    notes: str | None = None


class AssetValueHistoryCreate(BaseModel):
    value: int              # paise
    recorded_date: date


class AssetResponse(BaseModel):
    id: int
    asset_type: str
    name: str
    purchase_value: int
    current_value: int
    appreciation: int = 0   # computed: current_value - purchase_value
    purchase_date: str | None
    notes: str | None
    created_at: str

    class Config:
        from_attributes = True
