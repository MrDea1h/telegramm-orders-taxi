"""round-trip orders — is_round_trip + wait_time_min

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-24

A "туда-обратно" (there-and-back) order: the driver waits at the
destination for `wait_time_min` (default 15) before returning to the
origin. `est_duration_min` already carries the *total* occupied time the
scheduling code needs (one-way x2 + wait) — these two new columns are
purely informational/display plus one piece of scheduling logic that
can't be derived from est_duration_min alone: when computing the real
transit gap to the *next* booking after a round trip, the driver's
actual end-of-day location is the origin (from_address), not the
destination (to_address) — see api/app/orders_api.py's get_slots.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("is_round_trip", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("orders", sa.Column("wait_time_min", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "wait_time_min")
    op.drop_column("orders", "is_round_trip")
