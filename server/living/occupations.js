import {rng} from './random.js';
// Fictional sampling weights, informed by the importance of health, education,
// retail, manufacturing and hospitality in Vermont DOL's Bennington profile.
// Not a claim to reproduce county statistics or real wages in this town.
export const OCCUPATION_SOURCE='https://www.vtlmi.info/profile2024.pdf';
// [title, existing employer/skill family, relative frequency, minimum age, education]
export const OCCUPATIONS=[
 ['Nurse','Nurse',11,21,'vocational'],['Nursing assistant','Nurse',8,18,'vocational'],['Home health aide','Nurse',7,18,'vocational'],['Medical assistant','Nurse',4,19,'vocational'],['Physician','Physician',1.5,26,'university'],['Physical therapist','Nurse',2,24,'university'],['Occupational therapist','Nurse',1,24,'university'],['Dental hygienist','Nurse',2,21,'vocational'],['Pharmacy technician','Nurse',2,19,'vocational'],['Mental health counselor','Nurse',2,24,'university'],['Social worker','Nurse',3,22,'university'],
 ['Teacher','Teacher',6,22,'university'],['Teaching assistant','Teacher',3,19,'vocational'],['Special education teacher','Teacher',2,23,'university'],['Kindergarten educator','Kindergarten educator',3,20,'vocational'],['School secretary','Civic clerk',1,19,'vocational'],['Professor','Professor',1,28,'university'],['Researcher','Researcher',1,23,'university'],['Laboratory technician','Researcher',2,21,'vocational'],['University administrator','University administrator',2,22,'university'],['Library assistant','Bookseller',2,18,'vocational'],
 ['Retail assistant','Retail assistant',7,18,'vocational'],['Cashier','Retail assistant',5,18,'vocational'],['Grocery stock clerk','Retail assistant',4,18,'vocational'],['Store supervisor','Retail assistant',2,24,'vocational'],['Bookseller','Bookseller',1,18,'vocational'],['Customer service representative','Retail assistant',3,18,'vocational'],['Delivery coordinator','Office analyst',2,20,'vocational'],['Inventory specialist','Office analyst',2,20,'vocational'],
 ['Carpenter','Carpenter',3,21,'vocational'],['Electrician','Mechanic',3,22,'vocational'],['Plumber','Mechanic',3,22,'vocational'],['HVAC technician','Mechanic',2,21,'vocational'],['Mechanic','Mechanic',3,21,'vocational'],['Machinist','Mechanic',4,21,'vocational'],['Production assembler','Carpenter',5,18,'vocational'],['Quality control technician','Mechanic',3,20,'vocational'],['Welder','Mechanic',3,20,'vocational'],['Maintenance technician','Mechanic',3,20,'vocational'],['Tailor','Tailor',1,20,'vocational'],
 ['Chef','Chef',3,21,'vocational'],['Cook','Chef',5,18,'vocational'],['Baker','Baker',3,20,'vocational'],['Barista','Bartender',3,18,'vocational'],['Restaurant server','Bartender',5,18,'vocational'],['Dishwasher','Chef',2,18,'vocational'],['Catering coordinator','Chef',1,23,'vocational'],['Hotel receptionist','Retail assistant',2,18,'vocational'],['Housekeeper','Retail assistant',3,18,'vocational'],
 ['Office analyst','Office analyst',2,22,'university'],['Bookkeeper','Office analyst',3,21,'vocational'],['Accountant','Office analyst',2,22,'university'],['Payroll specialist','Office analyst',2,21,'vocational'],['Administrative assistant','Civic clerk',3,18,'vocational'],['Insurance claims clerk','Office analyst',2,20,'vocational'],['Human resources specialist','Office analyst',2,22,'university'],['Programmer','Programmer',2,22,'university'],['IT support technician','Programmer',3,20,'vocational'],['Web designer','Designer',1,20,'vocational'],
 ['Gardener','Gardener',2,18,'vocational'],['Groundskeeper','Gardener',2,18,'vocational'],['Arborist','Gardener',1,22,'vocational'],['Nursery grower','Gardener',1,20,'vocational'],['Fitness coach','Fitness coach',2,20,'vocational'],['Lifeguard','Lifeguard',1,18,'vocational'],['Illustrator','Illustrator',1,20,'vocational'],['Independent artist','Independent artist',1,20,'vocational'],['Photographer','Designer',1,20,'vocational'],['Graphic designer','Designer',2,21,'vocational'],['Club DJ','Club DJ',.5,21,'vocational'],
 ['Police','Police',2,21,'vocational'],['Firefighter','Firefighter',2,21,'vocational'],['Civic clerk','Civic clerk',2,18,'vocational'],['Civic planner','Civic planner',1,23,'university'],['Emergency dispatcher','Police',1,20,'vocational'],['Public works technician','Mechanic',2,20,'vocational'],
];
export const occupationData=title=>OCCUPATIONS.find(r=>r[0]===title);
export function sampleOccupation(age,seed,key){
 const eligible=OCCUPATIONS.filter(r=>age>=r[3]),draw=rng(seed+':occupation:'+key)();
 let target=draw*eligible.reduce((s,r)=>s+r[2],0);for(const row of eligible){target-=row[2];if(target<=0)return row[0];}return eligible.at(-1)?.[0]||'Retail assistant';
}
export function pronounsFor(p){
 const explicit=p.profile?.pronouns;
 if(explicit==='she/her'||!explicit&&p.gender==='female')return {subject:'She',possessive:'Her',be:'is',work:'works',enjoy:'enjoys',study:'studies',live:'lives',attend:'attends',receive:'receives'};
 if(explicit==='he/him'||!explicit&&p.gender==='male')return {subject:'He',possessive:'His',be:'is',work:'works',enjoy:'enjoys',study:'studies',live:'lives',attend:'attends',receive:'receives'};
 return {subject:'They',possessive:'Their',be:'are',work:'work',enjoy:'enjoy',study:'study',live:'live',attend:'attend',receive:'receive'};
}
export function occupationSentence(p){const n=pronounsFor(p),role=p.profile.job;return role==='Retired'?`${n.subject} ${n.be} retired.`:role==='Student'?`${n.subject} ${n.study} at college.`:role==='Pupil'?`${n.subject} ${n.attend} school.`:role==='Kindergarten child'?`${n.subject} ${n.receive} early childhood care.`:role==='Unemployed'?`${n.subject} ${n.be} currently looking for work.`:`${n.subject} ${n.work} as ${/^[aeiou]/i.test(role)?'an':'a'} ${role}.`;}
export function refreshBiographyPronouns(p){
 // Replace only known OWNER template clauses. Plural passages about two
 // relatives ('They know each other') correctly retain plural pronouns.
 const n=pronounsFor(p);return p.biography.replace(/\b(?:They|She|He) (?:works? as an? [^.]+|(?:are|is) (?:retired|currently looking for work)|attends? school|receives? early childhood care|stud(?:y|ies) at college)\./,occupationSentence(p)).replace(/\bTheir household includes /,n.possessive+' household includes ').replace(/\bThey live independently\./,`${n.subject} ${n.live} independently.`).replace(/\bThey enjoy /,`${n.subject} ${n.enjoy} `).replace(/\bTheir ambitions include /,n.possessive+' ambitions include ');
}
