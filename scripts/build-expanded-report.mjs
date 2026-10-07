// Rebuild the standalone implementation report from the actual runtime catalogs.
import fs from "node:fs";
import {
  JOBS,
  DUTIES,
  ATTRIBUTE_LABELS,
  SKILL_LABELS,
  POLICY,
  ACTIVITIES,
  ITEMS,
} from "../server/living/expanded/catalog.js";
const root = new URL("../", import.meta.url),
  e = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  eur = (c) =>
    (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const benchmark = JSON.parse(
    fs.readFileSync(
      new URL("artifacts/living-world/benchmark-expanded.json", root),
    ),
  ),
  table = (heads, rows) =>
    '<div class="table"><table><thead><tr>' +
    heads.map((v) => "<th>" + e(v) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (r) =>
          "<tr>" + r.map((v) => "<td>" + e(v) + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</tbody></table></div>";
const file = (name) =>
  `<a href="https://github.com/christophschuhmann/Vivarium_One/blob/living-world-expanded/server/living/expanded/${name}.js">${name}.js</a>`;
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vivarium · Stadtleben · Implementierung und Bedienung</title><style>
:root{--paper:#f9f6ef;--ink:#383542;--muted:#777280;--line:#e2dce6;--violet:#76568c;--sage:#587a68}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 system-ui,sans-serif}main{max-width:1300px;margin:auto;padding:40px 30px 90px}header{padding:30px 0}h1{font-size:clamp(36px,6vw,72px);line-height:1.1;letter-spacing:-.035em;margin:20px 0}h2{font-size:28px}h3{font-size:21px}p{max-width:1050px}.lead{font-size:21px;color:var(--muted);max-width:900px}.kicker{color:var(--violet);letter-spacing:.15em;font-size:12px;font-weight:700}nav{display:flex;flex-wrap:wrap;gap:10px;padding:20px 0}nav a,.badge{padding:7px 14px;border-radius:30px;background:#eee5f2;font-size:13px;text-decoration:none}a{color:var(--violet);text-underline-offset:3px}section{border-top:1px solid var(--line);padding:28px 0;scroll-margin-top:20px}.note{padding:18px 22px;border-radius:18px;background:#edf2eb;margin:22px 0}.warning{background:#f3e9da}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:18px 22px}.card h3{margin-top:0}.table{overflow:auto;border-radius:16px;border:1px solid var(--line);background:#fff;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:14px;min-width:650px}td,th{padding:13px 16px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{background:#ede7f1;color:var(--violet)}tbody tr:nth-child(even){background:#faf8fc}pre{overflow:auto;padding:20px;background:#eee8f2;border-radius:16px;font:13px/1.8 ui-monospace,monospace}code{font-size:.9em;overflow-wrap:anywhere}.flow{display:flex;gap:12px;flex-wrap:wrap}.flow span{border:1px solid #ccd9ce;background:#edf3eb;padding:10px 16px;border-radius:12px}.flow b{align-self:center;color:var(--sage)}details{padding:15px 0}summary{cursor:pointer;font-weight:600}img{max-width:100%;border-radius:18px;border:1px solid var(--line)}.tiny{font-size:13px;color:var(--muted)}@media(max-width:700px){main{padding:24px 16px 60px}.grid{grid-template-columns:1fr}.lead{font-size:18px}}
</style></head><body><main><header><div class="kicker">VIVARIUM · LIVING WORLD EXPANDED · 7. OKTOBER 2026</div><h1>Ein Alltag, der<br>zusammenhängt.</h1><p class="lead">Bedürfnisse, Persönlichkeit, Können, Geld und Beziehungen verändern gemeinsam, was ein Sim versucht, was wirklich gelingt und wie er das Erlebte versteht. Die klassische Bühne bleibt der Ort zum Zuschauen und Eingreifen.</p><span class="badge">Implementiert · Regelmigration v5</span> <span class="badge">Separate Kopie · living-world-expanded</span><div class="note">Der bisherige Stand wurde zuerst zu GitHub gepusht und auf <code>main</code> zusammengeführt. Diese Erweiterung liegt in <code>living-world/expanded-world</code>, mit eigener Datenbank und eigenem Server. <a href="living-world-social-tom-plan.html">Die ursprüngliche ausführliche Planung und ihre 600 Beispiele</a> bleiben als Entwurfsreferenz erhalten; diese Seite beschreibt die tatsächlich eingebauten Mechanismen und ihre Grenzen.</div></header>
<nav>${[
  ["start", "Installation"],
  ["usage", "Bedienung"],
  ["finance-education-care", "Finanzen, Bildung & Pflege"],
  ["loop", "Zusammenspiel"],
  ["mind", "Person & PERMA"],
  ["tom", "Soziale Sicht"],
  ["economy", "Geld & Haushalt"],
  ["jobs", "Arbeit & Stellen"],
  ["housing", "Wohnen"],
  ["life", "Aufgaben & Besitz"],
  ["community", "Stadt & Ereignisse"],
  ["safety", "Altersgrenzen"],
  ["architecture", "Code & Daten"],
  ["tests", "Prüfung & Messungen"],
  ["catalogs", "Kataloge"],
]
  .map(([id, name]) => `<a href="#${id}">${name}</a>`)
  .join("")}</nav>
<section id="start"><h2>Installieren und mit eigenem Schlüssel starten</h2><pre>git clone --branch living-world-expanded --recurse-submodules https://github.com/christophschuhmann/Vivarium_One.git
cd Vivarium_One
npm run setup
npm run living:setup
npm start</pre><p>Voraussetzungen: Node 22+, Python 3.11 empfohlen, ffmpeg, zip und unzip. Unter Debian/Ubuntu: <code>sudo apt install python3 python3-venv ffmpeg zip unzip</code>. Setup installiert Abhängigkeiten, erzeugt eine lokale Spieleranmeldung und zeigt deren Passwort einmal an. Es bewahrt vorhandene Konfiguration, Welten und gespeicherte Schlüssel. Danach <code>http://localhost:8890</code> öffnen.</p><p>In Settings → AI & models genügt <strong>entweder HyprLab oder OpenRouter</strong>. My own providers wählen, Modelle auswählen und Save my settings klicken. Keine Adminrolle und keine Vivarium-Credits erforderlich. Tatsächliche Provideraufrufe werden beim eigenen Anbieter abgerechnet; die rein prozedurale Simulation benötigt keinen API-Schlüssel. Standard-TTS bei HyprLab: <code>gemini-3.8-flash-tts</code>, <code>gemini-3.1-flash-tts</code> bleibt auswählbar.</p><p>Eine neue Living-World-Stadt im Home-Menü anlegen, zunächst mit 10–20 Einwohnern. Storyteller ausschalten, um Regeln und Budgets ohne Modellkosten auszuprobieren. Dann einen Sim oder Ort verankern und den Storyteller für relevante Felder zuschalten. Es gibt keinen privilegierten Spielercharakter: alle Einwohner sind Sims.</p><p>Die vorhandene Bildbibliothek wird über <code>npm run living:setup</code> eingebunden. Ohne privates HF-Dataset verwendet der Installer verfügbare passende Hintergrundbilder und Platzhalter, wenn kein altersgerechtes Porträt vorhanden ist. Figuren und Räume erhalten stabile Identitäten, auch wenn sie dasselbe Bild verwenden. Die optionale Musikinstallation und Speicherverwaltung stehen ausführlich in <a href="https://github.com/christophschuhmann/Vivarium_One/blob/living-world-expanded/README.md">README</a>.</p></section>
<section id="usage"><h2>Die neue Bedienung im vertrauten Vivarium</h2><div class="grid"><article class="card"><h3>Play, Mind & Profil</h3><p>Szene, Gedanken, ruhige Gespräche, Interventionen, Stats und Bonds bleiben zugänglich. Profil → Ressourcen öffnet den Haushalt, Fähigkeiten und den eigenen wirtschaftlichen Stand. Mind → Soziale Sicht führt zu den eigenen Erwartungen. Obere Aktionsleisten bleiben erreichbar.</p></article><article class="card"><h3>World & Cast</h3><p>Der kreisförmige World-Graph gruppiert Viertel, Straßen, Häuser und Räume. Ein Klick selektiert, ein Doppelklick auf eine echte Location öffnet Play. Suche, Anker-Navigation und der Explorer finden auch nicht verankerte Sims. Das neue Viertel Marktbogen bündelt zusätzliche öffentliche Gebäude.</p></article><article class="card"><h3>City / Stadtleben</h3><p>Ein gemeinsamer Bildschirm mit acht Bereichen statt separater Verwaltungsinseln. Der Bildschirm scrollt mit Mausrad, Tastatur und Touch. Die Sim-Auswahl und Bereichsnavigation bleiben erreichbar; mobil gibt es die kompakte Auswahl „Bereich“. Jeder Bereich merkt sich seine Scrollposition. ▶ Szene, Profil, Welt und Beziehungen führen direkt zum ausgewählten Sim; „Nach oben“ steht am Seitenende.</p></article></div>
${table(
  ["Bereich", "Was du hier siehst und tun kannst"],
  [
    [
      "Mein Alltag",
      "Bedürfnisse, Gefühle, Ziele, fünf PERMA-Säulen, Fähigkeiten, W100, Aufgaben und dokumentierte Fälle. Finanzielle Inhalte haben einen eigenen Bereich.",
    ],
    [
      "Finanzen",
      "Tatsächliche Einnahmen und Ausgaben des letzten Kalendermonats, aktueller Monat, eigene/gemeinsame Konten, vollständige Kategorien und paginierte Einzelbuchungen. Brutto-/Nettoerklärung, offene Rechnungen, Prognose für den nächsten Monat und anpassbare Rücklage für Ungeplantes.",
    ],
    [
      "Arbeit & Bildung",
      "Sofort sichtbarer aktueller Beruf, Schule, Studium, Arbeitsuche, Ruhestand oder Betreuung. Bildungsstationen mit Institution, Ort, Zeitraum, Fach, Abschluss und Ergebnis; berufliche Ambitionen, Familienpflege und sichere Ferienjobs.",
    ],
    [
      "Stellenbörse",
      "Passende und unpassende offene Stellen mit konkreten Gründen. Eigene Mindest-Nettoerwartung und Pendelgrenze einstellen, bewerben und tatsächliche Arbeitswege verfolgen. Eltern können sichere Ferienarbeit für 15–17-Jährige ausdrücklich erlauben.",
    ],
    [
      "Wohnungsbörse",
      "Freie, ausreichend große und bezahlbare Angebote. Kaution und Vertrag prüfen, mieten, kaufen oder eine finanzierte Hypothek vereinbaren. Ein Zusammenziehen braucht die Zustimmung aller Erwachsenen, gegenseitiges Vertrauen und genügend Platz.",
    ],
    [
      "Freizeit & Besitz",
      "32 Angebote mit Eintritt oder kostenloser Variante, 28 besondere Gegenstände, eigene Nutzung und sichtbarer Besitz, reale Mitgliedschaften mit kündbaren laufenden Kosten. Bezahlen allein stellt keine bereits erlebte Freizeitaktivität dar.",
    ],
    [
      "Soziale Sicht",
      "Durchsuchbare Kontaktkarten trennen Beobachtung, Deutung, alternative Erklärungen, eigene Wünsche und Wahrnehmungsfilter, vermuteten Eindruck auf andere, Unbekanntes und einen respektvollen nächsten Schritt. Quellen und Modellgewichtungen sind aufklappbar. Wer den Kontakt begann, Ablehnung, Publikum und Telefonkontakte werden ausdrücklich berücksichtigt; alte Notizen werden beim Lesen neu verständlich formuliert, ohne Erlebnisse oder Geld umzuschreiben.",
    ],
    [
      "Rundblick & Rathaus",
      "Lokale belegte Meldungen, Wetter, Versorgung, Arbeitsmarkt, getrennte öffentliche Fonds. Freiwillig spenden, bei ausreichendem Fonds ein Fest ermöglichen, optional einen klar markierten Modellkommentar zu vorhandenen Nachrichten erstellen.",
    ],
  ],
)}
<p>Ein Zeitfortschritt aktualisiert sämtliche Einwohner prozedural; der Storyteller bearbeitet die durch Anker und tatsächlich entstandenen Kontakt relevanten Felder. Anker verändern die erzählte Detailtiefe, nicht die Zugehörigkeit zur Wirtschaft. Beim ruhigen Gespräch läuft die Zeit nicht weiter; Gedanken und begrenzte emotionale Deutungen können sich ändern, aber es entstehen keine frei erfundenen Kontobuchungen oder erledigten Aufgaben.</p><p>Die Ressourcenansicht zeigt die Person, die du gerade gewählt hast. Die Beobachterrolle des Spielers darf Profile inspizieren; ein Sim-Agent erhält daraus <strong>keine fremden geheimen Gedanken, Kontostände oder Gesundheitsakten</strong>. Haushaltseinnahmen werden nur im Rahmen der hinterlegten eigenen Freigabe geteilt.</p><img src="../artifacts/expanded-world/education-desktop.png" alt="Arbeit und Bildung mit aktuellem Status und Bildungsweg"><p class="tiny">Automatisch geprüfte Browseraufnahme einer isolierten Teststadt; gespeicherte Testwelten werden danach entfernt.</p></section>
<section id="finance-education-care"><h2>Finanzen, Bildung, Betreuung und Lernen nebenbei</h2><div class="grid"><article class="card"><h3>Letzter Monat · echte Buchungen</h3><p>Finanzen beginnt beim letzten Kalendermonat. Zeitraum und Kontenumfang sind auswählbar. Kategorien summieren den gesamten dokumentierten Monat, Einzelbuchungen erscheinen in Seiten zu 60 Einträgen. Vor Simulationsbeginn werden keine Zahlungen erfunden. Eigenes und gemeinsames Konto werden je Transaktion netto summiert: interne Überweisungen erzeugen kein Einkommen.</p><p>Brutto, Steuer und Arbeitnehmerbeiträge erklären den bereits gezählten Nettolohn. Kredite, Startvermögen, gebundene Kautionen und Vermögensverschiebungen bleiben getrennt.</p></article><article class="card"><h3>Nächster Monat · sinnvoller Puffer</h3><p>Planung unterscheidet Kaltmiete, geschätzte Nebenkosten/Heizung, Essen, Kredite, Mitgliedschaften und Pflege-Eigenanteile. Erwartetes Einkommen erfordert tatsächliche Arbeit und gedeckte Auszahlung. Offene Forderungen und frei verplanter Spielraum bleiben sichtbar.</p><p>Eine anpassbare monatliche Rücklage bucht kein Geld ab. Der fiktive Zielpuffer beträgt zwei Monatskosten, mindestens 500 €. Eine tatsächliche eigene Budgetprüfung erzeugt belegte Sorge, Zweifel oder Erleichterung und kleine PERMA-Effekte; Geld allein erzeugt weder Sinn noch persönliche Würde.</p></article><article class="card"><h3>Arbeit & Bildung</h3><p>Der aktuelle Status steht in Stadtleben, Explorer und Profil: Beschäftigung, Schule, Studium, Arbeitsuche, Ruhestand, Kleinkindbetreuung oder Pflege. Die eigene Bildungszeitleiste nennt Institution, Ort, Zeitraum, Fach, Abschluss und Ergebnis. Kindergartenzeit hat keine Schulnote.</p><p>Ausgangsbiografien sind prozedurale Ergänzungen. Neue Abschlüsse setzen tatsächliches Lernen voraus; höhere Bildung benötigt zudem 200 Stunden und 60 Anwesenheitstage. Ein Abschluss erteilt keine automatische Berufszulassung.</p></article></div><h3>Individuelle Pflege statt pauschalem Altersstatus</h3><p>Einige ältere prozedurale Sims haben einen vereinbarten Unterstützungsbedarf. Seniorenhaus Lindenblick besitzt zugängliche Räume im World-Graph; andere erhalten häusliche Familienpflege. Angehörige müssen tatsächlich vor Ort sein, investieren Zeit und Kraft, üben Pflegefertigkeiten und verändern ihre Beziehung durch gewünschte Hilfe. Vorhandene Mahlzeiten werden wirklich verbraucht.</p><p>Professionelle Versorgung ist eine ausdrücklich finanzierte externe Dienstleistung außerhalb der aktiven Sim-Bevölkerung. Sie liefert eine reale Mahlzeit, erhält eine Zahlung aus dem Gesundheitsfonds und stellt einen separaten Eigenanteil in Rechnung. Unbezahlte Ansprüche bleiben dokumentiert. Keine unsichtbaren Pflege-Sims bekommen erfundene Löhne. Ein eigener Pflegehaushalt trennt die persönlichen Pflegekosten und Lebensmittelergänzungen von den Mitteln der zu Hause bleibenden Familie. Kalendermonate mit 31 Tagen werden nicht mit 31/30 des vereinbarten Beitrags berechnet. Familienmitglieder verbleiben in ihrer Wohnung; Leerstand und Kautionsrückgabe setzen tatsächlichen Auszug voraus. Unterstützungsstufen und Beiträge sind fiktive Spielregeln, keine amtlichen Pflegegrade.</p><h3>Bewerbungen mit nachvollziehbaren Chancen</h3><p>Auch erfüllte Mindestanforderungen garantieren keinen Vertrag. Praktisches Können, passende abgeschlossene Bildung, belegte Erfahrungen der konkreten Firma und freie Plätze verändern Stellenchancen. Vermögen ersetzt keine Kompetenz; Arbeitgeber erhalten keine privaten Kontostände, geheimen Meinungen oder Ethniedaten. Wohnbewerbungen berücksichtigen offengelegtes Einkommen, gedeckte Kaution und Puffer sowie belegte Zuverlässigkeit und offene Verpflichtungen.</p><p>Jede Entscheidung speichert Chance, Einflussfaktoren, W100 und Begründung. Eine Absage verändert weder bisherige Stelle noch Wohnung oder Kontostand. Derselbe Antrag kann erst nach sieben Tagen erneut geprüft werden. Wohnhilfe ist gesondert gedeckt; Notunterbringung bleibt ein Schutzverfahren. Eigentumskauf und Hypothek behalten eigene Finanzierungs- und Zustimmungsprüfungen.</p><h3>Info-Symbole an den Konzepten</h3><p>Ein kleines i erklärt Gefühle, Bedürfnisse, PERMA, Meaning/Sinn, Selbstwirksamkeit, Fertigkeiten, Attribute, soziale Sicht, Brutto/Netto, Krankenversicherung, Sozialabgaben, Kalt-/Warmmiete, Rücklagen, Kredite, Pflege und Bewerbungen. Erklärungen sind per Tastatur erreichbar; Escape schließt die Karte und setzt den Fokus zurück. Quellen: <a href="https://ppc.sas.upenn.edu/node/708">Penn: PERMA</a>, <a href="https://dictionary.apa.org/self-efficacy">APA: Selbstwirksamkeit</a>, <a href="https://www.bundesgesundheitsministerium.de/gkv/seite">BMG: Krankenversicherung</a>, <a href="https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung">BMG: Pflegeversicherung</a>, <a href="https://www.bpb.de/kurz-knapp/zahlen-und-fakten/sozialbericht-2024/553255/mieten-und-wohnkosten/">bpb: Miete und Wohnkosten</a>. Die Erklärungen unterscheiden reale Begriffe von vereinfachten Spielwerten.</p><img src="../artifacts/expanded-world/finances-desktop.png" alt="Monatsrückblick und Finanzplanung"><p class="tiny">Vollständige Prüfung: <a href="../artifacts/expanded-world/finance-care-review.json">Simulation und Ledger</a>, <a href="../artifacts/expanded-world/life-panels-browser-review.json">Desktop und mobile Bedienung</a>.</p></section>
<section id="scene-polish"><h2>Bedürfnisse, Wege und eine hörbare Szene</h2><p>Mein Alltag beginnt mit offen sichtbaren Bedürfnissen und Attributen. In Play zeigt ein Klick auf eine Figur dieselben Karten oberhalb der Gedankenansicht. Das Profil stellt sie vor die Biografie; die obere Aktionsleiste führt direkt zu Mind, Gespräch, Play, World, Bonds und Ressourcen. Die zweite Leiste springt zu Bedürfnissen/Attributen, PERMA, Biografie oder Protokoll. Werte von 0 % bedeuten Versorgung, 100 % dringenden Bedarf; ab 65 % und 85 % markieren warme Farben erhöhte Dringlichkeit. Die unveränderten Altersgrenzen für romantische Zuneigung gelten weiterhin.</p><p>Erklärkarten stellen Denkanstöße und fiktive Beispiele bereit, statt nur Wörter zu definieren. Ärger lässt sich über eine verletzte Erwartung und eine konkrete Bitte erkunden; bei Angst werden befürchtete und bereits eingetretene Ereignisse getrennt; bei Finanzen werden Liquidität, Besitz und gebundene Mittel verglichen. Die Beispiele behaupten keine aktuellen Erlebnisse und liefern keine Diagnose. Die Karten bleiben per Tastatur erreichbar und stellen nach Escape den vorherigen Fokus wieder her.</p><img src="../artifacts/expanded-world/everyday-needs-desktop.png" alt="Mein Alltag mit offenen Bedürfnissen und Attributen"><h3>Vorlesen</h3><p>Nach einem erfolgreichen Living-World-Zeitschritt aktiviert derselbe <code>stageState.justAdvanced</code>-Weg wie im klassischen Vivarium die vorhandene geordnete Sprachwiedergabe. Auto übernimmt die gespeicherte Settings-Einstellung. ↻ Vorlesen startet alle Sätze wieder am Anfang; Pause und Einzelzeilen bleiben verfügbar. Der initiierende Klick aktiviert den Audiokontext, damit eine längere Generierungszeit das mobile Autoplay nicht unnötig blockiert. Navigation löst keinen neuen automatischen Vortrag aus.</p><h3>Stabile Musik je Location</h3><p>Ein zweckbezogenes instrumentales Standard-Query sucht beim ersten Besuch über den vorhandenen BM25-Musikserver. <code>lw_place_music</code> speichert Query, Titel, Kandidaten und Auswahlquelle; Musik ist bereits Teil des World-Exports und wird mit neuen Location-IDs dupliziert. Anfragen desselben Orts werden zusammengeführt. Eine vorhandene Auswahl vermeidet weitere Suche; gleichzeitig lädt der Player nur einen Titel.</p><p>Die Musikschaltfläche zeigt das aktuelle Query und erlaubt Suche, Vorschau und manuelle Wahl. Der Storyteller kann optional <code>music:[{locationId,query}]</code> liefern, ausschließlich für derzeit belegte Räume seiner eigenen Sim-Gruppe. Neue Musik wird erst im gültigen Tick committed. Vergleiche mit der zuvor gelesenen Auswahl verhindern, dass verspätete Modell- oder Suchergebnisse eine neuere manuelle Wahl ersetzen. Eine fehlgeschlagene Suche lässt bestehende Musik erhalten. Keine zusätzliche Modellgeneration wird nur für Musikauswahl gestartet; Zeit, Sim-Zustand und Weltversion werden durch reine Musiknavigation nicht verändert.</p><p>Prüfung: <code>test-location-music.mjs</code> testet echte Endpoints, Zugriffstrennung, parallele Anfragen, manuelle Rennen, Storyteller-Grenzen und ZIP-/Duplikations-IDs. Der Browser-Test spielt gültige Fixture-Audiodaten über den wirklichen Player ab und prüft Auto nach Tick, Satzreihenfolge, Wiederholung und ausgeschaltetes Auto ohne bezahlte Provideraufrufe. Desktop und mobile Profile/Alltag werden separat geprüft. Ergebnisse: <a href="../artifacts/expanded-world/scene-audio-music-review.json">Vorlesen im Browser</a> und <a href="../artifacts/expanded-world/location-music-review.json">Musik-Persistenz und Rennen</a>.</p></section>
<section id="loop"><h2>Ein einziger kausaler Kreislauf</h2><div class="flow"><span>Eigene Lage & bekannte Angebote</span><b>→</b><span>Ziel, Aufgabe oder Bedürfnis</span><b>→</b><span>Erreichbarer Weg & Ressourcen</span><b>→</b><span>Versuch / W100 / freiwillige Antwort</span><b>→</b><span>Tatsächliches Ereignis & Buchung</span><b>→</b><span>Eigene Wahrnehmung, Gefühl, PERMA, nächste Erwartung</span></div><p>Eine arbeitslose Person mit wenig Geld kann eine passende Stelle suchen. Zu hohe Nettoerwartungen, fehlende Qualifikation oder ein belegter negativer Eindruck bei genau diesem Arbeitgeber verhindern eine Annahme. Eine tatsächliche Zusage verändert Vertrag und Tagesplan. Erst vor Ort geleistete Arbeitszeit erzeugt einen Lohnanspruch; erst die gedeckte Auszahlung verändert das Konto. Ein geringerer Haushaltsfehlbetrag kann Sorge reduzieren und wieder finanzierte Freizeit ermöglichen.</p><p>Ein leerer Vorrat löst keinen kostenlosen Kühlschrankzauber aus: der Sim sucht eigenen mitgenommenen Vorrat, erreichbaren Einkauf oder die gedeckte Gemeinschaftsküche. Geldmangel kann eine Mitgliedschaft unzugänglich machen, eine billigere Wohnungssuche auslösen oder um Hilfe bitten lassen. Freunde können tatsächlich helfen; fehlende Zustimmung, Geld oder Zeit kann ein Angebot scheitern lassen. Die Wirkung bleibt mit dem Ereignis verknüpft.</p><p>Pro Minute werden Kalenderereignisse, wirtschaftliche Fälligkeiten, Marktversorgung und Aufgaben geprüft; dann tatsächliche Wege, Bedürfnisse, Handlungen und lokale Begegnungen. Private Erwartungen werden vor dem sozialen Versuch festgehalten und nach dem beobachteten Ergebnis aktualisiert. Modellvorschläge werden gegen dieselben Fakten und Altersregeln geprüft. Zustand, Erlebnisse, Journal, Verträge und Geldbuchungen werden in einer gemeinsamen Transaktion gespeichert.</p><div class="note">Abbruch, falsche Weltversion, fehlerhafte Modellantwort oder nicht erfüllte Ressourcenbedingungen erzeugen keinen halben Tick. Ein erfüllter Plan ist von einer angekündigten Absicht getrennt; eine Rechnung, ein Anspruch und eine Zahlung sind verschiedene Dinge.</div></section>
<section id="mind"><h2>Persönlichkeit, Attribute, Fähigkeiten und PERMA</h2><p>Big Five, Interessen, Ambitionen, emotionale Zustände und der eigene autobiografische Verlauf bleiben erhalten. Hinzu kommen sieben individuelle Attribute, sechs soziale Fertigkeiten sowie berufliche und praktische Fähigkeiten. Der Ausgangswert ist eine plausible initiale Disposition, kein erfundenes vergangenes Erlebnis. Bereits ausgeübte Berufe können als Ausgangsqualifikation hinterlegt sein; neu verbesserte Werte erteilen keine ärztliche oder polizeiliche Zulassung.</p>
${table(
  ["Attribut", "Code"],
  Object.entries(ATTRIBUTE_LABELS).map(([k, v]) => [v, k]),
)}
<h3>W100 ist ein überprüfbarer Versuch</h3><pre>Fertigkeit = clamp(round_even(20 + 75 × Übung), 15, 95)
Belastung = round_even(20 × max(Müdigkeit, Hunger) + 8 × Durst)
Zielwert = clamp(round_even(0,65 × Fertigkeit + 0,35 × Attribut
                          + 9 − Belastung − Schwierigkeitsmodifikator), 5, 95)
Wurf = deterministisch erzeugte Zahl von 1 bis 100 pro konkretem Versuch
Ergebnis = besonders gelungen / gelungen / Teilergebnis / Rückschlag</pre><p>Wurf, Eingaben, Schwelle und Ausgang bleiben im eigenen Zustand und Ereignis. Berufliche Arbeit, Training, unsichere Aufgaben und passende soziale Versuche verbessern ihre tatsächliche Fähigkeit abhängig vom Aufwand und Ergebnis. Ein Wurf darf weder Zustimmung noch Einkommen ohne Gegenbuchung, einen Ausbildungsabschluss oder eine neue physische Anwesenheit erzeugen. Routine wird nicht willkürlich bei jeder Bewegung gewürfelt.</p>
<h3>Fünf Säulen statt einer Stimmungsskala</h3>${table(
  ["Säule", "Tatsächliche Eingänge", "Abgrenzung"],
  [
    [
      "P · Positive Emotionen",
      "Erlebte Freude, eigene Gefühlsdeutung, interessengerechte Aktivität, körperliche Belastung.",
      "Kurze Freude überschreibt nicht Beziehungen, Sinn und Können.",
    ],
    [
      "E · Engagement",
      "Tatsächlich ausgeübte, aktive oder passende Tätigkeiten, Lernen und eigene Aufgaben.",
      "Eine gekaufte Gitarre ist noch kein geübtes Instrument.",
    ],
    [
      "R · Relationships",
      "Akzeptierte eigene Kontakte, erhaltene Fürsorge, Konflikt und Reparatur.",
      "Ein Gerücht oder eine Geldspende erkauft keine Freundschaft.",
    ],
    [
      "M · Meaning",
      "Wirkliche eigene Zielschritte, Fürsorge und freiwilliger Beitrag.",
      "Keine pauschale Belohnung allein für Einkommen oder Besitz.",
    ],
    [
      "A · Accomplishment",
      "Tatsächlicher Fortschritt, Lernen und abgeschlossene Schritte.",
      "Ein Modell darf keinen beliebigen Erfolgswert einsetzen.",
    ],
  ],
)}
<p>Die Säulen sind normalisierte Spielwerte von 0 bis 1; der Mittelwert ist eine Übersicht, keine objektive Rangliste von Menschen. Die Grundwerte sind individuelle Spielparameter. Pro Quelle werden begrenzte Änderungen gespeichert, positive Tagesbeiträge auf 0,08 und negative auf 0,10 gedeckelt, mit säulenspezifischem zeitlichen Verfall. 128 jüngere Belege bleiben detailliert, ältere Beiträge bleiben bis zu 365 Tage in kompakten Tagesgruppen wirksam. Das vollständige Erlebnisjournal bleibt dauerhaft auf Platte.</p><p>Ruhige Gespräche können die eigene emotionale Bewertung verändern. Beim Löschen eines solchen Gesprächskanals werden dessen aktuelle und archivierte Beiträge entfernt, während spätere reale Aktivitäten und andere Gesprächskanäle erhalten bleiben. Ereignis-IDs werden bei Duplikation und Exportimport korrekt umgesetzt.</p><p class="tiny">Grundlage: <a href="https://ppc.sas.upenn.edu/node/708">University of Pennsylvania: PERMA-Theorie</a>. Diese Spielheuristik ersetzt nicht den <a href="https://ppc.sas.upenn.edu/node/375">validierten PERMA-Profiler</a> und ist keine psychologische Diagnose.</p></section>
<section id="tom"><h2>Private, probabilistische Theory of Mind</h2><p>Ein Sim erwägt mehrere Erklärungen gleichzeitig. Ein freundlicher Arbeitskontakt kann Hilfe, eine neue Aufgabe oder Kritik bedeuten. Ein eigenes Kind kann Unterstützung oder eine Erinnerung an die Hausaufgaben erwarten. Eine Gesprächseinladung ist keine sichere romantische Absicht. Alter, konkrete bekannte Verwandtschaft, eigener Charakter, Bedürfnisse, materielle Sorge und tatsächlich erkennbare Rollen bestimmen den Prior; die Gedanken des Gegenübers werden nicht gelesen.</p><p>Die typischen Hypothesen sind Unterstützung, Verpflichtung, Kritik, romantische Absicht und unbekannt. Die Wahrscheinlichkeiten werden normalisiert und maximal auf 0,85 konzentriert; unbekannt bleibt möglich. Eigene Rückmeldungen und erlaubte Beobachtungen aktualisieren das Modell, ältere Evidenz verliert über eine illustrative Halbwertszeit von drei Tagen Gewicht. Die zweite Ebene beschreibt nur: „Ich vermute, dass die andere Person mich so einschätzt“.</p><p>Höchstens 24 aktive Kontakte, je drei Themen und je acht Quellen verhindern ein unbegrenztes persönliches Allwissen. Private Absichten, Geld und Diagnosen werden nicht als allgemeine öffentliche Evidenz benutzt. Dritte erhalten nur tatsächlich zugängliche Ereignisse während ihrer Anwesenheit. Arbeitgeber können eigene dokumentierte Arbeitserfahrung bewerten; unbestätigte Gerüchte begründen kein automatisches Einstellungsverbot.</p><p>Der 600-Einträge-Katalog liefert alters- und kontextgeprüfte Themen, Erwartungsalternativen und konstruktive Gegenwege. Eine prozedurale Zeile „Gesprächsthema …“ ist ausdrücklich kein Beweis, dass der Beispiel-Auslöser passiert ist. Verpflichtungen, Rechnungen, Gegenstände, Geburtstag oder bekannte Beziehungen müssen real vorhanden sein, bevor sie als konkrete Ereignisse verwendet werden. Die vorhandenen sozialen Handlungen führen den Kontakt aus, statt jede Katalogzeile als eigenständige Weltmechanik zu behaupten.</p><p>Eigene Gedanken verbinden Wunsch, beobachtbare Lage, Unsicherheit und eine mögliche nächste Handlung. ToM kann Vorbereitung und Deutung verändern, aber keine Freiwilligkeit ersetzen. Ein Rückschlag kann Zweifel oder ein klärendes Gespräch bewirken, ohne die privaten Gefühle der anderen Person als Tatsache einzutragen.</p></section>
<section id="economy"><h2>Eine finanzierte Euro-Wirtschaft</h2><p>Alle Beträge sind ganzzahlige Centwerte. Jede Buchung hat mindestens zwei ausgeglichene Kontobeine und einen tatsächlichen Ursprung. Es gibt persönliche Konten, gemeinsam vereinbarte Haushaltsmittel, eingeschränkte Kautionen, Firmen, Banken und öffentliche Fonds. Ein deklarierter regionaler Außenbereich finanziert Anfangsbestände und begrenzte regionale Nachfrage; die Stadt ist damit eine nachvollziehbare offene Wirtschaft, kein geschlossenes Null-Einkommen-Spiel und keine Geldquelle des Storytellers.</p><p>Persönlicher Kontostand, gemeinsam verfügbarer Betrag, Immobilienwert und Schulden werden getrennt angezeigt. Kinder besitzen eigenes Erspartes und Taschengeld, bezahlen aber keine erfundenen Familienmieten. Erwachsene teilen nur vereinbarte Haushaltsmittel. Gemeinsame Ausgaben greifen erst nach vollständiger Deckungsprüfung auf die freigegebenen Beiträge zu; kleine persönliche Schutzreserven bleiben erhalten.</p><h3>Einnahmen, Kosten und Unsicherheit</h3><p>Die Prognose verbindet bestätigte Arbeitsverträge, bewilligte Betreuungshilfe, Pension und genehmigte Unterstützung mit Miete, Versorgung, erwarteter Nahrung, Raten und laufenden Abonnements. Sie zeigt 30/90 Tage als Erwartung, keine garantierte zukünftige Zahlung. Tatsächliche Löhne, Nebenverdienste, Mieten, Einkäufe und sonstige Bewegungen werden separat geführt. Offene Ansprüche, Rückstände, Kaution und zugeschriebener Status bleiben sichtbar.</p><p>Ausreichende Mittel können Sicherheit geben; ein realer Fehlbetrag oder eine zugestellte Mahnung erzeugt Sorge und neue Kandidaten wie Jobsuche, Training, günstigerer Konsum, Hilfe oder Wohnungswechsel. Diese Motive greifen in dieselben Bedürfnisse, Ambitionen, ToM und Gespräche ein. Finanzielle Not bedeutet keine vorbestimmte Kriminalität.</p><h3>Fiktiv am deutschen Modell orientierte Abgaben</h3>${table(
  ["Parameter", "Implementierter Spielwert"],
  [
    ["Währung", "EUR; integer cents"],
    [
      "Sozialbeiträge Arbeitnehmer / Arbeitgeber",
      "Je 20 % des tatsächlichen Bruttoentgelts, separat finanziert",
    ],
    [
      "Illustrative jährliche Einkommensteuer",
      "Bis 15.000 €: 0 %; 15.000–30.000 €: 20 %; 30.000–60.000 €: 30 %; darüber 45 %, marginale Bänder",
    ],
    [
      "Umsatzsteuer im Angebotskatalog",
      "0 %, 7 % oder 19 %; Wohnraummiete selbst 0 %",
    ],
    [
      "Mieteinnahmen",
      "Tatsächlich eingegangene, nach Kosten modellierte Überschüsse erzeugen eine Steuerforderung; kein pauschaler Umsatzsteueraufschlag auf private Wohnraummiete",
    ],
    [
      "Kranken- / Sozialfonds",
      "Eigene gedeckte Konten; Ärzte und Unterstützung erhalten tatsächliche Zahlungen",
    ],
    [
      "Öffentliche Arbeit",
      "Polizei, Feuerwehr, Verwaltung und ausgewählte Bildung aus Region; Gesundheitsberufe aus Gesundheitsfonds",
    ],
    [
      "Anfangsverteilung",
      "10 % finanziell knapp, 35 % untere Mitte, 45 % Mitte, 8 % obere Gruppe, 2 % sehr vermögend; Startverteilung, keine starre Kaste",
    ],
  ],
)}<div class="note warning">Abgabensätze, Fristen, Anspruchsbedingungen und rechtliche Abläufe sind ausdrücklich fiktive Simulationsregeln. Dies bildet weder geltendes deutsches Steuerrecht noch Miet-, Jugendarbeits- oder Sozialrecht vollständig ab. Die Regeln sind im Code und nicht in einem LLM-Prompt definiert.</div><p>Teilzahlungen reduzieren genau den offenen Anspruch. Zinsen werden bei Teilraten nur einmal anteilig verbucht. Wiederholte Lohnabrechnung im selben Monat darf einen neu erarbeiteten Anspruch nicht als angebliches Duplikat verwerfen. Jede wiederholte identische Zahlung bleibt idempotent. Eine insolvente Firma kann einen echten Lohnrückstand behalten, statt den Lohn kostenlos zu erzeugen.</p></section>
<section id="jobs"><h2>Arbeitsmarkt mit echten Bewerbungen</h2><p>30 Berufstypen erzeugen Firmen, Arbeitsorte, passende Stellen und begrenzte Plätze. Ein arbeitsloser erwachsener Sim sucht tagsüber höchstens einmal täglich bis zu fünf relevante Angebote. Es wird geprüft: eigene Nettoerwartung, erreichbarer Pendelweg, angemessene Fähigkeit, vorhandener Abschluss, bekannte Stelle und Platz, starker öffentlich belegter negativer Ruf oder ein aktueller eigener negativer Eindruck bei genau dieser Firma.</p><p>Eine private oder unbestätigte Behauptung sperrt keine Bewerbung. Ein hoher Fähigkeitswert stellt kein Zertifikat aus. Bei Ablehnung bleiben Grund und nächste Möglichkeiten wie Training oder andere Angebote im eigenen Kontext. Bei Annahme entstehen echter Vertrag, Arbeitsweg und Berufsroutine. Lohnansprüche werden nur für tatsächlich geleistete Zeit am Arbeitsplatz, innerhalb des Tageslimits, verbucht; Arbeit erhält einen eigenen W100-Versuch und eine dokumentierte Arbeitgebererfahrung.</p><p>Eltern kleiner Kinder können eine bewilligte, finanzierte Betreuungsphase haben. Sie erhalten deren eigene Leistung und betreuen das tatsächlich anwesende Kind, ohne gleichzeitig Vollzeitlohn für nie ausgeübte Arbeit zu erhalten. Unter 18 gibt es nur sichere Ferienhilfe ab 15, mit ausdrücklicher Bezugsperson-Erlaubnis, maximal vier Stunden täglich und 20 Arbeitstagen pro Jahr; der fiktive Ferienkalender und Werktage werden geprüft. Am 18. Geburtstag endet dieser Jugendvertrag; verdientes, noch nicht ausgezahltes Geld bleibt ein Anspruch.</p><p>Firmen kaufen und verkaufen reale Leistungen innerhalb begrenzter regionaler Nachfrage; Vorräte und Mittel sind begrenzt. Ein schlechter tatsächlicher Finanzstand kann offene Angebote oder Vertragsverlängerungen gefährden. Eine neue Stelle ist deshalb ein realer Handlungsweg und keine garantierte Lösung jedes Haushaltsdefizits.</p>${table(
  [
    "Berufstyp",
    "Relevante Fähigkeit",
    "Mindestwert",
    "Brutto/Monat",
    "Abschluss / Fonds",
  ],
  Object.entries(JOBS).map(([title, j]) => [
    title,
    SKILL_LABELS[j.skill] || j.skill,
    Math.round(j.minimum * 100) + " %",
    eur(j.gross),
    [j.credential, j.fund ? "Fonds: " + j.fund : "Privatfirma"]
      .filter(Boolean)
      .join(" · "),
  ]),
)}</section>
<section id="housing"><h2>Wohnen, Eigentum, Wohnwechsel und Kredit</h2><p>Jeder Haushalt bewohnt eine konkrete Immobilie mit realen Räumen. Eigentum ist von aktuellem Wohnort getrennt; ein Sim kann einen anderen Haushalt beherbergen und tatsächliche Mieteinnahmen erhalten. Leerstände werden nach Kapazität, Budget, Lage und Zustand angeboten, maximal fünf passende Kandidaten. Unvermietete Angebote können wöchentlich geringfügig günstiger werden; Eigentümer zahlen konkrete Instandhaltung aus vorhandenem Geld.</p><p>Ein Mietwechsel braucht freie Kapazität und die tatsächliche Kaution, entweder aus vereinbarten Haushaltsmitteln oder einem gedeckten Hilfefonds. Der Vertrag und ein zeitanteiliger erster Mietanspruch entstehen unmittelbar. Die Bewohner gehen danach tatsächlich durch den Graphen ins neue Zuhause. Erst wenn niemand mehr die alten Räume bewohnt, wird die alte Wohnung erneut angeboten, die gehaltene Kaution freigegeben und eine zeitanteilige Mietgutschrift geprüft. Eine unfinanzierte Rückzahlung bleibt ein Anspruch, kein neuer Kontostand.</p><p>Rückstand beginnt mit Erinnerung und Hilfeangebot, erst später folgen fiktive Kündigungs- und zivile Verfahrensstufen. Die Suche nach günstigerem Wohnraum berücksichtigt Haushalt und Kapazität. Falls keine Lösung möglich ist, bleiben betreute Notunterkunft, finanzierte Gemeinschaftsküche und für freiwillig wählende Erwachsene ein vorläufiges Camp. Familien mit Kindern werden nicht durch einen Zufallswurf auf die Straße gesetzt.</p><p>Ein Kauf verlangt verfügbare Mittel und Reserve. Eine Hypothek verlangt Eigenkapital, tragbare Rate, tatsächliche Bankdeckung und ausdrückliche Zustimmung; der Kredit finanziert den Kauf und bleibt separat als Schuld erhalten. Privatdarlehen brauchen zusätzlich eine tatsächliche bekannte Beziehung mit gegenseitigem Vertrauen und einen gedeckten Geldgeber. Zukünftige nur erhoffte Einnahmen sind keine vorhandenen Mittel.</p><p>Ein freiwilliges Zusammenziehen prüft alle beteiligten Erwachsenen, gegenseitiges Vertrauen, Zielwohnung und Kapazität. Gemeinsame Vorräte und offene Haushaltsforderungen werden nachvollziehbar vereinbart; persönliches und kindliches Geld wird nicht eingezogen. Die ursprünglichen Verträge bleiben im Verlauf und körperliche Wege werden weiter ausgeführt.</p></section>
<section id="life"><h2>Pflichten, Freizeit und besondere Gegenstände</h2><p>Die 100 Alltagspflichten werden über neun ausführbare Operatorfamilien umgesetzt: Haushalt, Wäsche, Essen, Lernen, Fürsorge, Arbeit, Finanzen, Nachbarschaft und Gemeinschaft. Konkrete Auslöser wie schmutziger Bereich, Vorrat, offene Rechnung, bestätigter Termin oder wirklich vorhandener Pflegebedarf werden geprüft. Aufgaben haben Ursprung, Zuständigkeit, Aufwand, Frist, Zustand und Fortschritt. Zusage, Ausführung, fehlende Mittel, Neuabstimmung, Ablehnung und tatsächlicher Abschluss sind getrennte Zustände.</p><p>Pro Tag gibt es eine begrenzte Zahl altersgerechter offener Aufgaben. Ein Sim muss nicht immer die identische Müllaufgabe abarbeiten; freiwillige soziale Ziele und Bedürfnisse bleiben handlungsfähig. Kleinkinder erhalten tatsächlich anwesende Betreuung, Nahrung aus vorhandenen Portionen und altersgerechte Fürsorge, statt bei einem öffentlichen leeren Kühlschrank endlos zu warten.</p><p>Freizeitangebote haben erreichbare Orte und den angegebenen echten Preis. Eine bezahlte Vormerkung ist keine schon ausgeführte Aktivität. Ein Spaziergang bleibt kostenlos; Café, Kino, Bad und Fitnessstudio können tatsächliche Kosten haben. Monatliche Mitgliedschaften rechnen nach 30 tatsächlichen Tagen erneut ab und können gekündigt werden; ohne Deckung entsteht eine Forderung statt unbegrenztem kostenlosen Zugang.</p><p>Besondere Gegenstände besitzen Besitzer, Kaufereignis und Nutzbarkeit. Lernen, Bewerbungen, Hobbys oder Statusdarstellung können sie wirklich verwenden. Eigentum allein verändert keinen PERMA-Erfolg und kauft keine Zuneigung. Schenkung und Leihe prüfen tatsächliche Nähe, Eigentum, Freigabe und Empfänger; Besitz und nur vorübergehender Zugriff bleiben getrennt.</p><details><summary>Alle 32 Angebote</summary>${table(
  ["Angebot", "Preisspanne", "Zugang", "Wirkung"],
  ACTIVITIES.map((a) => [
    a.name,
    eur(a.minCents) + " – " + eur(a.maxCents),
    a.access,
    a.effects,
  ]),
)}</details><details><summary>Alle 28 besonderen Gegenstände</summary>${table(
  ["Gegenstand", "Preisspanne", "Fähigkeiten", "Verwendung"],
  ITEMS.map((i) => [
    i.name,
    eur(i.minCents) + " – " + eur(i.maxCents),
    i.skills,
    i.use,
  ]),
)}</details></section>
<section id="community"><h2>Stadt, Knappheit, Bedrohungen, Nachrichten und Hilfe</h2><p>Marktbogen besitzt Straßen und zugängliche Gebäuderäume für Polizeiwache, Sozialberatung, Notunterkunft, Arbeitsbörse, Büro, Werkstatt, Laden, Freizeitstätten und Industrie. Vorhandene Schule, Bibliothek, Campus und andere öffentliche Orte bleiben mit Fluren und Fachräumen angebunden. Vorhandene Bild-Captions und Bibliothekszuordnung werden wiederverwendet; kein Tick erzeugt automatisch neue Bilder.</p><p>Wetter, Versorgung, Vorratsdruck, regionale Nachfrage und fällige Verpflichtungen bilden überprüfbare öffentliche Ereignisse. Die Preisreaktion bei knappem Vorrat ist begrenzt. Öffentliche Nachrichten beschreiben deren kanonische Fakten; private Bankstände, Gedanken, Diagnosen und unbelegte Täterbehauptungen werden nicht als Meldungen publiziert. Ein Sim kennt eine Meldung erst nach tatsächlichem Lesen oder einem zulässigen Gespräch. Aktuell bleiben 90 Meldungen verfügbar; ihre Ursprünge bleiben im Ereignisjournal.</p><p>Ein optionaler LLM-Kommentar wird separat und als Kommentar gespeichert. Er darf die ursprüngliche Meldung, den Kontostand oder das Ereignis nicht umschreiben. So können Nachrichten erzählerisch vielfältiger werden, ohne die Wirtschaft zu verändern. Freiwillige Hilfe, konkrete öffentliche Beiträge und beobachteter hilfreicher Kontakt erzeugen source-basierte Anerkennung. Reichtum, sichtbarer Besitz, Hilfsbereitschaft und Verlässlichkeit sind getrennte Größen.</p><p>Erwachsene können abstrakte, nicht anleitende Risiko- und Konfliktpfade besitzen. Ein ausgewiesener Erwachsenen-Gangkontakt kann einen konkreten, unsicheren Vorfall mit tatsächlichem erwachsenem Gegenüber, Verlust, privater Wahrnehmung und dokumentiertem Fall auslösen. Armut, Ethnie oder Geschlecht weisen niemandem eine kriminelle Rolle zu. Ein offener Fall ist kein Schuldspruch; diensthabende erwachsene Polizei prüft Fälle mit belegten Quellen und begrenztem Stundenbudget. Ohne ausreichenden Beleg wird kein Strafruf automatisch erfunden.</p><p>Substanzexpositionen sind nur für ausdrücklich freiwillig gewählte Erwachsene möglich, kosten tatsächliche Mittel und können graduelles Verlangen, gesundheitliche Sorge und Kostenkonflikte auslösen. Eigene Disposition beeinflusst Risiken; es gibt keine Konsumanleitung oder pauschale Erstkontakt-Abhängigkeit. Beratung wird an einem tatsächlich erreichbaren Ort mit finanzierter Leistung ausgeführt; Hilfe bewirkt graduelle Fortschritte statt sofortiger Heilung. Auch eigene Bedrohungseinschätzungen bleiben als Wahrscheinlichkeit mit Ursprung sichtbar.</p><p>Die optionale private Erwachsenen-Dienstleistungsrolle ist standardmäßig deaktiviert. Nur zwei tatsächlich privat anwesende, nicht verwandte, unabhängig und konkret zustimmende Erwachsene können einen nicht explizit beschriebenen Termin abrechnen. Rollenwahl, Geldnot, romantischer Bedarf oder ein W100-Wurf ersetzen keine konkrete Zustimmung. Steuern und Sozialforderungen auf tatsächliche eigene Einnahmen laufen über dieselbe Buchhaltung.</p></section>
<section id="safety"><h2>Verbindliche Alters- und Zustimmungsregeln</h2>${table(
  ["Gruppe", "Verbindliches Verhalten"],
  [
    [
      "Alle Altersgruppen",
      "Soziale Wärme ist von Romantischer Zuneigung getrennt. Freundschaft, Fürsorge, Spiel und Hilfe brauchen keine Romantik.",
    ],
    [
      "Unter 14",
      "Romantische Zuneigung immer genau 0. Keine romantischen oder sexuellen Interaktionen.",
    ],
    [
      "14–17",
      "Romantische Zuneigung höchstens 0,35. Ausschließlich seichte, nicht sexuelle Jugenddates und romantische Gespräche zwischen zwei 14–17-Jährigen mit maximal einem Jahr Altersunterschied.",
    ],
    [
      "Alle unter 18",
      "Keine sexuellen Handlungen, erotischen Gedanken oder sexualisierten Beschreibungen; keine Erwachsenen-Romantik, Erwachsenen-Dienstleistungsrolle, Gangrolle oder Substanzkonsumsimulation.",
    ],
    [
      "18+",
      "Höhere Romantikwerte und nicht explizite private Erwachsenen-Beziehungen sind möglich, nur mit unabhängiger Zustimmung, ohne Verwandtschaft und ohne minderjährige Zeugen.",
    ],
    [
      "Zustimmung",
      "Bedürfnisse, Attraktion, Vertrauen, Geld, Rollenwahl und Würfelerfolg erlauben keine erzwungene Interaktion. Ablehnung und Rückzug bleiben möglich.",
    ],
  ],
)}<p>Grenzen stehen in <code>config/living_social_policy.json</code>, <code>romance.js</code>, <code>romance_policy.py</code> und den Erweiterungsmodulen. Sie werden vor Aktionsauswahl, beim Storyteller-Auftrag, vor persistierter Prosa sowie bei Import und Geburtstag geprüft. Kommentare im Code benennen die Grenzen ausdrücklich. Die Textprüfung ergänzt strukturierte Alters- und Kontaktprüfungen; sie ist kein Ersatz für diese Regeln.</p></section>
<section id="architecture"><h2>Code, Daten, Migration und Export</h2><p>Die Erweiterung verwendet die bestehenden <code>lw_sims</code>, <code>lw_relations</code>, <code>lw_events</code>, <code>lw_journal</code>, <code>lw_beats</code> und realen Ortskanten. Vier zusätzliche indexierte Tabellen speichern Konten, typisierte Entitäten, Transaktionen und Kontobeine. Welt-ID und Eigentümerprüfung trennen Instanzen; Datenbank-Transaktionen, Versionprüfung und die vorhandene Busy-Sperre sichern atomare Schritte.</p><div class="grid">${[
  [
    "store",
    "Ganzzahlige, ausgeglichene und idempotente Geldbuchungen; typisierte indexierte Weltentitäten.",
  ],
  [
    "bootstrap",
    "Plausible Anfangsressourcen, Arbeitsorte, Stadtgraph und additive Migration vorhandener Welten.",
  ],
  ["finances", "Kalendermonate, tatsächliche Kontobeine, Planung und belegte Budgetgefühle."],
  ["education", "Bildungsbiografie, aktuelle Beschäftigung, reale Lernfortschritte und datierte Abschlüsse."],
  ["care", "Gewünschte Familienpflege vor Ort, finanzierte externe Hilfe und Pflegekosten."],
  ["applications", "Reproduzierbare, unsichere Bewerbungsentscheidungen, Fristen und eigene Ergebnisprotokolle."],
  [
    "economy",
    "Echte Lohnansprüche, Auszahlungen, Haushaltsprognosen, Einkäufe, Forderungen, Kredite, Fälligkeiten.",
  ],
  [
    "housing",
    "Wohnungsangebote, Eigentum, Kaution, physischer Umzug, Unterstützung und belegte Gutschriften.",
  ],
  [
    "life",
    "Altersgerechte Pflichten, reale Aufgabenfortschritte, Betreuung, Gegenstände und Mitgliedschaften.",
  ],
  [
    "tom",
    "Private hypothetische Modelle, Kontext, zulässige Quellen, Aktualisierung und Verfall.",
  ],
  [
    "community",
    "Öffentliche Nachrichten, Fonds, Versorgung, Ruf, Erwachsenenfälle und Unterstützung.",
  ],
  [
    "percentile",
    "Eigene Attribute, Fertigkeiten, reproduzierbarer W100 und quellenbasierte Übung.",
  ],
  [
    "index",
    "Integration aller Regeln in Wege, Aktionsauswahl, Storyteller-Kontext und gemeinsame Ticks.",
  ],
]
  .map(
    ([name, desc]) =>
      '<article class="card"><h3>' +
      file(name) +
      "</h3><p>" +
      desc +
      "</p></article>",
  )
  .join(
    "",
  )}</div><p>Weitere Module sind <code>households</code>, <code>leisure</code>, <code>adult-services</code>, <code>population</code>, <code>view</code> und <code>import</code>. <code>server/routes/expanded.js</code> stellt authentifizierte eigene Ressourcen und Entscheidungen bereit. <code>web/living-economy.js/.css</code> integrieren die acht City-Ansichten und Profilressourcen.</p><p>Die additive v5-Migration legt fehlende öffentliche Struktur und neue Regelquellen an, ohne erlebte Geschichte, Kontostände oder Uhrzeit neu zu würfeln. Vor dem Upgrade wird eine Sicherung der Laufzeitdatenbank erstellt. Bestehende authored Biografien bleiben erhalten. Initiale Fähigkeiten und Ressourcen sind als Ausgangsstand gekennzeichnet und keine rückwirkend bezeugten Erlebnisse.</p><p>ZIP-Export und Duplikation enthalten auch alle vier Geldtabellen, Ereignisreferenzen, Aufgaben, Hypothesen, Besitz und Verträge. Import setzt IDs neu, prüft ausgeglichene Transaktionen und die Übereinstimmung von Kontobeinen und Kontoständen, eigene Referenzen sowie Altersgrenzen. Kaputte Importe werden insgesamt zurückgerollt. Login-Zugangsdaten und Provider-Schlüssel gehören nicht in Szenarioexporte.</p><p>Rotierende längere Journal-Arrays nutzen reversibel gespeicherte <code>array_shift_append</code>-Patches mit entfernten und hinzugefügten Segmenten statt jedes Mal zwei vollständige Ringe. Der aktuelle persistierte Sim-Zustand bleibt maßgeblich; ein physischer Living-World-Rewind samt vollständiger Wirtschafts-Replay-Oberfläche ist weiterhin kein vorhandenes Produktmerkmal.</p></section>
<section id="tests"><h2>Geprüfte Wirkung und gemessene Grenzen</h2>${table(
  ["Prüfung", "Was geprüft wird"],
  [
    [
      "test:expanded",
      "Tatsächliche Arbeit, Bedarf, Aufgaben, Privatheit, belegte Nachrichten, Quellen und Geldbilanz.",
    ],
    [
      "test:expanded-semantics",
      "37 Invarianten plus qualifizierte Bewerbungen, Rufprivatheit, tatsächliche Nahrung, gedeckte Darlehen, physische Umzüge, gesamter Tick-Abbruch, vollständiger Export und Importkorruption.",
    ],
    [
      "test:expanded-lifecycle",
      "Kalenderabos, Umsatzsteuer, Teilzins, mehrfache echte Lohnansprüche, Jugendvertrag/Geburtstag, tatsächliche Ferienarbeit, Polizeidienst, Mietgutschrift, reversible Journalringe, Archiv-PERMA, Migration und freiwilliges Zusammenziehen.",
    ],
    [
      "Bestehende Living-Tests",
      "Anker, ursprünglicher Play-/Mind-Ablauf, ruhige Gespräche, Biografien, soziale Kontakte, Altersgrenzen, Provider, Storage und Musik.",
    ],
    [
      "review:expanded",
      "Desktop und 390-Pixel-Mobilansicht, acht City-Bereiche, Monatsbuchungen und Rücklagen, Bildungswege und Pflege, originale Profil-/Play-/Mind-Navigation, echte Einstellungen und Fehlermeldungen ohne Browserfehler.",
    ],
    [
      "Realer Providerlauf",
      "Ruhige Gedanken-/Figurengespräche und echter Fünf-Minuten-Storyteller mit Intervention auf einer isolierten Kopie; Original unverändert.",
    ],
    [
      "benchmark:expanded",
      "Je 10, 20, 50, 100 und 500 Sims: fünf kurze Ticks und 24 simulierte Stunden, ohne Providerlatenz.",
    ],
  ],
)}
<h3>Prozedurale Messung</h3>${table(
  [
    "Sims",
    "Haushalte",
    "Orte",
    "5-Minuten-Tick: Median",
    "24 Stunden",
    "Prozess-RSS",
    "SQLite kumulativ",
  ],
  benchmark.results.map((r) => [
    r.population,
    r.households,
    r.locations,
    r.fiveMinuteMedianMs + " ms",
    (r.dayMs / 1000).toFixed(2) + " s",
    r.rssMiB + " MiB",
    (r.databaseBytes / 1024 / 1024).toFixed(1) + " MiB",
  ]),
)}<p>Messlauf: ${e(benchmark.generatedAt)}, Node ${e(benchmark.node)}. Die einzelnen Teststädte wurden nacheinander im selben Prozess und derselben Testdatenbank behalten; RSS und SQLite-Größe sind deshalb kumulativ. Die 500er-Stadt umfasst 200 Haushalte. Alle gemessenen Welten hatten ausgeglichene Kontobuchungen. Beim 500er-Lauf waren zur späten Abend- und folgenden Morgenstichprobe keine Bedürfnisse am kritischen Anschlag; vorübergehender Durst während Wegen bleibt als tatsächlicher Zustand sichtbar.</p><p>Vollständige Daten: <a href="../artifacts/living-world/benchmark-expanded.json">Benchmark-JSON</a>. Das ist ein lokaler prozeduraler Funktions- und Lasttest, kein universeller Laufzeitwert. Modell-, Bild-, Sprach- und Musiklatenzen kommen bei deren tatsächlicher Nutzung hinzu. 500 Sims sind spielbar; rund eine Sekunde für fünf Minuten und rund 131 Sekunden für einen ganzen Tag machen die Kosten sichtbar.</p><div class="note warning">Die heutigen 500 Sims beweisen keine Millionenstadt. Ausführliche dauerhaft gespeicherte Journale wachsen deutlich; im kumulativen Test lag SQLite bei rund 500 MiB und der Prozess bei rund 1,1 GiB. Ereignisgesteuerte Aktivierung, kalte komprimierte Historie, paginierter Sim-Zustand und Partitionierung sind vor größeren Welten erforderlich. Diese Architekturarbeit wird nicht als bereits implementiert ausgegeben.</div><p>World rendert nur eine begrenzte sichtbare Auswahl: maximal 50 Bild-Thumbnails inklusive Sim-Vorschauen, ältere Expansionen werden bei Budgetdruck kollabiert, nicht sichtbare Bilder entfernt, maximal 180 sichtbare Graphknoten. Weitere Bewohner werden als Text und einfache Formen dargestellt. City-Picker zeigen bis zu zwölf Ergebnisse; ToM, PERMA und Nachrichten haben feste Hot-State-Grenzen. Es werden niemals 500 Bewohnerbilder zugleich angefordert.</p><h3>Konkrete Produktgrenzen</h3><p>Die tatsächlichen 100 Aufgaben nutzen neun Operatorfamilien; nicht jeder im Entwurf erwähnte Gegenstand hat eigene physikalische Animation. Die 600 Sozialbeispiele erweitern kontextgeprüfte Gespräche und Erwartungen, nicht 600 unabhängige Skriptwelten. Kriminalität und zivile Klärung sind abstrakte fiktive Abläufe, kein vollständiges Strafgerichtssystem; Wahlen, umfassende Versicherungsansprüche, autonome Feuerwehr-Einsatzsimulation und detaillierte Scheidung/Sorgerecht sind nicht als fertige Systeme ausgewiesen. Die Szene beschreibt nicht grafisch darstellbare Handlungen in Text. Kontinuierliche Echtzeitbewegung und verteilte Millionenstädte bleiben Ausbauarbeit.</p></section>
<section id="catalogs"><h2>Anhang · die 100 ausführbaren Alltagspflichten</h2><p>Diese Tabelle wird direkt aus dem tatsächlich verwendeten Katalog aufgebaut. Der Operator legt die sichere aktuelle Ausführung fest; die redaktionellen Beispiele beschreiben die möglichen Bedingungen, nicht erfundene Vergangenheit. Positive Kooperation und begründete Ablehnung sind gleichwertig mögliche Ausgänge.</p>${table(
  [
    "ID / Titel",
    "Bedingung und Beschreibung",
    "Ausführung",
    "Auflösung / Auswirkungen",
  ],
  DUTIES.map((d) => [
    d.id + " · " + d.title,
    d.trigger + " " + d.description,
    JSON.stringify(d.execution),
    d.resolution + " " + d.effects,
  ]),
)}<p>Die vollständigen wechselseitigen Erwartungsbeispiele, Generationskontakte, Erwachsenen-Datingkontexte und Verhandlungssituationen stehen in <a href="living-world-social-tom-plan.html#catalog">der ursprünglichen Taxonomie</a> und <a href="living-world-social-taxonomy.json">dem 600-Einträge-JSON</a>. Der wirtschaftliche Entwurf bleibt als <a href="living-world-economy-design.json">Design-JSON</a> erhalten; der aktive Regelstatus steht im importierten Laufzeitkatalog.</p></section><footer class="tiny">Reproduzierbar aus Laufzeitkatalogen mit <code>node scripts/build-expanded-report.mjs</code>. Keine API-Schlüssel, realen persönlichen Finanzen oder privaten Nutzerzugänge in diesem Dokument.</footer></main></body></html>`;
fs.writeFileSync(new URL("docs/living-world-expanded.html", root), html + "\n");
console.log(
  "Built docs/living-world-expanded.html from active catalogs and recorded benchmark.",
);
