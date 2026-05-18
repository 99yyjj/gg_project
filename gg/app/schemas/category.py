from typing import Optional
from pydantic import BaseModel, Field


class CategoryResponse(BaseModel):
    category_no: int = Field(..., description="카테고리 번호")
    category_name: str = Field(..., description="카테고리 이름")
    parent_category_no: Optional[int] = Field(None, description="상위 카테고리 번호 (최상위면 None)")
    depth: Optional[int] = Field(None, description="카테고리 depth (1=대분류, 2=중분류...)")


class CategoryListResponse(BaseModel):
    items: list[CategoryResponse]
    total: int
