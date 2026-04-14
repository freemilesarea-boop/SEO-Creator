import logging

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Text, Float, DateTime
from datetime import datetime

from backend.app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class GenerationHistory(Base):
    __tablename__ = "generation_history"

    id: Mapped[str] = mapped_column(primary_key=True)
    input_type: Mapped[str]
    input_data: Mapped[str] = mapped_column(Text)
    result_data: Mapped[str] = mapped_column(Text)
    seo_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


_db_url = get_settings().database_url
logger.info(f"Database URL: {_db_url}")
print(f"[database] URL: {_db_url}")

engine = create_async_engine(_db_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized")
    print("[database] Initialized OK")
