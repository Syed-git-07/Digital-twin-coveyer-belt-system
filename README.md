# ConveyorLab

A complete conveyor digital twin with an operational React interface, a Python/SimPy physical model, live sensor observations, trained random-forest forecasts, constrained speed recommendations and matched experiments.

**No database is required.** Browser preferences and cached results use `localStorage`. The shared Python engine stores accounts, run records, commands and model artifacts in ordinary local files. A browser refresh does not reset a running line.

## Start on Windows

Requirements: **Python 3.12–3.14** and **Node.js 22.12+ or 24 LTS**.

Open PowerShell in this project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open **http://localhost:8080**. On first launch, create your operator username and password. No credentials are supplied or committed. Keep the terminal open while using the application; press Ctrl+C to stop.

The script creates `.venv`, installs the locked dependencies, builds the frontend and starts the API and independent simulation worker. For subsequent launches without reinstalling or rebuilding:

```powershell
.\.venv\Scripts\python.exe scripts/run.py
```

Linux/macOS:

```sh
sh scripts/start.sh
```

## Start with Docker

Start Docker Desktop / the Docker engine first:

```powershell
docker compose up --build
```

Open **http://localhost:8080** and create the initial operator. Three services run: frontend/proxy, API, and simulation worker. The `conveyor-data` volume persists local files. There is no PostgreSQL, SQLite, Redis or database migration step.

Optional environment configuration:

```powershell
Copy-Item .env.example .env
```

Set a unique `SETUP_TOKEN` before exposing a fresh deployment outside localhost. On HTTPS deployments also set `SECURE_COOKIES=true` and `ALLOWED_ORIGINS` to the exact public origin. See [deployment](docs/deployment.md).

## What is included

- **Overview:** six live measurements, selectable three-zone conveyor, actual parcel positions, sensor charts, alert acknowledgment and prediction summary.
- **Simulation:** start, pause, resume, end, reset through a new run, emergency stop/clear, 1×/2×/5×/10× clocks, speed and rate settings, five injected fault types, audit timeline and conservation counts.
- **Predictions:** bottleneck probability and throughput forecast, measured held-out evaluation, model-level importance, six-candidate simulation search, apply/revert and optional automatic control.
- **Experiments:** one, three or five matched seeds; identical exogenous workload and fault schedules; independent baseline and optimized runs; variability, workload accounting, curves and CSV/JSON exports.
- **History:** searchable run archive, scenario/state/date filters, read-only telemetry playback, configuration and summary downloads, telemetry CSV and printable reports.
- **Settings:** validated physical and sensor limits, reduced motion preference, browser data export and cache clearing.
- **Access:** operator and viewer roles, scrypt password hashing, HttpOnly sessions, CSRF tokens, origin checks, bounded login/job requests.

The included model was actually trained on **100 independent runs / 3,100 samples**. Held-out test results: F1 **0.9525**, precision **0.9389**, recall **0.9665**, throughput MAE **2.7133 parcels/min**. Full evaluation, run splits, fingerprint and feature importance are in [artifacts/evaluation.json](artifacts/evaluation.json). These scores describe this synthetic model only.

## Daily workflow

1. Choose **New run → Balanced operation → Create run**.
2. Press **Start line**. Select 10× to advance the demonstration quickly.
3. Open **Simulation**. Lower outfeed service to 8 parcels/min and increase arrivals to 45 parcels/min to create congestion.
4. Open **Predictions** after at least 30 simulation seconds. Evaluate settings, then apply a recommendation if a safe improvement exists. A constrained outfeed can correctly produce no beneficial speed change.
5. Open **Experiments** and run a matched comparison.
6. End the live run. Open **History** to play back telemetry and export the record.

See the [demonstration script](docs/demo.md).

## Train or regenerate data

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m app.ml.pipeline --runs 100 --duration 240
# Dataset only:
.\.venv\Scripts\python.exe -m app.ml.pipeline --runs 100 --duration 240 --dataset-only
```

The UI's **Train** action runs in the worker's isolated process while live telemetry continues. For a manual training command, avoid running a second training job at the same time. New artifacts are activated by the worker when their modification time changes.

Docker:

```powershell
docker compose exec worker python -m app.ml.pipeline --runs 100 --duration 240
```

The bundled artifact is copied into the local data directory only when no model exists. To deliberately test the model-unavailable state, use an isolated data directory and temporarily move the bundled model aside; never delete a model needed by a live deployment.

## Bootstrap and viewer accounts

The first operator can be created in the first-launch screen or with an idempotent CLI command:

```powershell
$env:PYTHONPATH = 'backend'
$env:CONVEYOR_USERNAME = 'your-operator-name'
$env:CONVEYOR_PASSWORD = 'your-own-long-password'
.\.venv\Scripts\python.exe -m app.api.auth
Remove-Item Env:CONVEYOR_PASSWORD
```

For a viewer, set their own credentials and run:

```powershell
.\.venv\Scripts\python.exe -m app.api.auth --role viewer
```

CLI bootstrap preserves an existing account instead of silently resetting its password. Docker accepts environment variables with `docker compose exec -e CONVEYOR_USERNAME -e CONVEYOR_PASSWORD api python -m app.api.auth --role viewer`.

## Tests

Backend:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Pop-Location
```

Frontend build and browser acceptance (against a running application):

```powershell
Push-Location frontend
npm ci
npm run build
npx playwright install chromium
$env:BASE_URL = 'http://127.0.0.1:8080'
$env:TEST_USERNAME = 'your-test-operator'
$env:TEST_PASSWORD = 'your-test-password'
npm run test:e2e
Pop-Location
```

Use an **isolated data directory** for acceptance: tests create/end runs and change settings. Set `CONVEYOR_DATA` before starting `scripts/run.py`. The tests bootstrap their own account if this directory is empty; the default password in the test fixture is for isolated test data only.

For frontend development, run `npm run dev` in `frontend/`, API on port 8000 and worker on port 8001. Vite proxies `/api` including WebSockets. Full production startup uses port 8080 instead.

## Project map

```text
frontend/               React, TypeScript, Tailwind, Radix, Recharts, Playwright
backend/app/api/        Public API, sessions, authorization, exports, live sockets
backend/app/models/     Validated configuration and reproducible scenarios
backend/app/simulation/ Parcel process, optimization and matched experiments
backend/app/ml/         Shared features, dataset generation, training, inference
backend/app/worker.py   Authoritative simulation owner and bounded background jobs
backend/tests/         Behavioral and API tests
artifacts/             Trained forest models, actual evaluation and training data
scripts/               Local startup
deployment/            Frontend Dockerfile and reverse proxy
docs/                  Technical model, deployment, API and demonstration
data/                  Local runtime files (created automatically; not source)
```

## Boundaries

- This is a **local-file, single-host deployment**. Run one API process and one worker; the worker acquires an OS file lock. Do not scale replicas or use a network filesystem for the data directory.
- Engine state survives a browser disconnect. A worker restart marks the previous run **interrupted** and starts a new idle run; it does not pretend to simulate downtime.
- Recorded telemetry is retained for the most recent 7,200 simulation seconds per run; default file retention is 50 runs. Browser archives keep eight runs with their last 600 readings. Full retained telemetry is available from the engine.
- History playback replays recorded sensor data. It does not reconstruct historical parcel animation, because full parcel positions are not recorded at every sensor interval.
- Results validate the educational model, not an uncalibrated real conveyor. There are no invented OEE scores, external AI calls or guaranteed optimization gains.

Detailed design and assumptions: [technical guide](docs/technical.md). API usage: [API guide](docs/api.md).
"# Digital-twin-coveyer-belt-system" 
