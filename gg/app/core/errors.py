"""
전역 예외 핸들러.

라우터마다 Cafe24 오류/권한 오류 처리가 제각각이던 것을 한곳으로 모은다.
- httpx.HTTPStatusError: Cafe24 API 호출 실패 → 상태코드별로 매핑
    - 404 → 404 (해당 리소스 없음)
    - 401/403 → 503 (Cafe24 OAuth 미인증/만료: 먼저 로그인 필요)
    - 그 외 → 502 (Cafe24 게이트웨이 오류)
- PermissionError: 소유권 없는 리소스 접근 → 403

손님화면(shop.py)처럼 자체적으로 graceful 폴백을 하는 엔드포인트는 라우터 내부에서
직접 try/except로 잡으므로 이 핸들러까지 전파되지 않는다.
"""

import logging

import httpx
from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def httpx_status_error_handler(
    request: Request, exc: httpx.HTTPStatusError
) -> JSONResponse:
    code = exc.response.status_code
    if code == 404:
        return JSONResponse(
            status_code=404,
            content={"detail": "해당 상품을 찾을 수 없습니다."},
        )
    if code in (401, 403):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": "Cafe24 인증에 실패했습니다. "
                "/auth/cafe24/login 으로 OAuth 인증을 먼저 진행하세요."
            },
        )
    body = exc.response.text[:200] if exc.response is not None else ""
    logger.error(f"Cafe24 API 오류({code}) {request.method} {request.url.path}: {body}")
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": f"Cafe24 API 오류({code}): {body}"},
    )


async def permission_error_handler(
    request: Request, exc: PermissionError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": str(exc) or "해당 리소스에 대한 권한이 없습니다."},
    )
