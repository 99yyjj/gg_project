"""
회원가입/로그인/토큰 갱신/내 정보 조회 + Cafe24 OAuth 2.0 인증.
"""

import base64
import logging
import secrets
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
    ExchangeRequest,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.oauth_code_store import consume_code, issue_code
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


@router.patch("/me", response_model=UserResponse, summary="내 정보 수정 (쇼핑몰 이름)")
async def update_me(
    request: UserUpdateRequest,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    user = await UserService(db).update_profile(current, request.shop_name)
    return UserResponse.model_validate(user)


# ─────────── Cafe24 OAuth 2.0 ───────────

# OAuth state를 임시 보관하는 httpOnly 쿠키 이름. 콜백에서 대조해 CSRF를 막는다.
_STATE_COOKIE = "cafe24_oauth_state"


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
    response = RedirectResponse(url=auth_url, status_code=302)
    # state를 httpOnly 쿠키에 저장 → 콜백에서 쿼리의 state와 대조(CSRF 방어).
    # 콜백은 백엔드 same-origin이라 samesite=lax로 충분하며 로컬 http에서도 동작한다.
    response.set_cookie(
        _STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    return response


@router.get(
    "/cafe24/callback",
    summary="Cafe24 OAuth 2.0 콜백 처리",
    description="Cafe24가 로그인 완료 후 자동 호출하는 엔드포인트입니다. 직접 호출하지 마세요.",
    response_class=RedirectResponse,
)
async def cafe24_callback(
    request: Request,
    code: str = Query(..., description="Cafe24가 발급한 authorization code"),
    state: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    # ⓪ state 검증 (CSRF 방어): login에서 심은 httpOnly 쿠키와 쿼리의 state를 대조.
    cookie_state = request.cookies.get(_STATE_COOKIE, "")
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        error_msg = "잘못된 요청입니다. 다시 로그인해 주세요."
        invalid = RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error={error_msg}",
            status_code=302,
        )
        invalid.delete_cookie(_STATE_COOKIE)
        return invalid

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

    # ② mall_id로 우리 DB 사용자 조회 또는 자동 생성
    user_service = UserService(db)
    user = await user_service.get_or_create_cafe24_user(mall_id)

    # ③ Cafe24 토큰을 해당 유저 row에 저장 (멀티테넌트: 유저별 토큰 분리)
    await user_service.set_cafe24_tokens(user, cafe24_access, cafe24_refresh, mall_id)

    # ④ 우리 서비스의 JWT 발급
    our_access = create_access_token(user.id, user.username)
    our_refresh = create_refresh_token(user.id)

    # ⑤ 토큰을 일회용 code 뒤에 숨겨 프론트로 리다이렉트.
    #    토큰 자체는 URL에 싣지 않으므로 히스토리·Referer·로그에 남지 않는다.
    #    프론트는 이 code를 POST /auth/cafe24/exchange로 교환해 토큰을 받아간다.
    exchange_code = issue_code(our_access, our_refresh)
    params = urlencode({"code": exchange_code})
    response = RedirectResponse(
        url=f"{settings.FRONTEND_URL}/cafe24-callback?{params}",
        status_code=302,
    )
    response.delete_cookie(_STATE_COOKIE)
    return response


@router.post(
    "/cafe24/exchange",
    response_model=TokenResponse,
    summary="Cafe24 일회용 code → JWT 교환",
)
async def cafe24_exchange(request: ExchangeRequest) -> TokenResponse:
    tokens = consume_code(request.code)
    if tokens is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않거나 만료된 코드입니다.",
        )
    access_token, refresh_token = tokens
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_EXPIRES_MIN * 60,
    )
