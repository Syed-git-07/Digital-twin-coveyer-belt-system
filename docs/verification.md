# Delivery verification

Verified locally on Windows with Python 3.14.6 and Node.js 24.16.0.

- Backend: **25 tests passed**. Includes conservation, geometry/weight capacities, seeded determinism, serialized-state reconstruction, dynamic speed changes, pause, emergency stop, thermal interlocks, dropout isolation, congestion/recovery, alert lifecycle, past-only features, isolated matched experiments, authorization, CSRF and disjoint training splits.
- Frontend: TypeScript checks and **Vite production build passed**.
- Browser: **2 Playwright acceptance tests passed against the production build**. Covered operator sign-in, actual parcel motion, reload persistence, paused clock, constrained outfeed congestion, forecast availability, applying a beneficial recommendation, a newly completed matched comparison with equal generated workload, ending a run, history, telemetry download, browser archive persistence, mobile navigation, reconnect/resynchronization and command idempotency.
- Model: **100 independent runs, 3,100 samples** generated and trained. Actual evaluation and model artifacts are included. Held-out test F1: 0.952479; throughput MAE: 2.713255 parcels/min.
- Scenarios: all seven supplied presets ran for 300 simulation seconds. `artifacts/scenario-validation.json` contains their measured outcomes. Balanced completed 104 parcels with zero rejections; slow outfeed reached a queue of 33; friction triggered thermal shutdown; sensor interruption increased missing observations; blockage recovery resumed completions.
- Deployment: `docker compose config --quiet` passed. API documentation and health endpoint responded successfully on the local production server.

**Not executed:** Docker image build/container startup and VPS HTTPS deployment, because the Docker daemon was not running in this environment. Local Python/Node production operation was verified instead.

The backend test runner emits two upstream Starlette/httpx deprecation warnings; tests pass. Test credentials exist only in the isolated acceptance data directory and test fixtures, not as a default production account.

The current development session uses `data/acceptance` and port 8090. A normal fresh launch uses `data` and presents initial operator setup. Runtime account/session files and dependency folders are excluded from the delivery ZIP.
