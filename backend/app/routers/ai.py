import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.services import ai_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


@router.post("/chat/stream")
async def chat_stream(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream chat responses from AI advisor (SSE)."""
    ctx = ai_service.get_financial_context(db, current_user.id)
    history = [{'role': m.role, 'content': m.content} for m in body.history]

    async def event_generator() -> AsyncGenerator[str, None]:
        async for chunk in ai_service.stream_chat(
            ctx,
            getattr(current_user, 'full_name', None),
            body.message,
            history,
        ):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control':  'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


@router.get("/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return cached (24h) or fresh auto-insights."""
    recs = ai_service.get_recommendations(db, current_user.id)
    return {'recommendations': recs}


@router.post("/recommendations/refresh")
async def refresh_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force-regenerate recommendations, bypassing cache."""
    recs = ai_service.get_recommendations(db, current_user.id, force_refresh=True)
    return {'recommendations': recs}


@router.get("/context")
async def get_context(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the user's financial context that the AI uses."""
    ctx = ai_service.get_financial_context(db, current_user.id)
    return ctx
