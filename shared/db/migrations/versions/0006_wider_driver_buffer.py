"""wider driver buffer between rides — 15 -> 30 minutes

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-24

The 15-minute gap enforced between a driver's consecutive bookings (both
here, the DB's real EXCLUDE-constraint source of truth, and the advisory
slot-generation buffer in shared/config.py's ORDER_BUFFER_MIN) was a flat
constant that never accounted for the actual drive time from a ride's
drop-off point to the next ride's pickup point. Computing that for real
would mean an OpenRouteService call per candidate slot, which is both
slower and burns through the free ORS quota fast — deferred (see
docs/context). Doubling the flat buffer to 30 minutes is a stopgap that
reduces (without eliminating) the risk of a slot being offered that the
driver can't actually reach in time.

order_busy_range() is declared IMMUTABLE, so it can't be ALTERed in place
— CREATE OR REPLACE with the same signature is the standard way to change
an immutable SQL function's body.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_BUFFER_MIN = 15
_NEW_BUFFER_MIN = 30


def upgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION order_busy_range(scheduled_at timestamptz, duration_min smallint)
        RETURNS tstzrange
        LANGUAGE sql
        IMMUTABLE
        AS $$
          SELECT tstzrange(
            scheduled_at,
            scheduled_at + (COALESCE(duration_min, 0) + {_NEW_BUFFER_MIN}) * interval '1 minute',
            '[)'
          )
        $$
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION order_busy_range(scheduled_at timestamptz, duration_min smallint)
        RETURNS tstzrange
        LANGUAGE sql
        IMMUTABLE
        AS $$
          SELECT tstzrange(
            scheduled_at,
            scheduled_at + (COALESCE(duration_min, 0) + {_OLD_BUFFER_MIN}) * interval '1 minute',
            '[)'
          )
        $$
        """
    )
