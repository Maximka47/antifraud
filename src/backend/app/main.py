from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, Response
import base64
from fastapi.encoders import jsonable_encoder
from bson import ObjectId

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
async def index(request: Request):
    # Log the incoming document request headers so we can capture navigation-style headers
    try:
        headers = dict(request.headers)
    except Exception:
        headers = {k: v for k, v in request.headers.items()}

    # Normalize to lowercase keys for easier searching in logs
    headers_norm = {k.lower(): v for k, v in headers.items()}
    logger.info("document_request_headers", extra={"request_headers": headers_norm})

    return FileResponse('static/index.html')


@app.get("/probe")
async def probe(request: Request):
    # Return a tiny 1x1 PNG with an ETag and cache-control so the browser
    # may revalidate it (producing If-None-Match on revalidation). Log
    # request headers so the server sees what the client sent for this GET.
    try:
        headers = dict(request.headers)
    except Exception:
        headers = {k: v for k, v in request.headers.items()}
    headers_norm = {k.lower(): v for k, v in headers.items()}
    logger.info("probe_request_headers", extra={"request_headers": headers_norm})

    # 1x1 PNG (base64) transparent
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
    png = base64.b64decode(png_b64)
    headers_out = {"ETag": '"probe-v1"', "Cache-Control": "public, max-age=0"}
    return Response(content=png, media_type="image/png", headers=headers_out)


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

    # Echo back the stored event and the request headers so the frontend
    # can render HTTP attributes and JS attributes for the user immediately.
    try:
        headers = dict(request.headers)
    except Exception:
        # fallback in case headers can't be converted directly
        headers = {k: v for k, v in request.headers.items()}

    # If the inserted operation added a Mongo ObjectId into `doc`, convert it to string
    if isinstance(doc.get("_id"), ObjectId):
        doc["_id"] = str(doc["_id"])

    # Normalize header names to lowercase for consistent access
    headers_norm = {k.lower(): v for k, v in headers.items()}

    # Create an explicit ordered set of attributes (always present, may be empty)
    ordered_attrs = {
        "user_agent": headers_norm.get("user-agent", ""),
        "accept": headers_norm.get("accept", ""),
        "content_encoding": headers_norm.get("accept-encoding", ""),
        "content_language": headers_norm.get("accept-language", ""),
        "if_none_match": headers_norm.get("if-none-match", ""),
        "upgrade_insecure_requests": headers_norm.get("upgrade-insecure-requests", ""),
        "referer": headers_norm.get("referer", ""),
    }

    response_data = {
        "status": "ok",
        "id": str(result.inserted_id),
        "event": doc,
        "request_headers": headers_norm,
        "ordered_headers": ordered_attrs,
    }

    # Use jsonable_encoder so datetimes and other non-JSON-native types
    # (e.g., Python datetimes) are encoded to JSON-friendly values.
    return JSONResponse(jsonable_encoder(response_data))
