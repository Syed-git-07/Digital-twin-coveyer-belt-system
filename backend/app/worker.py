"""The only owner of live physical state. Run exactly one instance."""
import asyncio
import json
import logging
import os
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

from app.ml.pipeline import Predictor, train
from app.models.config import Config, SCENARIOS
from app.simulation.engine import Conveyor, utc
from app.simulation.optimization import experiment, optimize
from app.storage import DATA, internal_token, read, write, seed_artifacts

logger = logging.getLogger('conveyor.worker')
logging.basicConfig(level=logging.INFO, format='%(message)s')


def run_optimization(state):
    return optimize(Conveyor.reconstruct(state))


class Command(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    action: str = Field(max_length=40)
    values: dict = Field(default_factory=dict)
    actor: str = Field('operator', max_length=100)


class Runtime:
    def __init__(self):
        seed_artifacts()
        self.sim = Conveyor()
        self.speed = 1
        self.commands = read('commands.json', {})
        self.predictor = Predictor()
        self.prediction = {'status': 'unavailable', 'message': 'Model unavailable', 'horizon': 60}
        self.recommendation = None
        self.previous = None
        self.automatic = False
        self.job = read('job.json')
        if self.job and self.job['status'] in ('running', 'pending'):
            self.job.update(status='failed', error='Worker restarted; rerun the job.')
        self.pool = None
        self.lock = None
        self.last_prediction = -5
        self.last_auto = -60
        self.last_tick = time.monotonic()

    def acquire(self):
        self.lock = (DATA / 'worker.lock').open('a+b')
        self.lock.write(b'0')
        self.lock.flush()
        self.lock.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def save(self):
        snapshot = self.sim.snapshot(7200)
        write('current.json', snapshot)
        write(f'runs/{self.sim.run_id}.json', snapshot)
        files = sorted((DATA / 'runs').glob('*.json'), key=lambda p: p.stat().st_mtime)
        for path in files[:-int(os.environ.get('CONVEYOR_KEEP_RUNS', '50'))]:
            path.unlink()

    def snapshot(self):
        return self.sim.snapshot(180) | {'simulation_speed': self.speed, 'prediction': self.prediction, 'recommendation': self.recommendation, 'automatic': self.automatic, 'job': self.job}

    def apply_recommendation(self, rec_id, actor):
        rec = self.recommendation
        if not rec or rec['id'] != rec_id or rec['status'] != 'available':
            raise ValueError('No applicable recommendation')
        if rec['run_id'] != self.sim.run_id or self.sim.t - rec['source_time'] > 30 or self.sim.state != 'running':
            raise ValueError('Recommendation expired. Generate a new one.')
        if self.sim.last_adjustment > rec['source_time'] or self.sim.t - self.sim.last_adjustment < 30 or self.sim.faults or max(self.sim.temperatures) >= self.sim.config.warning - 5:
            raise ValueError('Settings or safety conditions changed. Generate a new recommendation.')
        if not self.sim.history or self.sim.history[-1]['quality'] != 'good':
            raise ValueError('Sensor quality is insufficient')
        # Re-run the proposed settings from the current physical state for safety.
        trial = self.sim.clone()
        trial.config = Config(**(trial.config.model_dump() | {'speeds': rec['proposed']['speeds']}))
        trial.advance(60)
        if trial.state != 'running' or max(trial.temperatures) >= trial.config.warning:
            raise ValueError('Recommendation no longer passes the thermal constraint')
        self.previous = self.sim.config.speeds[:]
        self.sim.command('settings', {'speeds': rec['proposed']['speeds']}, actor)
        rec['status'] = 'applied'

    async def start_job(self, kind, values):
        if self.job and self.job['status'] == 'running':
            raise ValueError('Another job is running. Wait for it to finish.')
        if kind == 'training':
            runs = int(values.get('runs', 100))
            if not 100 <= runs <= 500:
                raise ValueError('Choose between 100 and 500 runs')
            fn, args = train, (runs, 240)
        elif kind == 'experiment':
            duration = int(values.get('duration', 300))
            scenario = values.get('scenario', 'balanced')
            seeds = values.get('seeds', [42, 43, 44])
            if not 120 <= duration <= 900 or scenario not in SCENARIOS or not 1 <= len(seeds) <= 5 or any(not isinstance(s, int) or not 0 <= s <= 2147483647 for s in seeds):
                raise ValueError('Invalid experiment configuration')
            fn, args = experiment, (scenario, duration, seeds)
        elif kind == 'recommendation':
            if self.sim.state != 'running':
                raise ValueError('Start the line before evaluating settings')
            fn, args = run_optimization, (self.sim.serializable(),)
        else:
            raise ValueError('Unknown job')
        self.job = {'id': uuid.uuid4().hex[:12], 'kind': kind, 'status': 'running', 'created_at': utc()}
        write('job.json', self.job)
        asyncio.create_task(self.finish_job(fn, args, self.job))
        return self.job

    async def finish_job(self, fn, args, job):
        try:
            result = await asyncio.get_running_loop().run_in_executor(self.pool, fn, *args)
            job.update(status='completed', finished_at=utc())
            if job['kind'] == 'experiment':
                write(f'experiments/{result["id"]}.json', result)
                job['result_id'] = result['id']
            elif job['kind'] == 'recommendation':
                if result['run_id'] == self.sim.run_id:
                    self.recommendation = result
                if result['run_id'] == self.sim.run_id and self.automatic and result['status'] == 'available':
                    try:
                        self.apply_recommendation(result['id'], 'automatic')
                    except ValueError as error:
                        self.sim.event('automatic', str(error))
            self.save()
        except Exception as error:
            logger.exception(json.dumps({'event': 'job_failed', 'job_id': job['id']}))
            job.update(status='failed', error=str(error) if isinstance(error, ValueError) else 'Job failed. Check the worker log and retry.')
        write('job.json', job)

    async def loop(self):
        previous = time.monotonic()
        remainder = 0.
        saved = previous
        while True:
            await asyncio.sleep(0.1)
            now = time.monotonic()
            elapsed = min(now - previous, 0.5)
            previous = now
            self.last_tick = now
            if self.sim.state not in ('idle', 'paused', 'ended', 'interrupted'):
                remainder += elapsed * self.speed
                steps = int(remainder / 0.2)
                remainder -= steps * 0.2
                self.sim.advance(steps * 0.2)
            else:
                remainder = 0
            if self.sim.t - self.last_prediction >= 5:
                self.prediction = self.predictor.predict(self.sim.history)
                self.last_prediction = self.sim.t
                if self.prediction['status'] == 'ready':
                    self.sim.predictions.append(self.prediction)
                    self.sim.predictions = self.sim.predictions[-1440:]
            if self.automatic:
                if self.sim.state != 'running' or self.sim.faults or not self.sim.history or self.sim.history[-1]['quality'] != 'good':
                    self.automatic = False
                    self.sim.event('automatic', 'Automatic control disengaged by safety interlock')
                elif self.sim.t - self.last_auto >= 60 and not (self.job and self.job['status'] == 'running'):
                    self.last_auto = self.sim.t
                    await self.start_job('recommendation', {})
            if now - saved >= 5:
                self.save()
                saved = now


runtime = Runtime()


@asynccontextmanager
async def lifespan(app):
    runtime.acquire()
    old = read('current.json')
    if old and old['state'] not in ('ended', 'idle', 'interrupted'):
        old['state'] = 'interrupted'
        old['events'].append({'id': uuid.uuid4().hex[:10], 'kind': 'state', 'detail': 'Worker restarted; previous run interrupted', 'actor': 'system', 'simulation_time': old['simulation_time'], 'timestamp': utc()})
        write(f'runs/{old["run_id"]}.json', old)
    runtime.pool = ProcessPoolExecutor(max_workers=1)
    task = asyncio.create_task(runtime.loop())
    yield
    task.cancel()
    runtime.save()
    runtime.pool.shutdown(wait=False, cancel_futures=True)
    runtime.lock.close()


app = FastAPI(title='ConveyorLab worker', lifespan=lifespan)


@app.middleware('http')
async def internal_only(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.url.path != '/health' and request.headers.get('x-worker-token') != internal_token():
        return JSONResponse({'detail': 'Worker access denied'}, status_code=403)
    return await call_next(request)


@app.get('/health')
def health():
    return {'status': 'ok', 'owner': 'simulation-worker'}


@app.get('/snapshot')
def snapshot():
    return runtime.snapshot()


@app.get('/scenarios')
def scenarios():
    return SCENARIOS


@app.post('/commands')
async def command(body: Command):
    if body.idempotency_key in runtime.commands:
        return runtime.commands[body.idempotency_key]
    result = {'id': uuid.uuid4().hex[:12], 'action': body.action, 'status': 'pending', 'timestamp': utc()}
    try:
        action, values = body.action, body.values
        if action == 'new':
            if runtime.sim.state not in ('idle', 'ended', 'interrupted'):
                raise ValueError('End the active run before creating another')
            scenario = values.get('scenario', 'balanced')
            if scenario not in SCENARIOS:
                raise ValueError('Unknown scenario')
            runtime.save()
            preset = SCENARIOS[scenario]
            config = Config(**({'seed': preset['seed']} | preset['config'] | values.get('config', {})))
            runtime.sim = Conveyor(config=config, scenario=scenario)
            runtime.last_prediction = -5
            runtime.recommendation = runtime.previous = None
            runtime.automatic = False
            runtime.prediction = runtime.predictor.predict([])
            runtime.sim.event('created', 'Run created', body.actor)
        elif action == 'speed':
            if runtime.sim.state in ('ended', 'interrupted') or values.get('speed') not in (1, 2, 5, 10):
                raise ValueError('Choose 1×, 2×, 5× or 10× on an open run')
            old = runtime.speed
            runtime.speed = values['speed']
            runtime.sim.event('speed', 'Simulation speed changed', body.actor, previous=old, value=runtime.speed)
        elif action == 'acknowledge':
            alert = next((a for a in runtime.sim.alerts if a['id'] == values.get('id')), None)
            if not alert or alert['status'] != 'active':
                raise ValueError('Alert is no longer active')
            alert.update(status='acknowledged', acknowledged_by=body.actor, acknowledged_at=utc())
        elif action == 'apply':
            runtime.apply_recommendation(values.get('id'), body.actor)
        elif action == 'revert':
            if not runtime.previous or runtime.sim.state != 'running' or runtime.sim.faults or runtime.sim.t - runtime.sim.last_adjustment < 30:
                raise ValueError('Revert requires saved settings, a healthy running line and 30 s cooldown')
            old = runtime.sim.config.speeds[:]
            runtime.sim.command('settings', {'speeds': runtime.previous}, body.actor)
            runtime.previous = old
        elif action == 'automatic':
            enabled = bool(values.get('enabled'))
            if enabled and (runtime.sim.state != 'running' or runtime.sim.faults):
                raise ValueError('Automatic control requires a healthy running line')
            runtime.automatic = enabled
            runtime.sim.event('automatic', 'Automatic control ' + ('enabled' if enabled else 'disabled'), body.actor)
        else:
            runtime.sim.command(action, values, body.actor)
        result['status'] = 'applied'
        runtime.save()
    except ValidationError as error:
        result.update(status='rejected', error='; '.join(e['msg'] for e in error.errors()))
    except (ValueError, KeyError, TypeError) as error:
        result.update(status='rejected', error=str(error))
    runtime.commands[body.idempotency_key] = result
    runtime.commands = dict(list(runtime.commands.items())[-1000:])
    write('commands.json', runtime.commands)
    logger.info(json.dumps({'event': 'command', 'run_id': runtime.sim.run_id, **result}))
    return result


@app.post('/jobs/{kind}')
async def jobs(kind: str, request: Request):
    try:
        return await runtime.start_job(kind, await request.json())
    except (ValueError, TypeError) as error:
        raise HTTPException(400, str(error))


@app.get('/models')
def models():
    return read('models/evaluation.json')


@app.get('/runs')
def runs():
    paths = sorted((DATA / 'runs').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True) if (DATA / 'runs').exists() else []
    return [{k: run[k] for k in ('run_id', 'scenario', 'state', 'created_at', 'simulation_time', 'metrics')} for run in [read(str(p.relative_to(DATA))) for p in paths]][:100]


@app.get('/runs/{run_id}')
def run_detail(run_id: str):
    if not run_id.isalnum() or len(run_id) > 30:
        raise HTTPException(400, 'Invalid run ID')
    if run_id == runtime.sim.run_id:
        return runtime.sim.snapshot(7200)
    result = read(f'runs/{run_id}.json')
    if not result:
        raise HTTPException(404, 'Run not found')
    return result


@app.get('/experiments')
def experiments():
    folder = DATA / 'experiments'
    paths = sorted(folder.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True) if folder.exists() else []
    return [read(str(p.relative_to(DATA))) for p in paths[:30]]
