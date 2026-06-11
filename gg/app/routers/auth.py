"""
회원가입/로그인/토큰 갱신/내 정보 조회 + Cafe24 OAuth 2.0 인증.
"""

import base64
import logging
import re
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
# 로그인 시작 시 받은 mall_id를 콜백(토큰 교환)까지 전달하는 httpOnly 쿠키.
# 공개앱이라 사용자마다 다른 몰로 로그인하므로, 어느 몰에 토큰을 교환할지 기억해야 한다.
_MALL_COOKIE = "cafe24_oauth_mall"

# mall_id는 그대로 URL 서브도메인({mall_id}.cafe24api.com)에 들어가므로, 임의의
# 도메인/경로 주입(오픈 리다이렉트·SSRF)을 막기 위해 소문자·숫자·하이픈만 허용한다.
_MALL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,49}$")


def _normalize_mall_id(raw: str) -> str | None:
    """mall_id를 정규화·검증한다. 유효하면 정규화된 값, 아니면 None."""
    mall_id = raw.strip().lower()
    return mall_id if _MALL_ID_RE.match(mall_id) else None


@router.get(
    "/cafe24/login",
    summary="Cafe24 OAuth 2.0 로그인 시작",
    description="Cafe24 로그인 페이지로 리다이렉트합니다. 브라우저에서 직접 접속하세요.",
    response_class=RedirectResponse,
)
async def cafe24_login(
    mall_id: str | None = Query(
        None,
        description="로그인할 카페24 쇼핑몰 ID (예: mymall). 생략 시 서버 설정값(CAFE24_MALL_ID) 사용",
    ),
) -> RedirectResponse:
    # 쇼핑몰 ID를 입력받지 않을 때는 운영자가 .env에 설정한 CAFE24_MALL_ID로 OAuth를
    # 시작한다(단일 운영자/데모 시나리오). 쿼리로 넘어오면 그 값을 우선한다.
    raw_mall_id = mall_id or settings.CAFE24_MALL_ID
    # 검증 실패 시 인증 시작 자체를 막고 로그인 화면으로 돌려보낸다.
    normalized = _normalize_mall_id(raw_mall_id)
    if normalized is None:
        error_msg = "올바른 카페24 쇼핑몰 ID가 아닙니다."
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error={error_msg}",
            status_code=302,
        )

    state = secrets.token_urlsafe(16)
    params = urlencode({
        "response_type": "code",
        "client_id": settings.CAFE24_CLIENT_ID,
        "state": state,
        "redirect_uri": settings.CAFE24_REDIRECT_URI,
        "scope": settings.CAFE24_SCOPES,
    })
    auth_url = f"https://{normalized}.cafe24api.com/api/v2/oauth/authorize?{params}"
    response = RedirectResponse(url=auth_url, status_code=302)
    # state를 httpOnly 쿠키에 저장 → 콜백에서 쿼리의 state와 대조(CSRF 방어).
    # 콜백은 백엔드 same-origin이라 samesite=lax로 충분하며 로컬 http에서도 동작한다.
    cookie_kwargs = {
        "max_age": 600,
        "httponly": True,
        "samesite": "lax",
        "secure": settings.COOKIE_SECURE,
    }
    response.set_cookie(_STATE_COOKIE, state, **cookie_kwargs)
    # 콜백의 토큰 교환은 같은 mall_id로 해야 하므로 함께 쿠키에 보관한다.
    response.set_cookie(_MALL_COOKIE, normalized, **cookie_kwargs)
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
    # 에러로 로그인 화면에 되돌릴 때 OAuth 임시 쿠키를 모두 정리하는 헬퍼.
    def _login_error(message: str) -> RedirectResponse:
        redirect = RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error={message}",
            status_code=302,
        )
        redirect.delete_cookie(_STATE_COOKIE)
        redirect.delete_cookie(_MALL_COOKIE)
        return redirect

    # ⓪ state 검증 (CSRF 방어): login에서 심은 httpOnly 쿠키와 쿼리의 state를 대조.
    cookie_state = request.cookies.get(_STATE_COOKIE, "")
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return _login_error("잘못된 요청입니다. 다시 로그인해 주세요.")

    # ⓪-2 어느 몰로 토큰을 교환할지: login에서 심은 mall_id 쿠키를 읽어 재검증.
    mall_id = _normalize_mall_id(request.cookies.get(_MALL_COOKIE, ""))
    if mall_id is None:
        return _login_error("쇼핑몰 정보가 유실되었습니다. 다시 로그인해 주세요.")

    # ① authorization code → Cafe24 access_token 교환
    credentials = f"{settings.CAFE24_CLIENT_ID}:{settings.CAFE24_CLIENT_SECRET}"
    encoded = base64.b64encode(credentials.encode()).decode()
    token_url = f"https://{mall_id}.cafe24api.com/api/v2/oauth/token"

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
        return _login_error(f"Cafe24 인증 실패: {e.response.status_code}")

    token_data = resp.json()
    cafe24_access = token_data.get("access_token", "")
    cafe24_refresh = token_data.get("refresh_token", "")
    # 응답에 mall_id가 있으면 그것을 신뢰, 없으면 로그인 시작 시의 mall_id를 사용.
    mall_id = token_data.get("mall_id") or mall_id

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
    response.delete_cookie(_MALL_COOKIE)
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
