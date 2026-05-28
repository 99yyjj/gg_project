"""
리뷰 API 요청/응답 스키마.

저장소는 우리 DB (reviews 테이블). 상품번호는 Cafe24 product_no.
AI 분석은 백엔드 ai_service.analyze_review 가 담당하고, 결과를 함께 노출한다.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Sentiment = Literal["loading", "pos", "neu", "neg"]
ReviewFilter = Literal["all", "pos", "neu", "neg", "undone"]


# ─────────────── 요청 ───────────────

class ReviewCreate(BaseModel):
    """사장님이 (또는 데모) 직접 추가하는 리뷰 입력."""

    author_name: str = Field(..., min_length=1, max_length=50, description="고객 이름")
    rating: int = Field(..., ge=1, le=5, description="별점 1~5")
    content: str = Field(..., min_length=1, max_length=4000, description="리뷰 본문")


class ReviewUpdate(BaseModel):
    """답글 편집 / 처리완료 토글."""

    admin_reply: Optional[str] = Field(None, max_length=4000, description="사장님 답글 본문")
    is_done: Optional[bool] = Field(None, description="처리완료 플래그")


# ─────────────── 응답 ───────────────

class ReviewOut(BaseModel):
    """리뷰 단건 응답."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    product_no: int
    author_name: str
    rating: int
    content: str
    sentiment: Sentiment
    summary: Optional[str] = None
    admin_reply: Optional[str] = None
    is_done: bool
    ai_analyzed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ReviewStats(BaseModel):
    """상품별 리뷰 통계 카드용 수치."""

    total: int = Field(0, description="전체 리뷰 수")
    avg_rating: Optional[float] = Field(None, description="평균 별점 (소수점 1자리)")
    urgent: int = Field(0, description="긴급(1~2점) 미처리")
    done: int = Field(0, description="처리완료")


class ReviewListResponse(BaseModel):
    """목록 + 통계를 한 번에 응답 — 헤더 통계 카드와 같이 그릴 수 있게."""

    items: list[ReviewOut]
    stats: ReviewStats


# ─────────────── AI ───────────────

class ReviewAIAnalysis(BaseModel):
    """AI 분석 결과 (서비스 레이어 내부용 + 재생성 응답)."""

    sentiment: Sentiment
    summary: str = Field("", description="한 줄 요약")
    draft_reply: str = Field("", description="사장님 답글 초안")


class RegenerateReplyResponse(BaseModel):
    """답글 재생성 응답 — 새 초안만 돌려준다 (DB에는 저장하지 않음)."""

    draft_reply: str


# ─────────────── 공개(손님) 스키마 ───────────────

class ReviewPublicOut(BaseModel):
    """
    손님 화면용 리뷰 응답.

    sentiment / summary / is_done / ai_analyzed_at 등 운영용 데이터는 노출하지 않는다.
    사장님 답글(admin_reply)은 손님에게도 보여주는 것이 자연스러우므로 그대로 노출.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    product_no: int
    author_name: str
    rating: int
    content: str
    admin_reply: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReviewPublicListResponse(BaseModel):
    items: list[ReviewPublicOut]
    total: int
    avg_rating: Optional[float] = None  # 별점 표시용 평균


class ReviewPublicCreateResponse(BaseModel):
    """작성 직후 응답 — 손님이 본인 리뷰임을 증명할 edit_token 을 한 번만 받는다."""

    review: ReviewPublicOut
    edit_token: str


class ReviewPublicUpdate(BaseModel):
    """손님이 자기 리뷰의 이름/별점/내용을 수정. 답글·완료 토글은 사장님 전용."""

    author_name: Optional[str] = Field(None, min_length=1, max_length=50)
    rating: Optional[int] = Field(None, ge=1, le=5)
    content: Optional[str] = Field(None, min_length=1, max_length=4000)
