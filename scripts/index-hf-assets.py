#!/usr/bin/env python3
"""Index actual local WDS members; no extraction of untrusted archive paths."""
import argparse, hashlib, json, os, pathlib, sqlite3, tarfile
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--root',default=os.environ.get('VIV_ASSET_LIBRARY','data/hf-asset-library'));a=ap.parse_args();root=pathlib.Path(a.root).resolve()
 sources=json.loads((root/'source-tree.json').read_text());tmp=root/'catalog.next.sqlite';tmp.unlink(missing_ok=True);db=sqlite3.connect(tmp)
 db.executescript('''CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,identity_id TEXT,emotion TEXT,age_min INTEGER,age_max INTEGER,gender TEXT,ethnicity TEXT,style TEXT,title TEXT,caption TEXT,repo TEXT,revision TEXT,shard TEXT,offset INTEGER,bytes INTEGER,sha256 TEXT,metadata TEXT);
 CREATE INDEX identities ON assets(identity_id,emotion); CREATE INDEX filters ON assets(kind,gender,age_min,age_max,emotion);
 CREATE VIRTUAL TABLE asset_search USING fts5(id UNINDEXED,title,caption,tags,tokenize='unicode61 remove_diacritics 2');
 CREATE TABLE sources(repo TEXT PRIMARY KEY,revision TEXT,license TEXT);''')
 count=0;skipped=0
 for repo,info in sources.items():
  folder=root/repo.split('/')[-1];kind='character' if 'Characters' in repo else 'background';prefix='hfc-' if kind=='character' else 'hfb-'
  license=(folder/'LICENSE.md').read_text() if (folder/'LICENSE.md').exists() else 'See source repository license.'
  db.execute('INSERT INTO sources VALUES (?,?,?)',(repo,info['revision'],license))
  safety=folder/'metadata/minor-safety/public-stream-filter.json';release=json.loads(safety.read_text()) if safety.exists() else {}
  allowed={x['id']:x.get('image_sha256') for x in json.loads((folder/'metadata/sample-index.json').read_text())} if (folder/'metadata/sample-index.json').exists() else {}
  for f in info['files']:
   if not f['path'].endswith('.tar'):continue
   file=folder/f['path']
   if not file.exists() or file.stat().st_size!=f['size']:raise RuntimeError('Download incomplete: '+str(file))
   stamp=file.with_name(file.name+'.verified.json')
   if not stamp.exists() or json.loads(stamp.read_text())!={'oid':f['oid'],'sha':f.get('lfs',{}).get('oid'),'size':f['size']}:raise RuntimeError('Run verified sync before indexing: '+str(file))
   with tarfile.open(file,'r:') as tar:
    members={m.name:m for m in tar if m.isfile()}
    for name,m in members.items():
     if not name.endswith('.json') or m.size>2000000:continue
     record=json.load(tar.extractfile(m));image=members.get(name[:-5]+'.png')
     if not image or not record.get('id'):continue
     age=record.get('age_years');rid=record['id'];sha=record.get('image_sha256','')
     if kind=='character' and (not isinstance(age,(int,float)) or age<18 and (allowed.get(rid)!=sha or release.get('status')!='restored_after_completed_recheck_and_all_replacement_uploads')):skipped+=1;continue
     amin=amax=None
     if kind=='character':
      amin,amax=next(((lo,hi) for lo,hi in [(0,2),(3,5),(6,9),(10,13),(14,17),(18,29),(30,49),(50,64),(65,79),(80,110)] if lo<=age<=hi),(int(age),int(age)))
     meta={k:v for k,v in record.items() if k not in ['runtime','inference']};meta['source_url']=f'https://huggingface.co/datasets/{repo}/tree/{info["revision"]}';meta['license_reference']='LICENSE.md in source repository';meta['width']=record.get('inference',{}).get('width');meta['height']=record.get('inference',{}).get('height')
     caption=record.get('description') or record.get('prompt','');title=record.get('canonical_core_phrase') or (record.get('personality_id',rid)+' · '+record.get('emotion','neutral'));identity=prefix+record.get('personality_id',record.get('location_id',rid));emotion=record.get('emotion','neutral');style=record.get('outfit_style',record.get('world',''))
     row=(prefix+rid,kind,identity,emotion,amin,amax,record.get('gender',''),record.get('ethnicity',''),style,title,caption,repo,info['revision'],str(file.relative_to(root)),image.offset_data,image.size,sha,json.dumps(meta,ensure_ascii=False))
     existing=db.execute('SELECT metadata FROM assets WHERE id=?',(row[0],)).fetchone()
     if existing and json.loads(existing[0]).get('generated_utc','')>=record.get('generated_utc',''):continue
     db.execute('INSERT OR REPLACE INTO assets VALUES ('+','.join('?'*18)+')',row)
     count+=1
  db.commit();print(json.dumps({'repo':repo,'indexed':count,'withheld':skipped}),flush=True)
 for row in db.execute('SELECT id,title,caption,metadata,style,ethnicity,emotion FROM assets'):
  meta=json.loads(row[3]);tags=' '.join(str(meta.get(k,'')) for k in ['primary_class','subcategory','age_group','special_class','outfit','hair','skin_tone','world'])+' '+' '.join(row[4:]);db.execute('INSERT INTO asset_search VALUES (?,?,?,?)',(row[0],row[1],row[2],tags))
 db.commit();result={'assets':db.execute('SELECT count(*) FROM assets').fetchone()[0],'identities':db.execute("SELECT count(DISTINCT identity_id) FROM assets WHERE kind='character'").fetchone()[0],'withheld':skipped};db.execute('PRAGMA optimize');db.close();os.replace(tmp,root/'catalog.sqlite');(root/'catalog-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
if __name__=='__main__':main()
