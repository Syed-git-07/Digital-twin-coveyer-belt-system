"""Create a clean source deliverable without local accounts or dependencies."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
destination = root / 'ConveyorLab-final.zip'
excluded = {'.venv', 'node_modules', 'data', '.git', '__pycache__', '.pytest_cache', 'dist', 'test-results', 'playwright-report'}
with ZipFile(destination, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in excluded for part in relative.parts):
            continue
        if path.suffix in ('.log', '.zip', '.tsbuildinfo') or path.name in ('.env', 'mobile-inspection.png'):
            continue
        archive.write(path, Path('ConveyorLab') / relative)
print(f'{destination} ({destination.stat().st_size / 1024 / 1024:.2f} MB)')
