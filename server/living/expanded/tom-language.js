// First-person explanations use ONLY my state, known roles and my recorded
// encounter. Never inspect another Sim's thoughts, needs, finances or intentions.
export const SOCIAL_ACTION_LABELS = {
  greet: 'Begrüßung', small_talk: 'Alltagsgespräch', share_interest: 'Gespräch über gemeinsame Interessen',
  offer_help: 'Angebot zur Unterstützung', ask_help: 'Bitte um Hilfe', ask_advice: 'Bitte um Rat',
  tell_joke: 'Scherz', compliment: 'Kompliment', apologize: 'Entschuldigung', check_in: 'Nachfrage nach dem Befinden',
  confide: 'Versuch eines vertraulichen Gesprächs', invite_activity: 'Einladung zu einer Unternehmung',
  celebrate: 'Versuch, Freude zu teilen', play_together: 'Vorschlag zum gemeinsamen Spielen', coordinate_work: 'Abstimmung bei der Arbeit',
  set_boundary: 'Gespräch über eine persönliche Grenze', gossip: 'Austausch unbestätigter Gerüchte',
  reconcile: 'Versuch einer Versöhnung', comfort: 'Angebot von Trost', deep_talk: 'Persönliches Gespräch',
  argue: 'Streit über unterschiedliche Vorstellungen', debate: 'Diskussion verschiedener Meinungen',
  teen_romantic_talk: 'Behutsames Gespräch über altersnahes Schwärmen', teen_date: 'Harmloses altersnahes Date',
  adult_private_intimacy: 'Wunsch nach einem privaten liebevollen Moment zwischen Erwachsenen', flirt: 'Behutsames Flirten',
  ask_date: 'Einladung zu einem Date', express_affection: 'Ausdruck von Zuneigung', phone_call: 'Telefonischer Kontakt',
  ask_favor: 'Bitte um eine Gefälligkeit', collaborate_project: 'Gespräch über eine gemeinsame Idee',
  share_news: 'Austausch von Neuigkeiten', make_plans: 'Abstimmung gemeinsamer Pläne', invite_to_dinner: 'Einladung zum Essen',
  tell_story: 'Erzählung', tease: 'Spielerisches Aufziehen', challenge: 'Vorschlag zu einem Wettstreit',
  persuade: 'Versuch, für eine Idee zu gewinnen', provoke: 'Zugespitzte Bemerkung', undermine: 'Kritik an gemeinsamer Arbeit',
};
const topicLabels = { family: 'Familie & Zusammenleben', school: 'Lernen & Schulalltag', work: 'Arbeit & Zusammenarbeit', leisure: 'Freizeit & Begegnungen', negotiation: 'Wünsche & Absprachen', romance: 'Nähe & persönliche Grenzen', public: 'Öffentliche Begegnung' };
const romantic = new Set(['flirt','ask_date','express_affection','teen_date','teen_romantic_talk','adult_private_intimacy']);

// Store small, factual context rather than a growing prose model at each tick.
export function encounterMemory(event, context, witness = false) {
  return {
    category: event.facts?.category, outcome: event.facts?.outcome,
    initiatorId: event.participants?.[0] || null, witness,
    remote: !!event.facts?.remote, audience: context.publicAudience || 0,
    context: { ...context },
  };
}
export function socialEvidenceLabel(source) {
  const [category, outcome] = (source.observed || '').split(' ');
  return `Kontaktanlass: ${SOCIAL_ACTION_LABELS[category] || 'Dokumentierte Begegnung'} · ${outcome === 'accepted' ? 'Kontakt angenommen' : outcome === 'declined' ? 'Kontakt abgelehnt' : 'Ausgang nicht genauer dokumentiert'}`;
}
export function socialPerspective(p, subject, context, probability, memory = {}, sources = []) {
  const name = subject.name, category = memory.category, declined = memory.outcome === 'declined';
  const witness = !!memory.witness, ownBid = memory.initiatorId === p.id;
  const hasDirection = !!memory.initiatorId;
  const latest = sources.at(-1);
  const observation = sources.length
    ? `${socialEvidenceLabel(latest)}. ${witness ? 'Ich habe nur einen Teil dieser Begegnung mitbekommen; ich war nicht ihr Gegenüber.' : hasDirection ? ownBid ? 'Ich habe den Kontakt begonnen.' : `${name} hat den Kontakt begonnen.` : 'Wer den Kontakt begonnen hat, ist in dieser älteren Notiz nicht festgehalten.'}${memory.remote ? ' Der Austausch war telefonisch; Mimik und Vorgänge im Raum konnte ich dabei nicht sehen.' : ''}`
    : 'Noch keine eigene Begegnung als Beleg. Diese Erwartungen beruhen auf der mir bekannten Beziehung und der Situation.';
  let variants = {
    support: `${name} könnte Verbindung suchen oder Unterstützung anbieten; ein freundlicher Austausch wäre dafür ein Hinweis, aber kein Beweis.`,
    obligation: `${name} könnte einen Termin, eine Aufgabe oder die Verteilung von Verantwortung klären wollen.`,
    criticism: `${name} könnte mit einer konkreten Sache unzufrieden sein. Daraus folgt keine allgemeine Ablehnung meiner Person.`,
    romance: `${name} könnte behutsame, freiwillige Nähe wünschen. Freundlichkeit allein sagt darüber wenig aus und ist keine Zustimmung.`,
    unknown: `${name} könnte einen ganz anderen Anlass haben. Mir fehlen noch Informationen, um diesen einzuordnen.`,
  };
  let nextStep = 'Ich könnte fragen: „Was ist dir gerade wichtig – möchtest du erzählen oder gemeinsam etwas klären?“';
  if (context.isChild) {
    variants.support = `${name} könnte mir zuhören, mit mir Zeit verbringen oder mir bei einem eigenen Versuch helfen wollen. Ein Ausflug wäre schön, ist aber noch nicht zugesagt.`;
    variants.obligation = `${name} könnte unseren Tagesplan oder eine überschaubare Aufgabe besprechen wollen. Ich kann fragen, was erwartet wird und wobei ich Hilfe brauche.`;
    nextStep = 'Ich könnte sagen: „Ich wünsche mir Zeit mit dir. Geht es gerade um einen Plan oder um etwas, das ich erledigen soll?“';
  } else if (context.isParent) {
    variants.support = `${name} könnte Sicherheit, Aufmerksamkeit oder Unterstützung suchen und trotzdem etwas selbst schaffen wollen.`;
    variants.obligation = `${name} könnte mehr Mitbestimmung oder eine verständliche, faire Absprache wünschen. Selbstständigkeit und Nähe müssen kein Gegensatz sein.`;
    nextStep = 'Ich könnte fragen: „Was möchtest du selbst entscheiden, und an welcher Stelle soll ich dir helfen?“';
  } else if (context.partner) {
    variants.support = `${name} könnte sich gemeinsame Zeit oder ehrliches Zuhören wünschen. Eine Alltagsabsprache kann zugleich ein Wunsch nach Entlastung sein.`;
    variants.obligation = `${name} könnte Aufgaben, Termine oder gemeinsame Ausgaben abstimmen wollen. Ich weiß noch nicht, welche Aufteilung sich für uns beide fair anfühlt.`;
    nextStep = 'Ich könnte fragen: „Brauchst du gerade Nähe, Entlastung oder einen konkreten Plan? Was würde dir heute helfen?“';
  } else if (context.topic === 'work') {
    variants.support = `${name} könnte meinen Beitrag anerkennen oder bei einem schwierigen Arbeitsschritt unterstützen wollen.`;
    variants.obligation = context.explicitManager
      ? `${name} könnte als bekannte Führungskraft einen Auftrag oder eine Priorität klären wollen. Das bedeutet noch nicht, dass eine Rüge oder Beförderung bevorsteht.`
      : `${name} könnte einen gemeinsamen Arbeitsschritt abstimmen wollen. Eine kollegiale Bitte ist nicht automatisch eine Weisung.`;
    variants.criticism = `${name} könnte Rückmeldung zu einem Arbeitsschritt geben wollen; über meine Leistung insgesamt sagt diese Vermutung wenig aus.`;
    nextStep = 'Ich könnte fragen: „Welche Aufgabe hat Vorrang, was übernimmst du, und wo brauchst du meinen Beitrag?“';
  } else if (context.topic === 'school') {
    variants.support = `${name} könnte gemeinsam eine Frage lösen, mich ins Spiel einbeziehen oder nach der Schule Zeit mit mir verbringen wollen.`;
    variants.obligation = `${name} könnte eine Lernaufgabe oder Gruppenabsprache klären wollen. Ich kann um eine faire Aufteilung bitten.`;
    nextStep = 'Ich könnte fragen: „Sollen wir die Aufgabe zusammen angehen oder möchtest du erst erzählen, was passiert ist?“';
  } else if (context.topic === 'negotiation') {
    nextStep = 'Ich könnte fragen: „Was wäre für dich eine faire Lösung? Ich sage auch, was ich leisten kann und wo meine Grenze liegt.“';
  }
  // Direction matters: my invitation/help request is NOT proof of their wish.
  if (ownBid && ['ask_help','ask_advice','ask_favor'].includes(category)) {
    variants.support = `${name} könnte bereit sein, auf meine Bitte einzugehen. Eine Gesprächszusage beweist noch nicht, dass die Hilfe schon geleistet wurde.`;
    variants.obligation = `${name} könnte erst Aufwand, Zeitpunkt und eigene Grenzen mit mir klären wollen.`;
    nextStep = 'Ich könnte konkret sagen, welche Hilfe ich brauche, und fragen: „Was davon ist für dich möglich, und wann?“';
  } else if (ownBid && ['offer_help','comfort'].includes(category)) {
    variants.support = `${name} könnte mein Angebot als Zuwendung verstehen. Ob die Unterstützung passend ist, kann nur mein Gegenüber selbst sagen.`;
    nextStep = 'Ich könnte fragen: „Möchtest du, dass ich zuhöre oder etwas Konkretes tue? Du kannst mein Angebot auch ablehnen.“';
  } else if (!ownBid && hasDirection && category === 'ask_help') {
    variants.support = `${name} könnte mir genug vertrauen, um um Hilfe zu bitten. Umfang und Grund der Bitte sind damit noch nicht vollständig klar.`;
    nextStep = 'Ich könnte fragen: „Was brauchst du genau? Ich sage dir ehrlich, was ich davon übernehmen kann.“';
  }
  // Nuance depends on the actual kind of exchange, not on gender, appearance,
  // income class or an invented hidden motive. Acceptance is scoped to this bid.
  if (category === 'apologize' || category === 'reconcile') {
    variants.support = `${name} könnte unsere Spannung klären wollen. Ein Gespräch darüber ist ein Anfang; Vertrauen und Verzeihen brauchen trotzdem Zeit.`;
    variants.obligation = `${name} könnte sich eine konkrete Änderung für den nächsten ähnlichen Moment wünschen, statt nur freundlicher Worte.`;
    nextStep = 'Ich könnte sagen, was mich verletzt hat, den eigenen Anteil benennen und fragen: „Was können wir nächstes Mal konkret anders machen?“';
  } else if (category === 'set_boundary') {
    variants.support = `${name} könnte sich einen respektvollen Kontakt wünschen, in dem die ausgesprochene Grenze ernst genommen wird.`;
    variants.obligation = `${name} könnte klären wollen, was heute möglich ist und was nicht. Eine Grenze ist kein Beweis für fehlende Zuneigung.`;
    nextStep = 'Ich könnte die gehörte Grenze in eigenen Worten bestätigen und meinen eigenen Spielraum erklären, ohne sie wegzuverhandeln.';
  } else if (category === 'confide' || category === 'deep_talk') {
    variants.support = `${name} könnte Verständnis und aufmerksames Zuhören suchen. Ein persönliches Gespräch ist keine Erlaubnis, den Inhalt weiterzuerzählen.`;
    nextStep = 'Ich könnte fragen: „Möchtest du, dass ich nur zuhöre oder mit dir nach einer Lösung suche? Was davon soll unter uns bleiben?“';
  } else if (category === 'gossip') {
    variants.support = `${name} könnte durch gemeinsames Erzählen Verbindung suchen. Ich möchte Zugehörigkeit nicht auf Kosten einer abwesenden Person herstellen.`;
    variants.criticism = `${name} könnte Ärger ausdrücken oder eine einseitige Geschichte erzählen. Das macht die Behauptung noch nicht wahr.`;
    nextStep = 'Ich könnte fragen: „Hast du das selbst erlebt oder nur gehört?“ und unbestätigte Behauptungen nicht als Tatsachen weitergeben.';
  } else if (category === 'tease' || category === 'tell_joke') {
    variants.support = `${name} könnte spielerische Vertrautheit suchen. Ob ein Scherz für beide angenehm war, ergibt sich nicht allein aus der Gesprächszusage.`;
    variants.criticism = `${name} könnte die Bemerkung anders verstanden haben als beabsichtigt. Ich kann die Wirkung prüfen, ohne Kränkung oder gute Laune zu behaupten.`;
    nextStep = 'Ich könnte freundlich fragen: „War das für dich auch lustig, oder ging die Bemerkung zu weit?“ und eine Grenze ernst nehmen.';
  } else if (['invite_activity','invite_to_dinner','make_plans'].includes(category)) {
    variants.support = `${name} könnte gemeinsame Zeit begrüßen. Daraus folgt weder ein romantisches Interesse noch, dass schon ein Treffen stattgefunden hat.`;
    variants.obligation = `${name} könnte Zeitpunkt, Aufwand oder Kosten klären wollen. Ein passender Plan muss für beide möglich sein.`;
    nextStep = 'Ich könnte eine konkrete, bezahlbare Möglichkeit nennen und fragen: „Passt dir das, oder wäre ein anderer Zeitpunkt besser?“';
  } else if (category === 'debate') {
    variants.support = `${name} könnte sich ernsthaft mit meiner Sicht auseinandersetzen wollen. Unterschiedliche Meinungen schließen Respekt nicht aus.`;
    variants.criticism = `${name} könnte einem Argument widersprechen, ohne mich als Person abzulehnen.`;
    nextStep = 'Ich könnte das stärkste Argument meines Gegenübers in eigenen Worten wiedergeben und fragen, ob ich es richtig verstanden habe.';
  } else if (['argue','provoke','undermine'].includes(category)) {
    variants.criticism = `${name} könnte sich bei dieser Sache übergangen, unfair behandelt oder nicht verstanden fühlen. Welcher Grund tatsächlich zutrifft, kann ich nicht wissen.`;
    nextStep = 'Ich könnte zuerst den konkreten Streitpunkt klären, meine Gefühle ohne Vorwurf benennen und eine Pause vorschlagen, falls wir beide zu angespannt sind.';
  } else if (category === 'share_interest' || category === 'collaborate_project') {
    variants.support = `${name} könnte Freude daran haben, Ideen mit mir zu teilen. Ein gemeinsames Interesse sagt noch nichts darüber, wie viel Zeit wir investieren möchten.`;
    nextStep = 'Ich könnte fragen: „Was reizt dich daran besonders? Wollen wir erst eine kleine gemeinsame Sache ausprobieren?“';
  }
  if (witness) {
    variants.support = 'Die Beteiligten könnten Unterstützung oder einen freundlichen Austausch suchen. Daraus folgt kein Wunsch nach einem Kontakt mit mir.';
    variants.obligation = 'Die Beteiligten könnten etwas miteinander abstimmen. Ob mich eine Aufgabe betrifft, ist damit noch nicht gesagt.';
    variants.criticism = 'Es könnte um eine Meinungsverschiedenheit der Beteiligten gehen. Ich kenne weder ihren Auslöser noch die ganze Vorgeschichte.';
    variants.unknown = 'Ein weiterer Anlass bleibt möglich, den ich als beobachtende Person nicht erkennen konnte.';
  }
  const agePair = (p.age >= 18 && context.otherAge >= 18) || (p.age >= 14 && p.age < 18 && context.otherAge >= 14 && context.otherAge < 18 && Math.abs(p.age-context.otherAge)<=1);
  const kin = context.role?.some(r => /mutter|vater|schwester|bruder|tochter|sohn|cous|enkel|tante|onkel|groß|oma|opa/iu.test(r));
  // Under 14: no romance. 14–17: only mild nonsexual romance with <=1 year gap.
  // No sexual scenarios or adult/minor romance are generated by this prose layer.
  const alternatives = Object.entries(probability || {}).filter(([key,n]) => n > .01 && (key !== 'romance' || (agePair && !kin && !witness))).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([kind,n])=>({kind,probability:n,text:variants[kind] || variants.unknown}));
  let interpretation = alternatives[0]?.text || variants.unknown;
  const needs = p.state.needs || {}, selfLens = [];
  if (needs.hunger > .7) selfLens.push('Mein Hunger macht Geduld schwieriger. Ich könnte eine kurze Pause brauchen, bevor ich eine Bemerkung als Angriff deute.');
  if (needs.fatigue > .7) selfLens.push('Meine Müdigkeit kann neutrale Worte schroffer wirken lassen. Mein Eindruck ist deshalb noch kein Beleg für schlechte Absichten.');
  const affect = p.state.affect?.states || [];
  if (affect.some(e => ['fear','distress','anger'].includes(e.id) && e.intensity > .55)) selfLens.push('Ich bin gerade angespannt und achte stärker auf mögliche Ablehnung. Eine Rückfrage kann helfen, Gefühl und Beobachtung auseinanderzuhalten.');
  if ((p.state.psychology?.big_five?.neuroticism || 0) > .65 && !selfLens.length) selfLens.push('Ich mache mir schnell Sorgen über Missverständnisse. Ich möchte meine erste Deutung prüfen, bevor ich darauf reagiere.');
  if (p.state.economy?.threats?.some(t => t.kind === 'cash_shortfall' && t.probability > .5)) selfLens.push('Meine eigene Sorge um Geld kann eine Bitte wie eine zusätzliche Belastung wirken lassen. Ich möchte meinen Spielraum erklären, statt dem anderen schlechte Absichten zu unterstellen.');
  if ((context.tension || 0) > .35) selfLens.push('Unsere bekannte Spannung beeinflusst meine Erwartung. Eine frühere Schwierigkeit legt den Ausgang dieses Gesprächs aber nicht fest.');
  const unknowns = [ 'Den tatsächlichen Gedanken und Absichten meines Gegenübers habe ich keinen direkten Zugang.', 'Eine Zusage zum Gespräch ist weder ein erledigter Auftrag noch eine dauerhafte Verpflichtung.' ];
  if (category === 'gossip') unknowns.push('Erzählte Gerüchte sind keine bestätigten Tatsachen; ich sollte ihre Herkunft prüfen, bevor ich sie weitergebe.');
  if (witness) unknowns.push('Ich kenne weder den ganzen Gesprächsverlauf noch die private Vorgeschichte der Beteiligten.');
  let audience = memory.audience > 0 ? 'Andere waren dabei. Persönliches kann ich in einem ruhigen, freiwilligen Gespräch klären; ich weiß nicht, wie die Zuhörenden das Gesagte deuten.' : null;
  if (memory.remote) audience = 'Telefonischer Austausch: Ich kann nachfragen, ob mein Gegenüber gerade ungestört sprechen kann, statt die Situation im anderen Raum anzunehmen.';
  if (declined) {
    interpretation = 'Dieser Kontaktwunsch wurde abgelehnt. Diese konkrete Grenze steht fest; der Grund und die Haltung zu späteren, anderen Kontakten bleiben offen.';
    nextStep = romantic.has(category) ? 'Ich respektiere das Nein und dränge nicht auf Nähe. Eine Ablehnung verpflichtet niemanden, sich zu erklären.' : 'Ich lasse Raum und akzeptiere die Antwort. Falls eine notwendige Aufgabe offen ist, kann ich später eine andere Lösung oder Unterstützung suchen.';
  }
  if (witness) { interpretation = 'Ich habe eine Begegnung beobachtet. Meine Deutungen betreffen deren sichtbaren Verlauf, nicht ein Angebot oder Interesse an mir persönlich.'; nextStep = 'Ich kann abwarten oder fragen, ob Unterstützung erwünscht ist, ohne mich ungefragt in ein privates Gespräch einzumischen.'; }
  const myWish = p.profile.social?.wish || p.state.current_desire || 'Ich wünsche mir einen verständlichen, respektvollen Austausch.';
  let metabelief = null;
  if (!witness && sources.length) {
    metabelief = ownBid
      ? `Weil ich den Kontakt begonnen habe, könnte ${name} meinen Wunsch nach ${['ask_help','ask_advice','ask_favor'].includes(category) ? 'Unterstützung' : ['offer_help','comfort'].includes(category) ? 'Hilfsbereitschaft' : romantic.has(category) ? 'freiwilliger Nähe' : 'Kontakt oder Abstimmung'} wahrgenommen haben. Ob das so angekommen ist, weiß ich nicht; ich könnte meinen Wunsch deutlicher aussprechen.`
      : hasDirection
        ? `${name} könnte meine Antwort als ${declined ? 'Grenze für diesen Kontakt' : 'Bereitschaft zu diesem Gespräch'} verstanden haben. Daraus kann mein Gegenüber noch nicht wissen, wie viel Zeit oder Hilfe ich anbieten möchte; das kann ich selbst erklären.`
        : `Ich weiß nicht, welchen Eindruck ${name} aus diesem älteren Kontakt von mir gewonnen hat. Ich kann heute klar sagen, was ich möchte, statt diesen Eindruck vorauszusetzen.`;
  }
  return {romanceAllowed:agePair && !kin && !witness, contextLabel:topicLabels[context.topic] || 'Begegnung', observation, interpretation, alternatives, myWish, selfLens:selfLens.slice(0,2), unknowns, nextStep, audience, metabelief, evidenceAt:latest?.at ?? null};
}
export function perspectiveThought(brief) {
  return [brief.interpretation, brief.alternatives.find(a=>a.text!==brief.interpretation)?.text, brief.selfLens[0], brief.audience, brief.nextStep].filter(Boolean).join(' ');
}
