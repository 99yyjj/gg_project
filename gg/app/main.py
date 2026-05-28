"""
GG FastAPI 앱 엔트리포인트.

실행:
    uvicorn app.main:app --reload
문서:
    http://127.0.0.1:8000/docs
"""

import logging

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.errors import httpx_status_error_handler, permission_error_handler
from app.routers import ai, auth, categories, health, products, reviews, shop, shop_template

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="GG - AI 1인 쇼핑몰 플랫폼",
    description=(
        "사장님이 상품을 등록·수정·삭제하면 Cafe24와 즉시 동기화되며, "
        "AI(Gemini)가 마케팅 문구를 자동 작성해 줍니다. "
        "회원 정보(가입자)는 본 서버 DB(PostgreSQL)에 저장됩니다."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 전역 예외 핸들러 — Cafe24 API 오류/권한 오류를 일관된 HTTP 응답으로 변환
app.add_exception_handler(httpx.HTTPStatusError, httpx_status_error_handler)
app.add_exception_handler(PermissionError, permission_error_handler)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(ai.router)
app.include_router(categories.router)
app.include_router(shop.router)
app.include_router(shop_template.router)
app.include_router(reviews.router)
