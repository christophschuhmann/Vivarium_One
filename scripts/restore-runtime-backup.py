#!/usr/bin/env python3
"""Authenticate and decrypt a Vivarium AES-256-GCM runtime snapshot.
Requires: pip install cryptography. Does not extract files or overwrite a database.
Keep the recovery-key JSON separate from the archive and from GitHub.
"""
import argparse,json,os,pathlib,tempfile
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',required=True);p.add_argument('--key',required=True);p.add_argument('--output',required=True);a=p.parse_args()
archive=pathlib.Path(a.archive);output=pathlib.Path(a.output)
if output.exists():raise SystemExit('Output already exists; choose a new path.')
secret=json.loads(pathlib.Path(a.key).read_text());size=archive.stat().st_size
if size<16:raise SystemExit('Invalid encrypted archive.')
with archive.open('rb') as src:
 src.seek(size-16);tag=src.read(16);src.seek(0)
 dec=Cipher(algorithms.AES(bytes.fromhex(secret['key_hex'])),modes.GCM(bytes.fromhex(secret['nonce_hex']),tag)).decryptor()
 fd,tmp=tempfile.mkstemp(prefix='.vivarium-restore-',dir=output.parent)
 try:
  with os.fdopen(fd,'wb') as out:
   remaining=size-16
   while remaining:
    chunk=src.read(min(4*1024*1024,remaining))
    if not chunk:raise ValueError('Truncated archive')
    remaining-=len(chunk);out.write(dec.update(chunk))
   out.write(dec.finalize()) # Authentication must succeed before publishing the plaintext.
  os.rename(tmp,output)
 except BaseException:
  pathlib.Path(tmp).unlink(missing_ok=True);raise
print('Authenticated archive written to',output)
print('Inspect RESTORE.json inside the tar.gz before restoring files. Stop the target server first.')
