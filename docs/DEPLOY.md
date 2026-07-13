# Deploying Abrany

Abrany is a **single always-on Node server** (not serverless): it runs an in-process
background worker and stores data in a local SQLite file. So it needs a host that gives you
**one long-lived instance with a persistent disk**. Good fits: **Railway, Render, Fly.io, or any
VPS with Docker.** It will **not** work on Vercel/Netlify (ephemeral filesystem, no long-lived
process).

## What you need
- A host that runs a Docker image (or `next start`) on one instance with a **persistent volume**.
- The env vars from `.env.example` set on the host (secrets, not committed).
- A persistent volume mounted where `DATA_DIR` points (default `/data`) — this holds the SQLite DB.

## Required env vars (set on the host)
- `SESSION_SECRET` — random 64-char hex (`openssl rand -hex 32`).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the owner account (uses the built-in AI keys).
- `MINIMAX_API_KEY` and/or `KIMI_API_KEY` (+ `LLM_PROVIDER=balanced`) — the owner's AI.
- `BRAVE_SEARCH_API_KEY` — optional (current-info lessons).
- `DATA_DIR=/data` — points at the persistent volume.

Everyone except the owner brings their own AI key in **Settings** (DeepSeek/OpenRouter/MiniMax/
Kimi), so public users spend their own quota — not yours.

## Railway (simplest)
1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub → pick the repo. It auto-detects the `Dockerfile`.
3. Add a **Volume** mounted at `/data`.
4. Add the env vars above (Variables tab).
5. Deploy. Railway gives you a public URL. Health check path: `/api/health`.

## Render
1. New → Web Service → connect the repo → Runtime: **Docker**.
2. Add a **Disk** mounted at `/data` (1 GB is plenty to start).
3. Set env vars; Health Check Path `/api/health`.
4. Keep it on a single instance (no autoscaling — see below).

## Fly.io
1. `fly launch` (uses the Dockerfile). Say no to Postgres.
2. `fly volumes create data --size 1` and mount it at `/data` in `fly.toml`.
3. `fly secrets set SESSION_SECRET=... ADMIN_EMAIL=... ADMIN_PASSWORD=... MINIMAX_API_KEY=... KIMI_API_KEY=... BRAVE_SEARCH_API_KEY=...`
4. Set `min_machines_running = 1` and a single machine. `fly deploy`.

## Docker locally
```
docker build -t abrany .
docker run -p 3000:3000 -v abrany-data:/data \
  -e SESSION_SECRET=... -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... \
  -e MINIMAX_API_KEY=... -e KIMI_API_KEY=... -e LLM_PROVIDER=balanced \
  -e BRAVE_SEARCH_API_KEY=... abrany
```

## Important constraints
- **Single instance only.** The background worker and the SQLite file are per-process, so do
  **not** enable autoscaling / multiple replicas — a second instance can't share the SQLite file.
- **Back up the volume** — it holds all user data.
- **Scaling up later:** to run multiple instances, migrate storage to a shared DB (Turso/libSQL is
  SQLite-compatible with a network driver; the repo's `node:sqlite` calls in `lib/db.ts`/`lib/repo.ts`
  are the only place to swap) and move the worker to its own process or a queue service.
- Set a real `ADMIN_PASSWORD` and a strong `SESSION_SECRET` before going public.
