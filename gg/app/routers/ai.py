"""
AI 마케팅 문구 추천 엔드포인트.

상품 등록/수정 시 사용자가 "AI로 채우기" 버튼을 누르면 호출된다.
응답을 화면에서 사장님이 확인·편집한 뒤 POST/PUT /products로 전송한다.
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.deps import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AIImageAnalysisResponse,
    AIMarketingCopyRequest,
    AIMarketingCopyResponse,
)
from app.services.ai_service import get_ai_service

# 🌟 [태웅님 코드 수입] 자동 카테고리 매칭 함수 및 스마트 가격 산정 함수를 불러옵니다.
# (FAQ 생성은 Gemini 호출이라 AIService.generate_product_faq로 통합했습니다.)
from app.services.cafe24_extensions import (
    calculate_smart_pricing,
    get_recommended_category,
)
from app.services.price_service import calculate_reverse_price  # 🌟 가격 역산 함수 임포트

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB


@router.post(
    "/marketing-copy",
    response_model=AIMarketingCopyResponse,
    summary="AI 마케팅 문구·태그·카테고리·가격·FAQ 추천",
)
async def generate_marketing_copy(
    request: AIMarketingCopyRequest,
    _: User = Depends(get_current_user),
) -> AIMarketingCopyResponse:
    if not request.product_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="상품명을 입력해야 AI 문구를 생성할 수 있습니다.",
        )

    service = get_ai_service()

    try:
        # 1️⃣ 🌟 [태웅님 핵심 알고리즘 반영] 가격이 입력된 경우에만 수수료 역산 + 스마트 가격 산정을 수행합니다.
        #    price는 선택값이므로, 미입력 시 가격 단계를 건너뛰고 AI 프롬프트엔 원본 가격(None)을 사용합니다.
        pricing_result = None
        ai_price = request.price
        if request.price is not None:
            # 입력된 가격을 수수료 10%(0.1) 기준으로 먼저 역산합니다.
            reverse_calculated_price = calculate_reverse_price(original_price=request.price, fee_rate=0.1)
            # 역산된 가격을 바탕으로 스마트 가격 산정 기능(기존 기능)을 구동합니다.
            pricing_result = calculate_smart_pricing(cost_price=reverse_calculated_price)
            # 🌟 수수료가 감안되어 최종 역산 정산된 가격이 AI 프롬프트에 들어가도록 연동했습니다.
            ai_price = pricing_result["product_price"]

        # 2️⃣ 오리지널 AI 서비스 문구 및 태그 추출 구동
        result = await service.generate_product_content(
            product_name=request.product_name,
            price=ai_price,
            original_description=request.original_description,
            custom_prompt=request.custom_prompt,
        )

        # 3️⃣ 자동 FAQ 생성 기능 작동 (Gemini, mock/실패 시 기본 템플릿)
        faq_result = await service.generate_product_faq(
            product_name=request.product_name,
            description_text=request.original_description,
        )

        # 4️⃣ 자동 카테고리 매칭 가동
        # AI가 뽑아낸 태그(result.ai_tags)와 프론트엔드가 넘겨준 쇼핑몰 카테고리 목록을 매칭합니다.
        categories_dict_list = [cat.model_dump() for cat in request.cafe24_categories]
        recommended_cat_no = get_recommended_category(
            detected_tags=result.ai_tags,
            cafe24_categories=categories_dict_list
        )

    except Exception as e:
        logger.error(f"AI 문구 및 부가 기능 생성 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 통합 응답을 처리하지 못했습니다: {e}",
        )

    # 5️⃣ 모든 데이터 바구니에 담아서 최종 리턴
    return AIMarketingCopyResponse(
        description=result.ai_description,
        tags=result.ai_tags,
        pricing=pricing_result,
        faqs=faq_result,
        recommended_category_no=recommended_cat_no
    )


@router.post(
    "/analyze-image",
    response_model=AIImageAnalysisResponse,
    summary="상품 사진 분석 (키워드·상품명·특징 요약)",
)
async def analyze_image(
    file: UploadFile = File(..., description="분석할 상품 사진 (JPG/PNG)"),
    custom_prompt: Optional[str] = Form(None, description="추가 톤앤매너 지시사항 (선택)"),
    _: User = Depends(get_current_user),
) -> AIImageAnalysisResponse:
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_IMAGE_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"JPG, PNG 이미지만 분석할 수 있습니다. (받은 타입: {file.content_type})",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 파일입니다.",
        )
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="이미지 용량이 너무 큽니다. (최대 10MB)",
        )

    service = get_ai_service()
    try:
        result = await service.analyze_product_image(
            image_bytes=image_bytes,
            mime_type=mime,
            custom_prompt=custom_prompt,
        )
    except Exception as e:
        logger.error(f"이미지 분석 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 분석 응답을 받지 못했습니다: {e}",
        )

    return AIImageAnalysisResponse(
        file_id=uuid.uuid4().hex[:8],
        product_name=result.product_name,
        keywords=result.keywords,
        summary=result.summary,
        description=result.description,
        analysis_text=service.build_analysis_text(result),
    )