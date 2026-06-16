"""
자체 주문 서비스 — 카페24 대신 우리 DB(orders/order_items)에 저장·집계.

order_service.py(카페24 읽기 전용)를 대체하는 데모용 구현이다.
    - 주문 생성: 손님 화면(/shop/{username}/orders)에서 호출
    - 조회/집계: 관리자 대시보드(주문배송관리 / 판매성과)에서 호출

응답 스키마(OrderListResponse / SalesSummaryResponse)는 카페24 버전과 동일하게
유지하므로 프론트엔드는 그대로 동작한다.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem
from app.schemas.order import (
    OrderCreate,
    OrderListResponse,
    OrderSummary,
    ProductRank,
    ProductStat,
    SalesMetric,
    SalesSummaryResponse,
)

logger = logging.getLogger(__name__)

# 판매성과 '최근 3개월' 기본 조회 기간(일).
_DEFAULT_WINDOW_DAYS = 90


def _gen_order_no() -> str:
    """날짜 + 시각(마이크로초 일부)로 사람이 읽기 쉬운 주문번호 생성."""
    now = datetime.now(timezone.utc)
    return now.strftime("%Y%m%d") + now.strftime("%H%M%S%f")[-8:]


class StoreOrderService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─────────── 생성 (손님) ───────────

    async def create_order(self, user_id: int, payload: OrderCreate) -> Order:
        amount = sum(it.price * it.quantity for it in payload.items)
        order = Order(
            user_id=user_id,
            order_no=_gen_order_no(),
            buyer_name=payload.buyer_name,
            buyer_phone=payload.buyer_phone,
            address=payload.address,
            amount=amount,
            status="배송준비",
            items=[
                OrderItem(
                    product_no=it.product_no,
                    product_name=it.product_name or "상품",
                    price=it.price,
                    quantity=it.quantity,
                )
                for it in payload.items
            ],
        )
        self.db.add(order)
        await self.db.commit()
        return order

    # ─────────── 매핑 헬퍼 ───────────

    @staticmethod
    def _product_summary(items: list[OrderItem]) -> str:
        if not items:
            return ""
        first = items[0].product_name or "상품"
        extra = len(items) - 1
        return f"{first} 외 {extra}건" if extra > 0 else first

    def _to_summary(self, o: Order) -> OrderSummary:
        return OrderSummary(
            order_no=o.order_no,
            date=o.created_at.date().isoformat() if o.created_at else "",
            name=o.buyer_name,
            phone=o.buyer_phone,
            address=o.address,
            product=self._product_summary(list(o.items)),
            amount=o.amount,
            status=o.status,
            tracking=o.tracking,
        )

    # ─────────── 조회 (관리자) ───────────

    async def list_orders(
        self,
        user_id: int,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> OrderListResponse:
        rows_q = await self.db.execute(
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = list(rows_q.scalars().all())

        total_q = await self.db.execute(
            select(func.count(Order.id)).where(Order.user_id == user_id)
        )
        total = int(total_q.scalar() or 0)

        return OrderListResponse(
            orders=[self._to_summary(o) for o in rows],
            total=total,
        )

    async def sales_summary(self, user_id: int, period: str = "month") -> SalesSummaryResponse:
        """period: 'month'(이번 달) | 'total'(최근 3개월)."""
        today = date.today()
        if period == "month":
            start = today.replace(day=1)
            label = "이번 달"
        else:
            start = today - timedelta(days=_DEFAULT_WINDOW_DAYS)
            label = "최근 3개월"

        start_dt = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
        orders_q = await self.db.execute(
            select(Order).where(
                Order.user_id == user_id, Order.created_at >= start_dt
            )
        )
        orders = list(orders_q.scalars().all())

        total_amount = 0
        # product_no → {name, count, amount}
        by_product: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"name": "", "count": 0, "amount": 0}
        )

        for o in orders:
            total_amount += o.amount
            for it in o.items:
                pno = str(it.product_no)
                bucket = by_product[pno]
                if not bucket["name"]:
                    bucket["name"] = it.product_name or "상품"
                bucket["count"] += it.quantity
                bucket["amount"] += it.price * it.quantity

        count = len(orders)
        avg = total_amount // count if count else 0

        ranked = sorted(by_product.items(), key=lambda kv: kv[1]["count"], reverse=True)
        ranking = [ProductRank(name=v["name"], count=v["count"]) for _, v in ranked[:5]]
        period_stats = [
            ProductStat(name=v["name"], product_no=pno, amount=v["amount"], count=v["count"])
            for pno, v in ranked
        ]

        return SalesSummaryResponse(
            summary=SalesMetric(label=label, amount=total_amount, count=count, avg=avg),
            ranking=ranking,
            period_stats=period_stats,
        )
