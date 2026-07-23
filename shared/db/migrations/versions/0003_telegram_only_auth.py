"""drop email/password auth path — Telegram is now the only login method

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-23

Product decision: email+password never had a working delivery channel
(no SMTP configured) and Telegram login already covers every real user,
so the whole parallel path (register/verify-email/login, verification
codes, Argon2 hashing) is removed rather than left half-working.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Any row that only ever went through the email path (never linked a
    # Telegram account) has no way to log in anymore once telegram_id is
    # required — there's nothing to migrate it to.
    op.execute("DELETE FROM users WHERE telegram_id IS NULL")

    # Alembic re-applies the naming convention to whatever name is given
    # here (same as CheckConstraint's own `name=` in 0001) — passing the
    # already-prefixed "ck_users_identity_present" would double-prefix it.
    op.drop_constraint("identity_present", "users", type_="check")
    op.alter_column("users", "telegram_id", nullable=False)
    op.drop_column("users", "email")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email_confirmed_at")
    op.drop_table("verification_codes")


def downgrade() -> None:
    op.create_table(
        "verification_codes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.CheckConstraint("channel in ('email','phone')", name="channel"),
    )
    op.create_index("ix_verification_codes_user_id", "verification_codes", ["user_id"])

    op.add_column("users", sa.Column("email_confirmed_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("password_hash", sa.String(255)))
    op.add_column("users", sa.Column("email", sa.String(255)))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.alter_column("users", "telegram_id", nullable=True)
    op.create_check_constraint(
        "identity_present", "users", "telegram_id IS NOT NULL OR email IS NOT NULL"
    )
