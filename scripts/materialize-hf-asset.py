#!/usr/bin/env python3
import argparse, hashlib, io, os, pathlib, sqlite3, tempfile
from PIL import Image
from matte import cutout
ap=argparse.ArgumentParser();ap.add_argument('--root',required=True);ap.add_argument('--id',required=True);ap.add_argument('--variant',choices=['full','preview','sprite'],default='preview');a=ap.parse_args()
root=pathlib.Path(a.root).resolve();db=sqlite3.connect('file:'+str(root/'catalog.sqlite')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row;r=db.execute('SELECT * FROM assets WHERE id=?',(a.id,)).fetchone()
if not r:raise SystemExit('Unknown asset')
folder=root/'cache';folder.mkdir(exist_ok=True);dest=folder/(r['id']+'-'+r['sha256'][:12]+'--'+a.variant+'.png')
if not dest.exists():
 source=(root/r['shard']).resolve()
 if not source.is_relative_to(root) or r['bytes']>30000000:raise SystemExit('Invalid asset source')
 with source.open('rb') as f:f.seek(r['offset']);data=f.read(r['bytes'])
 if r['sha256'] and hashlib.sha256(data).hexdigest()!=r['sha256']:raise SystemExit('Image checksum mismatch')
 with tempfile.TemporaryDirectory(dir=folder) as td:
  raw=pathlib.Path(td)/'raw.png';raw.write_bytes(data);out=pathlib.Path(td)/'image.png'
  if r['kind']=='character' and a.variant in ['sprite','preview']:cutout(raw,out);im=Image.open(out)
  else:im=Image.open(io.BytesIO(data))
  if a.variant!='full':im.thumbnail((384,576) if r['kind']=='character' else (480,270))
  im.save(out);os.replace(out,dest)
print(dest)
