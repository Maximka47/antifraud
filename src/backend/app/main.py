from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from models.event import EventIn
from core.config import settings
from core.logger import logger
from database.session import get_database

app = FastAPI(title="Anti-Fraud MVP", version="0.1")

# serve static UI from ./static (mounted in Dockerfile)
app.mount("/", StaticFiles(directory="static", html=True), name="static")


@app.post("/collect")
async def collect(event: EventIn, request: Request):
    db = get_database()
    doc = event.dict(exclude_none=True)
    doc["client_ip"] = request.client.host if request.client else None
    result = await db.events.insert_one(doc)
    logger.info("event_collected", extra={"event_id": str(result.inserted_id), "client_ip": doc["client_ip"]})
    return JSONResponse({"status": "ok", "id": str(result.inserted_id)})
