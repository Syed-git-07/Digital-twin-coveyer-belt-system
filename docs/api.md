# API usage

Interactive OpenAPI: `http://localhost:8090/api/docs`.

All endpoints except health and authentication status require a server-managed `conveyor_session` cookie. Mutating authenticated requests also require `X-CSRF-Token` returned by login/status. Viewer sessions can read and export; only operators can command or start jobs.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | API + worker readiness |
| GET | `/api/auth/status` | Setup flags, current session and CSRF |
| POST | `/api/auth/setup` | Initial operator only; optional deployment setup token |
| POST | `/api/auth/login` | Username/password → HttpOnly cookie + role + CSRF |
| POST | `/api/auth/logout` | Revoke current session |
| GET | `/api/snapshot` | Full bounded latest twin |
| GET | `/api/scenarios` | Seeds, configurations and schedules |
| POST | `/api/commands` | Apply ordered idempotent worker commands |
| POST | `/api/jobs/recommendation` | Evaluate candidate operating settings |
| POST | `/api/jobs/experiment` | Run matched baseline/optimized comparisons |
| POST | `/api/jobs/training` | Generate dataset and train local models |
| GET | `/api/runs` | Bounded run archive list |
| GET | `/api/runs/{id}` | Run config, telemetry, events, alerts, predictions, metrics |
| GET | `/api/runs/{id}/telemetry.csv` | Bounded telemetry export with units/provenance |
| GET | `/api/experiments` | Latest 30 comparison results |
| GET | `/api/models` | Active evaluation metadata, or null |
| WS | `/api/ws` | Cookie-authenticated, origin-validated live snapshots/heartbeats |

## Commands

```json
{
  "idempotency_key": "client-generated-uuid-reuse-on-retry",
  "action": "settings",
  "values": {"speeds": [0.8, 0.9, 0.8], "service_rate": 30}
}
```

The API overwrites the actor with the authenticated username. Responses contain ID, timestamp, action and applied/rejected status. A rejected command includes an actionable `error`. HTTP validation/authorization failures use `detail` and an appropriate 4xx status. Worker outages return 503; internal tracebacks are not returned.

| Action | Values |
|---|---|
| new | `{ "scenario": "balanced", "config": { "seed": 42 } }` (config overrides optional) |
| start / pause / resume / end / estop / clear_estop | `{}` |
| speed | `{ "speed": 1 }` (1,2,5,10) |
| settings | any validated editable configuration fields |
| fault | `{ "kind": "blockage", "active": true }` |
| acknowledge | `{ "id": "alert-id" }` |
| apply | `{ "id": "recommendation-id" }` |
| revert | `{}` |
| automatic | `{ "enabled": true }` |

Fault kinds: `blockage`, `friction`, `surge`, `heating`, `sensor`.

Experiment body: `{"scenario":"balanced","duration":300,"seeds":[42,43,44]}`. Duration 120–900 s; one to five seeds. Training body: `{"runs":100}`, bounded 100–500. Recommendation body: `{}`. Jobs return ID/kind/status; poll the snapshot's `job` property. Only one expensive job can run at once. Completed experiment results are available in `/api/experiments`; recommendations are in the current snapshot.

## WebSocket contract

```json
{
  "type": "snapshot",
  "previous_sequence": null,
  "data": {
    "schema_version": 1,
    "run_id": "…",
    "sequence": 31,
    "simulation_time": 30,
    "timestamp": "UTC ISO-8601",
    "state": "running"
  }
}
```

`data` also contains configuration, metrics, actual parcels by zone, latest sensor observation, last 180 telemetry samples, faults, alerts, events, forecasts, job and recommendation. Updates are complete snapshots to make recovery bounded and straightforward. `previous_sequence` links transmitted snapshots; a mismatch triggers REST resynchronization. Simulation speed can skip intermediate observation sequences between broadcasts; that is expected and represented by the linkage, not treated as a network gap. A paused line continues to send snapshots. Worker unavailability sends `type=unavailable`.

## Exports

Sensor CSV headers embed units (`speed_m_s`, `load_kg`, `temperature_C`, `throughput_parcels_min`, `power_kW`) alongside UTC, simulation time, run ID and provenance. Missing values export as empty fields, not zeros. User-controlled text values beginning with a spreadsheet formula prefix are neutralized. Run configuration, summaries, experiments and evaluation can also be exported as JSON through UI actions.

## Bounds

Sessions expire after 12 h. Login: ten attempts/minute per address; initial setup: five/minute. Commands: 120/minute per user; expensive job submission: 12/minute, with only one active. Request bodies are capped at 64 KiB; the production proxy enforces this independently. Telemetry exports use retained observations only. Restrict the deployment to the documented single API process because rate-limit counters and account-file transaction ownership are local to it.
