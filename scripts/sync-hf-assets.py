#!/usr/bin/env python3
"""Incremental, pinned public dataset mirror. Never executes repository code."""
import argparse, concurrent.futures, hashlib, json, os, pathlib, time, urllib.request

REPOS = ['laion/Anim-E-Ghibli-Backgrounds-FLUX-9B', 'laion/Vivarium-Greenscreen-Characters-FLUX-9B']
def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Vivarium-asset-sync/1'}), timeout=120)
def tree(repo):
    with request('https://huggingface.co/api/datasets/'+repo) as r: revision=json.load(r)['sha']
    url=f'https://huggingface.co/api/datasets/{repo}/tree/{revision}?recursive=true&limit=1000'; files=[]
    while url:
        with request(url) as r:
            files.extend(f for f in json.load(r) if f['type']=='file')
            links=r.headers.get('Link',''); url=next((p.split('>')[0].strip().lstrip('<') for p in links.split(',') if 'rel="next"' in p),None)
    return {'revision':revision,'files':files}
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
    return h.hexdigest()
def download(root,repo,rev,item):
    rel=pathlib.PurePosixPath(item['path'])
    if rel.is_absolute() or '..' in rel.parts: raise ValueError('Unsafe repository path')
    dest=root/repo.split('/')[-1]/rel; dest.parent.mkdir(parents=True,exist_ok=True)
    sha=item.get('lfs',{}).get('oid'); expected=item.get('size')
    stamp=dest.with_name(dest.name+'.verified.json')
    if dest.exists() and dest.stat().st_size==expected:
        try:
            recorded=json.loads(stamp.read_text())
            if recorded=={'oid':item['oid'],'sha':sha,'size':expected}: return 'cached',expected
        except (OSError,ValueError): pass
        if sha and digest(dest)==sha:
            stamp.write_text(json.dumps({'oid':item['oid'],'sha':sha,'size':expected})); return 'verified',expected
    tmp=dest.with_name(dest.name+'.part')
    for attempt in range(4):
        try:
            with request(f'https://huggingface.co/datasets/{repo}/resolve/{rev}/{rel}') as r, tmp.open('wb') as f:
                h=hashlib.sha256(); size=0
                while b:=r.read(1024*1024): f.write(b);h.update(b);size+=len(b)
            if size!=expected or sha and h.hexdigest()!=sha: raise ValueError('Shard size/hash mismatch: '+str(rel))
            os.replace(tmp,dest);stamp.write_text(json.dumps({'oid':item['oid'],'sha':sha,'size':expected}));return 'downloaded',size
        except Exception:
            if attempt==3: raise
            time.sleep(2**attempt)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',default=os.environ.get('VIV_ASSET_LIBRARY', 'data/hf-asset-library'));ap.add_argument('--workers',type=int,default=6);ap.add_argument('--snapshot');ap.add_argument('--metadata-only',action='store_true');args=ap.parse_args()
    root=pathlib.Path(args.root).resolve();root.mkdir(parents=True,exist_ok=True)
    sources=json.loads(pathlib.Path(args.snapshot).read_text()) if args.snapshot else {r:tree(r) for r in REPOS}
    jobs=[]
    for repo,s in sources.items():
        for f in s['files']:
            p=f['path']
            if p.endswith('.tar') and not args.metadata_only or p.startswith('metadata/') or pathlib.PurePosixPath(p).name in ['README.md','LICENSE.md','MODEL_LICENSE.md']:
                jobs.append((root,repo,s['revision'],f))
    print(json.dumps({'phase':'download','files':len(jobs),'bytes':sum(x[3]['size'] for x in jobs),'revisions':{r:s['revision'] for r,s in sources.items()}}),flush=True)
    done=0; size=0; errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(12,args.workers))) as pool:
        pending={pool.submit(download,*j):j for j in jobs}
        for future in concurrent.futures.as_completed(pending):
            try: status,n=future.result();size+=n
            except Exception as e: errors.append({'path':pending[future][3]['path'],'error':str(e)})
            done+=1
            if done%20==0 or done==len(jobs):print(json.dumps({'completed':done,'total':len(jobs),'bytes':size,'errors':len(errors)}),flush=True)
    if errors:
        (root/'sync-errors.json').write_text(json.dumps(errors,indent=2));raise SystemExit('Some files failed; rerun to retry.')
    tmp=root/'source-tree.json.part';tmp.write_text(json.dumps(sources));os.replace(tmp,root/'source-tree.json')
    print('Snapshot downloaded and verified.',flush=True)
if __name__=='__main__':main()
