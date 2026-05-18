"""add user_products table

Revision ID: 0002_add_user_products
Revises: 0001_init_users
Create Date: 2026-04-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_add_user_products"
down_revision = "0001_init_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("product_no", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_no", name="uq_user_products_product_no"),
    )
    op.create_index("ix_user_products_user_id", "user_products", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_products_user_id", table_name="user_products")
    op.drop_table("user_products")
