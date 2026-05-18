"""
회원가입/로그인 요청·응답 스키마.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr = Field(..., description="이메일 (로그인 ID 겸용)")
    username: str = Field(..., min_length=3, max_length=50, description="화면 표시용 아이디")
    password: str = Field(..., min_length=8, max_length=128, description="비밀번호 (8~128자, 영문+숫자 권장)")
    full_name: Optional[str] = Field(None, max_length=100, description="실명")
    phone: Optional[str] = Field(None, max_length=20, description="휴대폰 번호")
    shop_name: Optional[str] = Field(None, max_length=100, description="운영 중인 쇼핑몰 이름")
    cafe24_mall_id: Optional[str] = Field(None, max_length=50, description="본인 Cafe24 mall_id (선택)")

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        # 최소한 영문과 숫자가 모두 포함되도록 (특수문자는 권장)
        has_alpha = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_alpha and has_digit):
            raise ValueError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
        return v


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., description="아이디 또는 이메일")
    password: str = Field(..., description="비밀번호")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="access_token 만료까지 남은 초")


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    cafe24_mall_id: Optional[str] = None
    is_active: bool
    is_admin: bool
    onboarding_completed: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
