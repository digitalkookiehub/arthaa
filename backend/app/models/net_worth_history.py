from sqlalchemy import Column, Date, ForeignKey, Index, Integer, UniqueConstraint

from app.database import Base


class NetWorthHistory(Base):
    __tablename__ = "net_worth_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    total_assets = Column(Integer, nullable=False)       # in paise
    total_liabilities = Column(Integer, nullable=False)  # in paise
    net_worth = Column(Integer, nullable=False)          # in paise
    recorded_date = Column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "recorded_date", name="uq_net_worth_user_date"),
        Index("ix_net_worth_user_date", "user_id", "recorded_date"),
    )
