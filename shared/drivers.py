from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import Driver, User


async def get_or_create_own_driver(user: User, session: AsyncSession) -> Driver | None:
    """The caller's own Driver row, auto-provisioning one for admins who
    don't have one yet. Admin is treated as a superuser with access to
    every workflow in this (deliberately small, single-company) app,
    including driving — not just managing it. Returns None for a non-admin
    account with no Driver row (shouldn't normally happen — role='driver'
    is only ever assigned alongside creating one, see admin_api.py)."""
    driver = (
        await session.execute(select(Driver).where(Driver.user_id == user.id))
    ).scalar_one_or_none()
    if driver is None and user.role == "admin":
        driver = Driver(user_id=user.id)
        session.add(driver)
        await session.flush()
    return driver
