"""
공개 쇼핑몰 API — 인증 불필요, 손님이 접근하는 엔드포인트.

엔드포인트:
    GET /shop/{username}                     - 쇼핑몰 기본 정보
    GET /shop/{username}/products            - 진열 중인 상품 목록
    GET /shop/{username}/products/{product_no} - 상품 상세
"""

import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.deps import get_db, get_session_maker, make_cafe24_client
from app.models.review import Review
from app.models.user_product import UserProduct
from app.schemas.category import CategoryListResponse, CategoryResponse
from app.schemas.order import OrderCreate, OrderCreateResponse
from app.schemas.product import ProductListResponse, ProductSummary
from app.schemas.review import (
    ReviewCreate,
    ReviewPublicCreateResponse,
    ReviewPublicListResponse,
    ReviewPublicOut,
    ReviewPublicUpdate,
)
from app.schemas.shop_template import ShopTemplate
from app.services.ai_service import get_ai_service
from app.services.product_service import _to_summary
from app.services.review_service import ReviewService, analyze_and_save
from app.services.store_order_service import StoreOrderService
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
        cafe24 = make_cafe24_client(user, db)
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
        cafe24 = make_cafe24_client(user, db)
        raw = await cafe24.get_product(product_no)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    if not raw:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    # 미진열(display != "T") 상품은 손님 화면에 노출하지 않는다.
    if raw.get("display") != "T":
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")

    return _to_summary(raw)


# ─────────────── 공개 리뷰 (손님용) ───────────────


async def _verify_owned_product(user_id: int, product_no: int, db: AsyncSession) -> None:
    """해당 username 의 사장님이 등록한 상품이 맞는지 확인."""
    result = await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == user_id,
            UserProduct.product_no == product_no,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")


@router.get(
    "/{username}/products/{product_no}/reviews",
    response_model=ReviewPublicListResponse,
    summary="상품 리뷰 목록 (공개)",
)
async def list_shop_reviews(
    username: str,
    product_no: int,
    db: AsyncSession = Depends(get_db),
) -> ReviewPublicListResponse:
    user = await _get_user_or_404(username, db)
    await _verify_owned_product(user.id, product_no, db)

    result = await db.execute(
        select(Review)
        .where(Review.user_id == user.id, Review.product_no == product_no)
        .order_by(Review.id.desc())
    )
    rows = list(result.scalars().all())

    avg_q = await db.execute(
        select(func.avg(Review.rating)).where(
            Review.user_id == user.id, Review.product_no == product_no
        )
    )
    avg_val = avg_q.scalar()
    avg_rating = round(float(avg_val), 1) if avg_val is not None else None

    return ReviewPublicListResponse(
        items=[ReviewPublicOut.model_validate(r) for r in rows],
        total=len(rows),
        avg_rating=avg_rating,
    )


@router.post(
    "/{username}/products/{product_no}/reviews",
    response_model=ReviewPublicCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="리뷰 작성 (공개, 익명)",
)
async def create_shop_review(
    username: str,
    product_no: int,
    payload: ReviewCreate,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> ReviewPublicCreateResponse:
    user = await _get_user_or_404(username, db)
    await _verify_owned_product(user.id, product_no, db)

    ai = get_ai_service()
    service = ReviewService(db, ai)
    token = ReviewService.generate_edit_token()
    row = await service.create(user.id, product_no, payload, edit_token=token)

    background.add_task(
        analyze_and_save,
        session_maker,
        ai,
        row.id,
        row.content,
        row.rating,
    )

    return ReviewPublicCreateResponse(
        review=ReviewPublicOut.model_validate(row),
        edit_token=token,
    )


@router.patch(
    "/{username}/reviews/{review_id}",
    response_model=ReviewPublicOut,
    summary="본인 리뷰 수정 (X-Edit-Token 헤더 필요)",
)
async def update_shop_review(
    username: str,
    review_id: int,
    payload: ReviewPublicUpdate,
    background: BackgroundTasks,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: AsyncSession = Depends(get_db),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> ReviewPublicOut:
    user = await _get_user_or_404(username, db)

    if not x_edit_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="수정 토큰이 필요합니다.",
        )

    ai = get_ai_service()
    service = ReviewService(db, ai)
    try:
        row = await service.get_by_id_and_token(review_id, x_edit_token)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # 토큰이 일치해도, 다른 사장님 가게의 리뷰 ID 가 섞여 들어오는 시도는 막는다.
    if row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리뷰를 찾을 수 없습니다.")

    row, needs_reanalysis = await service.apply_customer_edit(
        row,
        author_name=payload.author_name,
        rating=payload.rating,
        content=payload.content,
    )

    if needs_reanalysis:
        background.add_task(
            analyze_and_save,
            session_maker,
            ai,
            row.id,
            row.content,
            row.rating,
        )

    return ReviewPublicOut.model_validate(row)


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
    user = await _get_user_or_404(username, db)
    try:
        raw = await make_cafe24_client(user, db).get_categories()
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


# ─────────────── 공개 주문 (손님용) ───────────────


@router.post(
    "/{username}/orders",
    response_model=OrderCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="주문 생성 (공개, 손님용)",
)
async def create_shop_order(
    username: str,
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
) -> OrderCreateResponse:
    """손님이 장바구니에서 주문하면 해당 쇼핑몰(사장님) 소유의 주문으로 DB에 저장한다.

    이렇게 저장된 주문은 사장님 대시보드의 주문배송관리 / 판매성과 페이지에서
    바로 조회·집계된다(카페24를 거치지 않는 자체 주문 흐름).
    """
    user = await _get_user_or_404(username, db)
    order = await StoreOrderService(db).create_order(user.id, payload)
    return OrderCreateResponse(order_no=order.order_no)
