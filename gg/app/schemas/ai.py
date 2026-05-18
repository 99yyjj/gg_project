"""
AI 마케팅 문구 추천 요청/응답 스키마.
"""

from typing import Optional

from pydantic import BaseModel, Field


class AIMarketingCopyRequest(BaseModel):
    product_name: str = Field(..., description="상품명 (필수)")
    price: Optional[float] = Field(None, gt=0, description="판매가")
    original_description: Optional[str] = Field(None, description="원본 문구가 있으면 함께 전달 (수정 시)")
    custom_prompt: Optional[str] = Field(
        None,
        description="추가 톤앤매너 지시사항 (예: '20대 여성 타깃, 고급스럽게')",
    )


class AIMarketingCopyResponse(BaseModel):
    description: str = Field(..., description="AI가 생성한 마케팅 상세 문구")
    tags: list[str] = Field(default_factory=list, description="AI가 추천한 분류 태그 목록")
