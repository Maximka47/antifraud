# Anti-Fraud MVP

Minimal Anti-Fraud MVP (Sprint 1) — FastAPI backend with a single `/collect` endpoint, MongoDB storage, JSON logging, and a simple static page that posts a fingerprint payload.

Quick start (requires Docker & Docker Compose):

```powershell
# build & run
docker-compose up --build

# visit collector UI
# http://localhost:8000/

# stop
docker-compose down
```

Project layout (key files):
- `src/backend/app` — FastAPI app
- `src/backend/static` — simple collector UI
- `Dockerfile.backend` — backend image
- `docker-compose.yml` — starts backend + MongoDB
- `requirements/base.txt` — Python deps

If you want the local development environment without Docker, install requirements and run:

```powershell
python -m pip install -r requirements/base.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Enjoy — tell me if you want user auth, `/analyze` endpoint, or a React dashboard next.
