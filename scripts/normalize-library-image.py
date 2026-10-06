#!/usr/bin/env python3
"""Verify provider bytes and losslessly encode PNG; report technical green-key metrics."""
import hashlib, json, sys
import numpy as np
from PIL import Image
src,dst,kind=sys.argv[1:4]
with Image.open(src) as image:
    image.load();fmt=image.format
    image=image.convert('RGB');w,h=image.size
    if w<512 or h<512:raise ValueError(f'Image too small: {w}x{h}')
    expected=16/9 if kind=='background' else 2/3
    if abs(w/h-expected)>0.035:raise ValueError(f'Unexpected aspect ratio: {w}x{h}')
    image.save(dst,format='PNG')
    metrics={}
    if kind=='character':
        # Border should be a single strong green; metrics assist review, not ethnicity inference.
        arr=np.array(image,dtype=np.int16)
        ring=np.concatenate([arr[:8].reshape(-1,3),arr[-8:].reshape(-1,3),arr[:,:8].reshape(-1,3),arr[:,-8:].reshape(-1,3)])
        green=(ring[:,1]>ring[:,0]+45)&(ring[:,1]>ring[:,2]+45)
        metrics={'border_green_fraction':round(float(green.mean()),4),'border_median_rgb':[int(v) for v in np.median(ring,axis=0)],'border_colour_stddev':round(float(np.std(ring,axis=0).mean()),3)}
print(json.dumps({'width':w,'height':h,'format':'PNG','provider_returned_format':fmt,'sha256':hashlib.sha256(open(dst,'rb').read()).hexdigest(),'technical_review':metrics}))
