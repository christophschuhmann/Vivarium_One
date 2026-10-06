"""Extract scenario ZIPs as ordinary files only, within the fresh target directory."""
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import zipfile

source, target = sys.argv[1:]
root = Path(target).resolve()
with zipfile.ZipFile(source) as archive:
    entries = archive.infolist()
    if len(entries) > 25000 or sum(info.file_size for info in entries) > 1024 * 1024 * 1024:
        raise ValueError('Scenario archive exceeds the expanded size limit')
    destinations = set()
    for info in entries:
        name = info.filename
        if '\\' in name or any(ord(c) < 32 for c in name) or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:
            raise ValueError('Unsafe scenario path')
        destination = (root / name).resolve()
        if not destination.is_relative_to(root) or destination in destinations:
            raise ValueError('Duplicate or escaping scenario path')
        destinations.add(destination)
        mode = stat.S_IFMT(info.external_attr >> 16)
        if mode not in {0, stat.S_IFREG, stat.S_IFDIR}:
            raise ValueError('Scenario links and special files are not supported')
    for info in entries:
        destination = root / info.filename
        if info.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as incoming, destination.open('wb') as outgoing:
                shutil.copyfileobj(incoming, outgoing)
