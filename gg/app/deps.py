"""
FastAPI 의존성 주입 함수들.
"""

from collections.abc import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User
from app.services.cafe24_client import Cafe24Client
from app.services.user_service import UserService


bearer_scheme = HTTPBearer(auto_error=False)


def make_cafe24_client(user: User, db: AsyncSession) -> Cafe24Client:
    """
    해당 유저의 토큰으로 Cafe24 클라이언트를 생성한다 (멀티테넌트).

    토큰이 갱신되면 on_token_refresh 콜백이 그 유저 row에만 새 토큰을 저장하므로,
    사장님 A의 갱신이 사장님 B의 토큰을 덮어쓰지 않는다. 유저에게 토큰이 없으면
    빈 문자열로 시작하고, 첫 호출이 401→갱신 실패로 이어져 전역 핸들러가
    503(OAuth 먼저 인증)으로 응답한다.
    """

    async def _persist(access: str, refresh: str) -> None:
        user.cafe24_access_token = access
        user.cafe24_refresh_token = refresh
        db.add(user)
        await db.commit()

    return Cafe24Client(
        mall_id=user.cafe24_mall_id or settings.CAFE24_MALL_ID,
        access_token=user.cafe24_access_token or "",
        refresh_token=user.cafe24_refresh_token or "",
        on_token_refresh=_persist,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """
    백그라운드 작업용 세션 팩토리.

    BackgroundTasks 는 요청 스코프 세션이 닫힌 뒤에 실행되므로 자체 세션을 새로 열어야 한다.
    이 의존성을 거치면 테스트에서 인메모리 SQLite 세션 팩토리로 손쉽게 교체할 수 있다.
    """
    return AsyncSessionLocal


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Authorization 헤더의 Bearer 토큰을 검증하고 현재 사용자를 반환.
    """
    token = credentials.credentials if credentials else None
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="액세스 토큰이 아닙니다.",
        )

    user_id = int(payload.get("sub", 0))
    user = await UserService(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없거나 비활성 상태입니다.",
        )

    return user
