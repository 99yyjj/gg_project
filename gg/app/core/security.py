"""
비밀번호 해시(bcrypt)와 JWT 발급/검증 유틸.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings


# ─────────────── bcrypt ───────────────

def hash_password(plain_password: str) -> str:
    """평문 비밀번호 → bcrypt 해시(60자 안팎) 문자열로 반환."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """입력 비밀번호가 저장된 bcrypt 해시와 일치하는지 검증."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), stored_hash.encode("utf-8"))
    except ValueError:
        return False


# ─────────────── JWT ───────────────

def _create_token(payload: dict[str, Any], expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    to_encode = {
        **payload,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, username: str) -> str:
    return _create_token(
        {"sub": str(user_id), "username": username, "type": "access"},
        timedelta(minutes=settings.JWT_ACCESS_EXPIRES_MIN),
    )


def create_refresh_token(user_id: int) -> str:
    return _create_token(
        {"sub": str(user_id), "type": "refresh"},
        timedelta(days=settings.JWT_REFRESH_EXPIRES_DAYS),
    )


def decode_token(token: str) -> dict[str, Any]:
    """
    JWT를 검증하고 payload를 반환. 만료/위변조 시 jwt.PyJWTError 계열 예외.
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
