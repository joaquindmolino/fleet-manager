"""Configuración de la base de datos y sesión SQLAlchemy asíncrona."""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, func
import uuid

from app.core.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Clase base para todos los modelos SQLAlchemy."""

    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Mixin con campos de auditoría comunes a todas las tablas."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=_now,
        onupdate=_now,
        nullable=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia FastAPI: provee una sesión de base de datos por request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    """Crea todas las tablas en la base de datos (solo para desarrollo)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
