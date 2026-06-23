from pydantic import BaseModel


class NetWorthResponse(BaseModel):
    total_assets: int        # paise
    total_liabilities: int   # paise
    net_worth: int           # paise
    recorded_date: str

    # Breakdown
    total_account_balance: int = 0
    total_investment_value: int = 0
    total_asset_value: int = 0
    total_outstanding_loans: int = 0

    class Config:
        from_attributes = True


class NetWorthHistoryItem(BaseModel):
    total_assets: int
    total_liabilities: int
    net_worth: int
    recorded_date: str

    class Config:
        from_attributes = True
