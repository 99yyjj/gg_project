"""
더미 사용자 4명을 users 테이블에 삽입한다.

사전 조건:
    1. PostgreSQL `gg_db` 데이터베이스가 존재해야 함
    2. `alembic upgrade head` 가 실행되어 users 테이블이 만들어진 상태여야 함

비밀번호:
    레포에 평문 비밀번호를 남기지 않는다. 아래 환경 변수로 주입하고,
    미설정 시 실행 때마다 임시 비밀번호를 생성해 로그로 출력한다.
        SEED_ADMIN_PASSWORD : admin 계정 비밀번호
        SEED_USER_PASSWORD  : 나머지 일반 계정 공통 비밀번호

실행:
    cd gg/
    SEED_ADMIN_PASSWORD=... SEED_USER_PASSWORD=... python -m app.scripts.seed_users

이미 존재하는 username/email은 건너뜁니다 (중복 실행 안전).
"""

import asyncio
import logging
import os
import secrets

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_users")


DUMMY_USERS = [
    {
        "email": "admin@gg.local",
        "username": "admin",
        "full_name": "관리자",
        "phone": "010-0000-0000",
        "shop_name": "GG 본사",
        "cafe24_mall_id": None,
        "is_admin": True,
    },
    {
        "email": "kim@example.com",
        "username": "sangja_kim",
        "full_name": "김상자",
        "phone": "010-1111-2222",
        "shop_name": "김상자네 옷가게",
        "cafe24_mall_id": "kimsangja",
        "is_admin": False,
    },
    {
        "email": "lee@example.com",
        "username": "daily_lee",
        "full_name": "이데일리",
        "phone": "010-3333-4444",
        "shop_name": "데일리룩샵",
        "cafe24_mall_id": "dailylook",
        "is_admin": False,
    },
    {
        "email": "park@example.com",
        "username": "trendy_park",
        "full_name": "박트렌디",
        "phone": "010-5555-6666",
        "shop_name": "트렌디파크",
        "cafe24_mall_id": "trendypark",
        "is_admin": False,
    },
]


def _resolve_password(env_key: str) -> str:
    """
    환경 변수에서 비밀번호를 읽고, 없으면 임시 비밀번호를 생성해 로그로 알린다.
    평문 비밀번호를 소스 코드에 남기지 않기 위한 헬퍼.
    """
    pw = os.environ.get(env_key)
    if pw:
        return pw
    pw = secrets.token_urlsafe(12)
    logger.warning(f"{env_key} 미설정 → 임시 비밀번호 생성: {pw} (이 값으로 로그인하세요)")
    return pw


async def seed() -> None:
    admin_pw = _resolve_password("SEED_ADMIN_PASSWORD")
    user_pw = _resolve_password("SEED_USER_PASSWORD")

    async with AsyncSessionLocal() as session:
        for u in DUMMY_USERS:
            # 이미 있으면 건너뜀
            exists = await session.execute(
                select(User).where(User.username == u["username"])
            )
            if exists.scalar_one_or_none():
                logger.info(f"이미 존재하여 건너뜀: {u['username']}")
                continue

            password = admin_pw if u["is_admin"] else user_pw
            user = User(
                email=u["email"],
                username=u["username"],
                password_hash=hash_password(password),
                full_name=u["full_name"],
                phone=u["phone"],
                shop_name=u["shop_name"],
                cafe24_mall_id=u["cafe24_mall_id"],
                is_admin=u["is_admin"],
            )
            session.add(user)
            logger.info(f"추가: {u['username']} ({u['email']})")

        await session.commit()
        logger.info("시드 완료.")


if __name__ == "__main__":
    asyncio.run(seed())
