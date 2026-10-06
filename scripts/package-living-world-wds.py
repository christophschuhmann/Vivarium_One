#!/usr/bin/env python3
"""Package the complete asset library as one verified WebDataset shard."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def main():
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, default=project / "assets/living-world-library")
    parser.add_argument("--output", type=Path, default=project / "assets/living-world-library.wds.tar")
    args = parser.parse_args()
    library = args.library.resolve()
    output = args.output.resolve()
    if output.is_relative_to(library):
        raise ValueError("The archive must be outside the source library.")
    manifest = json.loads((library / "manifest.json").read_text())
    entries = manifest["entries"]
    inventory = {}
    members = {}
    canonical = set()
    samples = []

    def add_bytes(archive, name, data):
        if name in members:
            raise ValueError(f"Duplicate archive member: {name}")
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o644
        info.mtime = 0
        archive.addfile(info, io.BytesIO(data))
        members[name] = {"sha256": digest(data), "bytes": len(data)}

    def add_source(archive, relative, name):
        source = (library / relative).resolve()
        if not source.is_relative_to(library) or not source.is_file():
            raise ValueError(f"Invalid library file: {relative}")
        data = source.read_bytes()
        add_bytes(archive, name, data)
        inventory[relative] = {"archive_path": name, **members[name]}
        return data

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    try:
        with tarfile.open(temporary, "w", format=tarfile.PAX_FORMAT) as archive:
            for entry in entries:
                image_path = entry["file"]
                sidecar_path = entry["sidecar"]
                image_key = str(Path(image_path).with_suffix(""))
                if "." in Path(image_key).name or image_key.startswith("__"):
                    raise ValueError(f"Invalid WebDataset sample key: {image_key}")
                if str(Path(sidecar_path).with_suffix("")) != image_key:
                    raise ValueError(f"Image and sidecar names differ: {image_key}")
                image_data = add_source(archive, image_path, image_path)
                if digest(image_data) != entry["sha256"]:
                    raise ValueError(f"Manifest image checksum differs: {image_path}")
                sidecar = json.loads(add_source(archive, sidecar_path, sidecar_path))
                if sidecar["id"] != entry["id"] or sidecar["file"] != image_path:
                    raise ValueError(f"Sidecar identity differs: {sidecar_path}")
                caption = sidecar.get("caption", "")
                if isinstance(caption, dict):
                    caption = caption.get("en") or caption.get("de") or ""
                add_bytes(archive, image_key + ".txt", (caption + "\n").encode())
                canonical.update((image_path, sidecar_path))
                samples.append({"key": image_key, "id": entry["id"], "image": image_path,
                                "sidecar": sidecar_path, "caption": image_key + ".txt"})

            for source in sorted(library.rglob("*")):
                if not source.is_file():
                    continue
                relative = source.relative_to(library).as_posix()
                if relative not in canonical:
                    add_source(archive, relative, "__metadata__/library/" + relative)

            package = {
                "schema_version": 1,
                "format": "WebDataset",
                "sample_count": len(samples),
                "source_file_count": len(inventory),
                "source_counts": manifest["counts"],
                "caption_language": "en (de fallback)",
                "metadata_prefix": "__metadata__/",
                "samples": samples,
                "source_files": inventory,
            }
            add_bytes(archive, "__metadata__/package.json", json_bytes(package))
            add_bytes(archive, "__metadata__/README.txt", b"""Vivarium Living World asset library - WebDataset

167 samples: image (.png or .jpg), original JSON sidecar and UTF-8 caption (.txt).
Each sample's files are adjacent in the TAR and share the same key.
All prompts, captions, provenance and generation metadata remain in JSON.
Every original library file is included, byte-for-byte.

__metadata__/ contains the offline gallery, previews, references, revision
history, generation reports and an inventory with SHA-256 checksums.
The standard WebDataset reader skips this reserved metadata directory.

Python usage:
    import webdataset as wds
    dataset = wds.WebDataset('living-world-library.wds.tar', shardshuffle=False)
    dataset = dataset.decode('pil').to_tuple('png;jpg', 'json', 'txt')

Restore the complete offline gallery into an empty directory:
    mkdir library-unpacked
    tar -xf living-world-library.wds.tar -C library-unpacked
    python3 library-unpacked/__metadata__/restore-library.py
    # Open library-unpacked/index.html in your browser.
""")
            restore = '''#!/usr/bin/env python3
"""Restore the original library paths after extracting this shard."""
import hashlib
import json
from pathlib import Path
import shutil

metadata = Path(__file__).resolve().parent
root = metadata.parent
package = json.loads((metadata / "package.json").read_text())
for relative, record in package["source_files"].items():
    source = (root / record["archive_path"]).resolve()
    target = (root / relative).resolve()
    if not source.is_relative_to(root) or not target.is_relative_to(root):
        raise ValueError("Unsafe path in inventory")
    if hashlib.sha256(source.read_bytes()).hexdigest() != record["sha256"]:
        raise ValueError(f"Source checksum differs: {relative}")
    if source != target:
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != record["sha256"]:
                raise ValueError(f"Refusing to overwrite changed file: {relative}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
print(f'Restored {package["source_file_count"]} original files; gallery: {root / "index.html"}')
'''
            add_bytes(archive, "__metadata__/restore-library.py", restore.encode())

        expected_sources = {p.relative_to(library).as_posix() for p in library.rglob("*") if p.is_file()}
        if set(inventory) != expected_sources:
            raise ValueError("Not all source files were archived")
        checked = set()
        groups = []
        with tarfile.open(temporary, "r|") as archive:
            for member in archive:
                if member.name in checked or not member.isfile():
                    raise ValueError(f"Unexpected archive member: {member.name}")
                data = archive.extractfile(member).read()
                if members[member.name] != {"sha256": digest(data), "bytes": len(data)}:
                    raise ValueError(f"Archive verification failed: {member.name}")
                checked.add(member.name)
                if not member.name.startswith("__metadata__/"):
                    match = re.match(r"^((?:.*/|)[^.]+)[.]([^/]*)$", member.name)
                    if not match:
                        raise ValueError(f"Invalid WebDataset member: {member.name}")
                    key, suffix = match.groups()
                    if not groups or groups[-1][0] != key:
                        groups.append((key, set()))
                    if suffix in groups[-1][1]:
                        raise ValueError(f"Duplicate sample suffix: {member.name}")
                    groups[-1][1].add(suffix)
        if checked != set(members) or len(groups) != len(samples):
            raise ValueError("Archive member or sample count differs")
        for key, suffixes in groups:
            if suffixes not in ({"png", "json", "txt"}, {"jpg", "json", "txt"}):
                raise ValueError(f"Incomplete WebDataset sample: {key}")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

    archive_hash = hashlib.sha256()
    with output.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            archive_hash.update(chunk)
    report = {"archive": str(output), "bytes": output.stat().st_size,
              "sha256": archive_hash.hexdigest(), "sample_count": len(samples),
              "original_library_files": len(inventory), "tar_members": len(members),
              "all_source_bytes_verified": True, "sample_structure_verified": True}
    output.with_suffix(".json").write_bytes(json_bytes(report))
    output.with_suffix(".sha256").write_text(f'{report["sha256"]}  {output.name}\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
