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

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.product import (
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


def _http_error_to_http_exception(e: httpx.HTTPStatusError) -> HTTPException:
    code = e.response.status_code
    if code == 404:
        return HTTPException(status_code=404, detail="해당 상품을 찾을 수 없습니다.")
    if code in (401, 403):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cafe24 인증에 실패했습니다. /auth/cafe24/login 으로 OAuth 인증을 먼저 진행하세요.",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Cafe24 API 오류({code}): {e.response.text[:200]}",
    )


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
    try:
        items = await ProductService(db).list_products(current_user.id, limit, offset)
    except httpx.HTTPStatusError as e:
        raise _http_error_to_http_exception(e)
    return ProductListResponse(items=items, limit=limit, offset=offset)


@router.get("/{product_no}", response_model=ProductSummary, summary="내 상품 단건 조회")
async def get_product(
    product_no: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductSummary:
    try:
        product = await ProductService(db).get_product(current_user.id, product_no)
    except httpx.HTTPStatusError as e:
        raise _http_error_to_http_exception(e)
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
    description: str = Form(..., description="마케팅 상세 문구 (HTML 가능)"),
    category_no: Optional[int] = Form(None, description="카테고리 번호"),
    display: str = Form("T", description="진열 여부: T(진열) / F(미진열)"),
    selling: str = Form("T", description="판매 여부: T(판매) / F(판매안함)"),
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
        description=description,
        category_no=category_no,
        display=display,
        selling=selling,
    )

    try:
        created, warnings = await ProductService(db).create_product(
            current_user.id, request, detail_part, list_part
        )
    except httpx.HTTPStatusError as e:
        raise _http_error_to_http_exception(e)

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
    description: Optional[str] = Form(None, description="마케팅 상세 문구 (HTML 가능)"),
    category_no: Optional[int] = Form(None, description="카테고리 번호"),
    display: Optional[str] = Form(None, description="진열 여부: T / F"),
    selling: Optional[str] = Form(None, description="판매 여부: T / F"),
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
        description=description,
        category_no=category_no,
        display=display,
        selling=selling,
        delete_detail_image=delete_detail_image,
        delete_list_image=delete_list_image,
    )

    try:
        updated, warnings = await ProductService(db).update_product(
            current_user.id, product_no, request, detail_part, list_part
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise _http_error_to_http_exception(e)

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
    try:
        await ProductService(db).delete_product(current_user.id, product_no)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise _http_error_to_http_exception(e)

    return ProductDeleteResponse(
        product_no=product_no,
        message=f"product_no={product_no} 상품이 삭제되었습니다.",
    )
