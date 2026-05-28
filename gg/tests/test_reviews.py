"""
리뷰 라우터 + 서비스 동작 검증.

- USE_MOCK_AI=True (기본) 가정 → 백그라운드 분석은 별점 기반 폴백을 사용한다.
- 인메모리 SQLite + ASGI httpx 클라이언트.
"""

import pytest

from app.models.review import Review
from app.models.user import User


async def _post_review(client, user: User, headers, product_no: int, **payload):
    body = {
        "author_name": payload.get("author_name", "김민준"),
        "rating": payload.get("rating", 5),
        "content": payload.get("content", "정말 좋아요!"),
    }
    return await client.post(
        f"/products/{product_no}/reviews",
        headers=headers(user),
        json=body,
    )


async def test_create_review_runs_mock_analysis_and_returns_201(
    client, make_user, auth_headers
):
    user = await make_user("boss")
    resp = await _post_review(client, user, auth_headers, 100, rating=5, content="완전 만족!")
    assert resp.status_code == 201
    data = resp.json()
    assert data["product_no"] == 100
    assert data["rating"] == 5
    # BackgroundTasks 가 응답 후 실행되므로 GET 으로 다시 확인
    listing = await client.get(
        "/products/100/reviews", headers=auth_headers(user)
    )
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) == 1
    # Mock 모드 폴백: 별점 5 → pos
    assert items[0]["sentiment"] == "pos"
    assert items[0]["summary"]  # 비어있지 않음
    assert items[0]["admin_reply"]  # 초안이 채워졌음


async def test_stats_reflect_rating_distribution(client, make_user, auth_headers):
    user = await make_user("boss")
    # 5/4/3/2/1 별점 한 건씩
    for r in (5, 4, 3, 2, 1):
        await _post_review(client, user, auth_headers, 200, rating=r, content=f"r{r}")

    resp = await client.get("/products/200/reviews", headers=auth_headers(user))
    body = resp.json()
    stats = body["stats"]
    assert stats["total"] == 5
    assert stats["avg_rating"] == 3.0  # (5+4+3+2+1)/5
    # 1·2점 + 미처리 → urgent 2
    assert stats["urgent"] == 2
    assert stats["done"] == 0


async def test_filter_undone_and_sentiment(client, make_user, auth_headers):
    user = await make_user("boss")
    # 별점 5(pos), 1(neg)
    r5 = await _post_review(client, user, auth_headers, 300, rating=5, content="좋음")
    r1 = await _post_review(client, user, auth_headers, 300, rating=1, content="안좋음")

    id_pos = r5.json()["id"]
    id_neg = r1.json()["id"]

    # pos 필터
    resp = await client.get(
        "/products/300/reviews?filter=pos", headers=auth_headers(user)
    )
    items = resp.json()["items"]
    assert {it["id"] for it in items} == {id_pos}

    # neg 필터
    resp = await client.get(
        "/products/300/reviews?filter=neg", headers=auth_headers(user)
    )
    items = resp.json()["items"]
    assert {it["id"] for it in items} == {id_neg}

    # 한 건 처리완료 → undone 필터에서 빠짐
    await client.patch(
        f"/reviews/{id_pos}", headers=auth_headers(user), json={"is_done": True}
    )
    resp = await client.get(
        "/products/300/reviews?filter=undone", headers=auth_headers(user)
    )
    items = resp.json()["items"]
    assert {it["id"] for it in items} == {id_neg}


async def test_urgent_undone_negative_sorts_first(client, make_user, auth_headers):
    """미처리 1~2점 리뷰가 항상 맨 위에 오는지."""
    user = await make_user("boss")
    pos = await _post_review(client, user, auth_headers, 400, rating=5, content="좋아요")
    neg = await _post_review(client, user, auth_headers, 400, rating=1, content="별로요")

    resp = await client.get("/products/400/reviews", headers=auth_headers(user))
    items = resp.json()["items"]
    # neg 가 나중에 만들어졌어도 미처리 + 별점 1점 → 가장 위
    assert items[0]["id"] == neg.json()["id"]
    assert items[-1]["id"] == pos.json()["id"]


async def test_patch_admin_reply_and_done(client, make_user, auth_headers):
    user = await make_user("boss")
    r = await _post_review(client, user, auth_headers, 500, rating=3, content="보통")
    rid = r.json()["id"]

    resp = await client.patch(
        f"/reviews/{rid}",
        headers=auth_headers(user),
        json={"admin_reply": "감사합니다 ✨", "is_done": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["admin_reply"] == "감사합니다 ✨"
    assert body["is_done"] is True


async def test_cannot_modify_other_users_review(
    client, make_user, auth_headers
):
    owner = await make_user("owner")
    intruder = await make_user("intruder")
    r = await _post_review(client, owner, auth_headers, 600, rating=4, content="굿")
    rid = r.json()["id"]

    # PATCH
    resp = await client.patch(
        f"/reviews/{rid}",
        headers=auth_headers(intruder),
        json={"is_done": True},
    )
    assert resp.status_code == 403

    # DELETE
    resp = await client.delete(f"/reviews/{rid}", headers=auth_headers(intruder))
    assert resp.status_code == 403


async def test_delete_review(client, make_user, auth_headers):
    user = await make_user("boss")
    r = await _post_review(client, user, auth_headers, 700, rating=2, content="음")
    rid = r.json()["id"]

    resp = await client.delete(f"/reviews/{rid}", headers=auth_headers(user))
    assert resp.status_code == 204

    listing = await client.get("/products/700/reviews", headers=auth_headers(user))
    assert listing.json()["items"] == []


async def test_regenerate_reply_returns_new_draft(client, make_user, auth_headers):
    user = await make_user("boss")
    r = await _post_review(client, user, auth_headers, 800, rating=2, content="실망")
    rid = r.json()["id"]

    resp = await client.post(
        f"/reviews/{rid}/regenerate-reply", headers=auth_headers(user)
    )
    assert resp.status_code == 200
    body = resp.json()
    # Mock 모드 폴백: 1~2점 → 사과 톤
    assert body["draft_reply"]
    assert "죄송" in body["draft_reply"] or "불편" in body["draft_reply"]


async def test_other_users_review_invisible_in_list(
    client, db_session, make_user, auth_headers
):
    boss_a = await make_user("a")
    boss_b = await make_user("b")
    db_session.add(
        Review(
            user_id=boss_a.id,
            product_no=900,
            author_name="x",
            rating=5,
            content="A의 리뷰",
            sentiment="pos",
        )
    )
    await db_session.commit()

    # 같은 product_no=900 을 B 가 조회하면 자기 리뷰만 보임 (= 0건)
    resp = await client.get("/products/900/reviews", headers=auth_headers(boss_b))
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ─────────────── 공개(손님) 엔드포인트 ───────────────


async def _seed_owned_product(db_session, user, product_no: int) -> None:
    from app.models.user_product import UserProduct

    db_session.add(UserProduct(user_id=user.id, product_no=product_no))
    await db_session.commit()


async def test_public_list_returns_only_owner_reviews(
    client, db_session, make_user
):
    owner = await make_user("shop_owner")
    await _seed_owned_product(db_session, owner, 1000)
    db_session.add(
        Review(
            user_id=owner.id,
            product_no=1000,
            author_name="손님A",
            rating=4,
            content="굿굿",
            sentiment="pos",
            summary="만족",
            admin_reply="감사합니다!",
        )
    )
    await db_session.commit()

    resp = await client.get(f"/shop/{owner.username}/products/1000/reviews")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["avg_rating"] == 4.0
    one = body["items"][0]
    # 공개 응답에는 sentiment / summary 가 노출되지 않는다.
    assert "sentiment" not in one
    assert "summary" not in one
    # 사장님 답글은 손님에게도 보인다.
    assert one["admin_reply"] == "감사합니다!"


async def test_public_create_returns_edit_token_and_persists_review(
    client, db_session, make_user
):
    owner = await make_user("shop_owner2")
    await _seed_owned_product(db_session, owner, 1001)

    resp = await client.post(
        f"/shop/{owner.username}/products/1001/reviews",
        json={"author_name": "손님", "rating": 5, "content": "완전 만족!"},
    )
    assert resp.status_code == 201
    body = resp.json()
    token = body["edit_token"]
    assert isinstance(token, str) and len(token) >= 32
    rid = body["review"]["id"]

    listing = (
        await client.get(f"/shop/{owner.username}/products/1001/reviews")
    ).json()
    assert listing["total"] == 1
    assert listing["items"][0]["id"] == rid


async def test_public_create_404_when_product_not_owned(client, make_user):
    owner = await make_user("shop_owner3")
    # product_no=2000 을 owner 가 등록하지 않은 상태에서 작성 시도
    resp = await client.post(
        f"/shop/{owner.username}/products/2000/reviews",
        json={"author_name": "x", "rating": 5, "content": "test"},
    )
    assert resp.status_code == 404


async def test_public_update_requires_correct_edit_token(
    client, db_session, make_user
):
    owner = await make_user("shop_owner4")
    await _seed_owned_product(db_session, owner, 1100)

    created = (
        await client.post(
            f"/shop/{owner.username}/products/1100/reviews",
            json={"author_name": "손님", "rating": 3, "content": "보통"},
        )
    ).json()
    rid = created["review"]["id"]
    real_token = created["edit_token"]

    # 토큰 없이 시도 → 401
    resp = await client.patch(
        f"/shop/{owner.username}/reviews/{rid}",
        json={"content": "탈취 시도"},
    )
    assert resp.status_code == 401

    # 잘못된 토큰 → 403 (PermissionError → 전역 핸들러)
    resp = await client.patch(
        f"/shop/{owner.username}/reviews/{rid}",
        json={"content": "탈취 시도"},
        headers={"X-Edit-Token": "wrong-token"},
    )
    assert resp.status_code == 403

    # 정상 토큰 → 200
    resp = await client.patch(
        f"/shop/{owner.username}/reviews/{rid}",
        json={"author_name": "손님(수정)", "rating": 5, "content": "다시 보니 좋아요!"},
        headers={"X-Edit-Token": real_token},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["author_name"] == "손님(수정)"
    assert body["rating"] == 5
    assert body["content"] == "다시 보니 좋아요!"


async def test_admin_created_review_has_no_edit_token(
    client, make_user, auth_headers
):
    """관리자 POST 흐름은 토큰을 발급하지 않으므로 손님이 절대 수정할 수 없다."""
    owner = await make_user("shop_owner5")

    created = (
        await _post_review(client, owner, auth_headers, 1200, rating=4, content="관리자 직접 입력")
    ).json()
    rid = created["id"]

    # 임의의 토큰으로 시도해도 항상 403/404
    resp = await client.patch(
        f"/shop/{owner.username}/reviews/{rid}",
        json={"content": "탈취"},
        headers={"X-Edit-Token": "any"},
    )
    assert resp.status_code in (403, 404)
