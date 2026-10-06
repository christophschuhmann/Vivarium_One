#!/usr/bin/env python3
"""Prepare the reusable library, preserving legacy provenance and exact new prompts.
Requires Pillow. Read-only access to the game DB; no provider calls in this step.
"""
import ast, collections, datetime, hashlib, json, re, shutil, sqlite3
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
LIB=ROOT/'assets/living-world-library'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
if (LIB/'generation-plan.json').exists():
    raise SystemExit('Library is already prepared. Use generate-living-world-assets.mjs to resume; existing prompts and reviewed assets are preserved.')
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def slug(value):return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')[:65]
def relative(path):return str(path.relative_to(LIB))
for folder in ['backgrounds/existing','backgrounds/generated','characters/greenscreen','references','previews','review']:(LIB/folder).mkdir(parents=True,exist_ok=True)
# Store exact style reference bytes using the actual image extension.
references={}
for kind,src in [('background',ROOT/'assets/locations/living_room.png'),('character',ROOT/'assets/characters/alice_everyday.png')]:
    with Image.open(src) as im: ext={'JPEG':'jpg','PNG':'png','WEBP':'webp'}[im.format];size=list(im.size)
    dst=LIB/'references'/f'{kind}-style.{ext}';shutil.copy2(src,dst)
    references[kind]={'file':relative(dst),'original_file':str(src.relative_to(ROOT)),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'dimensions':size,'role':'style only; do not copy the reference identity or location'}
legacy=[]
c=sqlite3.connect(f'file:{ROOT}/data/vivarium.db?mode=ro',uri=True);c.row_factory=sqlite3.Row
for r in c.execute("SELECT a.*,l.name AS location_name,l.description AS location_description,w.title AS world_title FROM assets a LEFT JOIN locations l ON a.owner_ref=l.id LEFT JOIN worlds w ON a.world_id=w.id WHERE a.kind='background' ORDER BY a.created_at"):
    r=dict(r);call=c.execute('SELECT provider,model FROM provider_calls WHERE asset_id=? ORDER BY created_at DESC LIMIT 1',(r['id'],)).fetchone()
    legacy.append({'source_file':str((ROOT/'data/assets'/r['file']).relative_to(ROOT)),'source_asset_id':r['id'],'source':'database','title':r['location_name'] or (r['prompt'] or '').split(' — ')[0].removeprefix('bg:')[:85] or r['id'],'description':r['location_description'] or '', 'prompt':r['prompt'],'world':r['world_title'],'original_metadata':json.loads(r['meta'] or '{}'),'provider':call['provider'] if call else None,'model':call['model'] if call else None})
# Static demo backgrounds include a few earlier variants absent from the DB.
static_prompts={};tree=ast.parse((ROOT/'scripts/gen_locations_batch.py').read_text())
for node in tree.body:
    if isinstance(node,ast.Assign):
        for target in node.targets:
            if isinstance(target,ast.Name) and target.id in ['LOCS','SUFFIX']: static_prompts[target.id]=ast.literal_eval(node.value)
for src in sorted((ROOT/'assets/locations').glob('*')):
    if src.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:continue
    prompt=static_prompts.get('LOCS',{}).get(src.stem)
    legacy.append({'source_file':str(src.relative_to(ROOT)),'source':'static-demo','title':src.stem.replace('_',' ').title(),'description':prompt or '', 'prompt':prompt+static_prompts['SUFFIX'] if prompt else None,'provider':None,'model':None})
# Template bundles may retain a background no longer referenced by the live DB.
for mf in sorted((ROOT/'data/templates').glob('*/manifest.json')):
    manifest=json.loads(mf.read_text());assets=manifest.get('assets',[])
    if isinstance(assets,dict):assets=list(assets.values())
    for asset in assets:
        if asset.get('kind')!='background':continue
        filename=asset.get('file','');src=mf.parent/'assets'/filename
        if not src.is_file():continue
        legacy.append({'source_file':str(src.relative_to(ROOT)),'source':'template','source_asset_id':asset.get('id'),'title':(asset.get('prompt') or filename).split(' — ')[0][:85],'prompt':asset.get('prompt'),'provider':None,'model':None})
# Deduplicate identical source bytes, retaining EVERY source in the sidecar.
by_hash={};missing=[]
for source in legacy:
    src=ROOT/source['source_file']
    if not src.is_file():missing.append(source);continue
    raw=src.read_bytes();sha=hashlib.sha256(raw).hexdigest()
    if sha in by_hash:by_hash[sha]['sources'].append(source);continue
    with Image.open(src) as image:ext={'JPEG':'jpg','PNG':'png','WEBP':'webp'}.get(image.format,src.suffix[1:]);width,height=image.size;fmt=image.format
    name=(slug(source['title']) or 'background')+'-'+sha[:10]
    dst=LIB/'backgrounds/existing'/f'{name}.{ext}';shutil.copy2(src,dst)
    record={'schema_version':1,'id':'existing-'+sha[:16],'kind':'background','origin':'existing','title':source['title'],'file':relative(dst),'caption':{'de':'Vorhandener Vivarium-Hintergrund: '+source['title']+'.','en':source.get('description') or source.get('prompt') or source['title']},'prompt':source.get('prompt'),'prompt_status':'original_recorded' if source.get('prompt') else 'not_recorded','sha256':sha,'width':width,'height':height,'format':fmt,'aspect_ratio':'16:9','actual_aspect_ratio':round(width/height,6),'sources':[source]}
    by_hash[sha]=record
for record in by_hash.values():
    recorded=next((s['prompt'] for s in record['sources'] if s.get('prompt') and not s['prompt'].startswith('bg:')),None)
    if recorded:record['prompt']=recorded;record['prompt_status']='original_recorded'
    record['sidecar']=str(Path(record['file']).with_suffix('.json'));dump(LIB/record['sidecar'],record)
dump(LIB/'existing-backgrounds.json',{'source_count':len(legacy),'database_source_count':sum(s['source']=='database' for s in legacy),'unique_image_count':len(by_hash),'missing_sources':missing,'images':list(by_hash.values())})
# Thirty deliberately different reusable environments; the common world style stays fixed.
backgrounds=[
('attic-bedroom','Schlafzimmer im Dachgeschoss','A sunny contemporary attic bedroom with slanted exposed oak beams, a made double bed beneath a round dormer window, terracotta linen bedding, a woven rug, a compact reading armchair and a low wardrobe, warm quiet morning light.','residential','bedroom'),
('tatami-bedroom','Schlafzimmer mit Tatami und Futon','A peaceful compact bedroom in a contemporary Japanese house, tatami floor, a neatly made low futon, sliding shoji panels, a small oak wardrobe, blue-and-cream bedding, a recessed shelf with one ceramic vase and a view of a tiny private stone garden.','residential','bedroom'),
('shared-childrens-bedroom','Gemeinsames Kinderzimmer mit Hochbett','A cheerful shared bedroom for two school-age children, a sturdy wooden bunk bed with coral and navy bedding, two child-sized desks, drawers for toys, a low bookcase, paper stars hanging from the ceiling and bright afternoon light, generous tidy floor space.','residential','childrens_room'),
('baby-nursery','Babyzimmer mit Wiege und Wickelkommode','A calm baby nursery with a pale oak crib and changing cabinet, closed drawers, a comfortable upholstered rocking chair, a soft peach rug, simple moon-and-cloud wall shapes and filtered morning sunlight, orderly safe furnishings with no loose items inside the crib.','residential','nursery'),
('accessible-bathroom','Barrierefreies Badezimmer','A bright spacious accessible bathroom with a walk-in shower, wall-mounted fold-down shower seat, discreet safety rails, a broad ceramic basin, non-slip warm stone tiles, ample turning space and a high frosted window, welcoming practical contemporary design.','residential','bathroom'),
('timber-spa-bathroom','Badezimmer mit Holz und freistehender Wanne','A compact spa-like apartment bathroom with a freestanding oval tub, slatted cedar wall, warm limestone floor, copper fixtures, folded cream towels in open shelves, a low frosted window and soft late-afternoon light, distinctly different from a tiled student bathroom.','residential','bathroom'),
('family-living-dining-room','Familienwohnzimmer mit Essbereich','A lively but empty family living and dining room with a burgundy sectional sofa, a round six-seat wooden dining table, a low sideboard, a board-game shelf, a neatly folded play mat, broad garden doors and sunny yellow accents; practical open-plan suburban layout.','residential','living_room'),
('industrial-loft-lounge','Wohnbereich im Backstein-Loft','An empty industrial loft lounge in a converted modest warehouse apartment, exposed red brick, black steel ceiling beams, a tall arched factory window, a camel leather sofa, a round steel coffee table, an oversized abstract canvas without figures and a wool rug, mellow afternoon light.','residential','living_room'),
('farmhouse-kitchen','Landhausküche mit Kräuterregal','A sunlit country-house kitchen with cream-painted cabinetry, a deep farmhouse sink beneath a window onto an orchard, a flour-dusted wooden preparation table, terracotta crockery, a hanging herb shelf and a small cast-iron stove, open foreground floor area.','residential','kitchen'),
('laundry-utility-room','Waschküche und Hauswirtschaftsraum','A tidy apartment-building laundry and utility room with side-by-side washer and dryer, a folding counter, labelled shapes instead of text on storage baskets, a wall drying rack, navy tiles and a small high window, friendly warm practical lighting.','residential','utility'),
('entryway-mudroom','Hausflur mit Garderobe','A welcoming house entrance and mudroom with oak coat pegs, a long shoe bench, closed shoe cupboards, a woven runner, two umbrellas in a stand, a front door with frosted glass and a doorway leading deeper into the house, warm morning light and clear central passage.','residential','entry'),
('botanical-greenhouse','Botanisches Gewächshaus','A spacious Victorian-style public botanical greenhouse with a curved glass roof, brick paths, waist-high fern beds, hanging orchids, citrus trees in planters and a central bench, shafts of sunshine through misty panes; a clear walkway for character overlays.','outdoors','greenhouse'),
('rose-garden-maze','Rosengarten mit Heckenlabyrinth','A public rose garden with a low clipped hedge maze, stone paths, a small empty circular gazebo, climbing pink roses on arches and distant mature trees; warm early-summer sunlight, clear path in the foreground, a different setting from the existing pond park.','outdoors','park'),
('woodland-boardwalk','Holzsteg durch einen Wald','A quiet woodland nature trail with a raised timber boardwalk curving between tall beech trees, ferns, mossy stones and a small stream, dappled sunlight and a simple wooden lookout rail, inviting natural greens and golden highlights.','outdoors','forest'),
('seaside-promenade','Promenade am Meer','A bright seaside pedestrian promenade with a pale stone sea wall, a row of wooden benches, folded pastel café parasols, a distant lighthouse and sailboats on a calm sea, broad empty paved foreground and breezy late-afternoon sunlight.','outdoors','coast'),
('dune-beach','Sandstrand mit Dünen','An empty sandy beach with low dunes and beach grass, a weathered wooden access fence on one side, a small closed lifeguard hut in the distance, turquoise water and gentle waves under a soft summer sky; broad uncluttered sand foreground.','outdoors','beach'),
('evening-shopping-market','Einkaufsstraße mit Abendmarkt','A pedestrian shopping street at blue hour with small colourful produce and craft stalls under canvas canopies, shop windows, string lights and brick façades, all stalls unattended and street entirely empty, no readable advertising, warm cheerful lighting and broad walking space.','urban','shopping_street'),
('covered-shopping-arcade','Überdachte Einkaufspassage','A historic covered shopping arcade with an iron-and-glass barrel roof, a small bookshop and stationery shop, tiled geometric flooring, warm shop lamps, planters and curved wooden shop doors, empty eye-level view down the arcade with clear walking lanes and no readable signage.','urban','shopping_street'),
('artisan-bakery','Handwerksbäckerei','A small inviting artisan bakery interior with a glass bread display, baskets of sourdough loaves, a tiled oven alcove, a wooden sales counter, an empty breakfast nook and warm dawn sunlight through the front window, no shopkeeper or customers.','commercial','bakery'),
('community-music-studio','Musikproberaum','A friendly community music rehearsal studio with upright piano, acoustic panels, neatly stored guitars, a drum kit on a small platform, folded music stands and comfortable stools, warm amber lamps, a clear open practice area, no performers and no human images on posters.','community','music_studio'),
('makerspace-workshop','Werkstatt und Makerspace','An orderly neighbourhood makerspace workshop with wooden workbenches, safely stored tools on a pegboard, a closed 3D printer enclosure, colourful parts drawers and tall warehouse windows, tidy creative atmosphere with a broad clear aisle, no operators.','community','workshop'),
('school-classroom','Heller Schulklassenraum','A bright contemporary primary-school classroom with rows of small desks, low open bookshelves, a reading corner with soft cushions, a clean chalkboard with only simple geometric shapes, broad windows onto a school garden and warm cheerful daylight, no students or teachers.','education','classroom'),
('campus-botanical-courtyard','Campus-Innenhof mit Lernpavillon','A quiet university science-campus courtyard arranged around a circular planted rain garden, modern pale-brick faculty façades, a timber study pavilion with empty benches, bicycle stands and climbing vines, afternoon sunlight, no clock tower or classic campus quad composition.','education','campus'),
('student-shared-kitchen','Gemeinschaftsküche im Studierendenwohnheim','A compact shared student-residence kitchen with colourful mismatched cupboards, four cooking hobs, a labelled-shape pantry grid without text, two refrigerators, an empty communal breakfast bar and a large sunny window, clean welcoming affordable furnishings.','education','kitchen'),
('chemistry-teaching-lab','Chemisches Lehrlabor','A modern university chemistry teaching laboratory with clean bench islands, sealed fume hoods, neat glassware racks, stools tucked in, eyewash station and high windows, warm neutral daylight, a broad central aisle and no experiments in progress, distinct from a psychology lab.','education','laboratory'),
('public-childrens-library','Kinderabteilung einer Stadtbibliothek','An inviting public library children\'s section with low rounded bookshelves, a small story-circle rug, colourful reading seats, a tree-shaped wooden shelf and arched street-facing windows, bright warm daylight, tidy family-friendly space and no characters illustrated on book covers.','community','library'),
('neighbourhood-art-gallery','Kleine Galerie im Stadtviertel','A small contemporary neighbourhood art gallery with pale plaster walls, warm oak floor, abstract colour-field paintings with no people or faces, two ceramic sculptures on plinths, a simple reception desk and gentle skylight, clear empty circulation space.','community','gallery'),
('indoor-community-pool','Hallenbad','A bright indoor municipal swimming-pool hall with turquoise water, pale tile deck, lane ropes, stacked kickboards, a small empty lifeguard station and large windows opening onto a garden, softly reflected daylight, no swimmers and a clear dry foreground walkway.','community','swimming_pool'),
('small-town-train-platform','Kleinstadtbahnsteig','An empty small-town railway platform with a timber station shelter, a simple bench, a vintage clock without readable lettering, flower boxes and railway tracks receding beside a quiet distant train, warm morning light, clear safe platform foreground.','transport','train_station'),
('winter-mountain-cabin','Berghütte im Winter','The welcoming interior of a modest mountain cabin in winter, a glowing enclosed wood stove, plaid-covered armchairs, rough timber walls, a small dining table, snow-covered mountains visible through a square window and a rack of neatly stored boots, warm firelight and clear foreground floor.','residential','cabin'),
]
style='Warm bright high-quality hand-painted anime background in the same cozy storybook visual style as the reference image; fine expressive linework, soft watercolor-like textures, believable architectural perspective. New location layout, do not copy the reference room or its furniture.'
constraints='Empty scene with no people or animals, no portraits or human figures in decoration, no logos, no text. Widescreen location panorama, eye-level camera, a clear central foreground area for overlaying game characters.'
jobs=[]
for number,(sid,title,description,category,room) in enumerate(backgrounds,1):
    base=f'backgrounds/generated/{number:02d}-{sid}'
    jobs.append({'schema_version':1,'id':f'bg-{number:02d}-{sid}','kind':'background','origin':'generated','title':title,'category':category,'location_type':room,'file':base+'.png','sidecar':base+'.json','caption':{'de':title+'; menschenleerer, warm illustrierter 16:9-Hintergrund für Vivarium.','en':description+' Empty warm hand-painted anime location background.'},'prompt':description+' '+style+' '+constraints,'provider':'hyprlab','model':'nano-banana-2-lite','aspect_ratio':'16:9','reference_images':[references['background']], 'tags':[category,room,sid,'empty','anime']})
# Nine non-overlapping age bands, five variants for each male/female group.
age_groups=[('senior-70-85','Senioren',70,85,[70,74,78,82,85]),('adult-50-69','Ältere Erwachsene',50,69,[50,55,60,65,69]),('adult-30-49','Erwachsene',30,49,[30,35,40,45,49]),('young-adult-18-29','Junge Erwachsene',18,29,[18,21,24,27,29]),('teen-15-17','Teens',15,17,[15,16,17,15,17]),('child-10-14','Kinder 10–14',10,14,[10,11,12,13,14]),('child-6-9','Kinder 6–9',6,9,[6,7,8,9,7]),('preschool-3-5','Kleinkinder 3–5',3,5,[3,4,5,3,5]),('baby-0-2','Babys und Kleinkinder unter 3',0,2,[0,1,1,2,2])]
heritages=[('black','Black / African-American','dark brown skin and natural dark textured hair'),('latino','Latino','warm medium tan skin and dark brown hair'),('japanese','Japanese','light beige skin and straight dark hair'),('indian','Indian','medium brown skin and dark hair')]
adult_outfits=[('casual','a rust-coloured knit cardigan over a cream crew-neck shirt and navy straight-leg trousers','Rostfarbene Strickjacke, cremefarbenes Shirt und marineblaue Hose'),('smart-casual','a slate-blue blazer over a buttoned white shirt and dark grey tailored trousers','Blaugrauer Blazer, weißes Hemd und graue Stoffhose'),('outdoor','a mustard-yellow weather jacket over a burgundy sweater and charcoal outdoor trousers','Senfgelbe Wetterjacke, bordeauxroter Pullover und dunkle Outdoorhose'),('creative','a denim chore jacket over a muted coral long-sleeved shirt and tan corduroy trousers','Jeans-Arbeitsjacke, korallfarbenes Langarmshirt und Cordhose'),('classic','a navy cable-knit sweater over a pale blue collared shirt and brown straight-leg trousers','Marineblauer Strickpullover, hellblaues Hemd und braune Hose')]
child_outfits=[('casual','a loose coral hooded sweatshirt and navy full-length jeans','Korallfarbener Hoodie und lange Jeans'),('school','a mustard knit pullover over a white shirt and dark full-length corduroy trousers','Senfgelber Strickpullover, weißes Shirt und lange Cordhose'),('play','blue denim overalls over a cream-and-rust striped long-sleeved top','Jeanslatzhose und gestreiftes Langarmshirt'),('outdoor','a slate-blue zip-up windbreaker over a burgundy shirt and charcoal full-length trousers','Blaugraue Windjacke, bordeauxrotes Shirt und lange Hose'),('classic','a navy cardigan over a peach crew-neck shirt and tan full-length trousers','Marineblaue Strickjacke, pfirsichfarbenes Shirt und lange Hose')]
other_index=0
for group_index,(group,label,lo,hi,ages) in enumerate(age_groups):
    # Every band has 5 white characters and 5 distributed characters.
    white_by_gender={'male':3 if group_index%2==0 else 2,'female':2 if group_index%2==0 else 3}
    for gender in ['male','female']:
        for variant in range(5):
            age=ages[variant];under18=hi<18;baby=group=='baby-0-2'
            if variant<white_by_gender[gender]:
                heritage='white';ancestry='White / European';looks=['fair skin and chestnut hair','fair skin and golden-blond hair','fair skin with a few freckles and auburn hair'][variant%3]
            else:
                heritage,ancestry,looks=heritages[other_index%4];other_index+=1
            hair_style=['neatly cropped hair','a softly layered haircut','short loose curls','hair tied back neatly','a rounded tidy haircut'][variant]
            if lo>=70:looks=looks.split(' and ')[0]+' and naturally silver-grey hair';hair_style=['short softly waved grey hair','neatly cropped silver hair','white loose curls','grey hair neatly swept back','short silver-grey hair'][variant]
            elif lo>=50:looks=looks.replace(' hair',' hair with some grey at the temples')
            outfit_style,outfit,outfit_de=(child_outfits if under18 else adult_outfits)[variant]
            subject=('man' if gender=='male' else 'woman') if not under18 else ('boy' if gender=='male' else 'girl')
            age_months=[6,12,18,24,30][variant] if baby else None
            if baby:
                outfit_style='baby-everyday';colour=['coral','powder blue','mustard yellow','cream','navy'][variant]
                outfit=f'a fully covering {colour} long-sleeved cotton romper with covered legs and soft socks';outfit_de=f'Geschlossener Babystrampler ({colour}) mit langen Ärmeln und Socken'
                description=f'One fictional {age_months}-month-old {ancestry} baby {subject}, {looks}, a natural soft short baby hairstyle, realistic age-appropriate infant or toddler proportions, round cheeks and small hands, wearing {outfit}. The baby is sitting securely in a comfortable developmentally appropriate pose, full body visible, no supporting person, neutral friendly expression.'
                age_text=f'{age_months} Monate'
            else:
                aging='visibly elderly, natural age lines, relaxed mature posture, age-appropriate realistic face, ' if lo>=70 else 'visibly middle-aged with subtle natural age lines, ' if lo>=50 else ''
                age_shapes='natural child proportions and a clearly age-appropriate face, not an adult face, ' if under18 else 'natural adult proportions, '
                description=f'One fictional {age}-year-old {ancestry} {subject}, {looks}, {hair_style}, {aging}{age_shapes}wearing {outfit}. Calm friendly expression, relaxed arms and naturally posed hands, facing forward and looking toward the camera.'
                age_text=f'{age} Jahre'
            framing='Full body centered with generous green margin around the entire seated infant or toddler; keep every limb inside the frame.' if baby else 'Frontal three-quarter character portrait, knees to head including upper legs, both shoulders and hands inside the frame, generous green margin around the silhouette, no close-up crop.'
            prompt=description+' Warm bright high-quality hand-painted anime character illustration matching ONLY the linework, soft watercolor-like shading and friendly storybook finish of the reference image. This is a different person: do not copy the reference identity, gender, hair colour, outfit or age. '+framing+' Background: perfectly uniform solid chroma green #00FF00 from edge to edge, no gradient, no scenery, no props, no cast shadow, no green spill or green rim lighting on the subject. Clothing, accessories and eyes must contain no green or teal. One character only, no text, no logo, no watermark. Fully clothed, modest, family-friendly SFW everyday character design.'
            if under18:prompt+=' Clearly age-appropriate child clothing and presentation, natural ordinary posture, no glamour or adult styling.'
            cid=f'{group}-{gender}-{variant+1:02d}-{heritage}';base=f'characters/greenscreen/{group}/{cid}'
            jobs.append({'schema_version':1,'id':cid,'kind':'character','origin':'generated','title':f'{label} · {"männlich" if gender=="male" else "weiblich"} · Variante {variant+1}','file':base+'.png','sidecar':base+'.json','caption':{'de':f'Fiktive {"männliche" if gender=="male" else "weibliche"} Figur, {age_text}, {ancestry}. {outfit_de}. Warm illustrierter Anime-Stil vor einfarbigem Greenscreen.','en':description+' Warm anime illustration against a uniform chroma-green background.'},'prompt':prompt,'provider':'hyprlab','model':'nano-banana-2-lite','aspect_ratio':'2:3','reference_images':[references['character']],'age_group':group,'age_group_label':label,'age_range_years':[lo,hi],'age_years':age,'age_months':age_months,'gender':gender,'heritage':heritage,'heritage_label':ancestry,'heritage_source':'requested design; not inferred from image','outfit_style':outfit_style,'sfw':True,'under_18':under18,'background_key_colour':'#00FF00','tags':[group,gender,heritage,outfit_style,'sfw','greenscreen','anime']})
# First successful pilot is part of the batch, not an extra paid variant.
pilot_image=Path('/tmp/vivarium-pilot-background.png');pilot_meta=Path('/tmp/vivarium-pilot-background.json')
if pilot_image.is_file() and pilot_meta.is_file() and not (LIB/jobs[0]['file']).exists():
    info=json.loads(pilot_meta.read_text());job=jobs[0];job['prompt']=info['prompt'];dst=LIB/job['file']
    with Image.open(pilot_image) as im:
        original_format=im.format;im.convert('RGB').save(dst,format='PNG');width,height=im.size
    job.update(status='complete',width=width,height=height,format='PNG',provider_returned_format=original_format,png_normalization='Decoded once and saved losslessly as PNG; no resizing or content edits.',generated_at=NOW,elapsed_ms=info['elapsed_ms'],response_usage=info.get('response_usage'),sha256=hashlib.sha256(dst.read_bytes()).hexdigest(),estimated_cost_usd=0.0168)
    dump(LIB/job['sidecar'],job)
for job in jobs:
    if not (LIB/job['sidecar']).exists():dump(LIB/job['sidecar'],{**job,'status':'pending'})
dump(LIB/'generation-plan.json',{'schema_version':1,'created_at':NOW,'provider':'hyprlab','model':'nano-banana-2-lite','endpoint':'https://api.hyprlab.io/v1/images/generations','concurrency':20,'estimated_price_per_image_usd':0.0168,'estimated_cost_for_120_images_usd':2.016,'price_source':'User-provided HyprLab price; estimate, not billing confirmation.','age_groups':[{'id':g,'label':label,'min_age':lo,'max_age':hi,'male_images':5,'female_images':5} for g,label,lo,hi,ages in age_groups],'heritage_counts':dict(collections.Counter(j['heritage'] for j in jobs if j['kind']=='character')),'notes':['Backgrounds use 16:9; characters use the current 2:3 portrait format.','70–85 / 50–69 / 30–49 / 18–29 / 15–17 / 10–14 / 6–9 / 3–5 / under 3 are non-overlapping age bands.','Every new image has a same-basename JSON sidecar containing the exact prompt and caption.','All 192 database background records, static backgrounds and template backgrounds are preserved as sources. Exact-byte duplicate backgrounds share one library image.','Legacy source images are copied without modification; original prompts may be unrecorded.','Greenscreen originals are retained; no keying or world assignment is performed.'],'jobs':jobs})
print(json.dumps({'existing_sources':len(legacy),'existing_unique_images':len(by_hash),'missing_sources':len(missing),'new_backgrounds':30,'new_characters':90,'heritage_counts':dict(collections.Counter(j['heritage'] for j in jobs if j['kind']=='character')),'output':str(LIB)},ensure_ascii=False))
