#!/usr/bin/env python3
"""Download the RPG music dataset and index MP3 offsets without unpacking 14 GB."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import tarfile

REPO = 'laion/laion-tunes-rpg-music'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    project = Path(__file__).resolve().parents[1]
    parser.add_argument('--directory', type=Path, default=Path(os.environ.get('MUSIC_DATA_DIR', str(Path(os.environ.get('VIV_DATA_DIR', project / 'data')) / 'music-library'))))
    parser.add_argument('--index-only', action='store_true')
    args = parser.parse_args()
    root = args.directory.resolve()
    revision = None
    if not args.index_only:
        try:
            from huggingface_hub import HfApi, snapshot_download
        except ImportError:
            raise SystemExit('Install the downloader first: python3 -m pip install huggingface_hub')
        api = HfApi(token=os.environ.get('HF_TOKEN') or None)
        revision = api.repo_info(REPO, repo_type='dataset').sha
        print(f'Downloading {REPO} at {revision}. Audio shards total approximately 14.2 GB.', flush=True)
        snapshot_download(repo_id=REPO, repo_type='dataset', revision=revision, local_dir=root,
                          token=os.environ.get('HF_TOKEN') or None, max_workers=3)
    database = root / 'indices/rpg_metadata.db'
    if not database.is_file():
        raise SystemExit('Music metadata is missing; run without --index-only first.')
    with sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True) as db:
        expected = {str(row[0]) for row in db.execute('SELECT row_id FROM tracks')}
    tracks = {}
    shards = []
    for source in sorted((root / 'tars').glob('*.tar')):
        stat = source.stat()
        shards.append({'file': source.relative_to(root).as_posix(), 'bytes': stat.st_size, 'mtime_ns': stat.st_mtime_ns})
        with tarfile.open(source) as archive:
            for member in archive:
                name = Path(member.name)
                if not member.isfile() or name.suffix.lower() != '.mp3' or name.stem not in expected:
                    continue
                if name.stem in tracks:
                    raise SystemExit(f'Duplicate audio row: {name.stem}')
                tracks[name.stem] = {'tar': source.relative_to(root).as_posix(), 'offset': member.offset_data,
                                     'bytes': member.size, 'mime': 'audio/mpeg'}
        print(f'Indexed {source.name}: {len(tracks)} tracks so far.', flush=True)
    missing = expected - set(tracks)
    if missing:
        raise SystemExit(f'{len(missing)} audio files missing. Re-run the download before starting music.')
    report = {'schema_version': 1, 'dataset': REPO, 'revision': revision, 'shards': shards, 'tracks': tracks}
    target = root / 'audio-index.json'
    temporary = target.with_suffix('.partial')
    temporary.write_text(json.dumps(report, separators=(',', ':')) + '\n')
    temporary.replace(target)
    print(f'Ready: {len(tracks)} locally playable tracks; MP3 files stay inside the TAR shards.', flush=True)


if __name__ == '__main__':
    main()
