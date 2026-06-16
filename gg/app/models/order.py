"""
자체 주문 ORM 모델 (데모용 — 카페24 대신 우리 DB에 주문을 저장).

손님이 쇼핑몰 손님화면에서 '주문하기'를 누르면 여기에 주문이 쌓이고,
관리자 대시보드의 주문/배송 관리·판매 성과 페이지가 이 테이블을 읽는다.

소유권은 user_id(쇼핑몰 주인)로 묶는다. 상품 본체는 Cafe24에 있으므로
product_no/상품명/가격은 주문 시점 값을 스냅샷으로 함께 저장한다(나중에
Cafe24에서 상품이 바뀌거나 삭제돼도 과거 주문 내역이 보존되도록).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 사람이 읽기 쉬운 주문번호(날짜+시각 기반). DB PK와 별개로 표시·검색용.
    order_no: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True, index=True
    )

    buyer_name: Mapped[str] = mapped_column(String(50), nullable=False)
    buyer_phone: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    address: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="배송준비")
    tracking: Mapped[str] = mapped_column(String(100), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    # selectin: 비동기 세션에서 lazy-load 예외 없이 항상 함께 적재.
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Order(id={self.id}, order_no='{self.order_no}', amount={self.amount})>"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 상품 본체는 Cafe24에 있어 FK는 걸지 않는다(주문 시점 스냅샷).
    product_no: Mapped[int] = mapped_column(Integer, nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    order: Mapped["Order"] = relationship(back_populates="items")

    def __repr__(self) -> str:
        return f"<OrderItem(product_no={self.product_no}, qty={self.quantity})>"
