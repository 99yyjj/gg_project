"""
ProductService 단위 테스트 — 스텁 Cafe24 클라이언트 + 인메모리 SQLite.

상품 데이터는 Cafe24(스텁)에, 소유권은 user_products 테이블에 기록되는
이중 구조가 의도대로 동작하는지 검증한다.
"""

from typing import Any

import pytest

from app.models.user import User
from app.models.user_product import UserProduct
from app.schemas.product import ProductCreateRequest, ProductUpdateRequest
from app.services.product_service import ProductService


class StubCafe24:
    """ProductService가 호출하는 Cafe24 메서드만 흉내내는 스텁."""

    def __init__(self) -> None:
        self.deleted: list[int] = []
        self._next_no = 100

    async def create_product(self, payload: dict[str, Any]) -> dict[str, Any]:
        no = self._next_no
        self._next_no += 1
        return {"product_no": no, "product_name": payload["product_name"], "price": payload["price"]}

    async def get_products_by_nos(self, nos: list[int]) -> list[dict[str, Any]]:
        return [{"product_no": n, "product_name": f"P{n}", "price": "1000"} for n in nos]

    async def get_product(self, no: int) -> dict[str, Any]:
        return {"product_no": no, "product_name": f"P{no}", "price": "1000"}

    async def update_product(self, no: int, payload: dict[str, Any]) -> dict[str, Any]:
        return {"product_no": no, "product_name": payload.get("product_name", f"P{no}")}

    async def delete_product(self, no: int) -> bool:
        self.deleted.append(no)
        return True

    async def upload_product_image(self, no, detail, lst) -> dict[str, Any]:
        return {}


async def _new_user(db_session, username: str = "boss") -> User:
    from app.core.security import hash_password

    user = User(
        email=f"{username}@t.local",
        username=username,
        password_hash=hash_password("pw"),
        cafe24_mall_id=username,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_create_records_ownership(db_session):
    user = await _new_user(db_session)
    service = ProductService(db_session, StubCafe24())

    summary, warnings = await service.create_product(
        user.id,
        ProductCreateRequest(product_name="원피스", price=29000, description="설명"),
    )

    assert summary.product_no == 100
    assert warnings == []
    # 소유권이 user_products에 기록됨
    owned = await service._owned_nos(user.id, limit=20, offset=0)
    assert owned == [100]


async def test_list_returns_only_owned(db_session):
    boss = await _new_user(db_session, "boss")
    other = await _new_user(db_session, "other")
    db_session.add(UserProduct(user_id=boss.id, product_no=1))
    db_session.add(UserProduct(user_id=other.id, product_no=2))
    await db_session.commit()

    service = ProductService(db_session, StubCafe24())
    items = await service.list_products(boss.id)

    nos = [i.product_no for i in items]
    assert nos == [1]  # 남의 상품(2)은 안 보임


async def test_delete_removes_ownership(db_session):
    user = await _new_user(db_session)
    db_session.add(UserProduct(user_id=user.id, product_no=5))
    await db_session.commit()

    stub = StubCafe24()
    service = ProductService(db_session, stub)
    await service.delete_product(user.id, 5)

    assert stub.deleted == [5]
    assert await service._check_owner(user.id, 5) is None


async def test_update_non_owned_raises_permission_error(db_session):
    owner = await _new_user(db_session, "owner")
    intruder = await _new_user(db_session, "intruder")
    db_session.add(UserProduct(user_id=owner.id, product_no=9))
    await db_session.commit()

    service = ProductService(db_session, StubCafe24())
    with pytest.raises(PermissionError):
        await service.update_product(
            intruder.id, 9, ProductUpdateRequest(product_name="해킹시도")
        )
