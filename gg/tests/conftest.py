"""
공용 테스트 픽스처.

- 인메모리 SQLite(async) 엔진 + 테이블 생성
- get_db 의존성을 테스트 세션으로 교체한 httpx 기반 client
- 유저 생성 / JWT 발급 헬퍼

주의: pytest는 gg/ 디렉터리에서 실행한다(.env의 CAFE24_* 필수값 로드용).
"""

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base
from app.core.security import create_access_token, hash_password
from app.deps import get_db, get_session_maker
from app.main import app
from app.models.user import User

# 모델 메타데이터가 모두 등록되도록 import (create_all용).
# 주의: `import app.models.user_product`는 이름 `app`을 패키지로 재바인딩해
# FastAPI 인스턴스를 가려버리므로 from-import로 가져온다.
from app.models.user_product import UserProduct  # noqa: F401
from app.models.review import Review  # noqa: F401
from app.models.order import Order, OrderItem  # noqa: F401


@pytest_asyncio.fixture
async def session_maker():
    # StaticPool + 단일 :memory: 연결 → 여러 세션이 같은 DB를 공유
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    yield maker
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(session_maker):
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(session_maker, monkeypatch):
    # 테스트 환경은 항상 Mock AI 모드 — 외부 Gemini 호출 금지.
    # ai_service 싱글톤이 이미 만들어졌을 수 있으니 리셋한다.
    monkeypatch.setattr(settings, "USE_MOCK_AI", True)
    import app.services.ai_service as ai_mod
    monkeypatch.setattr(ai_mod, "_ai_service", None)

    async def _override_get_db():
        async with session_maker() as session:
            yield session

    def _override_get_session_maker():
        return session_maker

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_session_maker] = _override_get_session_maker
    transport = ASGITransport(app=app)
    # 백엔드 API는 모두 /api prefix 아래에 있으므로 base_url에 /api를 포함한다.
    # (Cafe24 OAuth 경로 /auth/cafe24/* 만 prefix 없이 노출되며, 테스트에선 호출 안 함)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_user(db_session):
    async def _make(username: str = "boss", with_tokens: bool = True, **kwargs) -> User:
        user = User(
            email=kwargs.get("email", f"{username}@test.local"),
            username=username,
            password_hash=hash_password("pw-test-1234"),
            shop_name=kwargs.get("shop_name", f"{username} 샵"),
            cafe24_mall_id=kwargs.get("cafe24_mall_id", username),
            cafe24_access_token="access-tok" if with_tokens else None,
            cafe24_refresh_token="refresh-tok" if with_tokens else None,
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return _make


@pytest.fixture
def auth_headers():
    """해당 유저의 access JWT를 담은 Authorization 헤더를 만드는 헬퍼."""

    def _headers(user: User) -> dict[str, str]:
        token = create_access_token(user.id, user.username)
        return {"Authorization": f"Bearer {token}"}

    return _headers
