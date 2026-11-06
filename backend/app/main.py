from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from .config import USERS, CORS_ORIGINS, APP_SECRET
from .database import Base, engine, get_db, SessionLocal
from .models import Message
from .security import create_token, current_user, verify_token

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Mani × Li Yilin Private Chat", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["*"]
)

# Single-process connection registry. For multiple workers, replace with Redis pub/sub.
connections: dict[str, set[WebSocket]] = {"mani": set(), "li-yilin": set()}
last_seen: dict[str, datetime] = {}

class LoginBody(BaseModel):
    username: str
    passcode: str

class MessageBody(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    reply_to_id: Optional[int] = None

class EditBody(BaseModel):
    body: str = Field(min_length=1, max_length=10000)

def user_payload(user_id: str):
    return {"id": user_id, "name": USERS[user_id]["display_name"]}

def online_payload():
    result = {}
    for uid in USERS:
        active = len(connections[uid]) > 0
        seen = last_seen.get(uid)
        result[uid] = {
            "online": active,
            "last_seen": None if active or seen is None else seen.isoformat()
        }
    return result

def serialize(msg: Message):
    return {
        "id": msg.id, "sender_id": msg.sender_id, "body": msg.body,
        "reply_to_id": msg.reply_to_id,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "deleted_for_everyone": msg.deleted_for_everyone,
        "read_by_other": msg.read_by_other,
    }

async def broadcast(event: dict):
    stale = []
    for uid, sockets in connections.items():
        for ws in list(sockets):
            try:
                await ws.send_json(event)
            except Exception:
                stale.append((uid, ws))
    for uid, ws in stale:
        connections[uid].discard(ws)

@app.get("/health")
def health():
    return {"ok": True, "service": "mani-li-chat"}

@app.post("/api/login")
def login(data: LoginBody):
    username = data.username.strip().lower()
    # Explicit allowlist: no registration or arbitrary accounts.
    if username not in USERS or data.passcode != USERS[username]["passcode"]:
        raise HTTPException(status_code=401, detail="Incorrect account or passcode")
    if APP_SECRET.startswith("CHANGE-ME"):
        # Keep local development convenient but warn in docs/logs.
        pass
    return {"token": create_token(username), "user": user_payload(username)}

@app.get("/api/me")
def me(user_id: str = Depends(current_user)):
    return user_payload(user_id)

@app.get("/api/presence")
def presence(user_id: str = Depends(current_user)):
    return online_payload()

@app.get("/api/messages")
def messages(limit: int = 50, before_id: int | None = None,
             user_id: str = Depends(current_user), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    query = select(Message).order_by(desc(Message.id)).limit(limit)
    if before_id:
        query = query.where(Message.id < before_id)
    rows = list(db.scalars(query).all())
    rows.reverse()
    return [serialize(m) for m in rows]

@app.post("/api/messages")
async def send_message(data: MessageBody, user_id: str = Depends(current_user),
                       db: Session = Depends(get_db)):
    body = data.body.strip()
    if not body:
        raise HTTPException(400, "Message cannot be empty")
    if data.reply_to_id is not None and not db.get(Message, data.reply_to_id):
        raise HTTPException(404, "Reply target not found")
    msg = Message(sender_id=user_id, body=body, reply_to_id=data.reply_to_id)
    db.add(msg); db.commit(); db.refresh(msg)
    event = {"type": "message", "message": serialize(msg)}
    await broadcast(event)
    return serialize(msg)

@app.patch("/api/messages/{message_id}")
async def edit_message(message_id: int, data: EditBody,
                       user_id: str = Depends(current_user), db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if not msg or msg.deleted_for_everyone:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != user_id:
        raise HTTPException(403, "You can only edit your own messages")
    msg.body = data.body.strip()
    if not msg.body:
        raise HTTPException(400, "Message cannot be empty")
    msg.edited_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(msg)
    result = serialize(msg)
    await broadcast({"type": "message_updated", "message": result})
    return result

@app.delete("/api/messages/{message_id}")
async def delete_message(message_id: int, user_id: str = Depends(current_user),
                         db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if not msg or msg.deleted_for_everyone:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != user_id:
        raise HTTPException(403, "You can only delete your own messages")
    msg.deleted_for_everyone = True
    msg.body = ""
    db.commit()
    result = serialize(msg)
    await broadcast({"type": "message_deleted", "message": result})
    return result

@app.post("/api/messages/{message_id}/read")
async def mark_read(message_id: int, user_id: str = Depends(current_user),
                    db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if msg and msg.sender_id != user_id:
        msg.read_by_other = True
        db.commit()
        await broadcast({"type": "read", "message_id": message_id, "reader_id": user_id})
    return {"ok": True}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str):
    try:
        user_id = verify_token(token)
    except HTTPException:
        await ws.close(code=1008)
        return
    await ws.accept()
    was_offline = not connections[user_id]
    connections[user_id].add(ws)
    if was_offline:
        await broadcast({"type": "presence", "presence": online_payload()})
    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "typing":
                await broadcast({"type": "typing", "user_id": user_id, "active": bool(data.get("active"))})
            elif data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        connections[user_id].discard(ws)
        if not connections[user_id]:
            last_seen[user_id] = datetime.now(timezone.utc)
            await broadcast({"type": "presence", "presence": online_payload()})
