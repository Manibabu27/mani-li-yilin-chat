import os
from dotenv import load_dotenv

load_dotenv()

USERS = {
    "mani": {"display_name": "Mani", "passcode": os.getenv("MANI_PASSCODE", "babe")},
    "li-yilin": {"display_name": "Li Yilin", "passcode": os.getenv("LIYILIN_PASSCODE", "69")},
}
APP_SECRET = os.getenv("APP_SECRET", "CHANGE-ME-TO-A-LONG-RANDOM-SECRET")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mani_li_chat.db")
# CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]

CORS_ORIGINS = [
    x.strip() 
    for x in os.getenv(
        "CORS_ORIGINS", 
        "http://192.168.0.8:5173,http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") 
    if x.strip()
]
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "168"))
