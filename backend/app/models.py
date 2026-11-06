from sqlalchemy import String, Text, DateTime, Boolean, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sender_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    edited_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_for_everyone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_by_other: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

Index("ix_messages_created_id", Message.created_at, Message.id)
