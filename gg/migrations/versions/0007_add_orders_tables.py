"""add orders and order_items tables

손님 주문을 카페24 대신 우리 DB에 저장하기 위한 테이블.
주문(orders) 1 : N 주문상품(order_items). 상품 본체는 Cafe24에 있어 FK 없이
product_no/이름/가격을 주문 시점 스냅샷으로 보관한다.

Revision ID: 0007_add_orders
Revises: 0006_add_review_edit_token
Create Date: 2026-06-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0007_add_orders"
down_revision: Union[str, Sequence[str], None] = "0006_add_review_edit_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("order_no", sa.String(length=32), nullable=False),
        sa.Column("buyer_name", sa.String(length=50), nullable=False),
        sa.Column("buyer_phone", sa.String(length=30), nullable=False, server_default=""),
        sa.Column("address", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="배송준비"),
        sa.Column("tracking", sa.String(length=100), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_order_no", "orders", ["order_no"], unique=True)

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_no", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("price", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index("ix_orders_order_no", table_name="orders")
    op.drop_index("ix_orders_user_id", table_name="orders")
    op.drop_table("orders")
