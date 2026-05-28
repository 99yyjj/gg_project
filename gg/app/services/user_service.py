"""
회원 가입/조회/인증 비즈니스 로직.
"""

import logging
import secrets
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import SignupRequest

logger = logging.getLogger(__name__)


class UserAlreadyExistsError(Exception):
    """이메일 또는 username이 이미 존재할 때."""


class InvalidCredentialsError(Exception):
    """로그인 실패 (아이디/비번 불일치, 비활성 계정 포함)."""


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        return await self.db.get(User, user_id)

    async def get_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, value: str) -> Optional[User]:
        stmt = select(User).where(or_(User.username == value, User.email == value))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def signup(self, request: SignupRequest) -> User:
        # 중복 검사
        stmt = select(User).where(
            or_(User.email == request.email, User.username == request.username)
        )
        existing = (await self.db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            field = "email" if existing.email == request.email else "username"
            raise UserAlreadyExistsError(f"이미 사용 중인 {field}입니다.")

        user = User(
            email=str(request.email),
            username=request.username,
            password_hash=hash_password(request.password),
            full_name=request.full_name,
            phone=request.phone,
            shop_name=request.shop_name,
            cafe24_mall_id=request.cafe24_mall_id,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        logger.info(f"신규 회원 가입: id={user.id}, username={user.username}")
        return user

    async def update_profile(self, user: User, shop_name: Optional[str]) -> User:
        """내 정보 수정 — 현재는 쇼핑몰 이름만 갱신한다."""
        if shop_name is not None:
            user.shop_name = shop_name
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def get_or_create_cafe24_user(self, mall_id: str) -> User:
        """Cafe24 OAuth 로그인용. mall_id로 기존 사용자 조회 후 없으면 자동 생성."""
        result = await self.db.execute(
            select(User).where(User.cafe24_mall_id == mall_id)
        )
        user = result.scalar_one_or_none()
        if user:
            return user

        # 새 계정 생성 (이메일·비밀번호 없이 OAuth 전용)
        placeholder_email = f"{mall_id}@cafe24.auth"
        username = mall_id

        # username 충돌 방지
        existing_username = await self.db.execute(
            select(User).where(User.username == username)
        )
        if existing_username.scalar_one_or_none():
            username = f"cafe24_{mall_id}"

        user = User(
            email=placeholder_email,
            username=username,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            shop_name=mall_id,
            cafe24_mall_id=mall_id,
            is_active=True,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        logger.info(f"Cafe24 OAuth 신규 사용자 생성: mall_id={mall_id}, id={user.id}")
        return user

    async def set_cafe24_tokens(
        self, user: User, access_token: str, refresh_token: str, mall_id: str
    ) -> User:
        """OAuth 콜백에서 받은 Cafe24 토큰을 해당 유저 row에 저장 (멀티테넌트)."""
        user.cafe24_access_token = access_token
        user.cafe24_refresh_token = refresh_token
        if mall_id and not user.cafe24_mall_id:
            user.cafe24_mall_id = mall_id
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def authenticate(self, username_or_email: str, password: str) -> User:
        user = await self.get_by_username_or_email(username_or_email)
        if user is None:
            raise InvalidCredentialsError("아이디 또는 비밀번호가 일치하지 않습니다.")
        if not user.is_active:
            raise InvalidCredentialsError("비활성화된 계정입니다.")
        if not verify_password(password, user.password_hash):
            raise InvalidCredentialsError("아이디 또는 비밀번호가 일치하지 않습니다.")
        return user
