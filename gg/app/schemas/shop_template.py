"""
쇼핑몰 빌더(시안) 스키마.

shop_template 컬럼에 저장되는 JSON 구조 + 요청/응답 모델.
프론트가 정한 블록 ID는 enum이 아닌 자유 문자열로 두어, 시안/블록 추가에 유연.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field


class ShopBlock(BaseModel):
    """미리보기에 그려지는 단위 블록 (hero / featured-products / banner …)."""

    id: str = Field(..., description="고유 ID (DnD 재정렬용)")
    type: str = Field(..., description="블록 종류 — 프론트의 블록 레지스트리 키")
    props: dict[str, Any] = Field(default_factory=dict, description="블록별 자유 prop")


class ShopTheme(BaseModel):
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    font_family: Optional[str] = None
    tone: Optional[str] = Field(None, description="modern / playful / minimal …")


class ShopTemplate(BaseModel):
    """shop_template 컬럼의 최상위 구조."""

    preset_id: Optional[str] = Field(None, description="기준이 된 시안 ID (참고용)")
    blocks: list[ShopBlock] = Field(default_factory=list)
    theme: ShopTheme = Field(default_factory=ShopTheme)


class ShopTemplateUpdateRequest(BaseModel):
    """확정 저장 — 미리보기 상태 전체를 그대로 보낸다."""

    preset_id: Optional[str] = None
    blocks: list[ShopBlock]
    theme: ShopTheme
    finalize: bool = Field(
        False,
        description="True면 onboarding_completed=true 로 마킹 (확정 단계).",
    )


class AIDesignRequest(BaseModel):
    """현재 시안을 보고 AI에게 테마/카피/블록 추천을 요청."""

    preset_id: Optional[str] = None
    blocks: list[ShopBlock] = Field(default_factory=list)
    shop_name: Optional[str] = None
    extra_prompt: Optional[str] = Field(
        None, description="사용자 톤앤매너 지시사항 (선택)"
    )


class AIDesignResponse(BaseModel):
    theme: ShopTheme
    hero_headline: Optional[str] = None
    hero_subcopy: Optional[str] = None
    hero_cta: Optional[str] = None
    section_copy: dict[str, str] = Field(
        default_factory=dict, description="블록 type별 추천 문구 (featured_title 등)"
    )
    recommended_blocks: list[str] = Field(
        default_factory=list, description="AI가 추천하는 블록 type 순서"
    )
