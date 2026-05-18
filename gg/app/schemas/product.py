"""
상품 송수신 스키마 (Cafe24와 직접 통신, 우리 DB 저장 없음).

이 스키마는 Cafe24 API의 페이로드/응답을 우리 시스템에서 다루기 좋게 정리한 형태이며
사용자가 등록·수정·조회 시 주고받는 데이터 구조이다.
"""

from typing import Optional

from pydantic import BaseModel, Field


class ProductSummary(BaseModel):
    """목록/단건 조회 응답."""
    product_no: int
    product_code: Optional[str] = None
    product_name: str
    price: Optional[float] = None
    description: Optional[str] = None
    detail_image: Optional[str] = None
    list_image: Optional[str] = None
    display: Optional[str] = None
    selling: Optional[str] = None
    category_no: Optional[int] = None


class ProductListResponse(BaseModel):
    items: list[ProductSummary]
    limit: int
    offset: int


class ProductCreateRequest(BaseModel):
    """신규 등록 시 사용자가 보내는 페이로드 (이미지는 별도 multipart 파일로 전달)."""
    product_name: str = Field(..., description="상품명")
    price: float = Field(..., gt=0, description="판매가")
    supply_price: Optional[float] = Field(None, description="공급가 (생략 시 판매가와 동일)")
    description: str = Field(..., description="마케팅 상세 문구 (HTML 가능)")
    category_no: Optional[int] = Field(None, description="카테고리 번호")
    display: str = Field("T", description="진열: T/F")
    selling: str = Field("T", description="판매: T/F")


class ProductUpdateRequest(BaseModel):
    """수정 시 보낼 수 있는 필드 (모두 선택, 이미지는 별도 multipart 파일로 전달)."""
    product_name: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    supply_price: Optional[float] = Field(None, gt=0)
    description: Optional[str] = None
    category_no: Optional[int] = None
    display: Optional[str] = None
    selling: Optional[str] = None
    delete_detail_image: bool = Field(False, description="대표(상세) 이미지 삭제 여부")
    delete_list_image: bool = Field(False, description="목록 이미지 삭제 여부")


class ProductMutationResponse(BaseModel):
    """등록/수정 완료 시 반환하는 응답."""
    product: ProductSummary
    message: str
    warnings: list[str] = Field(
        default_factory=list,
        description="상품은 처리됐지만 부수 작업(이미지 등)에서 문제가 있었을 때의 경고 메시지",
    )


class ProductDeleteResponse(BaseModel):
    product_no: int
    message: str
