"""
주문 조회/집계 테스트.

httpx.MockTransport로 카페24 /orders, /orders/count 응답을 흉내 내어
Cafe24Client 주문 메서드와 OrderService의 매핑·집계를 검증한다.
"""

import httpx

from app.services.cafe24_client import Cafe24Client
from app.services.order_service import OrderService, _map_status, _to_int


def _order(order_id: str, amount: str, status: str, items: list[dict]) -> dict:
    return {
        "order_id": order_id,
        "order_date": "2026-05-21T13:00:00+09:00",
        "payment_amount": amount,
        "order_status": status,
        "buyer": {"name": "홍길동", "cellphone": "010-1234-5678"},
        "receivers": [{"name": "홍길동", "address_full": "서울시 강남구"}],
        "items": items,
    }


_ORDERS = [
    _order("20260521-0001", "58000.00", "N20", [
        {"product_no": 101, "product_name": "오버핏 셔츠", "quantity": "2", "product_price": "29000.00"},
    ]),
    _order("20260520-0002", "30000.00", "N30", [
        {"product_no": 101, "product_name": "오버핏 셔츠", "quantity": "1", "product_price": "29000.00"},
        {"product_no": 202, "product_name": "에코백", "quantity": "1", "product_price": "1000.00"},
    ]),
]


def _make_client(orders: list[dict]) -> Cafe24Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/orders/count"):
            return httpx.Response(200, json={"count": len(orders)})
        if request.url.path.endswith("/orders"):
            return httpx.Response(200, json={"orders": orders})
        return httpx.Response(404, json={})

    return Cafe24Client(
        mall_id="mymall",
        access_token="acc",
        refresh_token="ref",
        transport=httpx.MockTransport(handler),
    )


def test_helpers():
    assert _to_int("58,000.00") == 58000
    assert _to_int(None) == 0
    assert _map_status("N20") == "배송준비"
    assert _map_status("N30") == "배송중"
    assert _map_status("C12") == "취소"
    assert _map_status("Z99") == "Z99"  # 알 수 없는 코드는 원문 유지


async def test_list_orders_maps_fields():
    service = OrderService(_make_client(_ORDERS))
    result = await service.list_orders()

    assert result.total == 2
    first = result.orders[0]
    assert first.order_no == "20260521-0001"
    assert first.date == "2026-05-21"
    assert first.name == "홍길동"
    assert first.amount == 58000
    assert first.status == "배송준비"
    assert first.product == "오버핏 셔츠"

    # 품목 2개면 "외 1건" 요약
    assert result.orders[1].product == "오버핏 셔츠 외 1건"


async def test_sales_summary_aggregates():
    service = OrderService(_make_client(_ORDERS))
    summary = await service.sales_summary(period="total")

    assert summary.summary.count == 2
    assert summary.summary.amount == 88000  # 58000 + 30000
    assert summary.summary.avg == 44000

    # 오버핏 셔츠가 수량 3개로 1위
    assert summary.ranking[0].name == "오버핏 셔츠"
    assert summary.ranking[0].count == 3

    by_name = {p.name: p for p in summary.period_stats}
    assert by_name["오버핏 셔츠"].count == 3
    assert by_name["오버핏 셔츠"].amount == 29000 * 3
    assert by_name["에코백"].count == 1


async def test_empty_orders():
    service = OrderService(_make_client([]))
    result = await service.list_orders()
    assert result.orders == []
    assert result.total == 0

    summary = await service.sales_summary(period="month")
    assert summary.summary.count == 0
    assert summary.summary.avg == 0
    assert summary.ranking == []
