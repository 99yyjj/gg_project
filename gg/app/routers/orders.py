"""
주문배송관리 / 판매성과 (카페24 주문 읽기 전용, mall.read_order 권한 필요).

엔드포인트:
    GET /orders                 - 내 카페24 쇼핑몰의 주문 목록 (기간 조회)
    GET /orders/sales-summary   - 판매성과 집계 (이번 달 / 최근 3개월)

products.py와 동일하게 로그인 유저별 Cafe24 클라이언트로 동작한다.
카페24 API 오류는 app/core/errors.py 전역 핸들러가 HTTP 응답으로 변환한다.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, make_cafe24_client
from app.models.user import User
from app.schemas.order import OrderListResponse, SalesSummaryResponse
from app.services.order_service import OrderService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["주문/판매성과"])


@router.get("/", response_model=OrderListResponse, summary="내 쇼핑몰 주문 목록")
async def list_orders(
    start_date: str | None = Query(None, description="조회 시작일 YYYY-MM-DD (미지정 시 최근 90일)"),
    end_date: str | None = Query(None, description="조회 종료일 YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderListResponse:
    service = OrderService(make_cafe24_client(current_user, db))
    return await service.list_orders(start_date, end_date, limit, offset)


@router.get("/sales-summary", response_model=SalesSummaryResponse, summary="판매성과 집계")
async def sales_summary(
    period: str = Query("month", pattern="^(month|total)$", description="month=이번 달, total=최근 3개월"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SalesSummaryResponse:
    service = OrderService(make_cafe24_client(current_user, db))
    return await service.sales_summary(period)
