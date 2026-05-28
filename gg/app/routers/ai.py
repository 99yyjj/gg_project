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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB


@router.post(
    "/marketing-copy",
    response_model=AIMarketingCopyResponse,
    summary="AI 마케팅 문구·태그 추천",
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

    try:
        result = await get_ai_service().generate_product_content(
            product_name=request.product_name,
            price=request.price,
            original_description=request.original_description,
            custom_prompt=request.custom_prompt,
        )
    except Exception as e:
        logger.error(f"AI 문구 생성 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 응답을 받지 못했습니다: {e}",
        )

    return AIMarketingCopyResponse(
        description=result.ai_description,
        tags=result.ai_tags,
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
