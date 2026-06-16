"""
주문배송관리 / 판매성과 (자체 DB 기반).

엔드포인트:
    GET /orders                 - 내 쇼핑몰의 주문 목록 (기간 조회)
    GET /orders/sales-summary   - 판매성과 집계 (이번 달 / 최근 3개월)

주문은 손님 화면(POST /shop/{username}/orders)에서 우리 DB(orders 테이블)에
저장되고, 여기서는 로그인 유저(쇼핑몰 주인) 소유의 주문만 읽어와 집계한다.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.order import OrderListResponse, SalesSummaryResponse
from app.services.store_order_service import StoreOrderService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["주문/판매성과"])


@router.get("/", response_model=OrderListResponse, summary="내 쇼핑몰 주문 목록")
async def list_orders(
    start_date: str | None = Query(None, description="조회 시작일 YYYY-MM-DD (미지정 시 전체)"),
    end_date: str | None = Query(None, description="조회 종료일 YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderListResponse:
    service = StoreOrderService(db)
    return await service.list_orders(current_user.id, start_date, end_date, limit, offset)


@router.get("/sales-summary", response_model=SalesSummaryResponse, summary="판매성과 집계")
async def sales_summary(
    period: str = Query("month", pattern="^(month|total)$", description="month=이번 달, total=최근 3개월"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SalesSummaryResponse:
    service = StoreOrderService(db)
    return await service.sales_summary(current_user.id, period)
