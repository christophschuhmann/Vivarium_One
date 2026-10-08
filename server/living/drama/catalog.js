// Fictional vulnerability patterns, not diagnoses of people or moral flaws.
// Sampling rates are explicit game targets, loosely calibrated to US surveys.
// Survey windows overlap; primary conditions are sampled together, not added.
export const CONDITIONS=[
 ['depression','Depressive vulnerability',.083,'low_mood','behavioral activation; practical support; therapy'],
 ['generalized_anxiety','Generalized anxiety',.027,'worry','predictable plans; CBT skills; appropriate treatment'],
 ['social_anxiety','Social anxiety',.071,'avoidance','gradual supported social practice; consent and safety'],
 ['specific_phobia','Specific phobia',.091,'avoidance','supported gradual exposure with a clinician'],
 ['panic','Panic vulnerability',.027,'alarm','grounding; assessment; evidence-based therapy'],
 ['ptsd','Trauma-related difficulties',.036,'alarm','safety; choice; trauma-informed treatment'],
 ['ocd','Obsessive-compulsive difficulties',.012,'rigidity','specialist treatment; avoid reinforcing compulsions'],
 ['bipolar','Bipolar vulnerability',.028,'episodic_mood','sleep regularity; clinical follow-up; relapse plan'],
 ['borderline','Emotion-regulation / borderline difficulties',.016,'sensitivity','validation plus boundaries; DBT skills; stable support'],
 ['persistent_depression','Persistent depressive difficulties',.015,'low_mood','steady activation; meaningful routines; clinical care'],
 ['adhd','ADHD / attention regulation',.044,'attention','external structure; accommodations; clinical support'],
 ['eating_disorder','Eating-disorder recovery needs',.012,'sensitivity','specialist support; no weight or food-shaming'],
 ['psychosis_vulnerability','Psychosis-spectrum vulnerability',.006,'perception','stable support; clinical care; no equation with violence'],
 ['insomnia','Persistent sleep difficulty',.075,'sleep','sleep routine; CBT-I; assessment'],
 ['chronic_pain','Chronic pain with daily-life impact',.10,'pain','pacing; access to care; social inclusion']
].map(([id,label,weight,pattern,support])=>({id,label,weight,pattern,support,minAge:['borderline','bipolar','psychosis_vulnerability'].includes(id)?18:12}));
export const COMMUNITY_GROUPS=[
 {id:'theatre',name:'Green Mountain Theatre Circle',interest:'craft',venue:'library',day:2,hour:18,age:14,fee:300,action:'creative_hobby'},
 {id:'youth_soccer',name:'Bennington Youth Soccer',interest:'walking',venue:'park',day:5,hour:15,age:6,maxAge:17,fee:250,action:'stroll',guardian:true},
 {id:'college_soccer',name:'College Soccer Club',interest:'walking',venue:'campus',day:3,hour:17,age:18,maxAge:29,fee:0,action:'stroll'},
 {id:'choir',name:'Community Choir',interest:'music',venue:'library',day:4,hour:18,age:14,fee:0,action:'creative_hobby'},
 {id:'chess',name:'Library Chess & Games',interest:'reading',venue:'library',day:1,hour:17,age:10,fee:0,action:'read'},
 {id:'senior_walk',name:'Senior Walking Circle',interest:'walking',venue:'park',day:2,hour:10,age:65,fee:0,action:'stroll'},
 {id:'senior_arts',name:'Senior Painting & Conversation',interest:'craft',venue:'library',day:4,hour:10,age:65,fee:0,action:'creative_hobby'},
 {id:'mutual_aid',name:'Benmont Mutual Aid',interest:'socializing',venue:'shelter',day:5,hour:11,age:16,fee:0,action:'relax'},
 {id:'garden',name:'Community Growing Circle',interest:'gardening',venue:'park',day:6,hour:14,age:12,fee:0,action:'garden'},
 {id:'study',name:'College Peer Learning',interest:'reading',venue:'campus',day:2,hour:17,age:18,maxAge:29,fee:0,action:'read'},
 {id:'faith',name:'Sunday Community & Reflection',interest:'socializing',venue:'church',day:6,hour:10,age:3,fee:0,action:'relax',guardian:true},
 {id:'secular',name:'Sunday Neighbors & Service',interest:'socializing',venue:'park',day:6,hour:10,age:3,fee:0,action:'relax',guardian:true}
];
export const LIFE_STYLES=['secure_haven','hopeful_striver','strained_caregiver','status_chaser','guarded_survivor','creative_seeker','content_minimalist','restless_competitor'];
export const INCOME_BANDS=[[.4,'lower_low','Lower low-income'],[.6,'middle_low','Middle low-income'],[.8,'upper_low','Upper low-income'],[1,'lower_middle','Lower middle-income'],[1.25,'middle','Middle-income'],[1.75,'upper_middle','Upper middle-income'],[2.5,'lower_high','Lower high-income'],[4,'middle_high','Middle high-income'],[8,'upper_high','Upper high-income'],[Infinity,'exceptional','Exceptionally high-income']];
export function incomeBand(income,members,currency='USD'){const equivalence=Math.sqrt(Math.max(1,members)),reference=currency==='USD'?300000:250000,ratio=income/equivalence/reference,band=INCOME_BANDS.find(b=>ratio<b[0]);return {id:band[1],label:band[2],ratio,monthlyHouseholdNetCents:income,members,equivalence,referenceCents:reference,equivalizedCents:Math.round(income/equivalence)};}
