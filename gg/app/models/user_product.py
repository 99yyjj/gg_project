from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserProduct(Base):
    """user_id ↔ product_no 소유권 매핑 테이블.

    상품 데이터(이름/가격 등)는 Cafe24에만 저장하고,
    '어느 유저가 등록한 상품인지'만 여기에 보관한다.
    """

    __tablename__ = "user_products"
    __table_args__ = (UniqueConstraint("product_no", name="uq_user_products_product_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_no: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
