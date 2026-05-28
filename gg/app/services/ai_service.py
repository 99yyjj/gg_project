"""
[파일 역할]
상품의 마케팅 상세페이지 문구와 해시태그를 자동 생성하는 AI 서비스 모듈.

현재 동작 모드:
    - USE_MOCK_AI=True (기본값): 실제 API 호출 없이 가짜 데이터를 즉시 반환
    - USE_MOCK_AI=False: Google Gemini API를 호출해 실제 마케팅 문구 생성

실제 LLM으로 전환하는 방법:
    1. .env에 GEMINI_API_KEY=실제키 입력
    2. .env에 USE_MOCK_AI=False 추가
    3. 서버 재시작 → 코드 변경 없이 즉시 전환
"""

import json
import logging
import random
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AIGenerationResult:
    """AI 생성 결과를 담는 데이터 클래스."""

    ai_description: str  # AI가 작성한 마케팅 상세페이지 텍스트
    ai_tags: list[str]   # AI가 분류한 태그 목록 (예: ["캐주얼", "여성복", "봄여름"])


@dataclass
class ShopThemeResult:
    """쇼핑몰 시안 → AI 테마/카피/블록 추천 결과."""

    theme: dict[str, Any]
    hero_headline: str | None = None
    hero_subcopy: str | None = None
    hero_cta: str | None = None
    section_copy: dict[str, str] = field(default_factory=dict)
    recommended_blocks: list[str] = field(default_factory=list)


@dataclass
class ImageAnalysisResult:
    """상품 사진 → AI 분석 결과 (상품명/키워드/특징 요약/상세 문구)."""

    product_name: str
    keywords: list[str]
    summary: str
    description: str


@dataclass
class ReviewAnalysisResult:
    """리뷰 본문/별점 → AI 감정·요약·답글 초안."""

    sentiment: str   # 'pos' | 'neu' | 'neg'
    summary: str
    draft_reply: str


class AIService:
    """
    상품 콘텐츠 자동 생성 서비스 클래스.

    USE_MOCK_AI=True이면 Mock 모드로 동작하고,
    False이면 실제 Claude API를 호출한다.
    두 모드 모두 AIGenerationResult를 반환하므로 호출부 코드는 바뀌지 않는다.
    """

    def __init__(self):
        self.use_mock = settings.USE_MOCK_AI

        if not self.use_mock:
            # 실제 API 모드일 때만 google-genai 패키지를 임포트
            from google import genai
            self._genai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            self.model = settings.GEMINI_MODEL
            self.max_tokens = settings.AI_MAX_TOKENS

        mode = "MOCK" if self.use_mock else "REAL API"
        logger.info(f"AIService 초기화 완료: 모드={mode}")

    async def generate_product_content(
        self,
        product_name: str,
        price: float | None,
        original_description: str | None,
        custom_prompt: str | None = None,
    ) -> AIGenerationResult:
        """
        상품 정보를 받아 마케팅 상세페이지와 분류 태그를 생성하는 핵심 함수.

        USE_MOCK_AI 설정에 따라 Mock 또는 실제 Gemini API로 분기한다.
        custom_prompt가 있으면 AI 생성 시 추가 지시사항으로 반영된다.
        """
        if self.use_mock:
            logger.info(f"[MOCK] AI 콘텐츠 생성: '{product_name}'")
            return self._mock_generate(product_name, price, original_description)

        logger.info(f"[REAL] Gemini API 호출: '{product_name}'")
        return await self._real_generate(product_name, price, original_description, custom_prompt)

    # ─────────────────────────────────────────────────────
    # MOCK 모드 구현
    # ─────────────────────────────────────────────────────

    def _mock_generate(
        self,
        product_name: str,
        price: float | None,
        original_description: str | None,
    ) -> AIGenerationResult:
        """실제 API 없이 그럴듯한 가짜 마케팅 데이터를 반환하는 Mock 함수."""

        price_str = f"{int(price):,}원" if price else "합리적인 가격"

        description = (
            f"✨ {product_name} — 당신의 일상을 특별하게\n\n"
            f"세심하게 선별된 소재와 정교한 마감으로 완성된 {product_name}입니다. "
            f"트렌디한 디자인과 편안한 착용감을 동시에 만족시키는 아이템으로, "
            f"어떤 스타일링에도 자연스럽게 어울립니다.\n\n"
            f"현재 {price_str}에 만나보실 수 있습니다. "
            f"데일리룩부터 특별한 날의 코디까지, 다양한 상황에서 활용 가능한 "
            f"이번 시즌 필수 아이템을 지금 바로 경험해보세요.\n\n"
            f"고객님의 만족을 최우선으로 생각하는 저희 쇼핑몰이 엄선한 제품으로, "
            f"받아보시는 순간 퀄리티 차이를 느끼실 수 있습니다."
        )

        tag_pool = [
            "신상품", "베스트셀러", "한정수량", "무료배송",
            "데일리룩", "캐주얼", "오피스룩", "스트릿패션",
            "봄여름", "가을겨울", "사계절",
            "여성의류", "남성의류", "유니섹스",
            "셔츠", "팬츠", "원피스", "자켓", "니트", "티셔츠",
            "트렌디", "미니멀", "빈티지", "클래식",
        ]

        # 상품명 키워드로 관련 태그를 앞쪽에 배치하고 나머지는 랜덤 선택
        name_lower = product_name.lower()
        priority_tags = [t for t in tag_pool if t in name_lower or name_lower in t]
        remaining = [t for t in tag_pool if t not in priority_tags]
        random.shuffle(remaining)

        selected_tags = (priority_tags + remaining)[:random.randint(5, 8)]

        return AIGenerationResult(
            ai_description=description,
            ai_tags=selected_tags,
        )

    # ─────────────────────────────────────────────────────
    # REAL API 모드 구현 (USE_MOCK_AI=False 시 사용)
    # ─────────────────────────────────────────────────────

    async def _real_generate(
        self,
        product_name: str,
        price: float | None,
        original_description: str | None,
        custom_prompt: str | None = None,
    ) -> AIGenerationResult:
        """Gemini API를 호출해 마케팅 문구와 태그를 생성하는 함수."""
        from google.genai import types

        prompt = self._build_prompt(product_name, price, original_description, custom_prompt)

        response = await self._genai_client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=self.max_tokens),
        )

        raw_response = response.text
        if not raw_response:
            raise ValueError("Gemini 응답이 비어있습니다. (안전 필터 차단 가능성)")

        logger.debug(f"Gemini 원본 응답: {raw_response[:200]}...")
        return self._parse_response(raw_response, product_name)

    def _build_prompt(
        self,
        product_name: str,
        price: float | None,
        original_description: str | None,
        custom_prompt: str | None = None,
    ) -> str:
        price_str = f"{price:,.0f}원" if price else "정보 없음"
        desc_str = original_description if original_description else "없음"
        custom_str = f"\n- 추가 지시사항: {custom_prompt}" if custom_prompt else ""

        return f"""당신은 한국 쇼핑몰의 전문 마케터입니다.
아래 상품 정보를 바탕으로 고객의 구매 욕구를 자극하는 마케팅 상세페이지와 분류 태그를 작성하세요.

[상품 정보]
- 상품명: {product_name}
- 판매가: {price_str}
- 원본 설명: {desc_str}{custom_str}

[요청 사항]
1. 마케팅 상세페이지: 상품의 매력을 부각하는 감성적이고 설득력 있는 문구 (3~5 문단, 200자 이상)
2. 분류 태그: 이 상품을 검색하거나 필터링할 때 사용할 태그 목록 (5~10개)

[출력 형식] 반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요:
{{
  "ai_description": "마케팅 상세페이지 텍스트",
  "ai_tags": ["태그1", "태그2", "태그3"]
}}"""

    # ─────────────────────────────────────────────────────
    # 상품 사진 분석 (Gemini 멀티모달)
    # ─────────────────────────────────────────────────────

    async def analyze_product_image(
        self,
        image_bytes: bytes,
        mime_type: str,
        custom_prompt: str | None = None,
    ) -> ImageAnalysisResult:
        """상품 사진 1장을 보고 상품명/키워드/특징 요약/상세 문구를 생성한다."""
        if self.use_mock:
            logger.info("[MOCK] 상품 이미지 분석")
            return self._mock_analyze_image()

        logger.info("[REAL] Gemini 상품 이미지 분석")
        return await self._real_analyze_image(image_bytes, mime_type, custom_prompt)

    def _mock_analyze_image(self) -> ImageAnalysisResult:
        """키 없이도 동작하는 가짜 분석 결과 (UI 흐름 확인용)."""
        keyword_pool = [
            ["스피커", "크리에이티브", "데스크탑", "RGB", "미니"],
            ["무선", "이어폰", "노이즈캔슬링", "블루투스", "휴대용"],
            ["텀블러", "보온", "스테인리스", "대용량", "캠핑"],
            ["가습기", "무드등", "초음파", "저소음", "USB충전"],
        ]
        keywords = random.choice(keyword_pool)
        product_name = " ".join(keywords[:3]) + f" {keywords[-1]}"
        summary = (
            f"{keywords[1]}의 감각적인 디자인이 돋보이는 {keywords[0]}로, "
            f"{keywords[2]} 환경에 최적화된 {keywords[-1]} 사이즈 제품입니다."
        )
        description = (
            f"✨ {product_name}\n\n"
            f"세련된 디자인과 실용성을 모두 갖춘 제품입니다. "
            f"{keywords[2]} 환경에 잘 어울리며, 간편한 사용성과 안정적인 품질로 "
            f"일상에서 만족스러운 경험을 제공합니다.\n\n"
            f"#{' #'.join(keywords)}"
        )
        return ImageAnalysisResult(
            product_name=product_name,
            keywords=keywords,
            summary=summary,
            description=description,
        )

    async def _real_analyze_image(
        self,
        image_bytes: bytes,
        mime_type: str,
        custom_prompt: str | None,
    ) -> ImageAnalysisResult:
        """Gemini 멀티모달로 사진을 분석한다."""
        from google.genai import types

        prompt = self._build_image_prompt(custom_prompt)
        response = await self._genai_client.aio.models.generate_content(
            model=self.model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(max_output_tokens=self.max_tokens),
        )

        raw = response.text
        if not raw:
            raise ValueError("Gemini 응답이 비어있습니다. (안전 필터 차단 가능성)")

        logger.debug(f"Gemini 이미지 분석 원본: {raw[:200]}...")
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start == -1 or end == 0:
                raise ValueError("응답에서 JSON을 찾을 수 없음")
            parsed = json.loads(raw[start:end])
            keywords = [str(k) for k in (parsed.get("keywords") or [])][:5]
            return ImageAnalysisResult(
                product_name=str(parsed.get("product_name") or "").strip() or "분석된 상품",
                keywords=keywords,
                summary=str(parsed.get("summary") or "").strip(),
                description=str(parsed.get("description") or "").strip(),
            )
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            logger.warning(f"이미지 분석 응답 파싱 실패: {e} → mock 폴백")
            return self._mock_analyze_image()

    def _build_image_prompt(self, custom_prompt: str | None) -> str:
        custom_str = f"\n- 추가 지시사항: {custom_prompt}" if custom_prompt else ""
        return f"""당신은 한국 쇼핑몰의 전문 MD입니다.
첨부된 상품 사진 한 장을 보고, 쇼핑몰 등록에 바로 쓸 수 있는 정보를 작성하세요.{custom_str}

[요청 사항]
1. 핵심 키워드: 사진 속 상품을 가장 잘 설명하는 키워드 정확히 5개
2. 상품명: 쇼핑몰 등록용 상품명 한 줄
3. 특징 요약: 상품의 주요 특징을 2~3문장으로 요약 (간략 설명용)
4. 상세 문구: 구매 욕구를 자극하는 마케팅 상세 문구 (2~4문단)

[출력 형식] 반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요:
{{
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "product_name": "상품명",
  "summary": "특징 요약",
  "description": "마케팅 상세 문구"
}}"""

    @staticmethod
    def build_analysis_text(result: ImageAnalysisResult) -> str:
        """사람이 읽기 좋은 분석 결과 전문 (데모 /analyze 형식)."""
        return (
            "다음은 이미지에서 추출한 정보입니다.\n\n"
            "1. **핵심 키워드 5개:**\n"
            f"    {', '.join(result.keywords)}\n\n"
            "2. **쇼핑몰 등록용 상품명:**\n"
            f"    {result.product_name}\n\n"
            "3. **상품의 주요 특징 요약:**\n"
            f"    {result.summary}"
        )

    # ─────────────────────────────────────────────────────
    # 쇼핑몰 시안 → 테마/카피/블록 추천 (빌더용)
    # ─────────────────────────────────────────────────────

    async def generate_shop_theme(
        self,
        preset_id: str | None,
        block_types: list[str],
        shop_name: str | None,
        extra_prompt: str | None = None,
    ) -> ShopThemeResult:
        """현재 시안(블록 구성)을 보고 AI가 어울리는 테마/카피/블록 순서를 제안."""
        if self.use_mock:
            logger.info(f"[MOCK] 쇼핑몰 테마 생성: preset={preset_id}")
            return self._mock_shop_theme(preset_id, block_types, shop_name)

        logger.info(f"[REAL] Gemini 쇼핑몰 테마 생성: preset={preset_id}")
        return await self._real_shop_theme(preset_id, block_types, shop_name, extra_prompt)

    def _mock_shop_theme(
        self,
        preset_id: str | None,
        block_types: list[str],
        shop_name: str | None,
    ) -> ShopThemeResult:
        # 시안별 분위기 프리셋 — 사용자가 고른 preset에 따라 톤을 다르게.
        palettes: dict[str, dict[str, str]] = {
            "minimal": {
                "primary_color": "#0f172a",
                "accent_color": "#10b981",
                "background_color": "#ffffff",
                "text_color": "#0f172a",
                "font_family": "Pretendard, system-ui, sans-serif",
                "tone": "minimal",
            },
            "bold": {
                "primary_color": "#dc2626",
                "accent_color": "#fbbf24",
                "background_color": "#fff7ed",
                "text_color": "#1c1917",
                "font_family": "'Spoqa Han Sans Neo', sans-serif",
                "tone": "bold",
            },
            "playful": {
                "primary_color": "#7c3aed",
                "accent_color": "#f472b6",
                "background_color": "#fdf4ff",
                "text_color": "#3b0764",
                "font_family": "'Nanum Gothic', sans-serif",
                "tone": "playful",
            },
        }
        theme = palettes.get(preset_id or "minimal", palettes["minimal"])

        name = shop_name or "내 쇼핑몰"
        headlines = {
            "minimal": f"{name}, 단정함의 기본",
            "bold": f"오늘 가장 뜨거운, {name}",
            "playful": f"즐거운 쇼핑, {name}에서!",
        }
        subcopies = {
            "minimal": "정제된 큐레이션으로 매일 입는 옷을 다시 정의합니다.",
            "bold": "트렌드의 맨 앞줄. 지금 만나보세요.",
            "playful": "당신의 하루를 더 가볍게 만들 아이템들",
        }
        cta_pool = {"minimal": "지금 둘러보기", "bold": "오늘의 핫딜", "playful": "구경하러 가기"}

        key = preset_id if preset_id in palettes else "minimal"

        # 블록 추천 — 사용자의 현재 구성 보존하되, 없는 블록은 채워줌.
        default_order = ["hero", "featured-products", "category-grid", "banner", "newsletter"]
        recommended = list(dict.fromkeys(block_types + default_order))

        return ShopThemeResult(
            theme=theme,
            hero_headline=headlines[key],
            hero_subcopy=subcopies[key],
            hero_cta=cta_pool[key],
            section_copy={
                "featured-products": "BEST PICK",
                "category-grid": "카테고리",
                "banner": "오늘만 이 가격",
                "newsletter": "새 소식을 가장 먼저 받아보세요",
            },
            recommended_blocks=recommended,
        )

    async def _real_shop_theme(
        self,
        preset_id: str | None,
        block_types: list[str],
        shop_name: str | None,
        extra_prompt: str | None,
    ) -> ShopThemeResult:
        from google.genai import types

        prompt = self._build_shop_theme_prompt(preset_id, block_types, shop_name, extra_prompt)
        response = await self._genai_client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=self.max_tokens),
        )
        raw = response.text or ""
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            parsed = json.loads(raw[start:end])
            theme = parsed.get("theme") or {}
            return ShopThemeResult(
                theme=theme,
                hero_headline=parsed.get("hero_headline"),
                hero_subcopy=parsed.get("hero_subcopy"),
                hero_cta=parsed.get("hero_cta"),
                section_copy=parsed.get("section_copy") or {},
                recommended_blocks=parsed.get("recommended_blocks") or [],
            )
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            logger.warning(f"AI 테마 응답 파싱 실패: {e} → mock 폴백")
            return self._mock_shop_theme(preset_id, block_types, shop_name)

    def _build_shop_theme_prompt(
        self,
        preset_id: str | None,
        block_types: list[str],
        shop_name: str | None,
        extra_prompt: str | None,
    ) -> str:
        blocks_str = ", ".join(block_types) if block_types else "(미지정)"
        extra = f"\n- 추가 지시: {extra_prompt}" if extra_prompt else ""
        return f"""당신은 한국 쇼핑몰 브랜드 디자이너입니다.
아래 시안 정보를 보고 어울리는 컬러 팔레트와 카피, 블록 순서를 제안하세요.

[시안]
- preset: {preset_id or "(미지정)"}
- 현재 블록: {blocks_str}
- 쇼핑몰 이름: {shop_name or "(미지정)"}{extra}

[출력 형식] 반드시 아래 JSON 형식으로만 답변:
{{
  "theme": {{
    "primary_color": "#HEX", "accent_color": "#HEX",
    "background_color": "#HEX", "text_color": "#HEX",
    "font_family": "...", "tone": "modern|playful|minimal|bold"
  }},
  "hero_headline": "...",
  "hero_subcopy": "...",
  "hero_cta": "...",
  "section_copy": {{ "featured-products": "...", "category-grid": "..." }},
  "recommended_blocks": ["hero", "featured-products", ...]
}}"""

    # ─────────────────────────────────────────────────────
    # 리뷰 분석 — 감정/요약/답글 초안
    # ─────────────────────────────────────────────────────

    async def analyze_review(self, content: str, rating: int) -> ReviewAnalysisResult:
        """
        리뷰 본문과 별점을 받아 {sentiment, summary, draft_reply}를 만든다.

        - Mock: 별점 기반 폴백 (샘플 HTML의 catch 블록 로직 그대로).
        - Real: Gemini에 본문+별점 보내 JSON으로 응답 받음.
        """
        if self.use_mock:
            logger.info(f"[MOCK] 리뷰 분석: rating={rating}")
            return self._mock_analyze_review(content, rating)

        logger.info(f"[REAL] Gemini 리뷰 분석: rating={rating}")
        return await self._real_analyze_review(content, rating)

    async def regenerate_review_reply(
        self,
        content: str,
        rating: int,
        prev_reply: str | None = None,
    ) -> str:
        """답글만 새로 한 문장 생성한다."""
        if self.use_mock:
            return self._mock_review_reply(rating)

        return await self._real_regenerate_reply(content, rating, prev_reply)

    def _mock_analyze_review(self, content: str, rating: int) -> ReviewAnalysisResult:
        """키 없이도 동작하는 폴백 — 별점 1~2 부정, 3 중립, 4~5 긍정."""
        if rating >= 4:
            sentiment, summary = "pos", "만족한 고객"
        elif rating == 3:
            sentiment, summary = "neu", "보통 반응"
        else:
            sentiment, summary = "neg", "불만 고객"
        return ReviewAnalysisResult(
            sentiment=sentiment,
            summary=summary,
            draft_reply=self._mock_review_reply(rating),
        )

    @staticmethod
    def _mock_review_reply(rating: int) -> str:
        if rating >= 4:
            return "소중한 리뷰 감사드립니다! 앞으로도 좋은 상품으로 보답할게요 😊"
        if rating == 3:
            return "리뷰 감사드립니다. 더 나은 서비스로 개선하겠습니다!"
        return "불편을 드려 정말 죄송합니다. 빠르게 해결해드리겠습니다."

    async def _real_analyze_review(self, content: str, rating: int) -> ReviewAnalysisResult:
        from google.genai import types

        prompt = self._build_review_prompt(content, rating)
        response = await self._genai_client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=self.max_tokens),
        )
        raw = response.text or ""
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start == -1 or end == 0:
                raise ValueError("응답에서 JSON을 찾을 수 없음")
            parsed = json.loads(raw[start:end])
            sentiment = str(parsed.get("sentiment") or "neu").strip().lower()
            if sentiment not in {"pos", "neu", "neg"}:
                sentiment = "neu"
            return ReviewAnalysisResult(
                sentiment=sentiment,
                summary=str(parsed.get("summary") or "").strip()[:60],
                draft_reply=str(parsed.get("draft_reply") or "").strip(),
            )
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            logger.warning(f"리뷰 분석 응답 파싱 실패: {e} → mock 폴백")
            return self._mock_analyze_review(content, rating)

    async def _real_regenerate_reply(
        self,
        content: str,
        rating: int,
        prev_reply: str | None,
    ) -> str:
        from google.genai import types

        prev = f"\n- 이전 답글(피해서 새로 작성): {prev_reply}" if prev_reply else ""
        prompt = (
            f"별점 {rating}점 리뷰: \"{content}\"\n"
            f"위 리뷰에 대한 사장님 답글을 40자 내외, 친근하고 따뜻하게 새로 한 줄 써줘. "
            f"답글 본문만 출력해. 따옴표·접두어 금지.{prev}"
        )
        response = await self._genai_client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=300),
        )
        text = (response.text or "").strip()
        # JSON/코드펜스 잔재 제거
        for token in ("```json", "```"):
            text = text.replace(token, "")
        text = text.strip().strip('"').strip("'").strip()
        return text or self._mock_review_reply(rating)

    @staticmethod
    def _build_review_prompt(content: str, rating: int) -> str:
        return f"""당신은 한국 쇼핑몰 사장님을 돕는 CX 보조 AI입니다.
아래 고객 리뷰를 분석해서 감정/한줄요약/답글초안을 JSON 으로 만드세요.

[리뷰]
- 별점: {rating}점
- 본문: \"\"\"{content}\"\"\"

[감정 기준]
- 별점은 참고만 하고 본문 내용을 우선합니다. (5점이어도 본문이 부정이면 neg)
- pos: 만족/추천/재구매 의사 등 긍정 신호 우세
- neg: 불만/환불/품질불만/배송불만 등 부정 신호 우세
- neu: 그 외 또는 양가적

[작성 규칙]
- summary: 사장님이 한눈에 알아볼 수 있는 15자 이내 한 줄 요약
- draft_reply: 40자 내외, 친근하고 따뜻한 사장님 톤. 고객 이름은 넣지 않음. 이모지는 최대 1개.

[출력 형식] 반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트 금지:
{{
  "sentiment": "pos | neu | neg",
  "summary": "한 줄 요약",
  "draft_reply": "답글 초안"
}}"""

    def _parse_response(self, raw_response: str, product_name: str) -> AIGenerationResult:
        try:
            start = raw_response.find("{")
            end = raw_response.rfind("}") + 1

            if start == -1 or end == 0:
                raise ValueError("응답에서 JSON을 찾을 수 없음")

            parsed = json.loads(raw_response[start:end])

            return AIGenerationResult(
                ai_description=parsed["ai_description"],
                ai_tags=parsed["ai_tags"],
            )

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Claude 응답 파싱 실패 ({product_name}): {e}. 기본값 사용.")
            return AIGenerationResult(
                ai_description=f"{product_name} 상품 상세페이지 (AI 생성 실패 - 수동 입력 필요)",
                ai_tags=["미분류"],
            )


# 모듈-레벨 싱글톤: AIService는 유저별 상태가 없어 공유해도 안전하다.
# REAL 모드에서 genai 클라이언트를 매 요청마다 새로 초기화하지 않도록 1회만 생성한다.
_ai_service: "AIService | None" = None


def get_ai_service() -> "AIService":
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
