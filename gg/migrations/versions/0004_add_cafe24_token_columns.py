"""add per-user cafe24 token columns to users

유저별 Cafe24 OAuth 토큰을 users 테이블에 저장하기 위한 컬럼 추가.
멀티테넌트 전환: 전역 .env 토큰 대신 각 사장님 토큰을 본인 row에 보관한다.

Revision ID: 0004_add_cafe24_tokens
Revises: 0003_add_shop_template
Create Date: 2026-05-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0004_add_cafe24_tokens"
down_revision: Union[str, Sequence[str], None] = "0003_add_shop_template"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("cafe24_access_token", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("cafe24_refresh_token", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "cafe24_refresh_token")
    op.drop_column("users", "cafe24_access_token")
