"""
공개 쇼핑몰 API — 인증 불필요, 손님이 접근하는 엔드포인트.

엔드포인트:
    GET /shop/{username}                     - 쇼핑몰 기본 정보
    GET /shop/{username}/products            - 진열 중인 상품 목록
    GET /shop/{username}/products/{product_no} - 상품 상세
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.user_product import UserProduct
from app.schemas.category import CategoryListResponse, CategoryResponse
from app.schemas.product import ProductListResponse, ProductSummary
from app.schemas.shop_template import ShopTemplate
from app.services.cafe24_client import get_cafe24_client
from app.services.product_service import _to_summary
from app.services.user_service import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shop", tags=["공개 쇼핑몰"])


class ShopInfo(BaseModel):
    username: str
    shop_name: str | None
    full_name: str | None
    # 손님화면이 시안대로 렌더할 수 있도록 사장님이 확정한 시안을 함께 내려준다.
    # 한 번도 꾸미지 않은 사용자는 None → 프론트는 기본 레이아웃으로 폴백.
    shop_template: ShopTemplate | None = None


class ShopProductListResponse(BaseModel):
    shop: ShopInfo
    items: list[ProductSummary]
    limit: int
    offset: int


async def _get_user_or_404(username: str, db: AsyncSession):
    user = await UserService(db).get_by_username(username)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="쇼핑몰을 찾을 수 없습니다.")
    return user


def _to_shop_info(user) -> ShopInfo:
    return ShopInfo(
        username=user.username,
        shop_name=user.shop_name,
        full_name=user.full_name,
        shop_template=(
            ShopTemplate.model_validate(user.shop_template)
            if user.shop_template
            else None
        ),
    )


async def _get_user_product_nos(
    user_id: int, limit: int, offset: int, db: AsyncSession
) -> list[int]:
    result = await db.execute(
        select(UserProduct.product_no)
        .where(UserProduct.user_id == user_id)
        .order_by(UserProduct.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [row[0] for row in result.fetchall()]


@router.get("/{username}", response_model=ShopInfo, summary="쇼핑몰 기본 정보")
async def get_shop_info(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> ShopInfo:
    user = await _get_user_or_404(username, db)
    return _to_shop_info(user)


@router.get(
    "/{username}/products",
    response_model=ShopProductListResponse,
    summary="쇼핑몰 상품 목록 (공개)",
)
async def list_shop_products(
    username: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ShopProductListResponse:
    user = await _get_user_or_404(username, db)
    shop = _to_shop_info(user)

    nos = await _get_user_product_nos(user.id, limit, offset, db)
    if not nos:
        return ShopProductListResponse(shop=shop, items=[], limit=limit, offset=offset)

    try:
        cafe24 = get_cafe24_client()
        raw_list = await cafe24.get_products_by_nos(nos)
    except httpx.HTTPStatusError:
        return ShopProductListResponse(shop=shop, items=[], limit=limit, offset=offset)

    # 진열 중인 상품만 노출
    displayed = [r for r in raw_list if r.get("display") == "T"]

    order = {no: i for i, no in enumerate(nos)}
    displayed.sort(key=lambda r: order.get(r.get("product_no", 0), 999))

    return ShopProductListResponse(
        shop=shop,
        items=[_to_summary(r) for r in displayed],
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{username}/products/{product_no}",
    response_model=ProductSummary,
    summary="쇼핑몰 상품 상세 (공개)",
)
async def get_shop_product(
    username: str,
    product_no: int,
    db: AsyncSession = Depends(get_db),
) -> ProductSummary:
    user = await _get_user_or_404(username, db)

    # 해당 사장님이 등록한 상품인지 확인
    result = await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == user.id,
            UserProduct.product_no == product_no,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    try:
        cafe24 = get_cafe24_client()
        raw = await cafe24.get_product(product_no)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    if not raw:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    return _to_summary(raw)


@router.get(
    "/{username}/categories",
    response_model=CategoryListResponse,
    summary="쇼핑몰 카테고리 목록 (공개)",
)
async def list_shop_categories(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> CategoryListResponse:
    """category-grid 블록 렌더용. 카테고리는 몰 전체 공용이라 사장님 확인만 하고 위임한다."""
    await _get_user_or_404(username, db)
    try:
        raw = await get_cafe24_client().get_categories()
    except httpx.HTTPStatusError:
        # 카테고리 조회 실패는 손님화면을 막을 이유가 아니다 → 빈 목록으로 폴백
        return CategoryListResponse(items=[], total=0)

    items = [
        CategoryResponse(
            category_no=c.get("category_no"),
            category_name=c.get("category_name", "이름 없음"),
            parent_category_no=c.get("parent_category_no") or None,
            depth=c.get("depth"),
        )
        for c in raw
    ]
    return CategoryListResponse(items=items, total=len(items))
