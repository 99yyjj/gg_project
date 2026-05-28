"""
OAuth 콜백 → 프론트 교환용 일회용 code 저장소.

왜 필요한가?
    Cafe24 콜백에서 발급한 우리 JWT를 URL 쿼리(?access_token=...)로 프론트에
    리다이렉트하면 토큰이 브라우저 히스토리·Referer 헤더·서버 로그에 그대로 남는다.
    대신 짧은 수명의 일회용 code만 URL로 넘기고, 프론트가 그 code를 POST로
    교환해 토큰을 받아가도록 한다. (code는 1회 사용 후 즉시 폐기)

cafe24_client 의 모듈-레벨 싱글톤과 동일한 인메모리 패턴.
단일 프로세스 기준으로 동작하며, 다중 워커/재시작 시에는 code가 유실될 수 있으나
TTL 120초 내 즉시 교환되는 흐름이므로 MVP 범위에서 충분하다.
"""

import secrets
import time

# code → (access_token, refresh_token, expiry_epoch)
_store: dict[str, tuple[str, str, float]] = {}

# 일회용 code 유효 시간(초). 콜백 직후 프론트가 곧바로 교환하므로 짧게 둔다.
_TTL_SECONDS = 120


def _purge_expired(now: float) -> None:
    """만료된 code를 정리한다."""
    expired = [c for c, (_, _, exp) in _store.items() if exp <= now]
    for c in expired:
        _store.pop(c, None)


def issue_code(access_token: str, refresh_token: str) -> str:
    """토큰 쌍을 저장하고 일회용 code를 발급한다."""
    now = time.time()
    _purge_expired(now)
    code = secrets.token_urlsafe(32)
    _store[code] = (access_token, refresh_token, now + _TTL_SECONDS)
    return code


def consume_code(code: str) -> tuple[str, str] | None:
    """
    code를 1회용으로 소비한다.

    Returns:
        (access_token, refresh_token) — 유효한 경우
        None — 존재하지 않거나 만료된 경우
    """
    entry = _store.pop(code, None)
    if entry is None:
        return None
    access_token, refresh_token, expiry = entry
    if expiry <= time.time():
        return None
    return access_token, refresh_token
