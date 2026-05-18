"""
SQLAlchemy 비동기 엔진과 세션 팩토리.

테이블 생성은 Alembic 마이그레이션이 담당하므로 여기서는 자동 DDL을 만들지 않는다.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
