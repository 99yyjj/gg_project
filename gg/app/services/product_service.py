"""
상품 서비스 (Cafe24 직통, 소유권은 우리 DB 관리).

- 상품 데이터(이름/가격/문구 등) → Cafe24
- 소유권(user_id ↔ product_no) → user_products 테이블

이미지 부착 흐름:
    상품 생성/수정 후 발급된 product_no로 즉시
    POST /products/{product_no}/images 를 호출해 대표/목록 이미지를 묶는다.
    사용자에게는 한 번의 등록 호출로 보이지만 내부적으로는 2단계.
"""

import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_product import UserProduct
from app.schemas.product import (
    ProductCreateRequest,
    ProductSummary,
    ProductUpdateRequest,
)
from app.services.cafe24_client import Cafe24Client

logger = logging.getLogger(__name__)

# (file_bytes, filename) — 라우터에서 검증/추출해 서비스로 넘기는 이미지 표현
ImagePart = tuple[bytes, str]


def _extract_additional_image_urls(raw: dict[str, Any]) -> list[str]:
    """Cafe24 상품 응답의 additional_image 배열 → URL 리스트."""
    items = raw.get("additional_image") or []
    urls: list[str] = []
    for it in items:
        if isinstance(it, str):
            urls.append(it)
        elif isinstance(it, dict):
            for key in ("big", "medium", "small", "image_url", "path"):
                if it.get(key):
                    urls.append(it[key])
                    break
    return urls


def _to_summary(raw: dict[str, Any]) -> ProductSummary:
    categories = raw.get("category") or []
    category_no = categories[0].get("category_no") if categories else None

    price = raw.get("price")
    try:
        price_val = float(price) if price is not None else None
    except (TypeError, ValueError):
        price_val = None

    return ProductSummary(
        product_no=raw.get("product_no"),
        product_code=raw.get("product_code"),
        product_name=raw.get("product_name", ""),
        price=price_val,
        summary_description=raw.get("summary_description"),
        description=raw.get("description"),
        detail_image=raw.get("detail_image"),
        list_image=raw.get("list_image"),
        additional_images=_extract_additional_image_urls(raw),
        display=raw.get("display"),
        selling=raw.get("selling"),
        category_no=category_no,
    )


class ProductService:
    def __init__(self, db: AsyncSession, cafe24: Cafe24Client) -> None:
        self.cafe24 = cafe24
        self.db = db

    # ─────────── 소유권 조회 헬퍼 ───────────

    async def _owned_nos(self, user_id: int, limit: int, offset: int) -> list[int]:
        result = await self.db.execute(
            select(UserProduct.product_no)
            .where(UserProduct.user_id == user_id)
            .order_by(UserProduct.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [row[0] for row in result.fetchall()]

    async def _check_owner(self, user_id: int, product_no: int) -> UserProduct | None:
        result = await self.db.execute(
            select(UserProduct).where(
                UserProduct.user_id == user_id,
                UserProduct.product_no == product_no,
            )
        )
        return result.scalar_one_or_none()

    # ─────────── 조회 ───────────

    async def list_products(
        self, user_id: int, limit: int = 20, offset: int = 0
    ) -> list[ProductSummary]:
        nos = await self._owned_nos(user_id, limit, offset)
        if not nos:
            return []
        raw_list = await self.cafe24.get_products_by_nos(nos)
        # Cafe24 응답 순서가 다를 수 있으므로 등록 순(nos 순서)으로 정렬
        order = {no: i for i, no in enumerate(nos)}
        raw_list.sort(key=lambda r: order.get(r.get("product_no", 0), 999))
        return [_to_summary(r) for r in raw_list]

    async def get_product(
        self, user_id: int, product_no: int
    ) -> ProductSummary | None:
        if not await self._check_owner(user_id, product_no):
            return None
        raw = await self.cafe24.get_product(product_no)
        if not raw:
            return None
        return _to_summary(raw)

    # ─────────── 이미지 부착 (공용) ───────────

    async def _attach_images(
        self,
        product_no: int,
        raw_product: dict[str, Any],
        detail_image: ImagePart | None,
        list_image: ImagePart | None,
    ) -> list[str]:
        """
        product_no에 이미지를 부착하고, raw_product 안의 image URL을 갱신한다.
        실패 시 경고 메시지 리스트를 반환 (상품 자체는 살림).
        """
        if detail_image is None and list_image is None:
            return []

        try:
            attached = await self.cafe24.upload_product_image(
                product_no,
                detail_image[0] if detail_image else None,
                list_image[0] if list_image else None,
            )
        except httpx.HTTPStatusError as e:
            body = e.response.text[:300] if e.response is not None else ""
            logger.error(
                f"이미지 부착 실패 product_no={product_no} status={e.response.status_code}: {body}"
            )
            return [
                f"상품은 등록되었으나 이미지 업로드에 실패했습니다 "
                f"(product_no={product_no}). 수정 화면에서 이미지만 다시 올려주세요."
            ]
        except Exception as e:
            logger.exception(f"이미지 부착 중 예기치 못한 오류 product_no={product_no}")
            return [
                f"상품은 등록되었으나 이미지 업로드 중 오류가 발생했습니다 "
                f"(product_no={product_no}): {e}"
            ]

        # 응답에서 갱신된 URL을 raw_product에 머지 (응답 ProductSummary에 반영)
        if attached.get("detail_image"):
            raw_product["detail_image"] = attached["detail_image"]
        if attached.get("list_image"):
            raw_product["list_image"] = attached["list_image"]
        return []

    async def _attach_tags(self, product_no: int, tags: list[str] | None) -> list[str]:
        """검색 키워드(태그)를 부착한다. 실패해도 상품은 살리고 경고만 반환."""
        clean = [t.strip() for t in (tags or []) if t and t.strip()]
        if not clean:
            return []
        try:
            await self.cafe24.set_product_tags(product_no, clean)
            return []
        except Exception as e:
            logger.warning(f"태그 저장 실패 product_no={product_no}: {e}")
            return [
                f"상품은 저장됐지만 키워드(태그) 저장에 실패했습니다 "
                f"(product_no={product_no}). 수정 화면에서 다시 시도해 주세요."
            ]

    # ─────────── 등록 ───────────

    async def create_product(
        self,
        user_id: int,
        request: ProductCreateRequest,
        detail_image: ImagePart | None = None,
        list_image: ImagePart | None = None,
    ) -> tuple[ProductSummary, list[str]]:
        supply_price = (
            request.supply_price if request.supply_price is not None else request.price
        )

        payload: dict[str, Any] = {
            "product_name": request.product_name,
            "price": str(int(request.price)),
            "supply_price": str(int(supply_price)),
            "description": request.description,
            "display": request.display,
            "selling": request.selling,
        }
        if request.summary_description is not None:
            payload["summary_description"] = request.summary_description
        if request.category_no:
            payload["category"] = [{"category_no": request.category_no}]

        # 1단계: 이미지 없이 상품 생성
        created = await self.cafe24.create_product(payload)
        product_no = created.get("product_no")

        # 소유권 즉시 기록 — 이미지 단계에서 실패해도 사용자 DB엔 상품이 남음
        self.db.add(UserProduct(user_id=user_id, product_no=product_no))
        await self.db.commit()

        # 2단계: 이미지 부착 (필요한 경우)
        warnings = await self._attach_images(product_no, created, detail_image, list_image)

        # 3단계: 검색 키워드(태그) 부착 (필요한 경우)
        warnings += await self._attach_tags(product_no, request.tags)

        return _to_summary(created), warnings

    # ─────────── 수정 ───────────

    async def update_product(
        self,
        user_id: int,
        product_no: int,
        request: ProductUpdateRequest,
        detail_image: ImagePart | None = None,
        list_image: ImagePart | None = None,
    ) -> tuple[ProductSummary, list[str]]:
        if not await self._check_owner(user_id, product_no):
            raise PermissionError(f"product_no={product_no}에 대한 권한이 없습니다.")

        payload: dict[str, Any] = {}
        if request.product_name is not None:
            payload["product_name"] = request.product_name
        if request.price is not None:
            payload["price"] = str(int(request.price))
        if request.supply_price is not None:
            payload["supply_price"] = str(int(request.supply_price))
        if request.summary_description is not None:
            payload["summary_description"] = request.summary_description
        if request.description is not None:
            payload["description"] = request.description
        if request.display is not None:
            payload["display"] = request.display
        if request.selling is not None:
            payload["selling"] = request.selling
        if request.category_no is not None:
            payload["category"] = [{"category_no": request.category_no}]

        # 이미지 삭제: 새 파일이 없는 슬롯에 대해서만 빈 문자열로 클리어
        # (새 파일이 있다면 _attach_images에서 교체되므로 삭제 플래그는 무시)
        if request.delete_detail_image and detail_image is None:
            payload["detail_image"] = ""
        if request.delete_list_image and list_image is None:
            payload["list_image"] = ""

        # 1단계: 텍스트 필드 갱신 (없으면 조회만)
        if payload:
            updated = await self.cafe24.update_product(product_no, payload)
        else:
            updated = await self.cafe24.get_product(product_no)

        # 2단계: 이미지 부착 (필요한 경우)
        warnings = await self._attach_images(product_no, updated, detail_image, list_image)

        # 3단계: 검색 키워드(태그) 부착 (비어있지 않을 때만 — 기존 태그 보존)
        warnings += await self._attach_tags(product_no, request.tags)

        return _to_summary(updated), warnings

    # ─────────── 추가(상세) 이미지 ───────────

    async def _ensure_owner(self, user_id: int, product_no: int) -> None:
        if not await self._check_owner(user_id, product_no):
            raise PermissionError(f"product_no={product_no}에 대한 권한이 없습니다.")

    async def list_additional_images(
        self, user_id: int, product_no: int
    ) -> list[str]:
        await self._ensure_owner(user_id, product_no)
        return await self.cafe24.get_additional_images(product_no)

    async def add_additional_images(
        self, user_id: int, product_no: int, images: list[bytes]
    ) -> list[str]:
        await self._ensure_owner(user_id, product_no)
        return await self.cafe24.create_additional_images(product_no, images)

    async def update_additional_image(
        self, user_id: int, product_no: int, additional_image_no: int, image: bytes
    ) -> str | None:
        await self._ensure_owner(user_id, product_no)
        return await self.cafe24.update_additional_image(
            product_no, additional_image_no, image
        )

    async def delete_additional_image(
        self, user_id: int, product_no: int, additional_image_no: int
    ) -> bool:
        await self._ensure_owner(user_id, product_no)
        return await self.cafe24.delete_additional_image(product_no, additional_image_no)

    # ─────────── 삭제 ───────────

    async def delete_product(self, user_id: int, product_no: int) -> bool:
        ownership = await self._check_owner(user_id, product_no)
        if not ownership:
            raise PermissionError(f"product_no={product_no}에 대한 권한이 없습니다.")

        await self.cafe24.delete_product(product_no)

        await self.db.delete(ownership)
        await self.db.commit()
        return True
