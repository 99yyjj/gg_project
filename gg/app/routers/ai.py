"""
AI 마케팅 문구 추천 엔드포인트.

상품 등록/수정 시 사용자가 "AI로 채우기" 버튼을 누르면 호출된다.
응답을 화면에서 사장님이 확인·편집한 뒤 POST/PUT /products로 전송한다.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.models.user import User
from app.schemas.ai import AIMarketingCopyRequest, AIMarketingCopyResponse
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


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
        result = await AIService().generate_product_content(
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
