"""
주문배송관리 / 판매성과 응답 스키마.

카페24 주문 API(mall.read_order)에서 읽어온 주문을 화면용으로 가공한 형태.
금액·건수는 숫자로 내려주고, 표시 포맷(천단위 콤마 등)은 프론트에서 처리한다.
"""

from pydantic import BaseModel, Field


class OrderSummary(BaseModel):
    """주문배송관리 테이블 한 줄."""

    order_no: str = Field(..., description="카페24 주문번호")
    date: str = Field(..., description="주문일 (YYYY-MM-DD)")
    name: str = Field("", description="주문자명")
    phone: str = Field("", description="주문자 연락처")
    address: str = Field("", description="배송지")
    product: str = Field("", description="상품명 요약 (예: 'A 외 2건')")
    amount: int = Field(0, description="실결제금액")
    status: str = Field("", description="주문상태 라벨 (예: 배송준비)")
    tracking: str = Field("", description="송장정보 (없으면 빈 문자열)")


class OrderListResponse(BaseModel):
    orders: list[OrderSummary]
    total: int = Field(..., description="기간 내 전체 주문 수 (페이지네이션용)")


class SalesMetric(BaseModel):
    label: str = Field(..., description="기간 라벨 (예: 이번 달)")
    amount: int = Field(..., description="총 판매 금액")
    count: int = Field(..., description="총 주문 건수")
    avg: int = Field(..., description="평균 객단가")


class ProductRank(BaseModel):
    name: str
    count: int = Field(..., description="판매 수량")


class ProductStat(BaseModel):
    name: str
    product_no: str = Field("", description="카페24 상품번호")
    amount: int = Field(..., description="총 판매 금액")
    count: int = Field(..., description="총 판매 수량")


class SalesSummaryResponse(BaseModel):
    summary: SalesMetric
    ranking: list[ProductRank] = Field(default_factory=list, description="판매량 TOP N")
    period_stats: list[ProductStat] = Field(default_factory=list, description="상품별 기간 실적")
