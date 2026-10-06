import {rng} from './random.js';
export const SOCIAL_VERSION=1;
const quarters=[
  ['Lindenhöfe','Lindenweg','Gartenstadt','Unter alten Linden liegen kleine Familienhäuser; man kennt die Nachbarn, braucht aber manchmal auch Ruhe.','Der offene Gartentisch bringt Nachbarn am späten Nachmittag zusammen.','town park','gardening'],
  ['Am Mühlbach','Mühlenstraße','Flussbogen','Ein ruhiges Viertel mit alten Handwerkerhäusern und neuen Familien. Veränderungen werden hier lebhaft diskutiert.','Beim Spaziergang am Wasser trifft man sich auf einen kurzen Plausch.','town park','walking'],
  ['Kastanienwinkel','Kastanienallee','Westgärten','Kinder spielen zwischen gepflegten Gärten; ältere Bewohner erzählen von früher, während junge Eltern ihren Alltag organisieren.','Nach Schule und Arbeit verabredet man sich im Park.','town park','socializing'],
  ['Alte Weberei','Webergasse','Werkstattviertel','Umgebaute Werkstätten, kleine Ateliers und Familienhöfe stehen nebeneinander. Hilfsbereitschaft trifft auf unterschiedliche Vorstellungen vom Zusammenleben.','Im Café wird über gemeinsame Vorhaben gesprochen.','shopping street cafe','craft'],
  ['Sonnenrain','Sonnenweg','Höhenviertel','An den Hängen wohnen alteingesessene Familien und Zugezogene. Hinter freundlichen Fassaden bleiben manche Wünsche unausgesprochen.','Ein Spaziergang am Abend bietet Gelegenheit, wieder ins Gespräch zu kommen.','town park','walking'],
  ['Bücherhof','Lesegasse','Campusgärten','Studierende, Lehrende und Familien teilen sich ruhige Innenhöfe. Lernen und gegenseitige Unterstützung gehören zum Alltag.','In der Bibliothek trifft sich ein lockerer Lesekreis.','public library','reading'],
  ['Rosenau','Rosenweg','Südgärten','Grüne Vorgärten und kleine Häuser bilden ein vertrautes Wohnviertel. Die Nachbarn helfen einander, ohne immer einer Meinung zu sein.','Im Park tauscht man Gartentipps und Neuigkeiten aus.','town park','gardening'],
  ['Bahnhofsgärten','Gleisgartenweg','Bahnhofsviertel','Pendler, Berufseinsteiger und langjährige Bewohner leben Tür an Tür. Neue Freundschaften entstehen zwischen vollen Tagesplänen.','Nach Feierabend trifft man Bekannte im Café.','shopping street cafe','socializing'],
  ['Birkenhain','Birkenpfad','Waldsaum','Am grünen Stadtrand suchen Familien und ältere Menschen Ruhe. Gemeinsame Wege bringen unterschiedliche Generationen zusammen.','Der gemeinsame Nachmittagsspaziergang steht allen offen.','town park','walking'],
  ['Markthöfe','Marktgasse','Altstadt','Über kleinen Geschäften liegen Wohnungen mit lebhaften Küchen. Man begegnet sich oft, doch nicht jede Bekanntschaft ist schon eine Freundschaft.','Beim Kaffee nach dem Einkauf bleibt Zeit für Gespräche.','shopping street cafe','cooking'],
  ['Apfelgärten','Obstgartenweg','Obstgartenviertel','Zwischen alten Obstbäumen pflegen Familien und Alleinlebende kleine Gärten. Nachbarschaftliche Hilfe ist hier eine Gewohnheit.','Am Gartentisch werden Ideen und praktische Hilfe angeboten.','town park','gardening'],
  ['Musikerhöfe','Melodiengasse','Kulturviertel','Kreative Bewohner, Familien und Ruheständler teilen kleine Innenhöfe. Begeisterung für Musik und das Bedürfnis nach Ruhe müssen zusammenfinden.','Im Café trifft man sich zum Austausch über Musik und kreative Projekte.','shopping street cafe','music']
];
export function neighborhoodIdentity(seed,index=0){
  const offset=Math.floor(rng('quarter:'+seed)()*quarters.length),[base,street,district,character,ritual,meetingPurpose,theme]=quarters[(index+offset)%quarters.length];
  const cycle=Math.floor(index/quarters.length),suffix=cycle?' '+['am Bach','am Hang','am Wald','bei der Brücke','am Stadtgarten','am See','am Feld','beim Tor'][Math.floor(cycle/quarters.length)%8]+(cycle%quarters.length?' '+['Nord','Ost','Süd','West','Oben','Unten','Innen','Außen','Mitte','Neu','Alt'][cycle%quarters.length-1]:''):'';
  return {name:base+suffix,street:street+suffix,district,character,ritual,meetingPurpose,theme};
}
export function nameNeighborhoods(places,seed,{offset=0,reserved=[]}={}){
  const used=new Set(reserved),identities={};let index=offset;
  for(const p of places)if(p.kind==='neighborhood'){
    let identity;do{identity=neighborhoodIdentity(seed,index++);}while(used.has(identity.name));
    // Keep names given by the user; only replace old generator labels.
    if(!/^Nachbarschaft \d+(?: · Erweiterung \d+)?$/.test(p.name)&&p.name)identity.name=p.name;
    used.add(identity.name);p.name=identity.name;p.purpose='quiet residential street houses trees · '+identity.street+' · '+identity.character+' '+identity.ritual;identities[p.id]=identity;
  }
  const districtNames=new Set(reserved);
  for(const p of places)if(p.kind==='district'&&/^(?:Nordviertel|Gartenviertel|Flussviertel) \d+(?: · Erweiterung \d+)?$/.test(p.name)){
    const child=places.find(q=>q.parent_id===p.id&&identities[q.id]);let name=child?identities[child.id].district:'Altstadt';
    if(districtNames.has(name))name+=' '+(child?identities[child.id].name:'am Stadtgarten');p.name=name;districtNames.add(name);
  }
  return identities;
}
