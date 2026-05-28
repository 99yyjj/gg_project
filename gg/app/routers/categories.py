"""
카테고리 목록 조회 (상품 등록 시 category_no 선택용).

Cafe24 카테고리 API에 직접 위임한다 (로컬 DB 폴백 없음).
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, make_cafe24_client
from app.models.user import User
from app.schemas.category import CategoryListResponse, CategoryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["카테고리"])


@router.get("/", response_model=CategoryListResponse, summary="카테고리 목록 조회")
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CategoryListResponse:
    # Cafe24 API 오류는 전역 예외 핸들러(app/core/errors.py)가 변환한다.
    raw = await make_cafe24_client(current_user, db).get_categories()

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
