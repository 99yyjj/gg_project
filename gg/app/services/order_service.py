"""
주문 서비스 — 카페24 주문 API(mall.read_order)에서 읽어와 화면용으로 가공.

읽기 전용: 카페24가 주문/결제/배송의 원본(source of truth)이고, 여기서는 조회·집계만
한다. 송장 입력·발송처리 같은 쓰기는 이 서비스의 책임이 아니다.

⚠️ 카페24 주문 응답의 정확한 필드명은 API 버전(config.CAFE24_API_VERSION)에 따라
다를 수 있어, 아래 매핑은 여러 키를 폴백하는 방어적 구현이다. 실제 응답/테스트로 확인.
"""

import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from app.schemas.order import (
    OrderListResponse,
    OrderSummary,
    ProductRank,
    ProductStat,
    SalesMetric,
    SalesSummaryResponse,
)
from app.services.cafe24_client import Cafe24Client

logger = logging.getLogger(__name__)

# 카페24 주문상태 코드 → 화면 라벨.
# 코드 체계는 접두 1글자(N 정상 / C 취소 / R 반품 / E 교환)로도 구분된다.
_STATUS_LABELS: dict[str, str] = {
    "N00": "입금대기",
    "N10": "상품준비",
    "N20": "배송준비",
    "N21": "배송대기",
    "N22": "배송보류",
    "N30": "배송중",
    "N40": "배송완료",
}
_STATUS_PREFIX: dict[str, str] = {"C": "취소", "R": "반품", "E": "교환"}

# 카페24 주문 목록 1회 호출 상한(API 제한). 집계 시 이 한도로 충분한 MVP 범위.
_MAX_FETCH = 1000
# 주문 목록 기본 조회 기간(일). 카페24는 start~end 기간 지정이 필수다.
_DEFAULT_WINDOW_DAYS = 90


def _to_int(value: Any) -> int:
    """'37,000' / '37000.00' / 37000 등 다양한 표현을 정수 원화로."""
    if value is None:
        return 0
    try:
        return int(round(float(str(value).replace(",", ""))))
    except (ValueError, TypeError):
        return 0


def _map_status(code: str) -> str:
    if not code:
        return ""
    if code in _STATUS_LABELS:
        return _STATUS_LABELS[code]
    label = _STATUS_PREFIX.get(code[:1])
    return label or code


def _first(d: dict[str, Any], *keys: str, default: Any = "") -> Any:
    """여러 후보 키 중 처음으로 값이 있는 것을 반환(필드명 폴백용)."""
    for k in keys:
        v = d.get(k)
        if v not in (None, "", []):
            return v
    return default


class OrderService:
    def __init__(self, cafe24: Cafe24Client) -> None:
        self.cafe24 = cafe24

    # ─────────── 매핑 헬퍼 ───────────

    @staticmethod
    def _order_amount(raw: dict[str, Any]) -> int:
        return _to_int(
            _first(raw, "payment_amount", "actual_order_amount", "order_price_amount",
                   "order_amount", default=0)
        )

    @staticmethod
    def _status_code(raw: dict[str, Any], items: list[dict[str, Any]]) -> str:
        code = raw.get("order_status")
        if not code and items:
            code = items[0].get("order_status")
        return code or ""

    @staticmethod
    def _product_summary(items: list[dict[str, Any]]) -> str:
        if not items:
            return ""
        first_name = _first(items[0], "product_name", "product_name_default", default="상품")
        extra = len(items) - 1
        return f"{first_name} 외 {extra}건" if extra > 0 else str(first_name)

    @staticmethod
    def _tracking(items: list[dict[str, Any]]) -> str:
        """읽기 전용: 배송정보가 품목에 실려오면 표시. 없으면 빈 문자열."""
        for it in items:
            no = _first(it, "tracking_no", "invoice_no", default="")
            if no:
                company = _first(it, "shipping_company_name", "shipping_company_code", default="")
                return f"{company} {no}".strip()
        return ""

    def _to_summary(self, raw: dict[str, Any]) -> OrderSummary:
        items = raw.get("items") or []
        buyer = raw.get("buyer") or {}
        receivers = raw.get("receivers") or []
        receiver = receivers[0] if receivers else {}

        order_date = str(_first(raw, "order_date", "payment_date", default=""))[:10]
        address = _first(
            receiver, "address_full", "address1",
            default=" ".join(
                str(x) for x in (receiver.get("address1"), receiver.get("address2")) if x
            ).strip(),
        )

        return OrderSummary(
            order_no=str(_first(raw, "order_id", "order_no", default="")),
            date=order_date,
            name=str(_first(buyer, "name", "member_name", default="")),
            phone=str(_first(buyer, "cellphone", "phone", default="")),
            address=str(address),
            product=self._product_summary(items),
            amount=self._order_amount(raw),
            status=_map_status(self._status_code(raw, items)),
            tracking=self._tracking(items),
        )

    # ─────────── 조회 ───────────

    @staticmethod
    def _default_range() -> tuple[str, str]:
        today = date.today()
        return (today - timedelta(days=_DEFAULT_WINDOW_DAYS)).isoformat(), today.isoformat()

    async def list_orders(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> OrderListResponse:
        if not start_date or not end_date:
            start_date, end_date = self._default_range()

        raw_orders = await self.cafe24.get_orders(
            start_date=start_date, end_date=end_date, limit=limit, offset=offset
        )
        total = await self.cafe24.count_orders(start_date=start_date, end_date=end_date)
        return OrderListResponse(
            orders=[self._to_summary(o) for o in raw_orders],
            total=total,
        )

    async def sales_summary(self, period: str = "month") -> SalesSummaryResponse:
        """period: 'month'(이번 달) | 'total'(최근 3개월)."""
        today = date.today()
        if period == "month":
            start = today.replace(day=1)
            label = "이번 달"
        else:
            start = today - timedelta(days=_DEFAULT_WINDOW_DAYS)
            label = "최근 3개월"

        raw_orders = await self.cafe24.get_orders(
            start_date=start.isoformat(), end_date=today.isoformat(), limit=_MAX_FETCH
        )

        total_amount = 0
        # product_no → [name, qty, amount]
        by_product: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"name": "", "count": 0, "amount": 0}
        )

        for o in raw_orders:
            total_amount += self._order_amount(o)
            for it in (o.get("items") or []):
                pno = str(_first(it, "product_no", "product_code", default=""))
                qty = _to_int(_first(it, "quantity", default=0))
                price = _to_int(_first(it, "product_price", "payment_amount", default=0))
                bucket = by_product[pno]
                if not bucket["name"]:
                    bucket["name"] = str(_first(it, "product_name", default="상품"))
                bucket["count"] += qty
                bucket["amount"] += price * qty if qty else price

        count = len(raw_orders)
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
