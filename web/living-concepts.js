/* Small, local learning cards; no translation or analytics service is needed. */
"use strict";
const EX_CONCEPTS = {
  perma: [
    "PERMA · fünf Seiten des Wohlbefindens",
    "Seligmans Modell unterscheidet Positive Gefühle, Engagement, Beziehungen, Sinn und Erreichen eigener Ziele. Ein Sim kann Freude erleben und sich trotzdem einsam fühlen.",
    "Die fünf Spielwerte ändern sich durch dokumentierte Erfahrungen. Sie sind keine klinische Messung und kein Urteil über den Wert eines Menschen.",
    "https://ppc.sas.upenn.edu/node/708",
  ],
  P: [
    "P · Positive Gefühle",
    "Freude, Dankbarkeit und Ruhe sind Beispiele für positive Gefühle. Belastende Erfahrungen können diesen Bereich zeitweise drücken.",
    "Sicherheit durch einen finanziellen Puffer wirkt hier moderat; Geld erzeugt nicht automatisch Glück.",
  ],
  E: [
    "E · Engagement / Vertiefung",
    "Vertiefung entsteht, wenn eine Aufgabe Aufmerksamkeit bindet und zu Können und Interessen passt. Eine gute Herausforderung ist weder dauernde Überforderung noch bloßes Warten.",
    "Tatsächliches Lernen, Handwerk und konzentrierte Tätigkeiten können E stärken.",
  ],
  R: [
    "R · Beziehungen",
    "Verlässliche, freiwillige Nähe und gegenseitige Unterstützung tragen zum Wohlbefinden bei. Die Anzahl von Kontakten allein sagt wenig über ihre Qualität aus.",
    "Erlebte Zuwendung, Freundschaft und gewünschte Betreuung beeinflussen R.",
  ],
  M: [
    "M · Meaning / Sinn",
    "Sinn bedeutet, das eigene Tun als bedeutsam und mit etwas über die unmittelbare Belohnung hinaus verbunden zu erleben. Das kann Familie, Gemeinschaft, Kreativität oder eine persönliche Aufgabe sein.",
    "Tatsächliche Hilfe und persönlich wichtige Tätigkeiten stärken M. Ein höherer Kontostand tut das allein nicht.",
  ],
  A: [
    "A · Accomplishment / Ziele erreichen",
    "Es geht um erlebten Fortschritt und das Meistern eigener Aufgaben. Erfolge müssen nicht prestigeträchtig oder öffentlich sichtbar sein.",
    "Dokumentierte Lernschritte und bewältigte Vorhaben beeinflussen A; ein Rückschlag löscht frühere Erfolge nicht.",
  ],
  self_efficacy: [
    "Selbstwirksamkeit",
    "Die Überzeugung, mit eigenem Handeln eine konkrete Herausforderung bewältigen zu können. Diese Einschätzung unterscheidet sich von der tatsächlich vorhandenen Fertigkeit.",
    "Eigene gelungene Versuche, Rückschläge und Hilfe verändern die Erwartungen des Sims. Selbstwirksamkeit ist situationsbezogen.",
    "https://dictionary.apa.org/self-efficacy",
  ],
  gross: [
    "Brutto",
    "Der vereinbarte Lohn vor Einkommensteuer und Arbeitnehmerbeiträgen. Arbeitgeberbeiträge kommen im Spiel gesondert hinzu.",
    "Der Bruttobetrag wird nicht vollständig auf dem Konto verfügbar. Die Simulation verwendet fiktive, vereinfachte Abzüge.",
    "https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Lohnsteuer/lohnsteuer.php",
  ],
  net: [
    "Netto",
    "Der ausgezahlte Lohn nach den berücksichtigten Abzügen. Erwartetes Netto ist eine Prognose; verfügbares Netto setzt tatsächliche Auszahlung voraus.",
    "In der Monatsauswertung zählen eingegangene Beträge. Steuer und Beiträge werden nicht nochmals von diesem Netto abgezogen.",
  ],
  cold_rent: [
    "Kaltmiete",
    "Die Miete für die Wohnung ohne Betriebs- und Heizkosten. Strom und weitere Verträge können zusätzlich anfallen.",
    "Die Wohnungsbörse zeigt Kaltmiete und Kaution. Prüfe die zusätzlichen Nebenkosten im Finanzplan.",
    "https://www.bpb.de/kurz-knapp/zahlen-und-fakten/sozialbericht-2024/553255/mieten-und-wohnkosten/",
  ],
  warm_rent: [
    "Warmmiete & Nebenkosten",
    "Zur Kaltmiete kommen umlagefähige Betriebskosten und Heizkosten. Ein Warmmietbetrag deckt nicht automatisch jeden privaten Vertrag ab, etwa Haushaltsstrom.",
    "Hier werden Nebenkosten und Heizkosten in einem vereinfachten Budget zusammengefasst; dies ist keine echte Nebenkostenabrechnung.",
  ],
  health_insurance: [
    "Krankenversicherung",
    "Die gesetzliche Krankenversicherung organisiert solidarisch den Zugang zu Gesundheitsleistungen. Beiträge und konkrete Leistungen folgen eigenen Regeln.",
    "Im Spiel werden Gesundheitsmittel getrennt von der Stadtkasse verbucht. Die fiktiven Beiträge ersetzen keine echten deutschen Beitragssätze.",
    "https://www.bundesgesundheitsministerium.de/gkv/seite",
  ],
  social_insurance: [
    "Sozialabgaben",
    "Sozialversicherung umfasst unterschiedliche Sicherungssysteme, etwa Krankheit, Pflege, Rente und Arbeitslosigkeit. Abgaben sind nicht dasselbe wie Einkommensteuer.",
    "Die vereinfachte Lohnabrechnung trennt Arbeitnehmerbeiträge, Arbeitgeberbeiträge und Steuer. Nicht jeder Beitrag gehört dem Rathaus.",
  ],
  reserve: [
    "Reserve für Ungeplantes",
    "Eine Rücklage schafft Spielraum für Reparaturen, notwendige Anschaffungen oder einen Einkommensausfall. Ihre sinnvolle Höhe hängt von den tatsächlichen Verpflichtungen ab.",
    "Die monatliche Rücklagenplanung reduziert den frei verplanten Spielraum. Sie bucht kein Geld ab und legt es nicht doppelt auf ein zweites Konto; Zielpuffer hier: zwei Monatskosten, mindestens 500 €.",
  ],
  projection: [
    "Prognose · kein Zahlungseingang",
    "Eine Prognose rechnet mit vereinbarten Einnahmen und erwarteten Kosten. Arbeitsleistung, verfügbare Arbeitgebermittel und unerwartete Ereignisse können das Ergebnis ändern.",
    "Nächster Monat: heutige zugängliche Mittel plus erwartete Einnahmen minus Kosten, offene Forderungen und geplante Rücklage. Andere private Konten bleiben privat.",
  ],
  liquidity: [
    "Liquidität",
    "Geld, das aktuell zum Bezahlen zugänglich ist. Immobilienwert, erwarteter Lohn und eine gebundene Kaution sind keine sofort verfügbaren Zahlungsmittel.",
    "Die kombinierte Ansicht berücksichtigt das eigene und das gemeinsame Konto. Interne Überweisungen zwischen beiden erzeugen kein Einkommen.",
  ],
  deposit: [
    "Kaution",
    "Eine Sicherheit für den Mietvertrag. Sie bleibt gebunden und ist weder verbrauchtes Essen noch frei verfügbare Ersparnis.",
    "Die Kaution wird separat verbucht; bei ordnungsgemäßem Vertragsende erfolgt eine dokumentierte Rückgabe. Eine Absage löst keine Kautionszahlung aus.",
  ],
  credit: [
    "Kredit · Rate & Zins",
    "Eine Auszahlung schafft Geld und zugleich eine Rückzahlungspflicht. Die Rate kann Tilgung und Zins enthalten.",
    "Kreditauszahlungen sind keine verdienten Einnahmen. Laufende Raten stehen in der Kostenplanung; eine Finanzierung erfordert gedeckte Mittel und Zustimmung.",
  ],
  arrears: [
    "Offene Verpflichtungen",
    "Unbezahlte, bereits entstandene Rechnungen sind von erst geplanten Kosten zu unterscheiden. Ein Engpass verlangt Klärung, Hilfe oder eine neue Vereinbarung.",
    "Die Prognose berücksichtigt bestehende Forderungen zusätzlich zu den zukünftigen Monatskosten.",
  ],
  care: [
    "Pflege & selbstbestimmte Unterstützung",
    "Unterstützungsbedarf ist individuell und macht einen älteren Menschen nicht automatisch unfähig oder willenlos. Familienpflege braucht Vereinbarung, Zeit und Entlastung.",
    "Einige Sims haben häusliche Pflege, andere wohnen im Seniorenhaus Lindenblick. Angehörige besuchen tatsächlich; professionelle Dienste sind ausdrücklich bezahlte externe Leistungen.",
  ],
  care_insurance: [
    "Pflegeversicherung & Eigenanteil",
    "Die Pflegeversicherung trägt einen Teil vereinbarter Pflegeleistungen. Weitere Kosten können als Eigenanteil verbleiben.",
    "Beiträge und Unterstützungsstufen im Spiel sind fiktiv und keine amtlichen Pflegegrade. Der Eigenanteil erscheint als eigene Rechnung.",
    "https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung",
  ],
  education: [
    "Bildungsweg & Nachweise",
    "Ein Bildungsweg benennt Institution, Zeitraum, Fach, Abschluss und gegebenenfalls ein Ergebnis. Eingeschrieben sein bedeutet noch nicht, den Abschluss erworben zu haben.",
    "Anfangsbiografien sind als prozedural ergänzt gekennzeichnet. Neue Abschlüsse erfordern später tatsächlich dokumentiertes Lernen und ausreichende Anwesenheit; eine Biografie erteilt keine Berufszulassung.",
  ],
  grade: [
    "Ergebnis / Schulnote",
    "Ein Ergebnis beschreibt eine bestimmte Bildungsleistung, nicht die ganze Person. In der hier verwendeten Skala ist eine kleinere Zahl besser.",
    "Noten im ergänzten Hintergrund sind fiktiv. Kindergartenzeit wird nicht benotet. Tatsächliche neue Ergebnisse beruhen auf Lernschritten und Können.",
  ],
  application: [
    "Bewerbung & Auswahl",
    "Eine passende Qualifikation eröffnet eine Chance, garantiert aber keinen Vertrag. Ein Verfahren kann auch bei erfüllten Voraussetzungen mit einer Absage enden.",
    "Stellen berücksichtigen Können, passenden Bildungsweg und belegte Erfahrungen dieser Firma. Wohnungen berücksichtigen offengelegte Finanzierung, Kaution und belegte Zuverlässigkeit. Erneute Bewerbung erst nach sieben Tagen; eine Absage verändert weder Vertrag noch Guthaben.",
  ],
  probability: [
    "Wahrscheinlichkeit",
    "Ein geschätzter Wert beschreibt eine Chance unter den aktuellen Annahmen. Er beweist keine Absicht und garantiert kein Ergebnis.",
    "Bewerbungen verwenden einen reproduzierbaren W100-Wurf. So lässt sich derselbe Antrag nicht durch wiederholtes Klicken neu würfeln.",
  ],
  tom: [
    "Theory of Mind · soziale Sicht",
    "Menschen versuchen, Wünsche, Wissen und Absichten anderer einzuschätzen. Diese Vermutungen sind fehlbar und werden durch eigene Erfahrungen und aktuelle Bedürfnisse gefärbt.",
    "Der Sim trennt Beobachtung, mögliche Deutung, eigene Wünsche und offene Fragen. Ein vermutetes Interesse ist keine tatsächliche Zustimmung.",
  ],
  emotion: [
    "Gefühle & ihre Intensität",
    "Gefühle reagieren auf Bedürfnisse, Erwartungen und erlebte Situationen. Mehrere Gefühle können gleichzeitig auftreten und im Lauf der Zeit schwächer werden.",
    "Die Prozentzahl zeigt die Intensität im Spiel, keine Wahrscheinlichkeit und keine psychologische Diagnose. Quelle und Dauer werden im inneren Protokoll festgehalten.",
  ],
  need: [
    "Bedürfnisse · Dringlichkeit",
    "Ein hoher Wert bedeutet hier ein stärkeres unbefriedigtes Bedürfnis, nicht eine bessere Versorgung. Bedürfnisse können Gefühle und Entscheidungen beeinflussen.",
    "Essen, Schlaf und gewünschte soziale Nähe senken die jeweilige Dringlichkeit nur durch tatsächlich ausgeführte Handlungen.",
  ],
  romantic_affection: [
    "Romantische Zuneigung",
    "Ein Wunsch nach romantischer Nähe ist von sozialer Wärme und von Zustimmung zu einer konkreten Handlung zu unterscheiden.",
    "Unter 14 immer 0; 14–17 höchstens 0,35 und ausschließlich harmlose Jugendromanzen mit höchstens einem Jahr Altersabstand. Sexuelle Interaktionen mit Minderjährigen sind ausgeschlossen. Erwachsene dürfen höhere Werte haben; Zustimmung bleibt separat erforderlich.",
  ],
  social_warmth: [
    "Soziale Wärme",
    "Der Wunsch nach verlässlichem Kontakt, Zugehörigkeit und freundlicher Nähe kann in jedem Alter bestehen. Er setzt weder eine Romanze noch Sexualität voraus.",
    "Familienkontakte, Freundschaft, gewünschte Hilfe und Gespräche können soziale Wärme geben.",
  ],
  skill: [
    "Fertigkeit",
    "Geübtes praktisches Können in einem konkreten Bereich. Es unterscheidet sich von Persönlichkeit, Vermögen und einem formalen Abschluss.",
    "Tatsächliches Üben verändert Fertigkeiten. Anforderungen einer Stelle und W100-Versuche beziehen sie ein.",
  ],
  attribute: [
    "Persönliches Attribut",
    "Eine vergleichsweise stabile Voraussetzung, etwa Aufmerksamkeit oder Ausdauer. Sie beschreibt eine Stärke in einem Bereich, nicht den Wert des Sims.",
    "Attribute und geübte Fertigkeiten wirken gemeinsam; Bedürfnisse und Belastung verändern die aktuelle Leistung.",
  ],
  goal: [
    "Ambition & Fortschritt",
    "Eine Ambition beschreibt, was dem Sim längerfristig wichtig ist. Fortschritt entsteht durch dazu passende Erfahrungen.",
    "Ein Ziel kann mit Geld, Lernen, Beziehungen, Kreativität oder Stabilität zusammenhängen; nicht jedes erfüllte Bedürfnis erfüllt automatisch jedes Ziel.",
  ],
  reputation: [
    "Ansehen · bekannte Quellen",
    "Ansehen entsteht aus sichtbaren Handlungen und den Erfahrungen anderer. Besitz, Hilfsbereitschaft und Zuverlässigkeit sind unterschiedliche Dimensionen.",
    "Firmen berücksichtigen belegte Erfahrungen. Unbestätigte Gerüchte und private Gedanken werden nicht automatisch als Schuld oder mangelndes Können behandelt.",
  ],
  w100: [
    "W100 · ein Versuch mit Unsicherheit",
    "Ein Wurf von 1 bis 100 wird mit einem Zielwert aus Können, Attributen und situativer Belastung verglichen.",
    "Ein gutes Ergebnis ist eine gelungene Ausführung. Es ersetzt niemals die Zustimmung eines anderen Sims.",
  ],
  status: [
    "Aktuelle Beschäftigung & Betreuung",
    "Diese Anzeige unterscheidet Beruf, Schule, Studium, Arbeitssuche, Ruhestand und vereinbarte Betreuung. Sie ist unabhängig davon, in welchem Raum der Sim gerade steht.",
    "Ein Sim kann angestellt sein und gerade zu Hause sein. Eine Betreuungspause und häusliche Familienpflege werden getrennt von einem neuen Arbeitsvertrag geführt.",
  ],
  amusement: [
    "Unterhaltung",
    "Unterhaltung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  elation: [
    "Hochgefühl",
    "Hochgefühl benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  pleasure_ecstasy: [
    "Lustgefühl/Ekstase",
    "Lustgefühl/Ekstase benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  contentment: [
    "Zufriedenheit",
    "Zufriedenheit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  thankfulness_gratitude: [
    "Dankbarkeit",
    "Dankbarkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  affection: [
    "Zuneigung",
    "Erlebte freundliche oder familiäre Nähe kann Zuneigung auslösen. Sie ist nicht automatisch romantisch oder sexuell.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  infatuation: [
    "Verliebtheit",
    "Verliebtheit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  hope_enthusiasm_optimism: [
    "Hoffnung/Begeisterung/Optimismus",
    "Hoffnung/Begeisterung/Optimismus benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  triumph: [
    "Triumph",
    "Triumph benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  pride: [
    "Stolz",
    "Ein eigener gelungener Schritt kann Stolz auslösen. Erfolg darf anerkannt werden, ohne andere abzuwerten.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  interest: [
    "Interesse",
    "Interesse benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  awe: [
    "Ehrfurcht",
    "Ehrfurcht benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  astonishment_surprise: [
    "Erstaunen/Überraschung",
    "Erstaunen/Überraschung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  concentration: [
    "Konzentration",
    "Konzentration benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  contemplation: [
    "Nachdenken",
    "Nachdenken benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  relief: [
    "Erleichterung",
    "Wenn Belastung nachlässt oder Unterstützung wirklich ankommt, kann Erleichterung entstehen. Sie ist von der langfristigen finanziellen Sicherheit zu unterscheiden.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  longing: [
    "Sehnsucht",
    "Sehnsucht benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  teasing: [
    "Neckerei",
    "Neckerei benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  impatience_and_irritability: [
    "Ungeduld und Reizbarkeit",
    "Ungeduld und Reizbarkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  sexual_lust: [
    "Sexuelle Lust",
    "Sexuelle Lust benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  doubt: [
    "Zweifel",
    "Unsichere Informationen und knappe Spielräume können Zweifel auslösen. Nachfragen und ein überprüfbarer Plan können helfen.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  fear: [
    "Angst",
    "Eine erwartete Bedrohung kann Aufmerksamkeit auf Schutz und Hilfe lenken. Die Bedrohung kann real sein oder überschätzt werden.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  distress: [
    "Belastung",
    "Belastung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  confusion: [
    "Verwirrung",
    "Verwirrung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  embarrassment: [
    "Verlegenheit",
    "Verlegenheit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  shame: [
    "Scham",
    "Ein ungünstiges Urteil über die eigene Person kann Scham auslösen. Ein Fehler oder Geldmangel vermindert nicht den menschlichen Wert.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  disappointment: [
    "Enttäuschung",
    "Wenn ein gewünschtes Ergebnis ausbleibt, kann Enttäuschung entstehen. Eine Absage sagt nicht, dass alle weiteren Versuche scheitern werden.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  sadness: [
    "Traurigkeit",
    "Traurigkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  bitterness: [
    "Bitterkeit",
    "Bitterkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  contempt: [
    "Verachtung",
    "Verachtung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  disgust: [
    "Ekel",
    "Ekel benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  anger: [
    "Ärger",
    "Ein erlebter Konflikt oder eine verletzte Grenze kann Ärger auslösen. Ärger erlaubt nicht automatisch Aggression oder Grenzverletzungen.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  malevolence_malice: [
    "Böswilligkeit",
    "Böswilligkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  sourness: [
    "Säuerlichkeit",
    "Säuerlichkeit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  pain: [
    "Schmerz",
    "Schmerz benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  helplessness: [
    "Hilflosigkeit",
    "Wenn eigene Handlungsmöglichkeiten fehlen oder so erscheinen, kann Hilflosigkeit entstehen. Verfügbare Unterstützung und kleine machbare Schritte können Spielraum schaffen.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  fatigue_exhaustion: [
    "Müdigkeit/Erschöpfung",
    "Müdigkeit/Erschöpfung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  emotional_numbness: [
    "Emotionale Taubheit",
    "Emotionale Taubheit benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  intoxication_altered_states_of_consciousness: [
    "Rausch/Bewusstseinsveränderung",
    "Rausch/Bewusstseinsveränderung benennt einen möglichen Gefühls- oder Aufmerksamkeitszustand. Sein Anlass hängt von der erlebten Situation, den Bedürfnissen und der eigenen Deutung ab.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
  jealousy_envy: [
    "Eifersucht und Neid",
    "Vergleiche oder die Sorge um eine wichtige Beziehung können Eifersucht oder Neid auslösen. Dieses Gefühl beweist kein Fehlverhalten des Gegenübers.",
    "Die angezeigte Intensität ist ein veränderlicher Spielwert. Eine einzelne Anzeige ist keine Diagnose; eigene Ereignisquellen bleiben entscheidend.",
  ],
};
const EX_CONCEPT_ALIASES = {};
Object.assign(EX_CONCEPT_ALIASES, {
  PERMA: "perma",
  Meaning: "M",
  Sinn: "M",
  "Positive Gefühle": "P",
  Vertiefung: "E",
  Engagement: "E",
  Beziehungen: "R",
  "Ziele erreichen": "A",
  Selbstwirksamkeit: "self_efficacy",
  Brutto: "gross",
  Netto: "net",
  Kaltmiete: "cold_rent",
  Miete: "cold_rent",
  Warmmiete: "warm_rent",
  Nebenkosten: "warm_rent",
  Krankenversicherung: "health_insurance",
  Sozialabgaben: "social_insurance",
  Rücklage: "reserve",
  Reserve: "reserve",
  Liquidität: "liquidity",
  Kaution: "deposit",
  Kredit: "credit",
  Bildungsweg: "education",
  Schule: "education",
  Studium: "education",
  Ausbildung: "education",
  Pflege: "care",
  "Soziale Wärme": "social_warmth",
  "Romantische Zuneigung": "romantic_affection",
  W100: "w100",
  Ansehen: "reputation",
  Hilfsbereitschaft: "reputation",
  Verlässlichkeit: "reputation",
  "Öffentliche Anerkennung": "reputation",
  "Sichtbarer Besitz": "reputation",
  "Fähigkeiten & Attribute": "attribute",
  "Persönliche Attribute": "attribute",
  "Eigene Ziele": "goal",
  Bedürfnisse: "need",
  "Soziale Sicht": "tom",
  "Theory of Mind": "tom",
  Arbeitssuchend: "status",
  Ruhestand: "status",
  Kindergarten: "status",
  "Angenommene Aufgaben": "goal",
  Hunger: "need",
  Durst: "need",
  Müdigkeit: "need",
  Hygiene: "need",
  Komfort: "need",
  Sicherheit: "need",
  Unterhaltung: "amusement",
  Amusement: "amusement",
  Hochgefühl: "elation",
  Elation: "elation",
  "Lustgefühl/Ekstase": "pleasure_ecstasy",
  "Pleasure/Ecstasy": "pleasure_ecstasy",
  Zufriedenheit: "contentment",
  Contentment: "contentment",
  Dankbarkeit: "thankfulness_gratitude",
  "Thankfulness/Gratitude": "thankfulness_gratitude",
  Zuneigung: "affection",
  Affection: "affection",
  Verliebtheit: "infatuation",
  Infatuation: "infatuation",
  "Hoffnung/Begeisterung/Optimismus": "hope_enthusiasm_optimism",
  "Hope/Enthusiasm/Optimism": "hope_enthusiasm_optimism",
  Triumph: "triumph",
  Stolz: "pride",
  Pride: "pride",
  Interesse: "interest",
  Interest: "interest",
  Ehrfurcht: "awe",
  Awe: "awe",
  "Erstaunen/Überraschung": "astonishment_surprise",
  "Astonishment/Surprise": "astonishment_surprise",
  Konzentration: "concentration",
  Concentration: "concentration",
  Nachdenken: "contemplation",
  Contemplation: "contemplation",
  Erleichterung: "relief",
  Relief: "relief",
  Sehnsucht: "longing",
  Longing: "longing",
  Neckerei: "teasing",
  Teasing: "teasing",
  "Ungeduld und Reizbarkeit": "impatience_and_irritability",
  "Impatience and Irritability": "impatience_and_irritability",
  "Sexuelle Lust": "sexual_lust",
  "Sexual Lust": "sexual_lust",
  Zweifel: "doubt",
  Doubt: "doubt",
  Angst: "fear",
  Fear: "fear",
  Belastung: "distress",
  Distress: "distress",
  Verwirrung: "confusion",
  Confusion: "confusion",
  Verlegenheit: "embarrassment",
  Embarrassment: "embarrassment",
  Scham: "shame",
  Shame: "shame",
  Enttäuschung: "disappointment",
  Disappointment: "disappointment",
  Traurigkeit: "sadness",
  Sadness: "sadness",
  Bitterkeit: "bitterness",
  Bitterness: "bitterness",
  Verachtung: "contempt",
  Contempt: "contempt",
  Ekel: "disgust",
  Disgust: "disgust",
  Ärger: "anger",
  Anger: "anger",
  Böswilligkeit: "malevolence_malice",
  "Malevolence/Malice": "malevolence_malice",
  Säuerlichkeit: "sourness",
  Sourness: "sourness",
  Schmerz: "pain",
  Pain: "pain",
  Hilflosigkeit: "helplessness",
  Helplessness: "helplessness",
  "Müdigkeit/Erschöpfung": "fatigue_exhaustion",
  "Fatigue/Exhaustion": "fatigue_exhaustion",
  "Emotionale Taubheit": "emotional_numbness",
  "Emotional Numbness": "emotional_numbness",
  "Rausch/Bewusstseinsveränderung":
    "intoxication_altered_states_of_consciousness",
  "Intoxication/Altered States of Consciousness":
    "intoxication_altered_states_of_consciousness",
  "Eifersucht und Neid": "jealousy_envy",
  "Jealousy & Envy": "jealousy_envy",
});
// Distinct everyday definitions for the remaining named emotion states.
const EX_EMOTION_EXPLANATIONS = {
  amusement:
    "Etwas Spielerisches oder Lustiges kann heitere Unterhaltung auslösen. Die Intensität beschreibt den erlebten Moment, nicht wie gut jemand ein Problem gelöst hat.",
  elation:
    "Ein besonders freudiger oder gelungener Moment kann ein Hochgefühl auslösen. Diese hohe Energie hält nicht automatisch den ganzen Tag an.",
  pleasure_ecstasy:
    "Ein sehr angenehmer Moment kann intensives Wohlgefühl auslösen. Angenehme Gefühle allein beweisen weder Liebe noch Zustimmung zu einer Handlung.",
  contentment:
    "Zufriedenheit kann entstehen, wenn die gegenwärtige Lage zu eigenen Bedürfnissen und Erwartungen passt. Sie lässt sich mit weiteren Wünschen vereinbaren.",
  thankfulness_gratitude:
    "Dankbarkeit reagiert auf als hilfreich oder freundlich erlebte Unterstützung. Eine erwiderte Hilfe ist freiwillig und keine automatische Schuld.",
  infatuation:
    "Verliebtheit ist die eigene romantische Aufmerksamkeit für eine andere Person. Sie sagt nicht, dass das Interesse erwidert wird; die Altersregeln gelten unabhängig von der Intensität.",
  hope_enthusiasm_optimism:
    "Hoffnung und Begeisterung richten sich auf eine gewünschte Möglichkeit. Eine Zusage kann Hoffnung geben, ohne die Zukunft zu garantieren.",
  triumph:
    "Triumph beschreibt das starke Erfolgserleben nach einem bewältigten Versuch. Ein Erfolg in einem Bereich ersetzt kein Können in allen anderen Bereichen.",
  interest:
    "Interesse lenkt die Aufmerksamkeit auf eine Person, Frage oder Tätigkeit. Es muss weder romantisch noch ein bereits vereinbartes Vorhaben sein.",
  awe: "Ehrfurcht kann bei etwas besonders Großem, Beeindruckendem oder Bedeutsamem entstehen. Sie kann Staunen und Nachdenken miteinander verbinden.",
  astonishment_surprise:
    "Überraschung entsteht, wenn ein Ereignis von der eigenen Erwartung abweicht. Sie kann angenehm oder unangenehm sein und braucht eine weitere Deutung.",
  concentration:
    "Konzentration ist gebündelte Aufmerksamkeit auf eine konkrete Aufgabe. Hunger, Unterbrechungen und Erschöpfung können sie erschweren.",
  contemplation:
    "Nachdenken bedeutet, eine Erfahrung oder mögliche Entscheidung innerlich zu prüfen. Ein Gedanke ist noch keine ausgeführte Handlung.",
  longing:
    "Sehnsucht kann fehlende soziale Wärme, eine vertraute Person oder eine erwünschte Erfahrung betreffen. Sie ist nicht automatisch sexuelle Lust.",
  teasing:
    "Spielerische Neckerei kann bei vertrauten, einverstandenen Personen Spaß machen. Unbehagen oder eine gesetzte Grenze verlangen Rücksicht statt weiterer Neckerei.",
  impatience_and_irritability:
    "Ungeduld und Reizbarkeit können entstehen, wenn Bedürfnisse drängen, etwas lange dauert oder die Belastung steigt. Sie belegen keine böse Absicht des Gegenübers.",
  sexual_lust:
    "Sexuelle Lust ist ein ausschließlich erwachsener Spielzustand. Eine eigene Intensität erlaubt keine Handlung ohne konkrete, unabhängige Zustimmung eines anderen Erwachsenen.",
  distress:
    "Belastung beschreibt erlebten Druck oder ein unangenehm dringendes Bedürfnis. Die Quelle kann körperlich, finanziell oder sozial sein und ist nicht automatisch eine Diagnose.",
  confusion:
    "Verwirrung kann bei widersprüchlichen oder unklaren Informationen entstehen. Nachfragen ist verlässlicher als aus einer Lücke eine sichere Geschichte zu machen.",
  embarrassment:
    "Verlegenheit kann entstehen, wenn eine Situation die eigene Sicherheit im Kontakt ins Wanken bringt. Eine freundliche Klärung kann helfen, ohne den Sim bloßzustellen.",
  sadness:
    "Traurigkeit kann auf Verlust, enttäuschte Nähe oder ein ausbleibendes wichtiges Ergebnis reagieren. Sie kann neben Hoffnung oder Zuneigung bestehen.",
  bitterness:
    "Bitterkeit kann wachsen, wenn eine Person wiederholte Enttäuschungen als ungerecht erlebt. Diese Deutung kann nachvollziehbar sein und trotzdem unvollständige Informationen enthalten.",
  contempt:
    "Verachtung enthält eine abwertende Sicht auf ein Gegenüber. Im Spiel ist diese subjektive Haltung kein objektives Urteil über dessen Wert oder Schuld.",
  disgust:
    "Ekel ist eine starke Abwehrreaktion auf etwas als unangenehm Erlebtes. Die Empfindung rechtfertigt keine Abwertung einer Personengruppe.",
  malevolence_malice:
    "Böswilligkeit bezeichnet eine feindselige Haltung. Sie ist von einer wirklich ausgeführten schädlichen Handlung zu unterscheiden, die eigene Fakten und Folgen braucht.",
  sourness:
    "Säuerlichkeit ist in der verwendeten Taxonomie eine körperlich gefärbte unangenehme Reaktion. Für die Spielentscheidung bleiben Anlass und aktuelle Bedürfnisse entscheidend.",
  pain: "Schmerz bezeichnet eine erlebte körperliche Belastung. Ein angezeigter Spielwert ersetzt keine medizinische Erklärung; gewünschte Hilfe bleibt wichtig.",
  fatigue_exhaustion:
    "Müdigkeit und Erschöpfung reduzieren die verfügbaren Kräfte und erschweren Konzentration und Betreuung. Ruhe und tatsächlicher Schlaf helfen; bloßes Planen einer Pause genügt nicht.",
  emotional_numbness:
    "Emotionale Taubheit beschreibt ein gedämpftes inneres Erleben. Diese einzelne Spielanzeige ist keine Diagnose und bedeutet nicht, dass einem Sim alle Beziehungen gleichgültig sind.",
  intoxication_altered_states_of_consciousness:
    "Ein veränderter Bewusstseinszustand kann Wahrnehmung und Entscheidungen beeinträchtigen. Im Spiel braucht er eine tatsächlich dokumentierte, ausschließlich erwachsene Quelle und erteilt keine Zustimmung.",
};
for (const [key, text] of Object.entries(EX_EMOTION_EXPLANATIONS))
  EX_CONCEPTS[key][1] = text;
Object.assign(EX_CONCEPT_ALIASES, {
  employed: "status",
  unemployed: "status",
  retired: "status",
  early_care: "status",
  kindergarten: "status",
  school: "education",
  study: "education",
  parental_care: "care",
  home_care: "care",
  residential_care: "care",
});
function exConceptKey(key) {
  return EX_CONCEPTS[key] ? key : EX_CONCEPT_ALIASES[key] || null;
}
function exInfo(key) {
  const id = exConceptKey(key);
  if (!id) return "";
  const title = EX_CONCEPTS[id][0];
  return `<button type="button" class="ex-info" data-concept="${esc(id)}" aria-label="Erklärung: ${esc(title)}" title="${esc(title)} erklären">i</button>`;
}
function exExplain(label, key = label) {
  return `${esc(label)} ${exInfo(key)}`;
}
function exConceptDialog(key, trigger) {
  const c = EX_CONCEPTS[key];
  if (!c) return;
  const previous = document.activeElement;
  const m = document.createElement("div");
  m.className = "modal-bg ex-learning";
  m.innerHTML = `<section class="ex-learning-card" role="dialog" aria-modal="true" aria-labelledby="ex-learning-title"><div class="ex-learning-top"><small>NEBENBEI VERSTEHEN</small><button type="button" class="btn btn-soft small" aria-label="Erklärung schließen">✕</button></div><h2 id="ex-learning-title">${esc(c[0])}</h2><p>${esc(c[1])}</p><div class="ex-note"><b>So wirkt es in Vivarium</b><p>${esc(c[2])}</p></div>${c[3] ? `<a href="${esc(c[3])}" target="_blank" rel="noopener noreferrer">Hintergrund bei der Fachquelle ↗</a>` : ""}<small class="ex-learning-note">Spielwerte sind vereinfachte Modelle. Du kannst die Erklärung schließen und direkt weiterspielen.</small></section>`;
  const close = () => {
    m.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
  m.onclick = (e) => {
    if (e.target === m) close();
  };
  m.querySelector("button").onclick = close;
  m.onkeydown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") {
      const focus = [...m.querySelectorAll("button,a")];
      const i = focus.indexOf(document.activeElement);
      e.preventDefault();
      focus[(i + (e.shiftKey ? -1 : 1) + focus.length) % focus.length].focus();
    }
  };
  document.body.append(m);
  m.querySelector("button").focus({ preventScroll: true });
}
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest("[data-concept]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    exConceptDialog(b.dataset.concept, b);
  },
  true,
);
// Observe added label nodes only; do not rescan the complete city on every tick.
const EX_LABEL_SELECTOR =
  ".lw-stat > span,.ex-meter > span,.emo-row > .nm,.ex-card h3,.ex-card h4,.lw-perma h5,.mind-pane h5,.ex-stats small";
function exAnnotate(root) {
  if (root.nodeType !== 1 || root.closest(".ex-learning")) return;
  const labels = [
    ...(root.matches(EX_LABEL_SELECTOR) ? [root] : []),
    ...root.querySelectorAll(EX_LABEL_SELECTOR),
  ];
  for (const label of labels) {
    if (
      label.querySelector(".ex-info") ||
      label.closest("button,a") ||
      label.dataset.conceptDecorated
    )
      continue;
    const text = label.textContent.trim();
    let key = exConceptKey(text);
    if (!key && /PERMA/.test(text)) key = "perma";
    if (!key && /Bedürfnisse/.test(text)) key = "need";
    if (!key && /W100/.test(text)) key = "w100";
    if (!key && label.matches(".ex-meter > span"))
      key = label
        .closest("details")
        ?.querySelector("summary")
        ?.textContent.includes("Attribute")
        ? "attribute"
        : "skill";
    if (!key && label.matches(".emo-row > .nm")) key = "emotion";
    if (!key) continue;
    label.dataset.conceptDecorated = "1";
    label.insertAdjacentHTML("beforeend", " " + exInfo(key));
  }
}
let exAnnotationQueued = false;
const exAnnotationRoots = new Set();
new MutationObserver((records) => {
  for (const r of records)
    for (const n of r.addedNodes)
      if (
        n.nodeType === 1 &&
        !n.matches(".ex-info") &&
        !n.closest(".ex-learning")
      )
        exAnnotationRoots.add(n);
  if (!exAnnotationRoots.size || exAnnotationQueued) return;
  exAnnotationQueued = true;
  requestAnimationFrame(() => {
    for (const n of exAnnotationRoots) if (n.isConnected) exAnnotate(n);
    exAnnotationRoots.clear();
    exAnnotationQueued = false;
  });
}).observe(document.body, { childList: true, subtree: true });
exAnnotate(document.body);
