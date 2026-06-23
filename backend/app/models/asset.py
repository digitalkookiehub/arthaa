import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class AssetType(str, enum.Enum):
    house = "house"
    land = "land"
    gold = "gold"
    vehicle = "vehicle"
    cash = "cash"
    other = "other"


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_type = Column(Enum(AssetType), nullable=False)
    name = Column(String(200), nullable=False)
    purchase_value = Column(Integer, nullable=False)   # in paise
    current_value = Column(Integer, nullable=False)    # in paise
    purchase_date = Column(Date, nullable=True)
    notes = Column(String(500), nullable=True)


class AssetValueHistory(Base):
    __tablename__ = "asset_value_history"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value = Column(Integer, nullable=False)            # in paise
    recorded_date = Column(Date, nullable=False)
