"""
상품 리뷰 ORM 모델.

상품 본체는 Cafe24에 있으므로 product_no는 단순 INT (FK 없음).
소유권은 user_id 로 묶고, AI 분석 결과(감정/요약)와 사장님 답글까지 한 row에 보관한다.

sentiment 값:
    - 'loading' : AI 분석 진행 중 (수동 등록 직후 임시 상태)
    - 'pos'     : 긍정
    - 'neu'     : 중립
    - 'neg'     : 부정
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        Index("ix_reviews_user_product", "user_id", "product_no"),
        Index("ix_reviews_user_done_sent", "user_id", "is_done", "sentiment"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Cafe24 상품번호 — 상품 본체는 Cafe24에 있어 FK는 걸지 않는다.
    product_no: Mapped[int] = mapped_column(Integer, nullable=False)

    author_name: Mapped[str] = mapped_column(String(50), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1~5
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # AI 분석 결과 (등록 직후엔 'loading')
    sentiment: Mapped[str] = mapped_column(String(10), nullable=False, default="loading")
    summary: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # 사장님 답글 (AI 초안 → 편집된 최종본)
    admin_reply: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # 손님 익명 수정용 토큰 — 작성 시 한 번 발급되어 응답으로 내려가고,
    # 손님 브라우저 localStorage 에 보관된다. 수정 요청 시 헤더로 함께 보내야 권한 통과.
    # 관리자(사장님) 경로에서 만든 리뷰는 토큰이 None 일 수 있다.
    edit_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    ai_analyzed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Review(id={self.id}, product_no={self.product_no}, rating={self.rating}, sentiment={self.sentiment})>"
