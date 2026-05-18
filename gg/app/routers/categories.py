"""
카테고리 목록 조회 (상품 등록 시 category_no 선택용).

Cafe24 카테고리 API에 직접 위임한다 (로컬 DB 폴백 없음).
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.models.user import User
from app.schemas.category import CategoryListResponse, CategoryResponse
from app.services.cafe24_client import Cafe24Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["카테고리"])


@router.get("/", response_model=CategoryListResponse, summary="카테고리 목록 조회")
async def list_categories(
    _: User = Depends(get_current_user),
) -> CategoryListResponse:
    try:
        raw = await Cafe24Client().get_categories()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cafe24 카테고리 조회 실패({e.response.status_code})",
        )

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
