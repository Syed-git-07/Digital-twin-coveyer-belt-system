import asyncio
import csv
import io
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError

from app.api.auth import Credentials, create_user, login, require, session_user, AUTH_LOCK
from app.storage import internal_token, read, write

WORKER = os.getenv('WORKER_URL', 'http://127.0.0.1:8001')
CLIENT = None
attempts = defaultdict(deque)


@asynccontextmanager
async def lifespan(app):
    global CLIENT
    CLIENT = httpx.AsyncClient(base_url=WORKER, timeout=30)
    yield
    await CLIENT.aclose()


app = FastAPI(title='ConveyorLab API', version='1.0.0', lifespan=lifespan, docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url='/api/redoc')


def origins(request):
    configured = os.getenv('ALLOWED_ORIGINS', '')
    return configured.split(',') if configured else [str(request.base_url).rstrip('/'), 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8090', 'http://127.0.0.1:8090']


def rate_limit(key, count, seconds):
    now = time.monotonic()
    values = attempts[key]
    while values and values[0] < now - seconds:
        values.popleft()
    if len(values) >= count:
        raise HTTPException(429, 'Too many requests. Wait a minute and retry.')
    values.append(now)


@app.middleware('http')
async def protections(request: Request, call_next):
    if int(request.headers.get('content-length', '0')) > 65536:
        return JSONResponse({'detail': 'Request is too large'}, status_code=413)
    origin = request.headers.get('origin')
    if request.method not in ('GET', 'HEAD') and origin and origin not in origins(request):
        return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
    return JSONResponse({'detail': '; '.join(f'{".".join(str(p) for p in e["loc"][1:])}: {e["msg"]}' for e in error.errors())}, status_code=422)


async def worker(path, method='GET', body=None):
    try:
        response = await CLIENT.request(method, path, json=body, headers={'x-worker-token': internal_token()})
        if response.status_code >= 400:
            raise HTTPException(response.status_code, response.json().get('detail', 'Worker rejected request'))
        return response.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(503, 'Simulation worker is unavailable. Check that it is running.')


@app.get('/api/health')
async def health():
    await worker('/health')
    return {'status': 'ok', 'storage': 'local-files', 'database': False}


@app.get('/api/auth/status')
def auth_status(request: Request):
    return {'setup_required': not bool(read('users.json', {})), 'setup_token_required': bool(os.getenv('SETUP_TOKEN')), 'user': session_user(request.cookies.get('conveyor_session', ''))}


@app.post('/api/auth/setup')
def setup(body: Credentials, request: Request, response: Response):
    rate_limit('setup:' + request.client.host, 5, 60)
    with AUTH_LOCK:
        if read('users.json', {}):
            raise HTTPException(409, 'Initial setup is already complete')
        if os.getenv('SETUP_TOKEN') and body.setup_token != os.environ['SETUP_TOKEN']:
            raise HTTPException(403, 'Setup token is incorrect')
        create_user(body.username, body.password)
    return login(body, response)


@app.post('/api/auth/login')
def sign_in(body: Credentials, request: Request, response: Response):
    rate_limit('login:' + request.client.host, 10, 60)
    return login(body, response)


@app.post('/api/auth/logout')
def logout(request: Request, response: Response):
    require(request)
    with AUTH_LOCK:
        sessions = read('sessions.json', {})
        sessions.pop(request.cookies.get('conveyor_session'), None)
        write('sessions.json', sessions)
    response.delete_cookie('conveyor_session', path='/')
    return {'status': 'signed_out'}


@app.get('/api/{resource}')
async def get_resource(resource: str, request: Request):
    require(request)
    if resource not in ('snapshot', 'scenarios', 'runs', 'experiments', 'models'):
        raise HTTPException(404, 'Resource not found')
    return await worker('/' + resource)


@app.get('/api/runs/{run_id}')
async def run_detail(run_id: str, request: Request):
    require(request)
    if not run_id.isalnum():
        raise HTTPException(400, 'Invalid run ID')
    return await worker('/runs/' + run_id)


@app.post('/api/commands')
async def commands(request: Request):
    user = require(request, operator=True)
    rate_limit('commands:' + user['username'], 120, 60)
    body = await request.json()
    body['actor'] = user['username']
    return await worker('/commands', 'POST', body)


@app.post('/api/jobs/{kind}')
async def jobs(kind: str, request: Request):
    user = require(request, operator=True)
    rate_limit('jobs:' + user['username'], 12, 60)
    return await worker('/jobs/' + kind, 'POST', await request.json())


@app.get('/api/runs/{run_id}/telemetry.csv')
async def export(run_id: str, request: Request):
    require(request)
    if not run_id.isalnum():
        raise HTTPException(400, 'Invalid run ID')
    run = await worker('/runs/' + run_id)
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer)
    writer.writerow(['run_id', 'observation_utc', 'simulation_time_s', 'speed_m_s', 'load_kg', 'temperature_C', 'queue_parcels', 'occupancy_pct', 'throughput_parcels_min', 'power_kW', 'sensor_quality', 'provenance'])
    def safe(value):
        return "'" + value if isinstance(value, str) and value.startswith(('=', '+', '-', '@', '\t', '\r')) else value
    for row in run['telemetry']:
        writer.writerow([safe(v) for v in [run_id, row['timestamp'], row['simulation_time'], row['speed'], row['load'], row['temperature'], row['queue'], row['occupancy'], row['throughput'], row['power'], row['quality'], 'ConveyorLab simulated sensors v1']])
    return Response(buffer.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="conveyor-{run_id}.csv"'})


@app.websocket('/api/ws')
async def websocket(ws: WebSocket):
    user = session_user(ws.cookies.get('conveyor_session', ''))
    origin = ws.headers.get('origin')
    allowed = os.getenv('ALLOWED_ORIGINS', '').split(',') if os.getenv('ALLOWED_ORIGINS') else ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8090', 'http://127.0.0.1:8090', 'http://' + ws.headers.get('host', ''), 'https://' + ws.headers.get('host', '')]
    if not user or origin not in allowed:
        await ws.close(code=1008)
        return
    await ws.accept()
    last = None
    try:
        while True:
            if not session_user(ws.cookies.get('conveyor_session', '')):
                await ws.close(code=1008)
                break
            try:
                snapshot = await worker('/snapshot')
                key = (snapshot['run_id'], snapshot['sequence'])
                message = {'type': 'snapshot' if last is None or last[0] != key[0] else 'update', 'previous_sequence': last[1] if last else None, 'data': snapshot}
                await asyncio.wait_for(ws.send_json(message), timeout=5)
                last = key
            except HTTPException:
                await ws.send_json({'type': 'unavailable', 'message': 'Worker connection lost'})
            await asyncio.sleep(0.5)
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
        pass


@app.get('/{path:path}', include_in_schema=False)
async def frontend(path: str):
    root = Path(__file__).resolve().parents[3] / 'frontend' / 'dist'
    target = (root / (path or 'index.html')).resolve()
    if root.resolve() not in target.parents or not target.is_file():
        raise HTTPException(404, 'File not found. Build the frontend with npm run build.')
    return FileResponse(target)
