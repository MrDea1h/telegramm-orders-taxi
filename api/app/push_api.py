from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import get_current_user
from shared.db.engine import get_session
from shared.db.models import PushSubscription, User

router = APIRouter(prefix="/v1/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys
    user_agent: str | None = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/subscribe", status_code=201)
async def subscribe(
    body: SubscribeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = insert(PushSubscription).values(
        user_id=user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
        user_agent=body.user_agent,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[PushSubscription.endpoint],
        set_={
            "user_id": stmt.excluded.user_id,
            "p256dh": stmt.excluded.p256dh,
            "auth": stmt.excluded.auth,
            "user_agent": stmt.excluded.user_agent,
        },
    ).returning(PushSubscription.id)
    result = await session.execute(stmt)
    await session.commit()
    return {"id": str(result.scalar_one())}


@router.delete("/subscribe", status_code=204, response_model=None)
async def unsubscribe(
    body: UnsubscribeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id
        )
    )
    await session.commit()
