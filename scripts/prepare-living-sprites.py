"""Reuse the existing chroma-key pipeline. Originals stay in the shared library."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
from PIL import Image
from matte import cutout

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--library', default=os.environ.get('VIV_LIVING_LIBRARY', str(root / 'assets/living-world-library')))
parser.add_argument('--data', default=os.environ.get('VIV_DATA_DIR', str(root / 'data')))
args = parser.parse_args()
library = Path(args.library)
target = Path(args.data) / 'living-library'
target.mkdir(parents=True, exist_ok=True)
entries = json.loads((library / 'manifest.json').read_text())['entries']
def prepare(entry):
    filename = target / (entry['id'] + '.png')
    if not filename.exists():
        cutout(library / entry['file'], filename)
        image = Image.open(filename)
        image.thumbnail((384, 576))
        image.save(filename)
    return entry['id']
people = [entry for entry in entries if entry['kind'] == 'character']
with ThreadPoolExecutor(max_workers=3) as executor:
    ids = list(executor.map(prepare, people))
print(f'Prepared {len(ids)} reusable transparent sprites in {target}')
