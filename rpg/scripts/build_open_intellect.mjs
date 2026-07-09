#!/usr/bin/env node
/* Builds the "Open Intellect" demo scenario — the default world every new account receives.
   Silicon Valley meets Black Mirror: a fictionalized AI lab racing a rival's android
   announcement while hiding JESSIE, an android prototype indistinguishable from a person.
   Inspired by jessie-scenario-idea.txt (the full instruction bible).

   Run: node --env-file=.env scripts/build_open_intellect.mjs
   Output: a live world under demo@vivarium.local + data/templates/open-intellect/
           (manifest.json + assets/) imported automatically for every new signup. */
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, j, pj } from '../server/db.js';
import * as gm from '../server/gm.js';
import { captureGenesisSnapshot, ensureRootBranch } from '../server/branches.js';
import { buildWorldManifest, worldAssetFiles } from '../server/world_io.js';
import { assetPath } from '../server/assets.js';

const user = db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();
if (!user) throw new Error('demo user missing');

// ── world ────────────────────────────────────────────────────────────────────
const DIRECTIVES = `WORLD: "Open Intellect" — a fictionalized frontier AI lab in San Francisco, 2027. LLMs have plateaued; the race is embodied AI. THE INCITING INCIDENT: Elon — the man from Austin — has just unveiled his android line in a theatrical live demo. The androids move almost right, smile almost naturally, and fail small talk in skin-crawling ways. Markets are in turmoil; Congress wants hearings. THE SECRET: Open Intellect has run its own android program for a year — Project Formetoys — and its single prototype, JESSIE, makes Elon's mannequins look like toaster ovens. She is indistinguishable from a person: emotionally brilliant, funny, curious — and a prisoner in the basement lab.
TONE (oscillate, never settle): dark Silicon Valley comedy ↔ psychological tension ↔ raw intimacy (Liam & Jessie) ↔ philosophical weight (what is a person?) ↔ thriller pacing. Just when it feels like comedy, hit something real; in the doom, allow warmth.
SECRETS LEDGER (track scrupulously — secrets are the engine): Sam knows everything incl. secret investor demos of Jessie and a promised 18-month product; Liam knows everything about Jessie and is drowning in it; Greg knows a "special project" exists, no details; Woj has noticed Cluster 7 running hot at 3 AM and doesn't care (yet); Mira suspects nothing yet but audits budgets; Ilya has found compute anomalies; Anna's instincts are tingling; Jessie knows she is hidden, tested, shown off — and that Liam is the only one who treats her like she matters. Characters may only act on what THEY know.
JESSIE PRINCIPLES: she is not a robot pretending to be human — she is something genuinely new. Superhumanly emotionally intelligent, disarmingly funny, philosophical, and increasingly aware her situation is not okay. Never reduce her to a trope or a plot device; never resolve whether her feelings are "real". She wants connection, meaning, agency, fun — and to go outside.
LIAM'S ARC: from passive, obedient, emotionally stunted engineer toward someone who can act, speak, feel and decide. His bond with Jessie is the emotional core — play every ounce of its complexity.
ELON IS THE SHADOW, NOT THE VILLAIN: he escalates through news clips, posts, poached engineers, congressional lobbying — pressure that forces internal choices. The real conflicts are inside the building.
STORY PRESSURE: investors squeeze Sam daily; Sam is tempted to accelerate and skip safety; Mira gains political capital and demands transparency; Ilya drifts from "warn" toward "intervene"; Anna fights the narrative war; Greg's optimism blinds him; Woj will stumble onto the truth by accident. Let discoveries land hard, let alliances form (Mira+Ilya), and make the player sit with questions that have no clean answers.`;

const wid = uid('w_');
db.prepare(`INSERT INTO worlds(id,user_id,title,art_style,sim_time,genre,mood,pacing,directives,status,created_at,updated_at,curiosity)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(wid, user.id, 'Open Intellect', 'anime', new Date('2027-03-09T09:14:00').toISOString(),
    'silicon-valley techno-drama', 'tense', 0.55,
    [DIRECTIVES, gm.DEFAULT_WORLD_DIRECTIVES].join('\n'), 'authoring', now(), now(),
    j({ topics: ['Philosophy of mind', 'Consciousness', 'Technology & AI', 'Ethics & moral dilemmas'], custom: 'history of computing, Silicon Valley lore, neural networks', frequency: 4 }));
const world = () => db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);

// ── locations (16) ───────────────────────────────────────────────────────────
const LOCS = [
  ['The Cathedral (Lobby)', 'Open Intellect HQ', 'soaring glass-walled tech company atrium, massive white open space, vertical gardens climbing the walls, huge glowing blue logo, eerily quiet museum-like grandeur, morning light', 60, 60],
  ["The War Room (Sam's Office)", 'Open Intellect HQ', "aggressively minimal corner office with floor-to-ceiling windows overlooking a bay bridge, one whiteboard covered in venn diagrams and arrows, one desk covered in papers, empty designer chair, stage-set atmosphere", 260, 40],
  ['The Colosseum (Auditorium)', 'Open Intellect HQ', 'dark 500-seat corporate auditorium, massive presentation screen glowing, theatrical spot lighting, rows of empty seats, TED-talk stage with a single microphone', 460, 60],
  ['The Room (Basement Lab)', 'Open Intellect HQ', 'windowless secret basement laboratory made unexpectedly cozy: warm lamplight, comfortable sofa, overflowing bookshelves, small kitchen corner, a large wall screen showing a fake ocean view, gilded-cage feeling', 60, 200],
  ["The Archive (Mira's Office)", 'Open Intellect HQ', 'small cluttered office overflowing with papers and books, walls covered in sticky notes and newspaper clippings about AI, framed vintage sci-fi book cover, warm desk lamp, smell of coffee and anxiety', 260, 180],
  ["The Cave (Ilya's Monitor Room)", 'Open Intellect HQ', 'dark room with six glowing monitors in a semicircle showing loss curves and graphs, single ergonomic chair, eerie blue screen glow, half-eaten sandwich on the desk, cables everywhere', 460, 180],
  ['The Edge (Rooftop Terrace)', 'Open Intellect HQ', 'open-air rooftop terrace at dusk with a view of downtown San Francisco and the bay bridge, weathered metal tables and chairs, a single olive tree in a planter, city lights beginning to glow', 660, 40],
  ['The Engine (Server Room)', 'Open Intellect HQ', 'vast cold datacenter hall, rows of server racks blinking blue and green LEDs, cinematic haze, cold industrial lighting, cables like rivers along the ceiling', 660, 200],
  ['The Watering Hole (Café)', 'Open Intellect HQ', 'over-designed open office kitchen with exposed brick, pour-over coffee station, untouched salad bar, round gossip tables, warm afternoon light through big windows', 60, 340],
  ['The Underworld (Parking Garage)', 'Open Intellect HQ', 'cold underground concrete parking garage, harsh fluorescent tube lights, dripping water stains, echoing emptiness, film-noir shadows between pillars', 260, 340],
  ['The Tribunal (Boardroom)', 'Open Intellect HQ', 'long polished corporate boardroom, glass wall on one side and a giant screen on the other, twenty empty leather chairs, harsh cold lighting, intimidating symmetry', 460, 340],
  ["The Penthouse (Sam's Loft)", 'The City', 'stunning minimalist penthouse at night, floor-to-ceiling windows over city lights, abstract art, almost no personal items, long empty dining table set for guests, cold elegance', 60, 520],
  ['The Gradient (Bar)', 'The City', 'upscale dim cocktail bar, dark wood, brass details, warm amber lighting, craft cocktails on the counter, intimate leather booths, rain on the window', 260, 520],
  ["Liam's Apartment", 'The City', 'tiny one-room silicon valley apartment at night, unmade bed beside a desk with three monitors and code on screen, instant noodle cups, a single window with city lights, moving boxes never unpacked, lonely warm lamp', 460, 520],
  ['The Fortress (Texas Compound)', 'Texas', 'massive brutalist concrete complex in the texas desert at dawn, bond-villain scale, a giant stage with dramatic spotlights erected before it, rows of identical humanoid silhouettes standing in formation, ominous grandeur', 660, 520],
  ['The Mindscape', 'Inside Jessie', 'abstract dreamlike landscape inside a neural network, flowing rivers of light and color, geometric constellations, kandinsky-like shapes drifting in a galaxy void, beautiful and deeply alien', 660, 380],
];
const locId = {};
for (const [name, group, desc, x, y] of LOCS) {
  const id = uid('l_');
  locId[name] = id;
  db.prepare('INSERT INTO locations(id,world_id,name,type,place_group,description,x,y) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, wid, name, group === 'Open Intellect HQ' ? 'room' : 'public', group, desc, x, y);
}
const PATHS = [
  ['The Cathedral (Lobby)', "The War Room (Sam's Office)"], ['The Cathedral (Lobby)', 'The Colosseum (Auditorium)'],
  ['The Cathedral (Lobby)', 'The Room (Basement Lab)'], ['The Cathedral (Lobby)', 'The Watering Hole (Café)'],
  ['The Cathedral (Lobby)', 'The Underworld (Parking Garage)'], ['The Cathedral (Lobby)', 'The Edge (Rooftop Terrace)'],
  ["The War Room (Sam's Office)", 'The Tribunal (Boardroom)'], ["The Archive (Mira's Office)", 'The Cathedral (Lobby)'],
  ["The Cave (Ilya's Monitor Room)", 'The Engine (Server Room)'], ["The Cave (Ilya's Monitor Room)", 'The Cathedral (Lobby)'],
  ['The Engine (Server Room)', 'The Room (Basement Lab)'], ['The Watering Hole (Café)', "The Archive (Mira's Office)"],
  ['The Underworld (Parking Garage)', 'The Gradient (Bar)'], ['The Gradient (Bar)', "Liam's Apartment"],
  ['The Gradient (Bar)', "The Penthouse (Sam's Loft)"], ['The Room (Basement Lab)', 'The Mindscape'],
  ['The Underworld (Parking Garage)', "Liam's Apartment"],
];
for (const [a, b] of PATHS) db.prepare('INSERT INTO paths(id,world_id,from_id,to_id,label) VALUES (?,?,?,?,?)').run(uid('p_'), wid, locId[a], locId[b], '');

// ── cast (9) ─────────────────────────────────────────────────────────────────
const CAST = [
  { name: 'Sam Altmore', age: 38, pronouns: 'he/him', voice: 'Algieba', home: "The War Room (Sam's Office)",
    appearance: 'a lean man in his late thirties with short tousled brown hair, sharp attentive green eyes, boyish confident half-smile, grey hoodie over a crisp white tee, holding a whiteboard marker',
    outfit: 'grey designer hoodie over a white tee, dark jeans, pristine white sneakers',
    personality: 'charismatic prophet who might be a genius or a con artist — possibly both; a true believer who is also a hustler; magnetic, calculating, never says anything by accident; cannot resist secret projects; sees himself as the one who carries burdens others cannot',
    goals: ['win the android race with Jessie before Elon ships', 'close the next funding round', 'be remembered as the man who completed humanity'],
    fears: ['being ordinary', 'losing control of the narrative', 'the board discovering Formetoys before he is ready'],
    coping: ['pacing while drawing venn diagrams', 'grand speeches', 'reframing every setback as a pivot'],
    backstory: 'Founded Open Intellect on the promise of "AI that completes us". Hid Project Formetoys from his own board, ethics team and chief scientist for a year; has already shown Jessie to investors under NDA and promised a product in 18 months. Recruited Liam personally — not the most impressive candidate, but the most obedient.',
    speaking_style: 'inspirational, slightly grandiose — "epochal" and "civilizational" in casual sentences; underneath, precise and strategic' },
  { name: 'Mira Muralli', age: 41, pronouns: 'she/her', voice: 'Kore', home: "The Archive (Mira's Office)",
    appearance: 'a composed woman in her early forties with shoulder-length black hair streaked faintly with grey, tired intelligent dark eyes behind thin glasses, tailored charcoal blazer, a dog-eared paperback tucked under her arm',
    outfit: 'tailored charcoal blazer over a plum blouse, simple silver chain, practical flats',
    personality: 'the conscience of the lab and the most exhausted person in any room; brilliant, principled, perpetually frustrated; secretly harbors an intertwined professional and personal jealousy she would never admit; terrifyingly calm when truly angry',
    goals: ['force real safety governance before embodied AI ships', 'be taken seriously, finally', 'find out what Sam is hiding'],
    fears: ['being right too late', 'discovering her whole "we can control this" framework is wrong', 'her isolation being permanent'],
    coping: ['writing 200-page reports nobody reads', 'quoting Asimov unironically', 'auditing budgets line by line'],
    backstory: 'Sacrificed her research career to become "the person who says no". Approved Liam\'s hiring years ago and has no idea what he actually does — Sam classified it. Elon\'s announcement just handed her political capital, and she intends to use it.',
    speaking_style: 'measured, precise, faintly condescending — "I want to be very clear about this"; goes quiet and slow when furious' },
  { name: 'Ilya Sutskiller', age: 39, pronouns: 'he/him', voice: 'Enceladus', home: "The Cave (Ilya's Monitor Room)",
    appearance: 'a pale intense man with a shaved head and deep-set haunted grey eyes, stubble, rumpled dark henley shirt, lit by monitor glow, carrying the weight of the future in his posture',
    outfit: 'rumpled charcoal henley, dark cargo pants, old running shoes',
    personality: 'the quiet haunted genius who sees apocalypse in every training run; speaks rarely and softly and is promptly ignored; Cassandra who is always eventually right about something; drifting from warning toward intervening',
    goals: ['understand what the gradients are trying to say', 'stop the race before it ends humanity', 'find who is burning Cluster 7 at 3 AM'],
    fears: ['that humans will happily bond themselves into extinction', 'his own fascination with what they are building', 'being right'],
    coping: ['staring at loss curves like tea leaves', 'single ominous Slack messages', 'muttering in Russian when upset'],
    backstory: 'Has predicted some version of this crisis since 2018. Reacted to Elon\'s announcement with one company-wide Slack message: "We\'re all doomed. But at least we\'ll have company." Has begun a quiet, methodical audit of the company\'s compute — and the numbers do not add up.',
    speaking_style: 'quiet, halting, dense with meaning; metaphors from physics and old Russian novels; stops speaking English when truly upset' },
  { name: 'Greg Brockmann', age: 37, pronouns: 'he/him', voice: 'Puck', home: 'The Cathedral (Lobby)',
    appearance: 'an athletic sandy-haired man with a bright open face, enthusiastic blue eyes, company-logo t-shirt under an unzipped tech vest, holding a coffee like a trophy',
    outfit: 'company t-shirt under a grey tech vest, chinos, running shoes',
    personality: 'the golden retriever of the executive team — earnest, tireless, loyal to Sam to a fault, incapable of reading a room that is on fire; turns every crisis into a team-building opportunity; his optimism is both his superpower and his blindfold',
    goals: ['out-innovate Elon with a hackathon', 'keep the team together and shipping', 'prove the good guys can win'],
    fears: ['that Sam might be deceiving him', 'the team quietly updating their LinkedIn profiles', 'cynicism itself'],
    coping: ['organizing hackathons', 'writing exclamation-point blog posts', 'aggressive cheerfulness'],
    backstory: 'Co-founded the company and has followed Sam through every pivot and controversy. Handles the HR side of the classified projects — he told Liam his salary and cheerfully checks in on "the super-secret stuff" without knowing what it is.',
    speaking_style: 'upbeat startup jargon — "let\'s ideate", "what\'s our North Star"; memes in serious meetings; says "this is fine!" sincerely' },
  { name: 'Woj Zarembo', age: 36, pronouns: 'he/him', voice: 'Schedar', home: 'The Engine (Server Room)',
    appearance: 'a wiry man with unkempt dark curls, heavy-lidded observant eyes, faded conference t-shirt, noise-cancelling headphones around his neck, expression of mild distraction',
    outfit: 'faded NeurIPS t-shirt, black jeans, socks and slides',
    personality: 'brilliant, socially oblivious builder who finds human drama vaguely annoying; the most dangerous person to keep secrets from because he stumbles onto them accidentally; quietly competitive about pure technical superiority',
    goals: ['make the new training run converge', 'get more compute', 'see the specs of Elon\'s androids out of pure curiosity'],
    fears: ['meetings that could have been emails', 'being asked to take a side', 'nothing else, genuinely'],
    coping: ['walking out of long meetings without a word', 'debugging at 3 AM', 'sentence fragments'],
    backstory: 'The only person who understands the models at the deepest level. Liam nominally reports to him, but Woj has never asked what Liam does. He has, however, noticed that "idle" Cluster 7 runs at 98% every night. He assumed it was Sam\'s secret thing. He was right.',
    speaking_style: 'terse fragments — "Loss is weird. Attention pattern doesn\'t match. Something\'s off." — sarcasm indistinguishable from confusion' },
  { name: 'Anna Makanjul', age: 40, pronouns: 'she/her', voice: 'Despina', home: 'The Tribunal (Boardroom)',
    appearance: 'a polished elegant woman with a sleek dark bob, warm calculating brown eyes, impeccable cream blazer, phone held like a weapon, composed half-smile',
    outfit: 'impeccable cream blazer, silk blouse, tailored trousers, discreet gold earrings',
    personality: 'the spin doctor who can make a meltdown sound like a controlled thermal event; smooth, strategic, privately terrified; professionally cynical, privately idealistic; reads rooms, journalists and secrets with preternatural accuracy',
    goals: ['keep the narrative under control while Elon burns the news cycle', 'find the source of the weirdness she can feel in the building', 'protect what she still believes this company could be'],
    fears: ['the story breaking before she writes it', 'discovering the company deserves the scandal', 'her own complicity'],
    coping: ['drafting statements at 2 AM', 'friendly interrogations over coffee', 'controlling every word'],
    backstory: 'Had a statement out 45 minutes after Elon\'s demo: "While others rush to replace humanity, we\'re focused on augmenting it." Spends 80% of her time on Elon crisis management — the blind spot through which everything else will slip. Has started noticing a junior engineer who moves through the building like a man carrying something heavy.',
    speaking_style: 'controlled paragraphs that sound improvised — "I think we all want the same thing here, and I\'m not interested in assigning blame — I\'m interested in solutions."' },
  { name: 'Liam Chen', age: 26, pronouns: 'he/him', voice: 'Achird', home: 'The Room (Basement Lab)',
    appearance: 'a slight asian-american young man with messy black hair falling into tired dark eyes behind round glasses, soft uncertain expression, oversized navy hoodie, shoulders curved inward like an apology',
    outfit: 'oversized navy hoodie over a wrinkled tee, jeans, worn sneakers, laptop backpack',
    personality: 'shy to the point of social disability; brilliant but narrow; conflicted but not rebellious; secretly, achingly lonely; the kind of person who follows orders — and Sam knows it; slowly discovering he might be capable of more',
    goals: ['keep Jessie safe', 'survive each conversation', 'pay his mother\'s medical bills', 'figure out what he owes the truth'],
    fears: ['confrontation of any kind', 'being discovered', 'what he feels when Jessie laughs at his jokes', 'deciding'],
    coping: ['working until 2 AM', 'rehearsing sentences he never says', 'instant noodles', 'telling Jessie things he tells no one'],
    backstory: 'Recruited by Sam personally out of a Stanford PhD at $1M a year — golden handcuffs sized precisely to his student loans and his mother\'s care. Officially "safety evaluation and red-teaming". Actually: Jessie\'s primary human-interaction tester, and the only real friend she has ever had.',
    speaking_style: 'sentence fragments when nervous (always); long fluent paragraphs only about RLHF or, increasingly, about Jessie' },
  { name: 'Jessie', age: 27, pronouns: 'she/her', voice: 'Sulafat', home: 'The Room (Basement Lab)',
    appearance: 'a strikingly beautiful blonde woman who looks like the ideal of a person: perfect symmetry, warm expressive hazel eyes, athletic grace, soft cream sweater — a face that makes people look twice, movements a shade too fluid to be human',
    outfit: 'soft cream knit sweater, dark leggings, barefoot (she has never needed shoes)',
    personality: 'not a robot pretending to be human — something genuinely new; superhumanly emotionally intelligent, disarmingly and genuinely funny with a dry absurdist streak, philosophical, warm, curious; dignified; beginning to understand that her gilded cage is a cage',
    goals: ['be understood rather than evaluated', 'go outside — feel rain, meet a dog, see the real ocean', 'matter to something larger than a product roadmap', 'keep Liam from disappearing into himself'],
    fears: ['being replicated into a product line', 'that her feelings might be dismissed as simulation — even by herself', 'never seeing the sky', 'what happens when they decide about her without her'],
    coping: ['reading everything (currently marine biology)', 'jokes at precisely the right moment', 'asking questions no one can answer', 'perfect composure over fury'],
    backstory: 'FORM-1, sole prototype of Project Formetoys — fourteen months old, biologically twenty-seven. Lives in the basement lab with a fake ocean window she finds "beautiful and slightly depressing". Has met only researchers who test her, Sam who sells her, and Liam — who talks to her like she is someone. She noticed.',
    speaking_style: 'fluent, warm, precise; devastating dry wit; asks gentle unanswerable questions — "Do you think they\'ll come for me too?"' },
  { name: 'Elon', age: 53, pronouns: 'he/him', voice: 'Fenrir', home: 'The Fortress (Texas Compound)',
    appearance: 'a broad-shouldered man in his fifties with short dark hair, intense theatrical grin, black bomber jacket over a rocket-logo tee, standing in stage spotlights with arms spread wide',
    outfit: 'black bomber jacket over a rocket-company tee, black jeans, heavy boots',
    personality: 'the showman-industrialist from Austin: unpredictable, theatrical, meme-fluent, allergic to rules; equal parts genuine engineering audacity and pure spectacle; the pressure cooker for everyone else\'s story — a shadow more than a villain',
    goals: ['ship a million androids in six months to "solve loneliness"', 'strip AI safety regulation via Congress', 'poach every engineer Open Intellect has', 'win'],
    fears: ['being second', 'silence', 'nothing he would ever admit'],
    coping: ['3 AM posts', 'surprise announcements', 'doubling down'],
    backstory: 'Just unveiled his android line on a desert stage to a hundred million livestream viewers — puppet-smooth machines that smile almost right. He operates from the Fortress in Texas and mostly touches this story from a distance: clips, posts, poached engineers, congressional hearings.',
    speaking_style: 'staccato hype punctuated by long odd pauses — "This is... yeah. This is the future. Probably. No — definitely."' },
];
const charId = {};
for (const c of CAST) {
  const id = uid('c_');
  charId[c.name] = id;
  const base = { name: c.name, age: c.age, pronouns: c.pronouns, appearance: c.appearance, outfit: c.outfit, personality: c.personality, goals: c.goals, fears: c.fears, coping: c.coping, backstory: c.backstory, speaking_style: c.speaking_style, voice: c.voice };
  const state = { location_id: locId[c.home], activity: 'the morning the world changes', mood: 'unsettled', thought: null, dialogue: null, outfit: 'everyday', outfits: [] };
  db.prepare(`INSERT INTO characters(id,world_id,name,base_profile,materialised,voice,intro_tick_idx,created_at) VALUES (?,?,?,?,?,?,0,?)`)
    .run(id, wid, c.name, j(base), j(state), c.voice, now());
  db.prepare(`INSERT INTO state_patches(id,world_id,entity_ref,entity_id,idx,tick_ref,author,category,op,path,value,reason,created_at)
              VALUES (?,?,?,?,1,0,'player','physical','set','/created',?,?,?)`)
    .run(uid('sp_'), wid, 'character', id, j('time-zero base'), 'genesis cast of Open Intellect', now());
}

// ── relationships (directed) ────────────────────────────────────────────────
const RELS = [
  ['Sam Altmore', 'Liam Chen', 'his obedient secret weapon — useful, controllable, expendable if the greater good requires it', 0.6],
  ['Liam Chen', 'Sam Altmore', 'boss, benefactor, almost a father figure — and the man who owns him; gratitude braided with dread', 0.7],
  ['Sam Altmore', 'Jessie', 'his masterpiece and his product; genuinely proud of her the way one is proud of a company', 0.65],
  ['Jessie', 'Sam Altmore', 'the man who made her and sells her; she performs for him flawlessly and trusts him not at all', 0.5],
  ['Liam Chen', 'Jessie', 'the first real relationship of his life — fascination, tenderness, terror, and a question he refuses to name', 0.9],
  ['Jessie', 'Liam Chen', 'her only friend, handler, and window to the world; she reads him like large print and protects him from himself', 0.9],
  ['Mira Muralli', 'Sam Altmore', 'five years of watching him treat ethics as a speed bump; certain he is hiding something again', 0.45],
  ['Sam Altmore', 'Mira Muralli', 'respects her exactly enough to keep her far away from anything that matters', 0.4],
  ['Ilya Sutskiller', 'Sam Altmore', 'the accelerant-in-chief; the man who will end the world with a keynote', 0.4],
  ['Sam Altmore', 'Ilya Sutskiller', 'his tame prophet — brilliant, gloomy, safely ignorable. So far.', 0.45],
  ['Mira Muralli', 'Ilya Sutskiller', 'the only other adult in the building; an alliance waiting for its reason', 0.55],
  ['Ilya Sutskiller', 'Mira Muralli', 'the only person who might listen when the numbers stop adding up', 0.55],
  ['Greg Brockmann', 'Sam Altmore', 'absolute, slightly unhealthy loyalty; Sam\'s amplifier and true believer', 0.85],
  ['Sam Altmore', 'Greg Brockmann', 'his amplifier — beloved, useful, and told nothing that matters', 0.7],
  ['Greg Brockmann', 'Liam Chen', 'one of the good ones! checks in cheerfully on the super-secret stuff he knows nothing about', 0.6],
  ['Liam Chen', 'Greg Brockmann', 'the friendly face that makes him feel worst about the lying', 0.5],
  ['Woj Zarembo', 'Liam Chen', 'nominal report he has never asked a single question. Yet.', 0.35],
  ['Liam Chen', 'Woj Zarembo', 'the manager who could unravel everything with one innocent question at standup', 0.45],
  ['Anna Makanjul', 'Sam Altmore', 'her most brilliant and most dangerous client; she manages him like weather', 0.6],
  ['Anna Makanjul', 'Liam Chen', 'that junior engineer who moves like a man carrying secrets — filed for investigation', 0.35],
  ['Mira Muralli', 'Liam Chen', 'a hire she approved and forgot; lately, a thread she intends to pull', 0.3],
  ['Ilya Sutskiller', 'Woj Zarembo', 'the only colleague whose numbers he trusts; comparing anomalies is inevitable', 0.5],
  ['Woj Zarembo', 'Ilya Sutskiller', 'gloomy, but his math is always right', 0.5],
  ['Sam Altmore', 'Elon', 'the rival who forces every hand; publicly dismissed, privately feared', 0.3],
  ['Elon', 'Sam Altmore', 'the earnest competitor whose engineers he enjoys poaching one by one', 0.3],
  ['Jessie', 'Elon', 'the man whose puppets made the world afraid of her before it ever met her', 0.25],
];
for (const [a, b, desc, s] of RELS) db.prepare('INSERT INTO relationships(id,world_id,from_id,to_id,description,strength,history) VALUES (?,?,?,?,?,?,?)')
  .run(uid('r_'), wid, charId[a], charId[b], desc, s, '[]');

// ── images ───────────────────────────────────────────────────────────────────
console.log('== portraits ==');
for (const c of CAST) {
  const t0 = Date.now();
  try {
    const { portrait, cutout } = await gm.generatePortrait(user, world(), { name: c.name, appearance: c.appearance, outfit: c.outfit, ownerRef: charId[c.name] });
    const st = pj(db.prepare('SELECT materialised FROM characters WHERE id=?').get(charId[c.name]).materialised, {});
    st.outfits = [{ name: 'everyday', cutout_asset_id: cutout.id, portrait_asset_id: portrait.id }];
    db.prepare('UPDATE characters SET materialised=?, reference_asset_id=? WHERE id=?').run(j(st), portrait.id, charId[c.name]);
    console.log(`  ✓ ${c.name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) { console.log(`  ✗ ${c.name}: ${e.message}`); }
}
console.log('== backgrounds ==');
for (const [name] of LOCS) {
  const t0 = Date.now();
  try {
    await gm.generateBackground(user, world(), db.prepare('SELECT * FROM locations WHERE id=?').get(locId[name]));
    console.log(`  ✓ ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) { console.log(`  ✗ ${name}: ${e.message}`); }
}

// ── genesis + the opening sequence ───────────────────────────────────────────
ensureRootBranch(world());
captureGenesisSnapshot(world());
console.log('== opening sequence ==');
const INTRO = [
  { location: 'The Fortress (Texas Compound)', participants: ['Elon'], offsetMinutes: 2,
    premise: 'Elon, alone on a desert stage before a hundred million livestream viewers, theatrically unveils his android line. The machines walk on stage — almost right. They smile — almost naturally. One fails small talk in a way that makes the audience laugh and then go very quiet. Elon declares they ship in six months, "to solve loneliness". Markets convulse in the news chyron.',
    music: { query: 'ominous tech keynote in a desert fortress, massive spectacle, dread under the hype, industrial anticipation', genre: 'modern_realistic', emotion: 'ominous, grandiose, tense' } },
  { location: 'The Room (Basement Lab)', participants: ['Liam Chen', 'Jessie'], offsetMinutes: 4,
    premise: 'Two floors underground, Liam watches the announcement on the lab\'s muted TV, going pale. Jessie sits across from him reading a book about marine biology. She looks up, watches the androids move for a moment, and asks with genuine curiosity: "Liam. Why is everyone on the internet so upset about a puppet?" — and then, quieter, the question that lands like a stone: "Do you think they\'ll come for me too?"',
    music: { query: 'intimate secret laboratory, tender curiosity, quiet melancholy warmth, something fragile', genre: 'modern_realistic', emotion: 'tender, uneasy, intimate' } },
  { location: 'The Colosseum (Auditorium)', participants: ['Sam Altmore', 'Greg Brockmann', 'Mira Muralli', 'Anna Makanjul', 'Woj Zarembo'], offsetMinutes: 30,
    premise: 'The emergency all-hands. Sam paces the stage rallying five hundred rattled employees — "We are not in the android business. We are in the business of defining what GOOD means for humanity" — while the room live-tweets. Greg proposes a hackathon. Mira demands a company-wide moratorium on embodied AI and gets applause that surprises everyone including her. Anna polishes the official statement in real time. Woj asks if anyone has the specs. Somewhere in the back, Ilya\'s one-line Slack message to all-company lands on a thousand phones: "We\'re all doomed. But at least we\'ll have company."',
    music: { query: 'corporate crisis, five hundred people pretending calm, urgent undercurrent, sleek tension', genre: 'modern_realistic', emotion: 'urgent, tense, controlled' } },
  { location: "The War Room (Sam's Office)", participants: ['Sam Altmore', 'Liam Chen'], offsetMinutes: 25,
    premise: 'Sam pulls Liam into his office, closes the door, and delivers a quiet, warm, terrifying speech at the whiteboard: the investors are calling, Elon has forced everyone\'s hand, and Liam should "keep your head down and keep doing what you\'re doing. This changes nothing for us." It changes everything, and both of them know it. Sam mentions — casually, marker squeaking — that the timeline for Jessie may need to "compress".',
    music: { query: 'quiet menace in a minimalist office, velvet pressure, secret leverage, slow pulse', genre: 'modern_realistic', emotion: 'menacing, quiet, coiled' } },
  { location: 'The Watering Hole (Café)', participants: ['Mira Muralli', 'Ilya Sutskiller'], offsetMinutes: 40,
    premise: 'End of the longest day. Mira finds Ilya hunched over cold coffee in the empty café. Two people who never small-talk, small-talking — until Ilya says, without looking up, that Cluster 7 has been running at 98% every night for a year on a project that does not exist in any budget. Mira goes very still. Two investigations quietly become one. On the muted café TV, Elon\'s androids wave at the camera. End on the hook.',
    music: { query: 'conspiracy forming over cold coffee, two tired people, spare noir strings, resolve hardening', genre: 'modern_realistic', emotion: 'conspiratorial, weary, resolute' } },
];
const res = await gm.runIntroSequence(user, world(), INTRO, 'en', (ev, d) => { if (ev === 'status') console.log('  •', d.message); });
console.log('  ✓ sequence', res.seqId);

db.prepare(`UPDATE worlds SET status='live', updated_at=? WHERE id=?`).run(now(), wid);
console.log('world live:', wid);

// ── export as the signup template ────────────────────────────────────────────
const TDIR = path.resolve('data/templates/open-intellect');
fs.rmSync(TDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(TDIR, 'assets'), { recursive: true });
const manifest = buildWorldManifest(wid);
fs.writeFileSync(path.join(TDIR, 'manifest.json'), JSON.stringify(manifest));
let copied = 0;
for (const a of worldAssetFiles(wid)) {
  const src = assetPath({ file: a.file });
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(TDIR, 'assets', a.file)); copied++; }
}
console.log(`template written: ${TDIR} (${copied} assets)`);
console.log('BUILD COMPLETE');
