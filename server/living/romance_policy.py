"""Age and consent boundary independent of LLM output or percentile rolls.

Under 14: no romance. Ages 14–17: ONLY innocent dates/conversation with another
14–17-year-old, <=1 year apart. NEVER sexual acts with anyone under 18.
Adult private intimacy requires two consenting unrelated adults, >=18, no
other occupants, and a private bedroom. Need intensity never supplies consent.
"""
import json
from copy import deepcopy
from pathlib import Path
POLICY = json.loads((Path(__file__).resolve().parents[2] / 'config/living_social_policy.json').read_text())
TEEN = set(POLICY['teen_categories'])
PRIVATE = POLICY['adult_private_category']
DEFINITIONS = {
    'teen_romantic_talk': {'label': 'Seichte Jugendromantik', 'duration_seconds': 180, 'tone': 'romance', 'base': .22, 'requires_consent': True, 'romantic': True, 'nonsexual': True},
    'teen_date': {'label': 'Harmloses Jugenddate', 'duration_seconds': 300, 'tone': 'romance', 'base': .18, 'requires_consent': True, 'romantic': True, 'nonsexual': True},
    PRIVATE: {'label': 'Privater einvernehmlicher Moment · Erwachsene', 'duration_seconds': 600, 'tone': 'romance', 'base': .15, 'requires_consent': True, 'romantic': True, 'private': True, 'adult_only': True},
}
def family(p):
    return p.get('family') or p.get('profile', {}).get('family', {})

def known_kin(a, b):
    for x, y in ((a,b),(b,a)):
        f=family(x)
        if y['id'] in f.get('parent_ids',[]) or y['id'] in f.get('known_kin_ids',[]):return True
        layer=x.get('relations',{}).get(y['id'],{}).get('layers',{}).get('family',{})
        if layer.get('status') not in (None,'none','unknown') or layer.get('score',0)>0:return True
    return bool(set(family(a).get('parent_ids',[])) & set(family(b).get('parent_ids',[])))

def allowed(a,b,category,venue):
    age_a,age_b=a.get('age',0),b.get('age',0)
    if known_kin(a,b):return False
    if category in TEEN:
        if not(14<=age_a<18 and 14<=age_b<18 and abs(age_a-age_b)<=1):return False
        if family(a).get('partner_id') not in (None,b['id']) or family(b).get('partner_id') not in (None,a['id']):return False
        if category=='teen_date' and not any(k in venue.get('purpose','') for k in ('park','cafe','library','shopping street')):return False
        return True
    if category==PRIVATE:
        return (age_a>=18 and age_b>=18 and 'bedroom' in venue.get('purpose','')
                and sorted(venue.get('occupant_ids',[]))==sorted([a['id'],b['id']])
                and family(a).get('partner_id')==b['id'] and family(b).get('partner_id')==a['id']
                and a.get('needs',{}).get('romantic_affection',0)>=.75)
    return False

def candidates(a,b,venue):
    out=[]
    for category,d in DEFINITIONS.items():
        if not allowed(a,b,category,venue):continue
        r=a.get('relations',{}).get(b['id'],{})
        willingness=max(.05,min(.85,d['base']+r.get('trust',.35)*.3-r.get('tension',0)*.4))
        out.append(dict(d,category=category,allowed=True,score=.1+a.get('needs',{}).get('romantic_affection',0)*.55,
                        willingness=willingness,requires_consent=True))
    return out

def apply(a,b,category,outcome,now,evidence):
    patch={}
    for x,y in ((a,b),(b,a)):
        r=deepcopy(x.get('relations',{}).get(y['id'],{}))
        r.setdefault('closeness',.1);r.setdefault('trust',.35);r.setdefault('tension',0)
        if outcome=='accepted':
            r['closeness']=min(1,r['closeness']+.025);r['trust']=min(1,r['trust']+.015)
            romance=r.setdefault('layers',{}).setdefault('romance',{'score':0,'status':'none'})
            romance['score']=min(.35 if category in TEEN else 1,romance.get('score',0)+.03)
            if romance.get('status') in ('none',None):romance['status']='developing'
        r['last_interaction']=now;r['last_evidence_id']=evidence
        patch[x['id']]={'relations':{y['id']:r}}
    return patch
