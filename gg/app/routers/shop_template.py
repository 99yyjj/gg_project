"""
쇼핑몰 빌더(시안) API.

엔드포인트:
    GET    /shop-template/me           - 내 시안 조회 (없으면 빈 객체)
    PUT    /shop-template/me           - 내 시안 저장 (finalize=true면 온보딩 완료 처리)
    POST   /shop-template/ai-design    - 현재 시안 보고 AI 테마/카피/블록 추천

실제 DB 컬럼 매핑:
    - User.shop_template (JSONB)        ← preset_id + blocks + theme
    - User.onboarding_completed (bool)  ← finalize=true 호출 시 True

손님화면(/shop/{username})에서의 렌더링은 후속 라운드 작업이다.
이 라우터는 dashboard 미리보기 + 저장만 책임진다.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.shop_template import (
    AIDesignRequest,
    AIDesignResponse,
    ShopTemplate,
    ShopTemplateUpdateRequest,
)
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shop-template", tags=["쇼핑몰 빌더"])


@router.get(
    "/me",
    response_model=ShopTemplate,
    summary="내 쇼핑몰 시안 조회",
)
async def get_my_template(
    current_user: User = Depends(get_current_user),
) -> ShopTemplate:
    if not current_user.shop_template:
        # 아직 한 번도 저장한 적 없는 사용자 → 빈 시안 반환
        return ShopTemplate()
    return ShopTemplate.model_validate(current_user.shop_template)


@router.put(
    "/me",
    response_model=ShopTemplate,
    summary="내 쇼핑몰 시안 저장",
    description="현재 미리보기 상태를 그대로 보내면 됩니다. finalize=true 시 온보딩 완료로 처리.",
)
async def update_my_template(
    request: ShopTemplateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShopTemplate:
    template = ShopTemplate(
        preset_id=request.preset_id,
        blocks=request.blocks,
        theme=request.theme,
    )
    current_user.shop_template = template.model_dump()
    if request.finalize:
        current_user.onboarding_completed = True
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    logger.info(
        f"shop_template 저장 user_id={current_user.id} "
        f"preset={request.preset_id} finalize={request.finalize}"
    )
    return template


@router.post(
    "/ai-design",
    response_model=AIDesignResponse,
    summary="현재 시안에 어울리는 테마/카피/블록 추천",
)
async def ai_design(
    request: AIDesignRequest,
    current_user: User = Depends(get_current_user),
) -> AIDesignResponse:
    try:
        result = await AIService().generate_shop_theme(
            preset_id=request.preset_id,
            block_types=[b.type for b in request.blocks],
            shop_name=request.shop_name or current_user.shop_name,
            extra_prompt=request.extra_prompt,
        )
    except Exception as e:
        logger.error(f"AI 테마 생성 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 응답을 받지 못했습니다: {e}",
        )

    return AIDesignResponse(
        theme=result.theme,
        hero_headline=result.hero_headline,
        hero_subcopy=result.hero_subcopy,
        hero_cta=result.hero_cta,
        section_copy=result.section_copy,
        recommended_blocks=result.recommended_blocks,
    )
