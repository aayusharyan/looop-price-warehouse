"""Define the relational schema for optional SQL storage."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Provide SQLAlchemy metadata shared by all tables."""


class Price(Base):
    """Store the charge published for one half-hour period in one area."""

    __tablename__ = "prices"
    __table_args__ = (
        UniqueConstraint("area_code", "valid_from", name="uq_price_area_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    area_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    valid_to: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    charge: Mapped[float] = mapped_column(Float, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
