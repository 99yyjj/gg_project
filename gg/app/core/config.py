"""
애플리케이션 환경 변수 설정.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Cafe24 API ---
    CAFE24_CLIENT_ID: str
    CAFE24_CLIENT_SECRET: str
    CAFE24_MALL_ID: str
    CAFE24_API_VERSION: str = "2026-03-01"
    CAFE24_ACCESS_TOKEN: str = ""
    CAFE24_REFRESH_TOKEN: str = ""
    CAFE24_REDIRECT_URI: str = "http://localhost:8000/auth/cafe24/callback"
    CAFE24_SCOPES: str = "mall.read_product,mall.write_product,mall.read_category,mall.write_category,mall.read_order"
    FRONTEND_URL: str = "http://localhost:3000"

    # OAuth state 쿠키에 Secure 속성을 붙일지 여부.
    # 로컬(http)에서는 False, 프로덕션(HTTPS)에서는 반드시 True로 설정한다.
    COOKIE_SECURE: bool = False

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://mac@localhost/gg_db"

    # --- AI ---
    GEMINI_API_KEY: str = "mock-key"
    GEMINI_MODEL: str = "gemini-2.5-pro"
    USE_MOCK_AI: bool = True
    AI_MAX_TOKENS: int = 2048

    # --- JWT ---
    JWT_SECRET: str = "change-me-in-production-please-use-32-byte-random-hex"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRES_MIN: int = 30
    JWT_REFRESH_EXPIRES_DAYS: int = 14

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
