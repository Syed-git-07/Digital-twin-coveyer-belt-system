import statistics
import uuid

from app.ml.pipeline import Predictor
from app.models.config import Config, SCENARIOS
from app.simulation.engine import Conveyor, utc


def optimize(source, predictor=None):
    if source.state != 'running' or any(f in source.faults for f in ('blockage', 'heating', 'sensor')):
        raise ValueError('A running line with healthy sensors and no critical fault is required')
    if source.history and source.history[-1]['quality'] != 'good':
        raise ValueError('Wait for a complete sensor observation')
    if source.t - source.last_adjustment < 30:
        raise ValueError('Adjustment cooldown: wait 30 simulation seconds')
    current = source.config.speeds
    candidates = [current, [0.5, 0.6, 0.7], [0.8, 1., 1.2], [1.1, 1.2, 1.4], [max(0.2, s * 0.8) for s in current], [min(2., s * 1.2) for s in current]]
    predictor = predictor or Predictor()
    results = []
    for speeds in candidates:
        sim = source.clone()
        sim.config = Config(**(sim.config.model_dump() | {'speeds': speeds}))
        completed, energy = sim.completed, sim.energy
        sim.advance(60)
        prediction = predictor.predict(sim.history)
        output = sim.completed - completed
        used = sim.energy - energy
        queue_growth = max(0, sim.queue_length() - source.queue_length())
        risk = prediction.get('risk', 0)
        score = output / 60 - 0.2 * used / 0.05 - 0.35 * queue_growth / 30 - 0.15 * max(0, max(sim.temperatures) - source.config.warning + 10) / 20 - 0.1 * risk
        results.append({'speeds': speeds, 'throughput': output, 'energy': used, 'temperature': max(sim.temperatures), 'queue_growth': queue_growth, 'score': score, 'safe': max(sim.temperatures) < source.config.warning and sim.state == 'running', 'predicted_risk': prediction.get('risk')})
    baseline = results[0]
    safe = [r for r in results if r['safe']]
    best = max(safe, key=lambda r: r['score']) if safe else baseline
    beneficial = best['safe'] and best['score'] > baseline['score'] + 0.015 and best['speeds'] != current
    return {'id': uuid.uuid4().hex[:12], 'status': 'available' if beneficial else 'no_change', 'message': 'Coordinated speed adjustment' if beneficial else 'No beneficial change found', 'run_id': source.run_id, 'source_sequence': source.sequence, 'source_time': source.t, 'generated_at': utc(), 'current': baseline, 'proposed': best if beneficial else baseline, 'candidates': len(results), 'prediction_used': any(r['predicted_risk'] is not None for r in results), 'horizon': 60}


def experiment(scenario='balanced', duration=300, seeds=None):
    seeds = seeds or [42, 43, 44]
    if scenario not in SCENARIOS or not 120 <= duration <= 900 or not 1 <= len(seeds) <= 5:
        raise ValueError('Choose a valid scenario, 120–900 seconds, and 1–5 matched seeds')
    pairs = []
    curves = []
    predictor = Predictor()
    for seed in seeds:
        config = Config(**(SCENARIOS[scenario]['config'] | {'seed': seed}))
        baseline, optimized = Conveyor(config, scenario), Conveyor(config.model_copy(deep=True), scenario)
        for sim in (baseline, optimized):
            sim.command('start')
        adjustments = 0
        for second in range(duration):
            for sim in (baseline, optimized):
                sim.advance(1)
            if second >= 30 and second % 60 == 0:
                try:
                    rec = optimize(optimized, predictor)
                    if rec['status'] == 'available':
                        optimized.command('settings', {'speeds': rec['proposed']['speeds']}, 'experiment')
                        adjustments += 1
                except ValueError:
                    pass
            if seed == seeds[0] and second % 5 == 0:
                curves.append({'time': second + 1, 'baseline': baseline.metrics()['throughput'], 'optimized': optimized.metrics()['throughput'], 'baseline_queue': baseline.queue_length(), 'optimized_queue': optimized.queue_length()})
        pairs.append({'seed': seed, 'baseline': baseline.metrics(), 'optimized': optimized.metrics(), 'adjustments': adjustments})
    keys = list(pairs[0]['baseline'])
    summary = {}
    for mode in ('baseline', 'optimized'):
        summary[mode] = {key: statistics.mean([p[mode][key] for p in pairs if p[mode][key] is not None]) if any(p[mode][key] is not None for p in pairs) else None for key in keys}
    deltas = [p['optimized']['completed'] - p['baseline']['completed'] for p in pairs]
    return {'id': uuid.uuid4().hex[:12], 'timestamp': utc(), 'scenario': scenario, 'duration': duration, 'seeds': seeds, 'pairs': pairs, 'summary': summary, 'completed_delta_mean': statistics.mean(deltas), 'completed_delta_std': statistics.stdev(deltas) if len(deltas) > 1 else 0, 'curves': curves, 'provenance': 'Identical seed, independent exogenous streams, arrival rate, parcel properties and external fault schedule. Controls change belt speeds only.'}
