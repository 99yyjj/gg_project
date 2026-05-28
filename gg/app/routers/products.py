"""
상품 CRUD (Cafe24 직통, 소유권은 우리 DB).

엔드포인트:
    GET    /products                  - 내 상품 목록 (로그인 유저 소유 상품만)
    GET    /products/{product_no}     - 내 상품 단건
    POST   /products                  - 신규 등록 (이미지 파일 포함 가능)
    PUT    /products/{product_no}     - 내 상품 수정 (이미지 파일 포함 가능)
    DELETE /products/{product_no}     - 내 상품 삭제 → 소유권 제거

이미지 업로드 흐름은 내부적으로 2단계로 동작한다.
    1) Cafe24 POST /products  → product_no 발급
    2) Cafe24 POST /products/{product_no}/images  → 이미지 부착
사용자(프론트)는 한 번의 요청으로 동시에 처리되는 것처럼 인지한다.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, make_cafe24_client
from app.models.user import User
from app.schemas.product import (
    AdditionalImage,
    AdditionalImageListResponse,
    AdditionalImageMutationResponse,
    ProductCreateRequest,
    ProductDeleteResponse,
    ProductListResponse,
    ProductMutationResponse,
    ProductSummary,
    ProductUpdateRequest,
)
from app.services.product_service import ImagePart, ProductService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["상품 관리"])

# Cafe24 API 오류(httpx.HTTPStatusError)와 권한 오류(PermissionError)는
# app/core/errors.py의 전역 예외 핸들러가 일관되게 HTTP 응답으로 변환한다.


async def _read_image_file(
    file: Optional[UploadFile],
    field_name: str,
) -> Optional[ImagePart]:
    """업로드 파일을 검증하고 (bytes, filename)으로 반환. 비어있으면 None."""
    if file is None or not file.filename:
        return None
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name}: 이미지 파일만 업로드 가능합니다. (받은 타입: {file.content_type})",
        )
    body = await file.read()
    if len(body) == 0:
        raise HTTPException(status_code=400, detail=f"{field_name}: 빈 파일입니다.")
    return body, file.filename


@router.get("/", response_model=ProductListResponse, summary="내 상품 목록")
async def list_products(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductListResponse:
    service = ProductService(db, make_cafe24_client(current_user, db))
    items = await service.list_products(current_user.id, limit, offset)
    return ProductListResponse(items=items, limit=limit, offset=offset)


@router.get("/{product_no}", response_model=ProductSummary, summary="내 상품 단건 조회")
async def get_product(
    product_no: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductSummary:
    service = ProductService(db, make_cafe24_client(current_user, db))
    product = await service.get_product(current_user.id, product_no)
    if not product:
        raise HTTPException(status_code=404, detail="해당 상품을 찾을 수 없습니다.")
    return product


@router.post(
    "/",
    response_model=ProductMutationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="신규 상품 등록",
    description=(
        "상품 정보와 이미지 파일을 함께 등록합니다. "
        "내부적으로 Cafe24에 상품을 먼저 생성하고, 발급된 product_no에 즉시 이미지를 부착합니다. "
        "이미지 부착이 실패하더라도 상품 자체는 등록 상태로 유지됩니다 (응답의 warnings 참고)."
    ),
)
async def create_product(
    product_name: str = Form(..., description="상품명"),
    price: float = Form(..., gt=0, description="판매가"),
    supply_price: Optional[float] = Form(None, description="공급가 (생략 시 판매가와 동일)"),
    summary_description: Optional[str] = Form(None, description="간략 설명 (상품 상단 노출)"),
    description: str = Form(..., description="마케팅 상세 문구 (HTML 가능)"),
    category_no: Optional[int] = Form(None, description="카테고리 번호"),
    display: str = Form("T", description="진열 여부: T(진열) / F(미진열)"),
    selling: str = Form("T", description="판매 여부: T(판매) / F(판매안함)"),
    tags: list[str] = Form(default=[], description="검색 키워드(태그) — 여러 개 반복 전송"),
    detail_image_file: Optional[UploadFile] = File(
        None, description="대표(상세) 이미지 파일 — 업로드 시 Cafe24 CDN에 저장됩니다"
    ),
    list_image_file: Optional[UploadFile] = File(
        None, description="목록 이미지 파일 — 업로드 시 Cafe24 CDN에 저장됩니다"
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductMutationResponse:
    detail_part = await _read_image_file(detail_image_file, "detail_image_file")
    list_part = await _read_image_file(list_image_file, "list_image_file")

    request = ProductCreateRequest(
        product_name=product_name,
        price=price,
        supply_price=supply_price,
        summary_description=summary_description,
        description=description,
        category_no=category_no,
        display=display,
        selling=selling,
        tags=tags,
    )

    service = ProductService(db, make_cafe24_client(current_user, db))
    created, warnings = await service.create_product(
        current_user.id, request, detail_part, list_part
    )

    return ProductMutationResponse(
        product=created,
        message=f"'{created.product_name}' 상품이 Cafe24에 등록되었습니다. (product_no={created.product_no})",
        warnings=warnings,
    )


@router.put(
    "/{product_no}",
    response_model=ProductMutationResponse,
    summary="내 상품 수정",
    description=(
        "수정할 필드만 전송하면 됩니다. "
        "이미지 파일을 첨부하면 Cafe24에 업로드 후 해당 상품의 이미지가 교체됩니다."
    ),
)
async def update_product(
    product_no: int,
    product_name: Optional[str] = Form(None, description="상품명"),
    price: Optional[float] = Form(None, gt=0, description="판매가"),
    supply_price: Optional[float] = Form(None, gt=0, description="공급가"),
    summary_description: Optional[str] = Form(None, description="간략 설명 (상품 상단 노출)"),
    description: Optional[str] = Form(None, description="마케팅 상세 문구 (HTML 가능)"),
    category_no: Optional[int] = Form(None, description="카테고리 번호"),
    display: Optional[str] = Form(None, description="진열 여부: T / F"),
    selling: Optional[str] = Form(None, description="판매 여부: T / F"),
    tags: Optional[list[str]] = Form(None, description="검색 키워드(태그) — 여러 개 반복 전송"),
    delete_detail_image: bool = Form(False, description="대표(상세) 이미지 삭제 여부"),
    delete_list_image: bool = Form(False, description="목록 이미지 삭제 여부"),
    detail_image_file: Optional[UploadFile] = File(
        None, description="대표(상세) 이미지 교체 파일 — 첨부 시 기존 이미지를 대체합니다"
    ),
    list_image_file: Optional[UploadFile] = File(
        None, description="목록 이미지 교체 파일 — 첨부 시 기존 이미지를 대체합니다"
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductMutationResponse:
    detail_part = await _read_image_file(detail_image_file, "detail_image_file")
    list_part = await _read_image_file(list_image_file, "list_image_file")

    request = ProductUpdateRequest(
        product_name=product_name,
        price=price,
        supply_price=supply_price,
        summary_description=summary_description,
        description=description,
        category_no=category_no,
        display=display,
        selling=selling,
        tags=tags,
        delete_detail_image=delete_detail_image,
        delete_list_image=delete_list_image,
    )

    service = ProductService(db, make_cafe24_client(current_user, db))
    updated, warnings = await service.update_product(
        current_user.id, product_no, request, detail_part, list_part
    )

    return ProductMutationResponse(
        product=updated,
        message=f"product_no={product_no} 상품이 수정되었습니다.",
        warnings=warnings,
    )


@router.delete(
    "/{product_no}",
    response_model=ProductDeleteResponse,
    summary="내 상품 삭제",
)
async def delete_product(
    product_no: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductDeleteResponse:
    service = ProductService(db, make_cafe24_client(current_user, db))
    await service.delete_product(current_user.id, product_no)

    return ProductDeleteResponse(
        product_no=product_no,
        message=f"product_no={product_no} 상품이 삭제되었습니다.",
    )


# ─────────── 추가(상세) 이미지 ───────────
# Cafe24 추가이미지는 안정적인 개별 번호를 주지 않으므로, 응답 URL 목록에
# 1부터 순번(additional_image_no)을 매겨 수정/삭제 시 위치 지정에 사용한다.


def _urls_to_additional_images(urls: list[str]) -> list[AdditionalImage]:
    return [
        AdditionalImage(additional_image_no=i + 1, image_url=u)
        for i, u in enumerate(urls)
    ]


@router.get(
    "/{product_no}/additionalimages",
    response_model=AdditionalImageListResponse,
    summary="상품 추가 이미지 목록",
)
async def list_additional_images(
    product_no: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdditionalImageListResponse:
    service = ProductService(db, make_cafe24_client(current_user, db))
    urls = await service.list_additional_images(current_user.id, product_no)
    return AdditionalImageListResponse(
        product_no=product_no, images=_urls_to_additional_images(urls)
    )


@router.post(
    "/{product_no}/additionalimages",
    response_model=AdditionalImageMutationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="상품 추가 이미지 등록 (다중)",
)
async def create_additional_images(
    product_no: int,
    files: list[UploadFile] = File(..., description="추가 이미지 파일 (다중)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdditionalImageMutationResponse:
    images: list[bytes] = []
    for idx, f in enumerate(files):
        part = await _read_image_file(f, f"files[{idx}]")
        if part is not None:
            images.append(part[0])
    if not images:
        raise HTTPException(status_code=400, detail="업로드할 이미지가 없습니다.")

    service = ProductService(db, make_cafe24_client(current_user, db))
    urls = await service.add_additional_images(current_user.id, product_no, images)
    return AdditionalImageMutationResponse(
        product_no=product_no,
        images=_urls_to_additional_images(urls),
        message=f"추가 이미지 {len(images)}장을 등록했습니다.",
    )


@router.put(
    "/{product_no}/additionalimages/{additional_image_no}",
    response_model=AdditionalImageMutationResponse,
    summary="상품 추가 이미지 수정 (단일)",
)
async def update_additional_image(
    product_no: int,
    additional_image_no: int,
    file: UploadFile = File(..., description="교체할 추가 이미지 파일"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdditionalImageMutationResponse:
    part = await _read_image_file(file, "file")
    if part is None:
        raise HTTPException(status_code=400, detail="이미지 파일이 필요합니다.")

    service = ProductService(db, make_cafe24_client(current_user, db))
    await service.update_additional_image(
        current_user.id, product_no, additional_image_no, part[0]
    )
    urls = await service.list_additional_images(current_user.id, product_no)
    return AdditionalImageMutationResponse(
        product_no=product_no,
        images=_urls_to_additional_images(urls),
        message="추가 이미지를 수정했습니다.",
    )


@router.delete(
    "/{product_no}/additionalimages/{additional_image_no}",
    response_model=AdditionalImageMutationResponse,
    summary="상품 추가 이미지 삭제",
)
async def delete_additional_image(
    product_no: int,
    additional_image_no: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdditionalImageMutationResponse:
    service = ProductService(db, make_cafe24_client(current_user, db))
    await service.delete_additional_image(
        current_user.id, product_no, additional_image_no
    )
    urls = await service.list_additional_images(current_user.id, product_no)
    return AdditionalImageMutationResponse(
        product_no=product_no,
        images=_urls_to_additional_images(urls),
        message="추가 이미지를 삭제했습니다.",
    )
