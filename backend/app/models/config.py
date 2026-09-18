from pydantic import BaseModel, ConfigDict, Field, model_validator


class Config(BaseModel):
    model_config = ConfigDict(extra='forbid')
    speeds: list[float] = Field(default_factory=lambda: [0.8, 0.9, 0.8], min_length=3, max_length=3)
    lengths: list[float] = Field(default_factory=lambda: [5., 5., 5.], min_length=3, max_length=3)
    capacities: list[int] = Field(default_factory=lambda: [8, 8, 8], min_length=3, max_length=3)
    weight_capacity: float = Field(100, ge=20, le=500)
    arrival_rate: float = Field(22, ge=5, le=60)
    service_rate: float = Field(30, ge=2, le=90)
    buffer_capacity: int = Field(30, ge=1, le=100)
    ambient: float = Field(25, ge=0, le=45)
    warning: float = Field(65, ge=40, le=90)
    shutdown: float = Field(80, ge=50, le=100)
    recovery: float = Field(55, ge=30, le=80)
    heating: float = Field(0.28, ge=0.01, le=1)
    cooling: float = Field(0.012, ge=0.002, le=0.1)
    base_power: float = Field(0.12, ge=0.01, le=1)
    drive_power: float = Field(0.35, ge=0.05, le=2)
    acceleration: float = Field(0.4, ge=0.05, le=2)
    min_length: float = Field(0.35, ge=0.2, le=0.6)
    max_length: float = Field(0.6, ge=0.3, le=1)
    min_weight: float = Field(1, ge=0.1, le=15)
    max_weight: float = Field(8, ge=1, le=25)
    spacing: float = Field(0.15, ge=0.05, le=0.4)
    queue_threshold: int = Field(12, ge=2, le=80)
    sensor_missing: float = Field(0.01, ge=0, le=0.4)
    seed: int = Field(42, ge=0, le=2147483647)

    @model_validator(mode='after')
    def coherent(self):
        if any(not 0.2 <= s <= 2 for s in self.speeds):
            raise ValueError('Belt speeds must be between 0.2 and 2.0 m/s')
        if any(not 3 <= x <= 12 for x in self.lengths) or any(not 2 <= x <= 20 for x in self.capacities):
            raise ValueError('Zone lengths must be 3–12 m; capacities 2–20 parcels')
        if not self.ambient < self.recovery < self.warning < self.shutdown:
            raise ValueError('Require ambient < recovery < warning < shutdown')
        if self.min_weight > self.max_weight or self.min_length > self.max_length:
            raise ValueError('Distribution minimum must not exceed maximum')
        return self


SCENARIOS = {
    'balanced': {'name': 'Balanced operation', 'description': 'Steady arrivals with spare outfeed capacity.', 'seed': 42, 'config': {}, 'events': []},
    'surge': {'name': 'Arrival surge', 'description': 'Demand rises at 45 seconds, then settles at 180.', 'seed': 73, 'config': {}, 'events': [[45, 'surge', True], [180, 'surge', False]]},
    'slow-outfeed': {'name': 'Slow outfeed', 'description': 'A constrained station builds an upstream queue.', 'seed': 19, 'config': {'arrival_rate': 40, 'service_rate': 10}, 'events': []},
    'heavy': {'name': 'Heavy parcels', 'description': 'Higher payloads increase drive load and heating.', 'seed': 61, 'config': {'min_weight': 12, 'max_weight': 22, 'arrival_rate': 30}, 'events': []},
    'friction': {'name': 'Increased motor friction', 'description': 'Transfer drive resistance rises after 30 seconds.', 'seed': 27, 'config': {}, 'events': [[30, 'friction', True]]},
    'sensor': {'name': 'Sensor interruption', 'description': 'Transfer readings drop out between 40 and 85 seconds.', 'seed': 91, 'config': {}, 'events': [[40, 'sensor', True], [85, 'sensor', False]]},
    'recovery': {'name': 'Recovery after blockage', 'description': 'Outfeed blocks at 40 seconds and clears at 120.', 'seed': 13, 'config': {'arrival_rate': 30}, 'events': [[40, 'blockage', True], [120, 'blockage', False]]},
}

FAULTS = {'blockage': ('Downstream blockage', 'critical', 2), 'friction': ('Mechanical friction', 'warning', 1), 'surge': ('Arrival surge', 'warning', 0), 'heating': ('Motor heating fault', 'critical', 1), 'sensor': ('Sensor dropout', 'warning', 1)}
