import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, confusion_matrix, f1_score, mean_absolute_error, mean_squared_error, precision_score, recall_score
from sklearn.pipeline import make_pipeline

from app.models.config import Config, SCENARIOS
from app.simulation.engine import Conveyor, utc
from app.storage import DATA, write

FEATURES = ['speed', 'speed_mean', 'load_mean', 'load_std', 'temperature_mean', 'temperature_trend', 'queue', 'queue_growth', 'occupancy', 'throughput', 'arrival_estimate', 'completion_estimate', 'blocked_recent', 'missing_fraction']


def features(history):
    if len(history) < 30 or history[-1]['simulation_time'] - history[0]['simulation_time'] < 29:
        return None
    h = history[-30:]
    frame = pd.DataFrame(h)
    duration = max(1., h[-1]['simulation_time'] - h[0]['simulation_time'])
    temperature = frame.temperature.dropna()
    mean = lambda key: float(frame[key].mean()) if frame[key].notna().any() else np.nan
    return [h[-1]['speed'] if h[-1]['speed'] is not None else np.nan, mean('speed'), mean('load'), float(frame.load.std()) if frame.load.notna().sum() > 1 else np.nan, mean('temperature'), float((temperature.iloc[-1] - temperature.iloc[0]) / duration) if len(temperature) > 1 else np.nan, h[-1]['queue'], (h[-1]['queue'] - h[0]['queue']) / duration, h[-1]['occupancy'], h[-1]['throughput'], (h[-1]['generated'] - h[0]['generated']) * 60 / duration, (h[-1]['completed'] - h[0]['completed']) * 60 / duration, h[-1]['blocked'] - h[0]['blocked'], float((frame.quality != 'good').mean())]


def dataset(runs=100, duration=240):
    if runs < 100 or not 180 <= duration <= 900:
        raise ValueError('Training requires at least 100 runs and 180–900 seconds per run')
    rows = []
    scenarios = list(SCENARIOS)
    for run in range(runs):
        rng = np.random.default_rng(5000 + run)
        scenario = scenarios[run % len(scenarios)]
        preset = SCENARIOS[scenario]
        config = Config(**(preset['config'] | {'seed': 1000 + run, 'arrival_rate': float(rng.uniform(10, 58)), 'service_rate': float(rng.uniform(8, 55)), 'speeds': [float(rng.uniform(0.25, 1.6)) for _ in range(3)]}))
        sim = Conveyor(config, scenario)
        sim.command('start')
        sim.advance(duration)
        h = sim.history
        for end in range(29, len(h) - 60, 5):
            future = h[end + 1:end + 61]
            consecutive = maximum = 0
            for obs in future:
                congested = obs['queue'] >= config.queue_threshold
                consecutive = consecutive + 1 if congested else 0
                maximum = max(maximum, consecutive)
            label = maximum >= 10 or future[-1]['blocked'] - h[end]['blocked'] >= 20
            rows.append({'run': run, 'bottleneck': int(label), 'future_throughput': future[-1]['completed'] - h[end]['completed'], **dict(zip(FEATURES, features(h[:end + 1])))})
    frame = pd.DataFrame(rows)
    folder = DATA / 'models'
    folder.mkdir(exist_ok=True)
    frame.to_csv(folder / 'dataset.csv', index=False)
    return frame


def evaluate(classifier, regressor, frame, threshold):
    x = frame[FEATURES].to_numpy()
    y = frame.bottleneck.to_numpy()
    p = classifier.predict_proba(x)[:, list(classifier[-1].classes_).index(1)]
    pred = p >= threshold
    throughput = regressor.predict(x)
    baseline = (frame.queue >= 12) | ((frame.queue_growth > 0.1) & (frame.occupancy > 65))
    return {'precision': precision_score(y, pred, zero_division=0), 'recall': recall_score(y, pred, zero_division=0), 'f1': f1_score(y, pred, zero_division=0), 'confusion_matrix': confusion_matrix(y, pred, labels=[0, 1]).tolist(), 'pr_auc': average_precision_score(y, p) if len(set(y)) == 2 else None, 'throughput_mae': mean_absolute_error(frame.future_throughput, throughput), 'throughput_rmse': float(np.sqrt(mean_squared_error(frame.future_throughput, throughput))), 'baseline_f1': f1_score(y, baseline, zero_division=0), 'baseline_precision': precision_score(y, baseline, zero_division=0), 'baseline_recall': recall_score(y, baseline, zero_division=0), 'samples': len(frame), 'class_distribution': {str(k): int(v) for k, v in frame.bottleneck.value_counts().items()}}


def train(runs=100, duration=240):
    frame = dataset(runs, duration)
    ids = np.random.default_rng(2026).permutation(runs)
    train_ids, validation_ids, test_ids = np.split(ids, [int(runs * 0.6), int(runs * 0.8)])
    tr, va, te = [frame[frame.run.isin(group)] for group in (train_ids, validation_ids, test_ids)]
    classifier = make_pipeline(SimpleImputer(strategy='median', keep_empty_features=True), RandomForestClassifier(n_estimators=100, min_samples_leaf=5, max_depth=12, class_weight='balanced', random_state=2026, n_jobs=1))
    regressor = make_pipeline(SimpleImputer(strategy='median', keep_empty_features=True), RandomForestRegressor(n_estimators=100, min_samples_leaf=4, max_depth=12, random_state=2026, n_jobs=1))
    classifier.fit(tr[FEATURES].to_numpy(), tr.bottleneck)
    regressor.fit(tr[FEATURES].to_numpy(), tr.future_throughput)
    if len(classifier[-1].classes_) != 2:
        raise ValueError('Dataset has only one class; increase run count or condition diversity')
    probabilities = classifier.predict_proba(va[FEATURES].to_numpy())[:, 1]
    threshold = max(np.arange(0.2, 0.81, 0.05), key=lambda t: f1_score(va.bottleneck, probabilities >= t, zero_division=0))
    fingerprint = hashlib.sha256(frame.to_csv(index=False).encode()).hexdigest()
    metadata = {'version': 'rf-' + fingerprint[:8], 'trained_at': utc(), 'features': FEATURES, 'fingerprint': fingerprint, 'seeds': {'split': 2026, 'runs_start': 1000}, 'runs': runs, 'samples': len(frame), 'duration': duration, 'horizon': 60, 'threshold': float(threshold), 'split_method': 'Complete independent runs: 60% train / 20% validation / 20% test; imputation fit on training only.', 'splits': {'train': train_ids.tolist(), 'validation': validation_ids.tolist(), 'test': test_ids.tolist()}, 'label': 'Next 60 s: queue >= configured threshold for 10 consecutive seconds OR at least 20 s of downstream blocking.', 'validation': evaluate(classifier, regressor, va, threshold), 'test': evaluate(classifier, regressor, te, threshold), 'importance': dict(zip(FEATURES, classifier[-1].feature_importances_.tolist()))}
    path = DATA / 'models' / 'model.joblib'
    temporary = path.with_suffix('.tmp')
    joblib.dump({'classifier': classifier, 'regressor': regressor, 'metadata': metadata}, temporary)
    temporary.replace(path)
    write('models/evaluation.json', metadata)
    return metadata


class Predictor:
    def __init__(self):
        self.model = None
        self.modified = None

    def load(self):
        path = DATA / 'models' / 'model.joblib'
        if path.exists() and path.stat().st_mtime != self.modified:
            self.model = joblib.load(path)
            self.modified = path.stat().st_mtime
        return self.model

    def predict(self, history):
        model = self.load()
        if not model:
            return {'status': 'unavailable', 'message': 'Model unavailable', 'horizon': 60}
        x = features(history)
        if x is None:
            return {'status': 'warmup', 'message': 'Collecting history', 'horizon': 60}
        if x[-1] > 0.2 or history[-1]['quality'] != 'good':
            return {'status': 'degraded', 'message': 'Insufficient sensor quality', 'horizon': 60}
        return {'status': 'ready', 'risk': float(model['classifier'].predict_proba([x])[0, 1]), 'throughput': float(model['regressor'].predict([x])[0]), 'horizon': 60, 'version': model['metadata']['version'], 'simulation_time': history[-1]['simulation_time'], 'timestamp': utc()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--runs', type=int, default=100)
    parser.add_argument('--duration', type=int, default=240)
    parser.add_argument('--dataset-only', action='store_true')
    args = parser.parse_args()
    result = dataset(args.runs, args.duration) if args.dataset_only else train(args.runs, args.duration)
    print(f'Generated {len(result)} samples' if args.dataset_only else json.dumps(result, indent=2))
