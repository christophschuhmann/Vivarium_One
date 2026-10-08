import fs from "node:fs";
import {OCCUPATIONS} from "../occupations.js";
const root = new URL("../../../", import.meta.url);
export const ECONOMY_CATALOG = JSON.parse(
  fs.readFileSync(new URL("docs/living-world-economy-design.json", root)),
);
export const SOCIAL_CATALOG = JSON.parse(
  fs.readFileSync(new URL("docs/living-world-social-taxonomy.json", root)),
).entries;
export const POLICY = {
  ...ECONOMY_CATALOG.policy,
  status: "simulation_rules",
  version: 1,
};
export const JOBS = {
  Teacher: {
    skill: "teaching",
    gross: 340000,
    minimum: 0.4,
    venue: "school",
    fund: "region",
  },
  Illustrator: { skill: "craft", gross: 270000, minimum: 0.3, venue: "studio" },
  Designer: { skill: "craft", gross: 310000, minimum: 0.35, venue: "office" },
  Carpenter: {
    skill: "craft",
    gross: 300000,
    minimum: 0.35,
    venue: "workshop",
  },
  Tailor: { skill: "craft", gross: 250000, minimum: 0.25, venue: "workshop" },
  Gardener: {
    skill: "gardening",
    gross: 250000,
    minimum: 0.25,
    venue: "garden",
    fund: "city",
  },
  Baker: { skill: "cooking", gross: 260000, minimum: 0.25, venue: "bakery" },
  Bookseller: { skill: "retail", gross: 260000, minimum: 0.25, venue: "shop" },
  Nurse: {
    skill: "care",
    gross: 340000,
    minimum: 0.45,
    venue: "clinic",
    fund: "health",
  },
  Firefighter: {
    skill: "response",
    gross: 340000,
    minimum: 0.45,
    venue: "fire",
    fund: "region",
  },
  "Civic clerk": {
    skill: "administration",
    gross: 300000,
    minimum: 0.35,
    venue: "townhall",
    fund: "city",
  },
  "Office analyst": {
    skill: "analysis",
    gross: 380000,
    minimum: 0.4,
    venue: "office",
  },
  "Fitness coach": {
    skill: "fitness",
    gross: 290000,
    minimum: 0.3,
    venue: "gym",
  },
  "Retail assistant": {
    skill: "retail",
    gross: 245000,
    minimum: 0.2,
    venue: "shop",
  },
  "Independent artist": {
    skill: "craft",
    gross: 260000,
    minimum: 0.3,
    venue: "studio",
  },
  Physician: {
    skill: "care",
    gross: 600000,
    minimum: 0.7,
    venue: "clinic",
    fund: "health",
    credential: "medical_license",
  },
  Chef: { skill: "cooking", gross: 320000, minimum: 0.4, venue: "cafe" },
  Mechanic: { skill: "craft", gross: 330000, minimum: 0.4, venue: "workshop" },
  Programmer: {
    skill: "analysis",
    gross: 470000,
    minimum: 0.45,
    venue: "office",
  },
  "Civic planner": {
    skill: "administration",
    gross: 400000,
    minimum: 0.45,
    venue: "townhall",
    fund: "city",
  },
  "Kindergarten educator": {
    skill: "teaching",
    gross: 330000,
    minimum: 0.4,
    venue: "daycare",
    fund: "region",
  },
  Lifeguard: { skill: "response", gross: 280000, minimum: 0.35, venue: "pool" },
  Bartender: { skill: "service", gross: 260000, minimum: 0.25, venue: "cafe" },
  "Club DJ": { skill: "music", gross: 290000, minimum: 0.3, venue: "cafe" },
  Professor: {
    skill: "teaching",
    gross: 540000,
    minimum: 0.7,
    venue: "campus",
    fund: "region",
    credential: "academic_qualification",
  },
  Researcher: {
    skill: "analysis",
    gross: 440000,
    minimum: 0.5,
    venue: "campus",
    fund: "region",
  },
  "University administrator": {
    skill: "administration",
    gross: 330000,
    minimum: 0.35,
    venue: "campus",
    fund: "region",
  },
  Police: {
    skill: "response",
    gross: 350000,
    minimum: 0.45,
    venue: "police",
    fund: "region",
    credential: "public_service_training",
  },
  Mayor: {
    skill: "administration",
    gross: 460000,
    minimum: 0.5,
    venue: "townhall",
    fund: "city",
  },
  "Holiday helper": {
    skill: "retail",
    gross: 100000,
    minimum: 0.15,
    venue: "shop",
    holiday: true,
  },
};
// Every occupation has a real contract/skill/workplace family and can be offered
// on the job board. Weights are sampling rules, not hiring eligibility.
for(const [title,family,weight,minAge,education] of OCCUPATIONS){
 const base=JOBS[family];JOBS[title]={...base,...JOBS[title],family,weight,minAge,education};
 // Fictional qualification gates, shared by job listings and applications.
 if(education==='university'&&!JOBS[title].credential)JOBS[title].credential='degree_skill:'+JOBS[title].skill;
 if(family==='Nurse'&&title!=='Nurse')JOBS[title].gross=Math.round(base.gross*(/aide|assistant|technician/i.test(title)?.78:/therapist|counselor/.test(title)?1.12:1));
 if(/assistant|clerk|Cashier|Dishwasher|assembler/i.test(title))JOBS[title].gross=Math.min(JOBS[title].gross,265000);
}
JOBS['Library assistant'].venue='library';
for(const role of ['Hotel receptionist','Housekeeper'])JOBS[role].venue='hotel';
export const SKILL_LABELS = {
  teaching: "Lehren",
  craft: "Handwerk & Gestaltung",
  gardening: "Gartenbau",
  cooking: "Kochen",
  retail: "Handel",
  care: "Versorgung",
  response: "Einsatz & Schutz",
  administration: "Verwaltung",
  analysis: "Analyse & Technik",
  fitness: "Bewegung",
  service: "Service",
  music: "Musik",
  humor: "Humor",
  charm: "Kontakt",
  empathy: "Einfühlung",
  persuasion: "Überzeugen",
  teamwork: "Zusammenarbeit",
  resolve: "Grenzen & Beharrlichkeit",
};
export const ATTRIBUTE_LABELS = {
  reasoning: "Denken",
  coordination: "Koordination",
  presence: "Auftreten",
  resolve: "Beharrlichkeit",
  perception: "Wahrnehmung",
  stamina: "Ausdauer",
  strength: "Kraft",
};
export const FAMILY_ACTIONS = {
  household: {
    skill: "craft",
    attribute: "coordination",
    minutes: 10,
    objects: ["table", "desk", "sofa"],
    age: 6,
  },
  laundry: {
    skill: "craft",
    attribute: "coordination",
    minutes: 15,
    objects: ["wardrobe", "bed"],
    age: 6,
  },
  food: {
    skill: "cooking",
    attribute: "perception",
    minutes: 15,
    objects: ["fridge", "counter", "table"],
    age: 10,
  },
  learning: {
    skill: "analysis",
    attribute: "reasoning",
    minutes: 20,
    objects: ["desk", "bookshelf", "table"],
    age: 6,
  },
  care: {
    skill: "care",
    attribute: "perception",
    minutes: 15,
    objects: ["bed", "table", "sofa"],
    age: 18,
  },
  work: {
    skill: "administration",
    attribute: "reasoning",
    minutes: 15,
    objects: ["desk"],
    age: 18,
  },
  finance: {
    skill: "administration",
    attribute: "reasoning",
    minutes: 15,
    objects: ["desk", "table"],
    age: 18,
  },
  neighborhood: {
    skill: "gardening",
    attribute: "stamina",
    minutes: 15,
    objects: ["planter", "bench", "park_marker", "desk"],
    age: 12,
  },
  community: {
    skill: "teamwork",
    attribute: "presence",
    minutes: 20,
    objects: ["community_table", "table", "desk"],
    age: 12,
  },
};
export function dutyFamily(r) {
  return r.context === "Haushalt"
    ? "household"
    : r.context === "Wäsche und Ordnung"
      ? "laundry"
      : r.context === "Essen und Versorgung"
        ? "food"
        : r.context === "Schule und Lernen"
          ? "learning"
          : ["Kinderbetreuung", "Pflege und Gesundheit"].includes(r.context)
            ? "care"
            : r.context === "Arbeit und Termine"
              ? "work"
              : r.context === "Geld und Verwaltung"
                ? "finance"
                : r.context === "Haus und Nachbarschaft"
                  ? "neighborhood"
                  : "community";
}
const dutyTitles=JSON.parse(fs.readFileSync(new URL('config/living-social-topics.en.json',root)));
export const DUTIES = SOCIAL_CATALOG.filter((r) => r.catalog === "duties").map(
  (r) => ({
    ...r,
    displayTitle: dutyTitles[r.id]||r.title,
    operator: dutyFamily(r),
    execution: FAMILY_ACTIONS[dutyFamily(r)],
  }),
);
export const ACTIVITIES = ECONOMY_CATALOG.activities.map((r) => ({
  ...r,
  minCents: Math.round(r.price_min_eur * 100),
  maxCents: Math.round(r.price_max_eur * 100),
}));
export const ITEMS = ECONOMY_CATALOG.items.map((r) => ({
  ...r,
  minCents: Math.round(r.price_min_eur * 100),
  maxCents: Math.round(r.price_max_eur * 100),
}));
export function incomeTax(monthlyCents) {
  const annual = Math.max(0, monthlyCents) * 12;
  let previous = 0,
    result = 0;
  for (const [limit, rate] of POLICY.annual_income_tax_bands) {
    const end = limit ?? annual;
    result += Math.max(0, Math.min(annual, end) - previous) * rate;
    previous = end;
    if (annual <= end) break;
  }
  return Math.round(result / 12);
}
export function estimatedNet(gross) {
  return (
    gross - Math.round(gross * POLICY.employee_social_rate) - incomeTax(gross)
  );
}
export function monthKey(time) {
  return new Date(Date.UTC(2026, 8, 21) + time * 1000)
    .toISOString()
    .slice(0, 7);
}
export function calendarDate(time) {
  return new Date(Date.UTC(2026, 8, 21) + time * 1000);
}
