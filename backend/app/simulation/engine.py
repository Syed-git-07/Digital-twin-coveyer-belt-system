"""Fixed 0.2 s SimPy integration, finite spatial queues and seeded exogenous streams."""
import copy
import random
import uuid
from collections import deque
from datetime import datetime, timezone

import simpy

from app.models.config import Config, SCENARIOS, FAULTS

DT = 0.2
ZONE_NAMES = ['Infeed', 'Transfer', 'Outfeed']


def utc():
    return datetime.now(timezone.utc).isoformat()


class Conveyor:
    def __init__(self, config=None, scenario='balanced'):
        preset = SCENARIOS[scenario]
        self.config = config or Config(**preset['config'], seed=preset['seed'])
        self.scenario = scenario
        self.run_id = uuid.uuid4().hex[:12]
        self.created_at = utc()
        self.state = 'idle'
        self.thermal_latched = False
        self.t = 0.
        self.sequence = 0
        self.rng = {key: random.Random(self.config.seed + offset) for key, offset in [('arrivals', 0), ('properties', 101), ('service', 202), ('faults', 303), ('sensors', 404)]}
        self.next_arrival = self.rng['arrivals'].expovariate(self.config.arrival_rate / 60)
        self.zones = [[] for _ in range(3)]
        self.waiting = []
        self.speeds = [0., 0., 0.]
        self.temperatures = [self.config.ambient] * 3
        self.generated = self.completed = self.rejected = 0
        self.cycle_total = self.energy = self.blocked = self.starved = 0.
        self.power = 0.
        self.completions = deque()
        self.faults = {}
        self.events = []
        self.alerts = []
        self.history = []
        self.predictions = []
        self.last_valid = [None] * 3
        self.schedule_index = 0
        self.max_temperature = self.config.ambient
        self.queue_integral = 0.
        self.max_queue = 0
        self.last_adjustment = -1000.
        self.env = simpy.Environment()
        self.env.process(self._process())

    def _process(self):
        while True:
            yield self.env.timeout(DT)
            self._tick()

    def advance(self, seconds):
        if self.state in ('paused', 'idle', 'ended', 'interrupted'):
            return
        steps = int((seconds + 1e-8) / DT)
        for _ in range(steps):
            self.env.step()
            # First event initializes the generator without advancing physical time.
            if self.env.now == 0:
                self.env.step()

    def event(self, kind, detail, actor='system', **extra):
        self.events.append({'id': uuid.uuid4().hex[:10], 'kind': kind, 'detail': detail, 'actor': actor, 'simulation_time': round(self.t, 2), 'timestamp': utc(), **extra})
        self.events = self.events[-2000:]

    def fault(self, kind, active, actor='operator'):
        if kind not in FAULTS:
            raise ValueError('Unknown fault')
        if active and kind not in self.faults:
            name, severity, zone = FAULTS[kind]
            self.faults[kind] = {'kind': kind, 'name': name, 'severity': severity, 'zone': zone, 'activated_at': utc(), 'simulation_time': self.t}
            self.event('fault', name + ' activated', actor)
        elif not active and kind in self.faults:
            del self.faults[kind]
            self.event('recovery', FAULTS[kind][0] + ' cleared', actor)

    def command(self, action, values=None, actor='operator'):
        values = values or {}
        if self.state in ('ended', 'interrupted'):
            raise ValueError('This run is closed. Create a new run.')
        before = self.state
        if action in ('start', 'resume'):
            if self.state not in ('idle', 'paused', 'stopped', 'thermal'):
                raise ValueError('Line cannot start from its current state')
            if self.thermal_latched and max(self.temperatures) >= self.config.recovery:
                raise ValueError('Motors must cool below the recovery threshold')
            if max(self.temperatures) >= self.config.shutdown:
                raise ValueError('Motor temperature exceeds the shutdown threshold')
            if 'heating' in self.faults:
                raise ValueError('Clear the heating fault before restarting')
            self.state = 'running'
            self.thermal_latched = False
        elif action == 'pause':
            if self.state != 'running':
                raise ValueError('Only a running line can be paused')
            self.state = 'paused'
        elif action == 'estop':
            self.state = 'emergency'
            self.speeds = [0., 0., 0.]
        elif action == 'clear_estop':
            if self.state != 'emergency':
                raise ValueError('Emergency stop is not latched')
            self.state = 'stopped'
        elif action == 'end':
            self.state = 'ended'
            self.speeds = [0., 0., 0.]
        elif action == 'settings':
            previous = self.config.model_dump()
            proposed = Config(**(previous | values))
            if 'seed' in values and values['seed'] != previous['seed']:
                raise ValueError('Set the random seed when creating a new run')
            if any(k in values and values[k] != previous[k] for k in ('lengths', 'min_length', 'max_length', 'spacing')) and self.t > 0:
                raise ValueError('Geometry, spacing and seed can only change before a run starts')
            if len(self.waiting) > proposed.buffer_capacity or any(len(items) > proposed.capacities[i] or sum(p['weight'] for p in items) > proposed.weight_capacity for i, items in enumerate(self.zones)):
                raise ValueError('New capacities cannot be smaller than the current physical load')
            if proposed.shutdown <= max(self.temperatures):
                raise ValueError('Shutdown threshold must exceed current motor temperatures')
            self.config = proposed
            self.last_adjustment = self.t
            self.event('settings', 'Operating settings applied', actor, previous=previous, value=self.config.model_dump())
        elif action == 'fault':
            self.fault(values['kind'], bool(values['active']), actor)
        else:
            raise ValueError('Unknown command')
        if self.state != before:
            self.event('state', before + ' → ' + self.state, actor)
        self.sequence += 1

    def _room(self, zone, parcel):
        items = self.zones[zone]
        c = self.config
        return (len(items) < c.capacities[zone]
                and sum(p['weight'] for p in items) + parcel['weight'] <= c.weight_capacity
                and (not items or min(p['position'] for p in items) >= parcel['length'] + c.spacing))

    def _tick(self):
        c = self.config
        self.t = round(self.t + DT, 6)
        schedule = SCENARIOS[self.scenario]['events']
        while self.schedule_index < len(schedule) and self.t >= schedule[self.schedule_index][0]:
            _, kind, active = schedule[self.schedule_index]
            self.fault(kind, active, 'scenario')
            self.schedule_index += 1
        running = self.state == 'running'
        # Exogenous arrivals keep coming during stopped cooling; explicitly reject them.
        while self.t >= self.next_arrival:
            self.generated += 1
            r = self.rng['properties']
            p = {'id': self.generated, 'arrival_time': self.next_arrival, 'weight': r.uniform(c.min_weight, c.max_weight), 'length': r.uniform(c.min_length, c.max_length), 'zone': -1, 'position': 0., 'completion_time': None, 'service_work': self.rng['service'].uniform(0.8, 1.2)}
            if running and len(self.waiting) < c.buffer_capacity:
                self.waiting.append(p)
            else:
                self.rejected += 1
            rate = min(120, c.arrival_rate * (2.5 if 'surge' in self.faults else 1))
            self.next_arrival += self.rng['arrivals'].expovariate(rate / 60)
        self.power = 0.
        for i in range(3):
            load = sum(p['weight'] for p in self.zones[i]) / c.weight_capacity
            target = c.speeds[i] / (1 + 0.15 * load) if running else 0.
            self.speeds[i] += max(-c.acceleration * DT, min(c.acceleration * DT, target - self.speeds[i]))
            friction = 4 if i == 1 and 'friction' in self.faults else 1
            drive = c.drive_power * self.speeds[i] ** 2 * (1 + 2 * load) * friction
            heat = c.heating * self.speeds[i] ** 2 * (1 + 2 * load) * friction
            if i == 1 and 'heating' in self.faults:
                heat += 1.2
            self.temperatures[i] += (heat - c.cooling * (self.temperatures[i] - c.ambient)) * DT
            self.power += c.base_power + drive
        self.energy += self.power * DT / 3600
        self.max_temperature = max(self.max_temperature, *self.temperatures)
        if max(self.temperatures) >= c.shutdown:
            self.thermal_latched = True
            if self.state not in ('emergency', 'thermal'):
                self.state = 'thermal'
                self.speeds = [0., 0., 0.]
                self.event('safety', 'Thermal shutdown latched')
                running = False
        blocked_tick = False
        if running:
            for i in (2, 1, 0):
                leader = None
                for p in sorted(self.zones[i][:], key=lambda x: -x['position']):
                    limit = c.lengths[i] - p['length']
                    if leader:
                        limit = min(limit, leader['position'] - p['length'] - c.spacing)
                    p['position'] = max(0., min(limit, p['position'] + self.speeds[i] * DT))
                    at_end = p['position'] >= c.lengths[i] - p['length'] - 1e-8
                    moved = False
                    if at_end and i == 2:
                        if 'blockage' not in self.faults:
                            p['service_work'] -= c.service_rate / 60 * DT
                            if p['service_work'] <= 0:
                                self.zones[i].remove(p)
                                p['completion_time'] = self.t
                                self.completed += 1
                                self.cycle_total += self.t - p['arrival_time']
                                self.completions.append(self.t)
                                moved = True
                        else:
                            blocked_tick = True
                    elif at_end:
                        if self._room(i + 1, p):
                            self.zones[i].remove(p)
                            p['zone'], p['position'] = i + 1, 0.
                            self.zones[i + 1].append(p)
                            moved = True
                        else:
                            blocked_tick = True
                    if not moved:
                        leader = p
            if self.waiting and self._room(0, self.waiting[0]):
                p = self.waiting.pop(0)
                p['zone'] = 0
                self.zones[0].append(p)
            self.blocked += DT if blocked_tick else 0
            self.starved += DT if not self.zones[0] and not self.waiting else 0
        while self.completions and self.completions[0] <= self.t - 60:
            self.completions.popleft()
        queue = self.queue_length()
        self.max_queue = max(self.max_queue, queue)
        self.queue_integral += queue * DT
        if round(self.t * 5) % 5 == 0:
            self.sequence += 1
            self._observe()
            self._alerts()

    def queue_length(self):
        return len(self.waiting) + sum(1 for i, items in enumerate(self.zones) for p in items if p['position'] >= self.config.lengths[i] - p['length'] - 0.25)

    def metrics(self):
        load = sum(p['weight'] for items in self.zones for p in items)
        return {'speed': sum(self.speeds) / 3, 'load': load, 'load_pct': load / (3 * self.config.weight_capacity) * 100, 'temperature': max(self.temperatures), 'throughput': len(self.completions) * 60 / max(1, min(60, self.t)), 'queue': self.queue_length(), 'occupancy': sum(map(len, self.zones)) / sum(self.config.capacities) * 100, 'cycle_time': self.cycle_total / self.completed if self.completed else None, 'power': self.power, 'energy': self.energy, 'energy_per_parcel': self.energy * 1000 / self.completed if self.completed else None, 'blocked': self.blocked, 'starved': self.starved, 'generated': self.generated, 'accepted': self.generated - self.rejected, 'completed': self.completed, 'rejected': self.rejected, 'inside': len(self.waiting) + sum(map(len, self.zones)), 'mean_queue': self.queue_integral / max(self.t, 1), 'max_queue': self.max_queue, 'max_temperature': self.max_temperature}

    def _observe(self):
        readings = []
        timestamp = utc()
        m = self.metrics()
        r = self.rng['sensors']
        for i, name in enumerate(ZONE_NAMES):
            missing = (i == 1 and 'sensor' in self.faults) or r.random() < self.config.sensor_missing
            load = sum(p['weight'] for p in self.zones[i])
            if not missing:
                self.last_valid[i] = timestamp
            readings.append({'zone_id': i, 'name': name, 'speed': None if missing else max(0., self.speeds[i] + r.uniform(-0.008, 0.008)), 'load': None if missing else max(0., load + r.uniform(-0.08, 0.08)), 'temperature': None if missing else self.temperatures[i] + r.uniform(-0.12, 0.12), 'queue': None if missing else sum(1 for p in self.zones[i] if p['position'] >= self.config.lengths[i] - p['length'] - 0.25), 'occupancy': None if missing else len(self.zones[i]) / self.config.capacities[i] * 100, 'quality': 'missing' if missing else 'good', 'last_valid': self.last_valid[i]})
        missing = any(z['quality'] != 'good' for z in readings)
        observation = {'schema_version': 1, 'run_id': self.run_id, 'sequence': self.sequence, 'timestamp': timestamp, 'simulation_time': self.t, 'state': self.state, 'zones': readings, 'speed': None if missing else sum(z['speed'] for z in readings) / 3, 'load': None if missing else sum(z['load'] for z in readings), 'temperature': None if missing else max(z['temperature'] for z in readings), 'queue': m['queue'], 'occupancy': m['occupancy'], 'throughput': m['throughput'], 'power': m['power'], 'completed': self.completed, 'generated': self.generated, 'blocked': self.blocked, 'quality': 'degraded' if missing else 'good'}
        self.history.append(observation)
        self.history = self.history[-7200:]

    def _alerts(self):
        conditions = {'queue': (self.queue_length() >= self.config.queue_threshold, self.queue_length() <= max(0, self.config.queue_threshold - 3), 'Queue above threshold', 'warning'), 'thermal': (max(self.temperatures) >= self.config.warning, max(self.temperatures) < self.config.warning - 5, 'Motor temperature high', 'critical'), **{k: (k in self.faults, k not in self.faults, v[0], v[1]) for k, v in FAULTS.items()}}
        for key, (on, off, title, severity) in conditions.items():
            existing = next((a for a in self.alerts if a['key'] == key and a['status'] != 'resolved'), None)
            if on and not existing:
                self.alerts.append({'id': uuid.uuid4().hex[:10], 'key': key, 'title': title, 'severity': severity, 'status': 'active', 'timestamp': utc(), 'simulation_time': self.t})
            elif off and existing:
                existing.update(status='resolved', resolved_at=utc(), resolved_time=self.t)
        self.alerts = self.alerts[-500:]

    def snapshot(self, history=180):
        return {'schema_version': 1, 'run_id': self.run_id, 'scenario': self.scenario, 'created_at': self.created_at, 'state': self.state, 'simulation_time': self.t, 'sequence': self.sequence, 'timestamp': utc(), 'config': self.config.model_dump(), 'metrics': self.metrics(), 'zones': [{'id': i, 'name': ZONE_NAMES[i], 'speed': self.speeds[i], 'temperature': self.temperatures[i], 'parcels': copy.deepcopy(p), 'length': self.config.lengths[i], 'capacity': self.config.capacities[i]} for i, p in enumerate(self.zones)], 'waiting': len(self.waiting), 'observation': self.history[-1] if self.history else None, 'telemetry': self.history[-history:] if history else [], 'faults': list(self.faults.values()), 'alerts': copy.deepcopy(self.alerts), 'events': copy.deepcopy(self.events[-100:]), 'predictions': self.predictions[-100:]}

    def clone(self):
        """Rebuild SimPy from explicit physical state, never copy its active processes."""
        other = Conveyor(self.config.model_copy(deep=True), self.scenario)
        for key, value in self.__dict__.items():
            if key not in ('env', 'rng', 'config'):
                setattr(other, key, copy.deepcopy(value))
        for key in self.rng:
            other.rng[key].setstate(self.rng[key].getstate())
        return other

    def serializable(self):
        return {'config': self.config.model_dump(), 'fields': {k: list(v) if k == 'completions' else copy.deepcopy(v) for k, v in self.__dict__.items() if k not in ('env', 'rng', 'config')}, 'streams': {k: r.getstate() for k, r in self.rng.items()}}

    @classmethod
    def reconstruct(cls, data):
        obj = cls(Config(**data['config']), data['fields']['scenario'])
        for key, value in data['fields'].items():
            setattr(obj, key, deque(value) if key == 'completions' else copy.deepcopy(value))
        def tuples(value):
            return tuple(tuples(v) for v in value) if isinstance(value, (tuple, list)) else value
        for key, state in data['streams'].items():
            obj.rng[key].setstate(tuples(state))
        return obj
