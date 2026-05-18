"""
서버/DB 상태 확인 엔드포인트.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["헬스체크"])


@router.get("/", summary="서버 상태 확인")
async def root() -> dict:
    return {
        "status": "ok",
        "message": "GG AI 쇼핑몰 관리 플랫폼 서버가 정상 실행 중입니다.",
        "docs": "/docs",
    }


@router.get("/health", summary="DB 연결까지 포함한 상세 헬스체크")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"DB 헬스체크 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="데이터베이스 연결에 실패했습니다.",
        )

    return {"status": "ok", "database": "ok"}
