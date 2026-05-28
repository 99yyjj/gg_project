"""
상품 리뷰 관리 엔드포인트.

URL 설계:
    GET    /products/{product_no}/reviews         목록 + 통계
    POST   /products/{product_no}/reviews         수동 추가 (AI 분석 백그라운드 트리거)
    PATCH  /reviews/{review_id}                   답글 편집 / 처리완료 토글
    POST   /reviews/{review_id}/regenerate-reply  AI 답글 재생성
    DELETE /reviews/{review_id}                   삭제

소유권: 모든 변경 동작은 user_id 일치 검증 후 처리한다.
"""

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.deps import get_current_user, get_db, get_session_maker
from app.models.user import User
from app.schemas.review import (
    RegenerateReplyResponse,
    ReviewCreate,
    ReviewFilter,
    ReviewListResponse,
    ReviewOut,
    ReviewUpdate,
)
from app.services.ai_service import get_ai_service
from app.services.review_service import ReviewService, analyze_and_save

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Reviews"])


# ─────────────── 상품별 목록 / 등록 ───────────────


@router.get(
    "/products/{product_no}/reviews",
    response_model=ReviewListResponse,
    summary="상품 리뷰 목록 + 통계",
)
async def list_reviews(
    product_no: int,
    filter: ReviewFilter = "all",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReviewListResponse:
    service = ReviewService(db, get_ai_service())
    items = await service.list_for_product(user.id, product_no, filter)
    stats = await service.compute_stats(user.id, product_no)
    return ReviewListResponse(
        items=[ReviewOut.model_validate(r) for r in items],
        stats=stats,
    )


@router.post(
    "/products/{product_no}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="리뷰 추가 (AI 분석 백그라운드 트리거)",
)
async def create_review(
    product_no: int,
    payload: ReviewCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> ReviewOut:
    ai = get_ai_service()
    service = ReviewService(db, ai)
    row = await service.create(user.id, product_no, payload)

    # 백그라운드: AI 분석 후 row 업데이트. 라우터 세션은 응답 직후 닫히므로
    # 백그라운드는 session_maker 로 새 세션을 연다. (테스트에서는 인메모리 SQLite로 교체)
    background.add_task(
        analyze_and_save,
        session_maker,
        ai,
        row.id,
        row.content,
        row.rating,
    )

    return ReviewOut.model_validate(row)


# ─────────────── 단건 변경 ───────────────


@router.patch(
    "/reviews/{review_id}",
    response_model=ReviewOut,
    summary="답글 편집 / 처리완료 토글",
)
async def update_review(
    review_id: int,
    payload: ReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReviewOut:
    service = ReviewService(db, get_ai_service())
    try:
        row = await service.update(user.id, review_id, payload)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return ReviewOut.model_validate(row)


@router.post(
    "/reviews/{review_id}/regenerate-reply",
    response_model=RegenerateReplyResponse,
    summary="AI 답글 초안 재생성",
)
async def regenerate_reply(
    review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegenerateReplyResponse:
    ai = get_ai_service()
    service = ReviewService(db, ai)
    try:
        row = await service.get_owned(user.id, review_id)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    try:
        draft = await ai.regenerate_review_reply(
            content=row.content,
            rating=row.rating,
            prev_reply=row.admin_reply,
        )
    except Exception as e:
        logger.error(f"답글 재생성 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 응답을 받지 못했습니다: {e}",
        )

    return RegenerateReplyResponse(draft_reply=draft)


@router.delete(
    "/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="리뷰 삭제",
)
async def delete_review(
    review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    service = ReviewService(db, get_ai_service())
    try:
        await service.delete(user.id, review_id)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
