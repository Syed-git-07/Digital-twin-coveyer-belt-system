import json

import pytest
from pydantic import ValidationError

from app.models.config import Config, SCENARIOS
from app.simulation.engine import Conveyor
from app.simulation.optimization import experiment, optimize
from app.ml.pipeline import FEATURES, features


def running(config=None, scenario='balanced'):
    sim = Conveyor(config, scenario)
    sim.command('start')
    return sim


def assert_physical(sim):
    m = sim.metrics()
    assert m['generated'] == m['completed'] + m['inside'] + m['rejected']
    assert 0 <= len(sim.waiting) <= sim.config.buffer_capacity
    for i, items in enumerate(sim.zones):
        assert len(items) <= sim.config.capacities[i]
        assert sum(p['weight'] for p in items) <= sim.config.weight_capacity + 1e-8
        ordered = sorted(items, key=lambda p: p['position'])
        for p in ordered:
            assert p['zone'] == i
            assert 0 <= p['position'] <= sim.config.lengths[i] - p['length'] + 1e-8
        for a, b in zip(ordered, ordered[1:]):
            assert a['position'] + a['length'] + sim.config.spacing <= b['position'] + 1e-8


@pytest.mark.parametrize('scenario', list(SCENARIOS))
def test_conservation_geometry_capacity(scenario):
    sim = running(scenario=scenario)
    for _ in range(60):
        sim.advance(5)
        assert_physical(sim)


def test_seed_determinism_and_serializable_clone():
    a, b = running(), running()
    a.advance(90); b.advance(90)
    assert a.metrics() == b.metrics()
    clone = Conveyor.reconstruct(json.loads(json.dumps(a.serializable())))
    a.advance(35); clone.advance(35)
    assert a.metrics() == clone.metrics()
    assert a.zones == clone.zones


def test_dynamic_speed_changes_existing_parcel_motion():
    sim = running(Config(speeds=[0.3, 0.3, 0.3], arrival_rate=5))
    while not sim.zones[0]:
        sim.advance(0.2)
    sim.command('pause')
    fast, slow = sim.clone(), sim.clone()
    fast.command('settings', {'speeds': [1.8, 1.8, 1.8]})
    for candidate in (fast, slow):
        candidate.command('resume'); candidate.advance(2)
    assert fast.zones[0][0]['position'] > slow.zones[0][0]['position'] + 0.4


def test_pause_estop_and_restart_interlock():
    sim = running(); sim.advance(40)
    sim.command('pause')
    state = sim.serializable()
    sim.advance(100)
    assert state == sim.serializable()
    sim.command('resume'); sim.command('estop')
    positions = [[p['position'] for p in items] for items in sim.zones]
    accepted = sim.metrics()['accepted']
    temperature = max(sim.temperatures)
    sim.advance(30)
    assert sim.t == 70
    assert sim.metrics()['accepted'] == accepted
    assert positions == [[p['position'] for p in items] for items in sim.zones]
    assert max(sim.temperatures) < temperature
    sim.command('clear_estop')
    assert sim.state == 'stopped'
    assert sim.speeds == [0, 0, 0]


def test_thermal_safety_and_hysteresis():
    sim = running(Config(speeds=[1.8]*3))
    sim.fault('heating', True)
    sim.advance(150)
    assert sim.state == 'thermal'
    with pytest.raises(ValueError): sim.command('start')
    sim.fault('heating', False)
    sim.advance(200)
    assert max(sim.temperatures) < sim.config.recovery
    sim.command('start')
    assert sim.state == 'running'


def test_thermal_latch_cannot_be_bypassed_by_estop():
    sim = running()
    sim.temperatures = [79, 81, 79]
    sim.advance(0.2)
    assert sim.thermal_latched
    sim.command('estop'); sim.command('clear_estop')
    sim.temperatures = [60, 60, 60]
    with pytest.raises(ValueError): sim.command('start')
    sim.temperatures = [50, 50, 50]
    sim.command('start')
    assert not sim.thermal_latched


def test_pause_below_shutdown_can_resume_without_thermal_latch():
    sim = running()
    sim.temperatures = [60, 60, 60]
    sim.command('pause'); sim.command('resume')
    assert sim.state == 'running'


def test_sensor_fault_does_not_change_physical_state():
    a, b = running(), running()
    a.fault('sensor', True)
    a.advance(90); b.advance(90)
    assert a.metrics() == b.metrics()
    assert a.zones == b.zones
    assert a.history[-1]['zones'][1]['temperature'] is None
    assert a.history[-1]['quality'] == 'degraded'
    assert a.history[-1]['temperature'] is None


def test_congestion_and_recovery():
    baseline, slow = running(), running(scenario='slow-outfeed')
    baseline.advance(300); slow.advance(300)
    assert slow.queue_length() > baseline.queue_length() + 10
    assert slow.blocked > baseline.blocked
    recovery = running(scenario='recovery')
    recovery.advance(100)
    stalled = recovery.completed
    recovery.advance(100)
    assert recovery.completed > stalled
    assert 'blockage' not in recovery.faults


def test_alert_acknowledgment_does_not_clear_condition():
    sim=running(); sim.fault('blockage',True); sim.advance(2)
    alert = next(a for a in sim.alerts if a['key']=='blockage')
    alert['status']='acknowledged'; sim.advance(2)
    assert 'blockage' in sim.faults
    assert len([a for a in sim.alerts if a['key']=='blockage'])==1
    sim.fault('blockage',False); sim.advance(2)
    assert alert['status']=='resolved'


def test_features_use_past_only_and_warmup():
    sim=running(); sim.advance(29)
    assert features(sim.history) is None
    sim.advance(31)
    point = features(sim.history[:30])
    sim.advance(30)
    assert features(sim.history[:30]) == point
    assert len(point) == len(FEATURES)
    assert all('future' not in key and key not in ('seed','scenario','run_id') for key in FEATURES)


def test_recommendation_constraints_and_no_live_mutation():
    sim=running(Config(sensor_missing=0)); sim.advance(45)
    previous=sim.serializable()
    rec=optimize(sim)
    assert previous==sim.serializable()
    assert all(0.2<=v<=2 for v in rec['proposed']['speeds'])
    if rec['status']=='available':
        assert rec['proposed']['temperature']<sim.config.warning
        assert rec['proposed']['score']>rec['current']['score']
    sim.command('estop')
    with pytest.raises(ValueError):optimize(sim)


def test_fair_experiment_and_live_isolation():
    live=running(); live.advance(10)
    state=live.serializable()
    result=experiment('balanced',120,[42])
    assert live.serializable()==state
    pair=result['pairs'][0]
    assert pair['baseline']['generated']==pair['optimized']['generated']
    for mode in ('baseline','optimized'):
        m=pair[mode]
        assert m['generated']==m['completed']+m['inside']+m['rejected']


def test_invalid_config_transitions_and_finished_run():
    with pytest.raises(ValidationError):Config(speeds=[8,1,1])
    with pytest.raises(ValidationError):Config(recovery=75,warning=60)
    sim=running()
    with pytest.raises(ValueError):sim.command('start')
    sim.advance(10)
    with pytest.raises(ValueError):sim.command('settings',{'spacing':0.3})
    sim.command('end')
    with pytest.raises(ValueError):sim.command('settings',{'arrival_rate':40})


def test_acceleration_time_units_and_window_startup():
    sim=running(Config(sensor_missing=0)); sim.advance(0.2)
    assert max(sim.speeds) <= sim.config.acceleration * 0.2 + 1e-8
    a,b=running(),running()
    for _ in range(50):a.advance(0.2)
    b.advance(10)
    assert a.metrics()==b.metrics()
    assert a.t==10
