import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.auth.jwt import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.config import settings
from app.exceptions import ConflictError, UnauthorizedError
from app.models.user import User, RefreshToken, UserSettings
from app.schemas.auth import RegisterRequest

logger = logging.getLogger(__name__)


def register_user(db: Session, data: RegisterRequest) -> User:
    if db.query(User).filter(User.email == data.email).first():
        raise ConflictError("Email already registered")
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    db.flush()
    db.add(UserSettings(user_id=user.id))
    db.commit()
    db.refresh(user)
    logger.info("User registered: %s", user.id)
    return user


def authenticate_user(db: Session, email: str, password: str) -> tuple[str, str]:
    user = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712
    if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user.id, token=refresh_token, expires_at=expires_at))
    db.commit()
    logger.info("User authenticated: %s", user.id)
    return access_token, refresh_token


def refresh_access_token(db: Session, refresh_token: str) -> tuple[str, str]:
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == refresh_token, RefreshToken.revoked == False)  # noqa: E712
        .first()
    )
    if not token_record or token_record.expires_at < datetime.now(timezone.utc):
        raise UnauthorizedError("Invalid or expired refresh token")

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid refresh token")

    token_record.revoked = True
    user_id = int(payload["sub"])
    new_access = create_access_token({"sub": str(user_id)})
    new_refresh = create_refresh_token({"sub": str(user_id)})
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user_id, token=new_refresh, expires_at=expires_at))
    db.commit()
    return new_access, new_refresh


def revoke_refresh_token(db: Session, refresh_token: str) -> None:
    token_record = db.query(RefreshToken).filter(RefreshToken.token == refresh_token).first()
    if token_record:
        token_record.revoked = True
        db.commit()
