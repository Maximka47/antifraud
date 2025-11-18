from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

from models.event import EventIn
from core.config import settings
from core.logger import logger
from database.session import get_database
import ipaddress
from datetime import datetime, timezone

app = FastAPI(title="Anti-Fraud MVP", version="0.1")

# serve static UI from ./static (mounted in Dockerfile)
# Mount static files under /static so API routes like /collect remain reachable.
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse('static/index.html')


# Note: we read `X-Forwarded-For` header directly below. If you run behind
# a reverse proxy that rewrites headers you can enable Starlette's
# ProxyHeadersMiddleware — add it when the runtime environment provides
# `starlette.middleware.proxy_headers`.


@app.post("/collect")
async def collect(event: EventIn, request: Request):
    db = get_database()
    doc = event.dict(exclude_none=True)

    # Determine the most likely *public* client IP using this preference order:
    # 1. X-Forwarded-For (first IP) if it appears to be a public address
    # 2. client-provided `client_ip` from the payload, if it appears public
    # 3. socket peer address (`request.client.host`) as a last resort
    def _is_public(ip_str: str) -> bool:
        try:
            ip = ipaddress.ip_address(ip_str)
        except Exception:
            return False
        # `is_global` is True for globally routable addresses (not private/loopback/reserved)
        return getattr(ip, "is_global", False)

    xff = request.headers.get("x-forwarded-for")
    xff_ip = None
    if xff:
        xff_ip = xff.split(",")[0].strip()

    client_ip = None
    if xff_ip and _is_public(xff_ip):
        client_ip = xff_ip
    else:
        # prefer client-supplied public IP for local testing (may be spoofed)
        supplied = doc.get("client_ip")
        if supplied and _is_public(supplied):
            client_ip = supplied
        else:
            # fallback to the socket address (may be local docker gateway)
            client_ip = request.client.host if request.client else None

    doc["client_ip"] = client_ip
    # Add server-generated timezone-aware UTC timestamp for each event
    # Use timezone-aware datetimes to satisfy linters and make intent explicit
    doc["timestamp"] = datetime.now(timezone.utc)
    result = await db.events.insert_one(doc)
    logger.info("event_collected", extra={"event_id": str(result.inserted_id), "client_ip": doc["client_ip"]})
    return JSONResponse({"status": "ok", "id": str(result.inserted_id)})
