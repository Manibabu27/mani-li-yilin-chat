import base64, hashlib, hmac, json, time
from fastapi import HTTPException, Header
from .config import APP_SECRET, USERS, TOKEN_TTL_HOURS

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + TOKEN_TTL_HOURS * 3600}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    encoded = _b64(raw)
    sig = _b64(hmac.new(APP_SECRET.encode(), encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{sig}"

def verify_token(token: str) -> str:
    try:
        encoded, signature = token.split(".", 1)
        expected = _b64(hmac.new(APP_SECRET.encode(), encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(_unb64(encoded))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        user_id = payload["sub"]
        if user_id not in USERS:
            raise ValueError("user")
        return user_id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

def current_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in")
    return verify_token(authorization[7:])
