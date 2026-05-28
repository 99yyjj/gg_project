"""add reviews table

상품 리뷰 + AI 분석(감정/요약) + 사장님 답글을 한 테이블에 보관.
product_no 는 Cafe24 상품번호로 FK 없이 정수로 저장한다.

Revision ID: 0005_add_reviews
Revises: 0004_add_cafe24_tokens
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0005_add_reviews"
down_revision: Union[str, Sequence[str], None] = "0004_add_cafe24_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("product_no", sa.Integer(), nullable=False),
        sa.Column("author_name", sa.String(length=50), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "sentiment",
            sa.String(length=10),
            nullable=False,
            server_default="loading",
        ),
        sa.Column("summary", sa.String(length=120), nullable=True),
        sa.Column("admin_reply", sa.Text(), nullable=True),
        sa.Column(
            "is_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("ai_analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"])
    op.create_index("ix_reviews_user_product", "reviews", ["user_id", "product_no"])
    op.create_index(
        "ix_reviews_user_done_sent",
        "reviews",
        ["user_id", "is_done", "sentiment"],
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_user_done_sent", table_name="reviews")
    op.drop_index("ix_reviews_user_product", table_name="reviews")
    op.drop_index("ix_reviews_user_id", table_name="reviews")
    op.drop_table("reviews")
