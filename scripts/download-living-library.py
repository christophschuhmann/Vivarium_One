"""Install the user's existing private WebDataset without embedding access tokens."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
from huggingface_hub import hf_hub_download

root = Path(__file__).resolve().parents[1]
target = Path(os.environ.get('VIV_LIVING_LIBRARY', root / 'assets/living-world-library'))
if (target / 'manifest.json').exists():
    raise SystemExit('Library already installed; no overwrite needed.')
source = hf_hub_download(repo_id=os.environ.get('VIV_LIVING_HF_REPO', 'TTS-AGI/vivarium-living-world-assets'),
                        filename='data/living-world-library.wds.tar', repo_type='dataset', token=os.environ.get('HF_TOKEN'))
target.mkdir(parents=True, exist_ok=True)
with tarfile.open(source) as archive:
    for member in archive:
        destination = (target / member.name).resolve()
        if not destination.is_relative_to(target.resolve()):
            raise ValueError('Unsafe archive path')
        if member.isdir():
            destination.mkdir(parents=True, exist_ok=True)
        elif member.isfile():
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as stream, destination.open('wb') as output:
                shutil.copyfileobj(stream, output)
        else:
            raise ValueError('Links and special files are not supported')
metadata = target / '__metadata__/package.json'
package = json.loads(metadata.read_text())
for relative, record in package['source_files'].items():
    original = (target / record['archive_path']).resolve()
    destination = (target / relative).resolve()
    if not original.is_relative_to(target.resolve()) or not destination.is_relative_to(target.resolve()):
        raise ValueError('Unsafe library path')
    if hashlib.sha256(original.read_bytes()).hexdigest() != record['sha256']:
        raise ValueError('Checksum mismatch: ' + relative)
    if original != destination:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, destination)
print('Installed original captions, provenance, images and previews:', target)
