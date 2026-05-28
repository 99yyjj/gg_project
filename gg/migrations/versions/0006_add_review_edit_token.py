"""add edit_token column to reviews

손님이 익명으로 자기 리뷰를 수정할 수 있도록 한 번 발급되는 토큰을 보관.
관리자가 만든 리뷰는 NULL 일 수 있어 nullable=True.

Revision ID: 0006_add_review_edit_token
Revises: 0005_add_reviews
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_add_review_edit_token"
down_revision: Union[str, Sequence[str], None] = "0005_add_reviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("edit_token", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviews", "edit_token")
