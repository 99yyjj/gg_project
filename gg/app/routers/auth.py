"""
회원가입/로그인/토큰 갱신/내 정보 조회 + Cafe24 OAuth 2.0 인증.
"""

import base64
import logging
import secrets
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)
from app.services.cafe24_client import get_cafe24_client
from app.services.user_service import (
    InvalidCredentialsError,
    UserAlreadyExistsError,
    UserService,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["인증"])


def _build_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.username),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.JWT_ACCESS_EXPIRES_MIN * 60,
    )


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)) -> UserResponse:
    try:
        user = await UserService(db).signup(request)
    except UserAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse, summary="로그인 (JWT 발급)")
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        user = await UserService(db).authenticate(request.username_or_email, request.password)
    except InvalidCredentialsError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return _build_token_response(user)


@router.post("/refresh", response_model=TokenResponse, summary="액세스 토큰 재발급")
async def refresh(request: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        payload = decode_token(request.refresh_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="리프레시 토큰이 만료되었습니다."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 리프레시 토큰입니다."
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="리프레시 토큰이 아닙니다."
        )

    user_id = int(payload.get("sub", 0))
    user = await UserService(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다."
        )

    return _build_token_response(user)


@router.get("/me", response_model=UserResponse, summary="내 정보 조회")
async def me(current: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current)


# ─────────── Cafe24 OAuth 2.0 ───────────

@router.get(
    "/cafe24/login",
    summary="Cafe24 OAuth 2.0 로그인 시작",
    description="Cafe24 로그인 페이지로 리다이렉트합니다. 브라우저에서 직접 접속하세요.",
    response_class=RedirectResponse,
)
async def cafe24_login() -> RedirectResponse:
    state = secrets.token_urlsafe(16)
    params = urlencode({
        "response_type": "code",
        "client_id": settings.CAFE24_CLIENT_ID,
        "state": state,
        "redirect_uri": settings.CAFE24_REDIRECT_URI,
        "scope": settings.CAFE24_SCOPES,
    })
    auth_url = f"https://{settings.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/authorize?{params}"
    return RedirectResponse(url=auth_url, status_code=302)


@router.get(
    "/cafe24/callback",
    summary="Cafe24 OAuth 2.0 콜백 처리",
    description="Cafe24가 로그인 완료 후 자동 호출하는 엔드포인트입니다. 직접 호출하지 마세요.",
    response_class=RedirectResponse,
)
async def cafe24_callback(
    code: str = Query(..., description="Cafe24가 발급한 authorization code"),
    state: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    # ① authorization code → Cafe24 access_token 교환
    credentials = f"{settings.CAFE24_CLIENT_ID}:{settings.CAFE24_CLIENT_SECRET}"
    encoded = base64.b64encode(credentials.encode()).decode()
    token_url = f"https://{settings.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                token_url,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.CAFE24_REDIRECT_URI,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        error_msg = f"Cafe24 인증 실패: {e.response.status_code}"
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error={error_msg}",
            status_code=302,
        )

    token_data = resp.json()
    cafe24_access = token_data.get("access_token", "")
    cafe24_refresh = token_data.get("refresh_token", "")
    mall_id = token_data.get("mall_id") or settings.CAFE24_MALL_ID

    # ② Cafe24 토큰을 서버에 저장
    get_cafe24_client().update_tokens(cafe24_access, cafe24_refresh)

    # ③ mall_id로 우리 DB 사용자 조회 또는 자동 생성
    user = await UserService(db).get_or_create_cafe24_user(mall_id)

    # ④ 우리 서비스의 JWT 발급
    our_access = create_access_token(user.id, user.username)
    our_refresh = create_refresh_token(user.id)

    # ⑤ 프론트엔드 콜백 페이지로 리다이렉트 (토큰을 쿼리 파라미터로 전달)
    params = urlencode({
        "access_token": our_access,
        "refresh_token": our_refresh,
    })
    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/cafe24-callback?{params}",
        status_code=302,
    )
