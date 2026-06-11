"""
AI 마케팅 문구 추천 요청/응답 스키마.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# 🌟 [카테고리 매칭 추가] Cafe24 카테고리 단건에 대한 규격 정의
class Cafe24CategoryInput(BaseModel):
    category_no: int = Field(..., description="Cafe24 카테고리 번호")
    category_name: str = Field(..., description="카테고리 전체 경로 명칭 (예: '패션의류 > 상의')")


class AIMarketingCopyRequest(BaseModel):
    product_name: str = Field(..., description="상품명 (필수)")
    price: Optional[float] = Field(None, gt=0, description="판매가")
    original_description: Optional[str] = Field(None, description="원본 문구가 있으면 함께 전달 (수정 시)")
    custom_prompt: Optional[str] = Field(
        None,
        description="추가 톤앤매너 지시사항 (예: '20대 여성 타깃, 고급스럽게')",
    )
    # 🌟 [카테고리 매칭 추가] 사장님의 쇼핑몰 카테고리 목록을 배열로 받습니다.
    cafe24_categories: List[Cafe24CategoryInput] = Field(
        default_factory=list, 
        description="Cafe24 상점의 실제 활성화된 카테고리 리스트"
    )


class ProductPricingResponse(BaseModel):
    cost_price: int = Field(..., description="공급 원가")
    consumer_price: int = Field(..., description="Cafe24 소비자가 항목에 주입할 값")
    product_price: int = Field(..., description="Cafe24 판매가 항목에 주입할 값")
    discount_rate: str = Field(..., description="화면에 표시할 할인율 기획 문구 (예: '25%')")
    margin_preview: int = Field(..., description="예상 순수익 마진 금액")


class ProductFAQItem(BaseModel):
    q: str = Field(..., description="소비자 예상 질문")
    a: str = Field(..., description="친절한 답변 내용")


class AIMarketingCopyResponse(BaseModel):
    description: str = Field(..., description="AI가 생성한 마케팅 상세 문구")
    tags: list[str] = Field(default_factory=list, description="AI가 추천한 분류 태그 목록")
    pricing: Optional[ProductPricingResponse] = Field(None, description="원가 기반 마진 및 역산 판매가 정보")
    faqs: List[ProductFAQItem] = Field(default_factory=list, description="자동 생성된 상품 예상 FAQ 3가지")
    
    # 🌟 [카테고리 매칭 추가] AI가 연산하여 추천한 최종 Cafe24 카테고리 번호
    recommended_category_no: int = Field(1, description="추천된 Cafe24 카테고리 번호 (매칭 실패 시 기본값 1)")


class AIImageAnalysisResponse(BaseModel):
    """상품 사진 1장을 Gemini로 분석한 결과 (등록 폼 자동 채우기용)."""
    file_id: str = Field(..., description="이 분석 건의 짧은 식별자")
    product_name: str = Field(..., description="쇼핑몰 등록용 상품명")
    keywords: list[str] = Field(default_factory=list, description="핵심 키워드 (보통 5개)")
    summary: str = Field("", description="상품 주요 특징 한 줄 요약 (간략 설명용)")
    description: str = Field("", description="마케팅 상세 문구")
    analysis_text: str = Field("", description="사람이 읽기 좋은 분석 결과 전문 (참고용)")