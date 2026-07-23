"""order wizard backend — idempotency key, driver on-duty flag, schedule uniqueness

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-23

M3 (real order/scheduling backend): three independent additions needed
before the wizard/driver-transition endpoints can be built.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "drivers",
        sa.Column("on_duty", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    # Blocks literal duplicate (driver_id, weekday, start_time) rows only —
    # see the matching comment on DriverSchedule.__table_args__ in models.py
    # for why a true overlap-proof EXCLUDE constraint isn't used here.
    op.create_unique_constraint(
        "uq_driver_schedule_driver_id_weekday_start_time",
        "driver_schedule",
        ["driver_id", "weekday", "start_time"],
    )

    op.add_column("orders", sa.Column("idempotency_key", postgresql.UUID(as_uuid=True)))
    op.create_index(
        "uq_orders_user_idempotency_key",
        "orders",
        ["user_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_orders_user_idempotency_key", table_name="orders")
    op.drop_column("orders", "idempotency_key")
    op.drop_constraint(
        "uq_driver_schedule_driver_id_weekday_start_time", "driver_schedule", type_="unique"
    )
    op.drop_column("drivers", "on_duty")
