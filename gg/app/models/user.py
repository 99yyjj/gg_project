"""
회원 가입 사용자 ORM 모델.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    # bcrypt 해시 (60자 안팎). 평문 절대 보관 금지.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shop_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cafe24_mall_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # 유저별 Cafe24 OAuth 토큰. 멀티테넌트: 요청마다 이 토큰으로 클라이언트를 만든다.
    # (전역 .env 토큰을 공유하면 사장님 A의 갱신이 B의 토큰을 덮어쓰므로 유저 row에 보관)
    cafe24_access_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    cafe24_refresh_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 쇼핑몰 빌더 — 사용자가 고른/꾸민 시안(블록 배열 + 테마 + 카피). 미설정 시 None.
    # Postgres는 JSONB, 테스트용 SQLite는 JSON으로 변형(variant)해 양쪽에서 동작.
    shop_template: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"), nullable=True
    )
    # 온보딩(쇼핑몰 꾸미기) 완료 여부. False면 로그인 후 setup 페이지로 유도.
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}')>"
