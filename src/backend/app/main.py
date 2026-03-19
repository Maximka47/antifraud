from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
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

# Configure CORS so the static frontend (GitHub Pages or other origin)
# can call `/collect` and `/probe`. Set `BACKEND_ALLOWED_ORIGINS` env
# to a comma-separated list (e.g. "https://<owner>.github.io") or leave
# empty to allow all origins (not recommended for production).
allowed = os.environ.get("BACKEND_ALLOWED_ORIGINS", "*")
if allowed.strip() == "*":
    origins = ["*"]
else:
    origins = [o.strip() for o in allowed.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def collect(request: Request):
    db = get_database()
    # Read the full JSON payload so we store the complete fingerprint the
    # client sent (not limited by the Pydantic EventIn model).
    try:
        body = await request.json()
    except Exception:
        body = {}
    # Start document from the raw body (exclude None-like values later)
    doc = {k: v for k, v in (body or {}).items()}

    # Capture request headers now so we can persist them with the event.
    try:
        headers = dict(request.headers)
    except Exception:
        headers = {k: v for k, v in request.headers.items()}
    headers_norm = {k.lower(): v for k, v in headers.items()}
    # Save normalized request headers into the event document for later comparisons
    doc['request_headers'] = headers_norm

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

    xff = headers.get("x-forwarded-for")
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
    # Use the previously captured headers_norm for the response rendering
    headers = headers_norm

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


def _levenshtein(a: str, b: str) -> int:
    # simple iterative Levenshtein distance
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la == 0:
        return lb
    if lb == 0:
        return la
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i] + [0] * lb
        for j, cb in enumerate(b, start=1):
            add = prev[j] + 1
            delete = cur[j - 1] + 1
            change = prev[j - 1] + (0 if ca == cb else 1)
            cur[j] = min(add, delete, change)
        prev = cur
    return prev[lb]


def _str_similarity(a, b) -> int:
    if a is None and b is None:
        return 100
    if a is None or b is None:
        return 0
    sa = str(a)
    sb = str(b)
    if sa == sb:
        return 100
    maxlen = max(len(sa), len(sb))
    if maxlen == 0:
        return 0
    dist = _levenshtein(sa, sb)
    return max(0, int((1 - (dist / maxlen)) * 100))


def _numeric_similarity(a, b) -> int:
    try:
        a_f = float(a)
        b_f = float(b)
    except Exception:
        return 0
    if a_f == b_f:
        return 100
    denom = max(abs(a_f), abs(b_f), 1.0)
    diff = abs(a_f - b_f) / denom
    score = max(0.0, 1.0 - diff)
    return int(score * 100)


def _jaccard_similarity(a, b) -> int:
    try:
        sa = set(a or [])
        sb = set(b or [])
    except Exception:
        return 0
    if not sa and not sb:
        return 100
    inter = sa.intersection(sb)
    union = sa.union(sb)
    if not union:
        return 0
    return int(len(inter) / len(union) * 100)


def _get_attr(ev: dict, key: str):
    # map flattened keys to event document structure
    # support comparing HTTP request headers saved under `request_headers`
    header_aliases = {
        'user_agent': 'user-agent',
        'content_encoding': 'accept-encoding',
        'content_language': 'accept-language',
        'if_none_match': 'if-none-match',
        'upgrade_insecure_requests': 'upgrade-insecure-requests',
        'referer': 'referer'
    }
    if key == 'user_agent':
        # prefer explicit top-level user_agent, otherwise request headers
        return ev.get('user_agent') or (ev.get('request_headers') or {}).get('user-agent') or ev.get('user-agent') or ''
    if key in ('timezone', 'timezone_offset_minutes', 'language'):
        return ev.get(key)
    if key.startswith('screen_'):
        screen = ev.get('metadata', {}).get('screen', {})
        return screen.get(key.split('_', 1)[1])
    if key in ('platform', 'deviceMemory', 'hardwareConcurrency', 'cookieEnabled', 'doNotTrack', 'maxTouchPoints'):
        return ev.get('metadata', {}).get(key)
    # If key maps to a header alias, try the saved request headers
    if key in header_aliases:
        return (ev.get('request_headers') or {}).get(header_aliases[key]) or ev.get(key)
    if key == 'languages':
        langs = ev.get('metadata', {}).get('languages')
        return list(langs) if isinstance(langs, (list, tuple)) else (str(langs).split(',') if langs else [])
    if key in ('plugins', 'fonts'):
        return ev.get(key) or ev.get('metadata', {}).get(key) or []
    if key in ('plugins_count', 'mimeTypes_count', 'fonts_count'):
        return ev.get(key) or ev.get('metadata', {}).get(key) or 0
    if key == 'canvas_hash':
        return ev.get('canvas_hash') or ev.get('metadata', {}).get('canvas_hash') or ev.get('canvas_hash')
    if key in ('webdriver', 'adblock', 'java_enabled'):
        return ev.get(key) or ev.get('metadata', {}).get(key)
    if key == 'connection_effective_type':
        return ev.get('connection_effective_type') or ev.get('metadata', {}).get('connection_effective_type')
    # Check saved request headers for arbitrary header-like keys (e.g., host, x-forwarded-for)
    rh = ev.get('request_headers') or {}
    if isinstance(key, str) and key in rh:
        return rh.get(key)
    # fallback to top-level
    return ev.get(key)


@app.post('/compare')
async def compare(request: Request):
    """Compare an incoming fingerprint payload to events in the DB and
    return per-attribute similarity percentages for recent events.
    """
    db = get_database()
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    # Attributes to compare (match frontend flattened keys)
    attrs = [
        'user_agent', 'timezone', 'timezone_offset_minutes', 'language', 'platform',
        'screen_width', 'screen_height', 'screen_colorDepth', 'screen_pixelDepth',
        'screen_availWidth','screen_availHeight','screen_availTop','screen_availLeft',
        'languages','deviceMemory','hardwareConcurrency','cookieEnabled','doNotTrack',
        'maxTouchPoints','product','productSub','vendor','vendorSub','buildID',
        'plugins_count','plugins','mimeTypes_count','webdriver','connection_effective_type',
        'fonts','fonts_count','canvas_hash','adblock','java_enabled'
    ]

    # Load recent events (limit to 200 for performance)
    cursor = db.events.find({}, sort=[('timestamp', -1)]).limit(200)
    results = []
    per_map = {}
    events_raw = []
    async for ev in cursor:
        # compute per-attribute similarity
        per = {}
        scores = []
        for a in attrs:
            incoming = None
            # resolve incoming flattened key from payload
            if a.startswith('screen_'):
                incoming = (payload.get('metadata') or {}).get('screen', {}).get(a.split('_',1)[1])
            elif a in ('plugins', 'fonts', 'languages'):
                incoming = payload.get(a) or (payload.get('metadata') or {}).get(a)
            else:
                incoming = payload.get(a) or (payload.get('metadata') or {}).get(a) or payload.get(a)

            stored = _get_attr(ev, a)

            # choose similarity function
            score = 0
            if isinstance(stored, (int, float)) or (isinstance(incoming, (int, float))):
                score = _numeric_similarity(incoming, stored)
            elif isinstance(stored, (list, tuple)) or isinstance(incoming, (list, tuple)):
                score = _jaccard_similarity(incoming, stored)
            else:
                score = _str_similarity(incoming, stored)

            per[a] = score
            scores.append(score)

        overall = int(sum(scores) / len(scores)) if scores else 0
        res_entry = {
            'id': str(ev.get('_id')) if ev.get('_id') else None,
            'timestamp': ev.get('timestamp'),
            'per_attribute': per,
            'score': overall
        }
        results.append(res_entry)
        if res_entry.get('id'):
            per_map[res_entry['id']] = per
        events_raw.append(ev)

    # sort by overall score descending and prepare top matches (still returned)
    results_sorted = sorted(results, key=lambda r: r['score'], reverse=True)[:10]

    # Compute incoming payload frequency-based similarity: for each attribute,
    # count how many stored events have the same value as the incoming payload.
    incoming_similarity = {}
    try:
        # normalize request headers for the incoming compare request
        try:
            req_headers = dict(request.headers)
        except Exception:
            req_headers = {k: v for k, v in request.headers.items()}
        req_headers_norm = {k.lower(): v for k, v in req_headers.items()}

        if events_raw:
            # Resolve incoming values for attributes
            incoming_vals = {}
            for a in attrs:
                # header aliases map
                header_aliases = {
                    'user_agent': 'user-agent',
                    'content_encoding': 'accept-encoding',
                    'content_language': 'accept-language',
                    'if_none_match': 'if-none-match',
                    'upgrade_insecure_requests': 'upgrade-insecure-requests',
                    'referer': 'referer'
                }
                if a in header_aliases:
                    incoming_vals[a] = req_headers_norm.get(header_aliases[a])
                elif a.startswith('screen_'):
                    incoming_vals[a] = (payload.get('metadata') or {}).get('screen', {}).get(a.split('_',1)[1])
                elif a in ('plugins', 'fonts', 'languages'):
                    incoming_vals[a] = payload.get(a) or (payload.get('metadata') or {}).get(a)
                else:
                    incoming_vals[a] = payload.get(a) or (payload.get('metadata') or {}).get(a) or payload.get(a)

            def _equal_attr(x, y):
                if x is None and y is None:
                    return True
                if x is None or y is None:
                    return False
                # lists/tuples: compare as sets
                if isinstance(x, (list, tuple)) or isinstance(y, (list, tuple)):
                    try:
                        sx = set(x or [])
                        sy = set(y or [])
                        return sx == sy
                    except Exception:
                        return False
                # numeric equality
                try:
                    if (isinstance(x, (int, float)) or (isinstance(x, str) and x.isdigit())) and (isinstance(y, (int, float)) or (isinstance(y, str) and y.isdigit())):
                        return float(x) == float(y)
                except Exception:
                    pass
                # string compare normalized
                try:
                    return str(x).strip().lower() == str(y).strip().lower()
                except Exception:
                    return False

            total = len(events_raw)
            for a, inc_val in incoming_vals.items():
                cnt = 0
                for ev in events_raw:
                    stored = _get_attr(ev, a)
                    if _equal_attr(inc_val, stored):
                        cnt += 1
                incoming_similarity[a] = int((cnt / total) * 100) if total > 0 else 0
    except Exception:
        incoming_similarity = {}

    # Compute uniqueness per event: average similarity to other events, uniqueness = 100 - avg_sim
    uniques = []
    n_events = len(events_raw)
    if n_events > 0:
        # Precompute attribute vectors if desired (we'll compute on the fly)
        for i, ev_i in enumerate(events_raw):
            sims = []
            for j, ev_j in enumerate(events_raw):
                if i == j:
                    continue
                # compute similarity between ev_i and ev_j across attrs
                attr_scores = []
                for a in attrs:
                    vi = _get_attr(ev_i, a)
                    vj = _get_attr(ev_j, a)
                    if isinstance(vi, (int, float)) or isinstance(vj, (int, float)):
                        s = _numeric_similarity(vi, vj)
                    elif isinstance(vi, (list, tuple)) or isinstance(vj, (list, tuple)):
                        s = _jaccard_similarity(vi, vj)
                    else:
                        s = _str_similarity(vi, vj)
                    attr_scores.append(s)
                sims.append(int(sum(attr_scores) / len(attr_scores)) if attr_scores else 0)
            avg_sim = int(sum(sims) / len(sims)) if sims else 0
            uniqueness = max(0, 100 - avg_sim)
            # collect stored attribute values for display
            attrs_map = {}
            for a in attrs:
                v = _get_attr(ev_i, a)
                # stringify simple values; join lists
                if isinstance(v, (list, tuple)):
                    attrs_map[a] = list(v)
                else:
                    attrs_map[a] = v

            uid = str(ev_i.get('_id')) if ev_i.get('_id') else None
            uniques.append({'id': uid, 'uniqueness': uniqueness, 'attributes': attrs_map, 'per_attribute': per_map.get(uid, {})})

    # sort uniques descending and take top 5
    uniques_sorted = sorted(uniques, key=lambda r: r['uniqueness'], reverse=True)[:5]

    return JSONResponse(jsonable_encoder({'matches': results_sorted, 'unique_ids': uniques_sorted, 'incoming_similarity': incoming_similarity}))
