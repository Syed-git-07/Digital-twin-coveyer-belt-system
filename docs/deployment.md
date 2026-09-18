# Deployment and operations

## Local Windows

Run `powershell -ExecutionPolicy Bypass -File .\start.ps1` from the project folder. Startup uses Python and Node, no database. The frontend production build and API are served at localhost:8090; the worker binds localhost:8001. Both are separate subprocesses. `.venv` and `data` are created automatically. On first launch create an operator in the browser.

For frontend development, start three terminals:

```powershell
# Terminal 1, root folder
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m uvicorn app.worker:app --host 127.0.0.1 --port 8001

# Terminal 2, root folder
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000

# Terminal 3
Set-Location frontend
npm run dev
```

Visit localhost:5173. Do not use `--reload` on the authoritative worker while demonstrating a run: restarting it intentionally interrupts the run. The API can restart without restarting the worker.

## Docker Compose

```sh
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs --tail 100 worker
```

The frontend proxy listens on **127.0.0.1:8090**, with no public worker/API ports. The API and worker share the durable `conveyor-data` local volume. The worker uses an OS-level file lock; do not scale it. Run one API process for file-based session transactions. `docker compose down` preserves data; `down -v` removes the volume and must only be used when intentionally deleting all local records.

Initial setup and passwords are not baked into images. Set `SETUP_TOKEN` before first remote access, then create your operator in the browser. Alternatively bootstrap with environment variables and the CLI described in the README. Once an operator exists, the setup endpoint cannot create another.

## Linux VPS and HTTPS

Use a persistent Linux host with Docker Engine and Compose. Do not deploy the continuous worker to a short-lived serverless request environment. A small machine with at least 2 CPU cores and 2 GB memory is appropriate for the included dataset and one background job; measure before increasing the training run count.

1. Copy source to `/opt/conveyorlab` or a directory owned by your deployment user.
2. Copy `.env.example` to `.env`, set a strong random `SETUP_TOKEN`, `SECURE_COOKIES=true` and `ALLOWED_ORIGINS=https://conveyor.example.org`.
3. Run `docker compose up --build -d`.
4. Put a TLS reverse proxy such as Caddy in front of localhost:8090:

```caddyfile
conveyor.example.org {
    reverse_proxy 127.0.0.1:8090
    header Strict-Transport-Security "max-age=31536000"
}
```

5. Point DNS to the host, allow inbound 80/443, and let the proxy issue certificates. Keep 8000/8001 private and keep the Compose port bound to loopback.
6. Open the HTTPS origin, enter the one-time setup token, create the operator, and verify a running line receives WebSocket updates. Browsers must use the exact allowed origin including scheme/port.

No paid API or cloud account is required. The inner Nginx proxy forwards upgrade headers and disables buffering for live connections.

## Storage and backups

Set `CONVEYOR_DATA` for a custom local directory; Compose fixes it to `/data` inside the named volume. Run retention defaults to 50 files (`CONVEYOR_KEEP_RUNS`). Each run retains the last 7,200 simulated seconds. Maximum export and live payload sizes follow these bounds. Command idempotency retains 1,000 entries. Session storage retains up to 100 unexpired session records. Experiment browsing lists the latest 30 results; older experiment files remain on disk until deliberately archived.

For a consistent backup, stop API and worker writes first. Linux example:

```sh
docker compose stop api worker
mkdir -p backups
docker run --rm -v conveyorlab_conveyor-data:/data:ro -v "$PWD/backups:/backup" alpine:3.22 sh -c 'tar czf /backup/conveyor-data.tgz -C /data .'
docker compose start worker api
```

Check the actual volume name with `docker volume ls` if you override the Compose project name. Backups include hashed user records and active sessions, so store them privately. A restore should happen into a stopped deployment and the intended named volume:

```sh
docker compose stop api worker
docker run --rm -v conveyorlab_conveyor-data:/data -v "$PWD/backups:/backup:ro" alpine:3.22 sh -c 'tar xzf /backup/conveyor-data.tgz -C /data'
docker compose start worker api
```

For a clean rollback, restore into an empty replacement volume created deliberately for that backup rather than combining older and newer files. Local Windows deployments can stop the app and copy the whole `data` folder to a private backup location. Settings → Export browser backup covers only that browser's cache; it is not a server backup.

## Updates

End the active run first. Back up data, update source, then `docker compose up --build -d`. No migrations are required. The persisted model is preserved; a source artifact is seeded only when the volume has no model. Schema version 1 is embedded in telemetry and browser backups. Future schema changes should include explicit converters, not silent data resets.

Worker restart marks any previously running/paused/stopped run interrupted and preserves its final recorded observations. Up to the last five wall seconds between checkpoints can be absent after a hard crash. A new idle run is created; restart does not claim that downtime was simulated. Background jobs interrupted by restart are marked failed and can be rerun.

## Troubleshooting

| Symptom | Check |
|---|---|
| `docker API ... pipe` / daemon connection failure | Start Docker Desktop / Docker engine, then retry Compose. |
| `Connection unavailable` | Worker must be on 8001 and API on 8090 (production) or 8000 (Vite). Check worker/API logs. |
| Worker lock acquisition fails | Another worker owns the same data directory. End that instance or choose a distinct test directory. Do not remove the lock while its process is alive. |
| Login works but controls fail | Refresh the session, confirm operator role, check Origin and CSRF settings. |
| WebSocket rejected | Set `ALLOWED_ORIGINS` to the exact browser origin; use the same origin for frontend/API. |
| Secure session not retained | `SECURE_COOKIES=true` requires HTTPS. Keep false for localhost HTTP. |
| Forecast says collecting history | Wait 30 simulation seconds after starting. |
| Forecast says degraded | Check sensor fault and quality. Clear fault, then wait for a sufficiently healthy history window. |
| No beneficial recommendation | Current configuration or downstream service may already constrain the result; the optimizer does not invent a gain. |
| Thermal restart rejected | Clear heating fault and wait below the recovery threshold, then explicitly start. |
| Browser export cache full | Export/clear browser cache from Settings; engine files remain available. |
| Training job fails | Check worker logs, available memory, filesystem permissions and the one-job limit. |

## Verification status

The development environment can execute local Python/Node/browser tests. Docker configuration can be parsed without a running daemon. A full container image build, Linux container health check and TLS deployment require the Docker engine/target host and are reported separately in the delivered verification record.
