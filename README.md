# Mani × Li Yilin — Private Chat

A two-account, real-time chat starter built with FastAPI, SQLite/PostgreSQL, WebSockets, React, and TypeScript.

## Included
- Exactly two allowed account names: `Mani` and `Li Yilin`
- Login with separate passcodes
- One shared private conversation
- Real-time messages over WebSockets
- Online/offline status and last seen
- Reply, edit own messages, delete for everyone
- Emoji picker, read receipts, typing indicator
- Four themes, saved independently per browser
- Responsive desktop/mobile layout
- Message history pagination

## Important security note
The requested passcode `69` is weak and is supplied only as a local-development default. Do not expose this app publicly with that passcode. Set unique, strong passcodes for both accounts and a long random `APP_SECRET` before deployment. HTTPS is required in production. This starter is private by application-level account allowlisting, but it is not end-to-end encrypted.

## Requirements
- Python 3.11+
- Node.js 20+
- npm

## Run locally

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
uvicorn app.main:app --reload
```
Backend: http://localhost:8000  
API docs: http://localhost:8000/docs

### 2. Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Local development credentials
- Mani — `69`
- Li Yilin — `69`

The backend reads `MANI_PASSCODE`, `LIYILIN_PASSCODE`, and `APP_SECRET` from `backend/.env`.

## PostgreSQL
SQLite is the default for easy local setup. For PostgreSQL, set `DATABASE_URL` in `backend/.env`, for example:
```env
DATABASE_URL=postgresql+psycopg://chatuser:strong-password@localhost:5432/manili_chat
```
Install `psycopg[binary]` (already included in requirements).

## Production checklist
1. Set strong, unique passcodes; never use `69`.
2. Set a cryptographically random `APP_SECRET` (at least 32 random bytes).
3. Set `DATABASE_URL` to managed PostgreSQL.
4. Set `CORS_ORIGINS` to your exact frontend origin.
5. Serve behind HTTPS/WSS.
6. Run one backend instance, or add shared pub/sub (e.g. Redis) before scaling multiple instances. In-memory WebSocket fan-out works for one backend process only.
7. Add rate limiting at the reverse proxy/platform and configure backups.
8. Do not commit `.env`.

## Notes
- Delete for everyone uses a tombstone so both chat views update and show “This message was deleted.”
- Users may edit/delete only their own messages.
- Presence is based on active WebSocket connections; last seen is persisted when the last connection for a user closes.
- Read receipts are lightweight: the recipient's active chat sends read acknowledgements.
