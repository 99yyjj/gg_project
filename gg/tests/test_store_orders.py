"""
자체 주문 흐름 통합 테스트.

손님 화면 주문 생성(POST /shop/{username}/orders) → 사장님 대시보드
주문배송관리(GET /orders) / 판매성과(GET /orders/sales-summary) 반영 확인.
"""

import pytest


@pytest.mark.asyncio
async def test_create_order_then_appears_in_dashboard(client, make_user, auth_headers):
    boss = await make_user(username="boss")

    # 손님이 장바구니에서 주문 (인증 불필요)
    resp = await client.post(
        "/shop/boss/orders",
        json={
            "buyer_name": "김손님",
            "buyer_phone": "010-1234-5678",
            "address": "서울시 어딘가 123",
            "items": [
                {"product_no": 101, "product_name": "에코백", "price": 12000, "quantity": 2},
                {"product_no": 102, "product_name": "머그컵", "price": 8000, "quantity": 1},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    order_no = resp.json()["order_no"]
    assert order_no

    # 사장님 대시보드 주문 목록에 반영
    headers = auth_headers(boss)
    listed = await client.get("/orders/", headers=headers)
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    row = body["orders"][0]
    assert row["order_no"] == order_no
    assert row["name"] == "김손님"
    assert row["amount"] == 12000 * 2 + 8000  # 32000
    assert row["status"] == "배송준비"
    assert row["product"] == "에코백 외 1건"


@pytest.mark.asyncio
async def test_sales_summary_aggregates_orders(client, make_user, auth_headers):
    boss = await make_user(username="boss")

    for _ in range(2):
        await client.post(
            "/shop/boss/orders",
            json={
                "buyer_name": "손님",
                "items": [
                    {"product_no": 101, "product_name": "에코백", "price": 12000, "quantity": 1},
                ],
            },
        )

    summary = await client.get(
        "/orders/sales-summary", params={"period": "total"}, headers=auth_headers(boss)
    )
    assert summary.status_code == 200
    data = summary.json()
    assert data["summary"]["count"] == 2
    assert data["summary"]["amount"] == 24000
    assert data["summary"]["avg"] == 12000
    assert data["ranking"][0]["name"] == "에코백"
    assert data["ranking"][0]["count"] == 2


@pytest.mark.asyncio
async def test_orders_are_scoped_per_owner(client, make_user, auth_headers):
    boss = await make_user(username="boss")
    other = await make_user(username="other")

    await client.post(
        "/shop/boss/orders",
        json={"buyer_name": "손님", "items": [{"product_no": 1, "price": 5000, "quantity": 1}]},
    )

    # 다른 사장님 대시보드에는 boss 의 주문이 보이지 않아야 한다
    listed = await client.get("/orders/", headers=auth_headers(other))
    assert listed.status_code == 200
    assert listed.json()["total"] == 0


@pytest.mark.asyncio
async def test_order_to_unknown_shop_404(client):
    resp = await client.post(
        "/shop/nobody/orders",
        json={"buyer_name": "손님", "items": [{"product_no": 1, "price": 1000, "quantity": 1}]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_empty_items_rejected(client, make_user):
    await make_user(username="boss")
    resp = await client.post(
        "/shop/boss/orders",
        json={"buyer_name": "손님", "items": []},
    )
    assert resp.status_code == 422
