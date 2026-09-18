import json
import os
import secrets
import tempfile
import shutil
from pathlib import Path

DATA = Path(os.environ.get('CONVEYOR_DATA', str(Path(__file__).resolve().parents[2] / 'data')))
DATA.mkdir(parents=True, exist_ok=True)


def seed_artifacts():
    source = Path(__file__).resolve().parents[2] / 'artifacts'
    if source.exists():
        (DATA / 'models').mkdir(exist_ok=True)
        for name in ('model.joblib', 'evaluation.json'):
            if (source / name).exists() and not (DATA / 'models' / name).exists():
                shutil.copy2(source / name, DATA / 'models' / name)


def read(name, default=None):
    path = DATA / name
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def write(name, value):
    path = DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(value, file, allow_nan=False, separators=(',', ':'))
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def internal_token():
    path = DATA / 'internal.key'
    try:
        with path.open('x') as file:
            file.write(secrets.token_hex(32))
    except FileExistsError:
        pass
    return path.read_text().strip()
