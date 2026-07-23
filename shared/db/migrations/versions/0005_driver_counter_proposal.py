"""driver counter-proposal — proposed_scheduled_at + driver_countered status

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-24

Order flow change: a driver assigned to a specific order who can't make
the requested time can now propose a different one instead of only
accept/reject. The employee then accepts (order confirmed at the new
time) or declines (order cancelled) — single round, no further
negotiation.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_STATUSES = (
    "draft",
    "pending_driver",
    "confirmed",
    "driver_en_route",
    "driver_arrived",
    "in_progress",
    "completed",
    "cancelled_by_user",
    "cancelled_by_driver",
    "cancelled_by_admin",
    "expired",
)
_NEW_STATUSES = (
    "draft",
    "pending_driver",
    "driver_countered",
    "confirmed",
    "driver_en_route",
    "driver_arrived",
    "in_progress",
    "completed",
    "cancelled_by_user",
    "cancelled_by_driver",
    "cancelled_by_admin",
    "expired",
)


def upgrade() -> None:
    op.add_column("orders", sa.Column("proposed_scheduled_at", sa.DateTime(timezone=True)))

    # Alembic re-applies the naming convention to the name given here (same
    # gotcha as migration 0003's identity_present drop) — "status" is the
    # short name CheckConstraint(name="status") resolves to ck_orders_status.
    op.drop_constraint("status", "orders", type_="check")
    op.create_check_constraint(
        "status", "orders", "status in (" + ",".join(f"'{s}'" for s in _NEW_STATUSES) + ")"
    )


def downgrade() -> None:
    op.drop_constraint("status", "orders", type_="check")
    op.create_check_constraint(
        "status", "orders", "status in (" + ",".join(f"'{s}'" for s in _OLD_STATUSES) + ")"
    )
    op.drop_column("orders", "proposed_scheduled_at")
