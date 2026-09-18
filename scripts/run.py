"""Start the local production build and its independent simulation worker."""
import os
import subprocess
import sys
import time
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
env = os.environ.copy()
env['PYTHONPATH'] = str(ROOT / 'backend')
env.setdefault('WORKER_URL', 'http://127.0.0.1:8001')
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
port = os.getenv('CONVEYOR_PORT', '8090')
for target in (8001, int(port)):
    with socket.socket() as check:
        if check.connect_ex(('127.0.0.1', target)) == 0:
            raise SystemExit(f'Port {target} is already in use. Set CONVEYOR_PORT to another port for the web app, or stop your previous ConveyorLab worker on 8001.')
processes = []
try:
    for app, service_port in [('app.worker:app', '8001'), ('app.api.main:app', port)]:
        processes.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', app, '--host', '127.0.0.1', '--port', service_port], cwd=ROOT, env=env, creationflags=flags, stdout=sys.stdout, stderr=sys.stderr))
    print(f'\nConveyorLab is starting at http://localhost:{port}\nCreate your operator account on first launch.\nPress Ctrl+C to stop.\n', flush=True)
    while all(p.poll() is None for p in processes):
        time.sleep(1)
except KeyboardInterrupt:
    print('\nStopping ConveyorLab…', flush=True)
finally:
    for process in reversed(processes):
        if process.poll() is None:
            if os.name == 'nt':
                # Windows venv launchers may have a child interpreter; stop our full tree.
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                process.terminate()
    for process in processes:
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
