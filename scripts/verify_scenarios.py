"""Generate a measured scenario record, independent of the running line."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

from app.models.config import SCENARIOS
from app.simulation.engine import Conveyor, utc

results = {}
for scenario in SCENARIOS:
    sim = Conveyor(scenario=scenario)
    sim.command('start')
    sim.advance(300)
    results[scenario] = {
        'seed': sim.config.seed,
        'duration_s': sim.t,
        'final_state': sim.state,
        'config': sim.config.model_dump(),
        'metrics': sim.metrics(),
        'missing_observations': sum(row['quality'] != 'good' for row in sim.history),
        'events': sim.events,
    }
assert results['slow-outfeed']['metrics']['max_queue'] > results['balanced']['metrics']['max_queue']
assert results['friction']['metrics']['max_temperature'] > results['balanced']['metrics']['max_temperature']
assert results['sensor']['missing_observations'] > results['balanced']['missing_observations']
assert results['recovery']['metrics']['completed'] > 0
output = ROOT / 'artifacts' / 'scenario-validation.json'
output.write_text(json.dumps({'generated_at': utc(), 'provenance': 'Actual 300-second SimPy runs from the supplied preset seeds', 'scenarios': results}, indent=2), encoding='utf-8')
for scenario, data in results.items():
    m = data['metrics']
    print(f'{scenario:14s} completed={m["completed"]:3d} rejected={m["rejected"]:3d} max_queue={m["max_queue"]:2d} peak_C={m["max_temperature"]:.1f} state={data["final_state"]}')
