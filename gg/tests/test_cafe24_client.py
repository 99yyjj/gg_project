"""
Cafe24Client 토큰 자동 갱신 + per-user 격리 테스트.

httpx.MockTransport로 실제 네트워크 없이 401→갱신→재시도 시나리오를 검증한다.
멀티테넌트 회귀 방지: 서로 다른 클라이언트가 각자 토큰만 갱신하고 서로 덮어쓰지 않음.
"""

import httpx

from app.services.cafe24_client import Cafe24Client


def _make_transport(new_access: str = "new-acc", new_refresh: str = "new-ref"):
    """첫 /products 호출은 401, /oauth/token은 새 토큰 200, 갱신 후 재시도는 200."""
    state = {"refreshed": False}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            state["refreshed"] = True
            return httpx.Response(
                200, json={"access_token": new_access, "refresh_token": new_refresh}
            )
        if not state["refreshed"]:
            return httpx.Response(401, json={"error": "expired"})
        return httpx.Response(200, json={"products": []})

    return httpx.MockTransport(handler), state


async def test_auto_refresh_invokes_callback():
    captured: dict[str, str] = {}

    async def on_refresh(access: str, refresh: str) -> None:
        captured["access"] = access
        captured["refresh"] = refresh

    transport, state = _make_transport()
    client = Cafe24Client(
        mall_id="mymall",
        access_token="old-acc",
        refresh_token="old-ref",
        on_token_refresh=on_refresh,
        transport=transport,
    )

    await client.get_products()

    assert state["refreshed"] is True
    # 콜백이 새 토큰으로 호출되고, 인스턴스 토큰도 갱신됨
    assert captured == {"access": "new-acc", "refresh": "new-ref"}
    assert client._access_token == "new-acc"
    assert client._refresh_token == "new-ref"


async def test_per_user_token_isolation():
    """두 사장님의 클라이언트가 각자 토큰만 갱신하고 서로 덮어쓰지 않는다."""
    store_a: dict[str, str] = {}
    store_b: dict[str, str] = {}

    async def cb_a(access: str, refresh: str) -> None:
        store_a["access"] = access

    async def cb_b(access: str, refresh: str) -> None:
        store_b["access"] = access

    transport_a, _ = _make_transport("acc-A", "ref-A")
    transport_b, _ = _make_transport("acc-B", "ref-B")

    client_a = Cafe24Client("mall-a", "old", "old", on_token_refresh=cb_a, transport=transport_a)
    client_b = Cafe24Client("mall-b", "old", "old", on_token_refresh=cb_b, transport=transport_b)

    await client_a.get_products()
    await client_b.get_products()

    assert store_a["access"] == "acc-A"
    assert store_b["access"] == "acc-B"
    # A의 갱신이 B에 새지 않음
    assert store_a["access"] != store_b["access"]
    assert client_a._access_token == "acc-A"
    assert client_b._access_token == "acc-B"


async def test_refresh_failure_propagates():
    """refresh token도 만료(갱신 401)면 HTTPStatusError가 전파된다 → 핸들러가 503."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(401, json={"error": "invalid_grant"})
        return httpx.Response(401, json={"error": "expired"})

    client = Cafe24Client(
        mall_id="mymall",
        access_token="",
        refresh_token="",
        transport=httpx.MockTransport(handler),
    )

    raised = False
    try:
        await client.get_products()
    except httpx.HTTPStatusError:
        raised = True
    assert raised is True
