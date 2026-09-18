export type User = {
  username: string;
  role: "operator" | "viewer";
  csrf: string;
};
export type Config = {
  speeds: number[];
  lengths: number[];
  capacities: number[];
  weight_capacity: number;
  arrival_rate: number;
  service_rate: number;
  buffer_capacity: number;
  ambient: number;
  warning: number;
  shutdown: number;
  recovery: number;
  heating: number;
  cooling: number;
  base_power: number;
  drive_power: number;
  acceleration: number;
  min_length: number;
  max_length: number;
  min_weight: number;
  max_weight: number;
  spacing: number;
  queue_threshold: number;
  sensor_missing: number;
  seed: number;
};
export type Parcel = {
  id: number;
  position: number;
  length: number;
  weight: number;
  zone: number;
  arrival_time: number;
};
export type Zone = {
  id: number;
  name: string;
  speed: number;
  temperature: number;
  parcels: Parcel[];
  length: number;
  capacity: number;
};
export type Reading = {
  zone_id: number;
  name: string;
  speed: number | null;
  temperature: number | null;
  load: number | null;
  occupancy: number | null;
  queue: number | null;
  quality: string;
  last_valid: string | null;
};
export type Observation = {
  run_id: string;
  sequence: number;
  timestamp: string;
  simulation_time: number;
  speed: number | null;
  temperature: number | null;
  load: number | null;
  queue: number;
  occupancy: number;
  throughput: number;
  power: number;
  quality: string;
  zones: Reading[];
};
export type Metrics = {
  speed: number;
  load: number;
  load_pct: number;
  temperature: number;
  throughput: number;
  queue: number;
  occupancy: number;
  cycle_time: number | null;
  power: number;
  energy: number;
  energy_per_parcel: number | null;
  blocked: number;
  starved: number;
  generated: number;
  accepted: number;
  completed: number;
  rejected: number;
  inside: number;
  mean_queue: number;
  max_queue: number;
  max_temperature: number;
};
export type Alert = {
  id: string;
  key: string;
  title: string;
  severity: string;
  status: string;
  timestamp: string;
  simulation_time: number;
};
export type Event = {
  id: string;
  kind: string;
  detail: string;
  actor: string;
  simulation_time: number;
  timestamp: string;
};
export type Fault = {
  kind: string;
  name: string;
  severity: string;
  zone: number;
  activated_at: string;
  simulation_time: number;
};
export type Prediction = {
  status: string;
  message?: string;
  risk?: number;
  throughput?: number;
  horizon: number;
  version?: string;
  simulation_time?: number;
};
export type Candidate = {
  speeds: number[];
  throughput: number;
  energy: number;
  temperature: number;
  queue_growth: number;
  score: number;
  predicted_risk: number | null;
};
export type Recommendation = {
  id: string;
  status: string;
  message: string;
  run_id: string;
  source_sequence: number;
  source_time: number;
  generated_at: string;
  current: Candidate;
  proposed: Candidate;
  candidates: number;
  prediction_used: boolean;
  horizon: number;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  error?: string;
  result_id?: string;
};
export type Snapshot = {
  run_id: string;
  scenario: string;
  state: string;
  created_at: string;
  timestamp: string;
  simulation_time: number;
  sequence: number;
  config: Config;
  metrics: Metrics;
  zones: Zone[];
  waiting: number;
  observation: Observation | null;
  telemetry: Observation[];
  faults: Fault[];
  alerts: Alert[];
  events: Event[];
  predictions: Prediction[];
  simulation_speed: number;
  prediction: Prediction;
  recommendation: Recommendation | null;
  automatic: boolean;
  job: Job | null;
};
export type Scenario = {
  name: string;
  description: string;
  seed: number;
  config: Partial<Config>;
  events: [number, string, boolean][];
};
export type Run = Pick<
  Snapshot,
  "run_id" | "scenario" | "state" | "created_at" | "simulation_time" | "metrics"
>;
export type Evaluation = {
  version: string;
  trained_at: string;
  runs: number;
  samples: number;
  horizon: number;
  threshold: number;
  split_method: string;
  label: string;
  features: string[];
  importance: Record<string, number>;
  test: {
    precision: number;
    recall: number;
    f1: number;
    pr_auc: number | null;
    confusion_matrix: number[][];
    throughput_mae: number;
    throughput_rmse: number;
    baseline_f1: number;
    samples: number;
    class_distribution: Record<string, number>;
  };
};
export type Experiment = {
  id: string;
  timestamp: string;
  scenario: string;
  duration: number;
  seeds: number[];
  summary: { baseline: Metrics; optimized: Metrics };
  completed_delta_mean: number;
  completed_delta_std: number;
  pairs: {
    seed: number;
    baseline: Metrics;
    optimized: Metrics;
    adjustments: number;
  }[];
  curves: {
    time: number;
    baseline: number;
    optimized: number;
    baseline_queue: number;
    optimized_queue: number;
  }[];
  provenance: string;
};
