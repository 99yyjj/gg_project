"""
권한 / 토큰없음 동작을 HTTP 엔드포인트 레벨로 검증.

- 비소유 상품 update/delete → 403 (전역 PermissionError 핸들러)
- 공개 shop 엔드포인트가 비소유 product_no에 404
- 토큰 만료/없음으로 Cafe24가 401 → 전역 핸들러가 503
"""

import httpx

from app.models.user_product import UserProduct
from app.services.cafe24_client import Cafe24Client


async def test_update_non_owned_product_returns_403(client, db_session, make_user, auth_headers):
    owner = await make_user("owner")
    intruder = await make_user("intruder")
    db_session.add(UserProduct(user_id=owner.id, product_no=42))
    await db_session.commit()

    # 소유권 체크가 Cafe24 호출 전에 PermissionError를 던지므로 네트워크 불필요
    resp = await client.put(
        "/products/42",
        headers=auth_headers(intruder),
        data={"product_name": "탈취"},
    )
    assert resp.status_code == 403


async def test_delete_non_owned_product_returns_403(client, db_session, make_user, auth_headers):
    owner = await make_user("owner2")
    intruder = await make_user("intruder2")
    db_session.add(UserProduct(user_id=owner.id, product_no=43))
    await db_session.commit()

    resp = await client.delete("/products/43", headers=auth_headers(intruder))
    assert resp.status_code == 403


async def test_public_shop_product_not_owned_returns_404(client, db_session, make_user):
    owner = await make_user("shopowner")
    # owner가 등록하지 않은 product_no를 요청 → 404 (Cafe24 호출 전 차단)
    resp = await client.get(f"/shop/{owner.username}/products/999")
    assert resp.status_code == 404


async def test_tokenless_user_products_returns_503(
    client, db_session, make_user, auth_headers, monkeypatch
):
    """토큰 없는 유저가 소유 상품 목록을 요청하면 Cafe24 401→갱신 실패→503."""
    user = await make_user("notoken", with_tokens=False)
    db_session.add(UserProduct(user_id=user.id, product_no=1))
    await db_session.commit()

    def _all_401_transport():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"error": "unauthorized"})

        return httpx.MockTransport(handler)

    def fake_make_client(u, db):
        return Cafe24Client(
            mall_id="mymall",
            access_token="",
            refresh_token="",
            transport=_all_401_transport(),
        )

    monkeypatch.setattr("app.routers.products.make_cafe24_client", fake_make_client)

    resp = await client.get("/products/", headers=auth_headers(user))
    assert resp.status_code == 503
