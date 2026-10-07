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
// Authored reflective examples: possibilities to consider, not diagnoses or mind-reading.
const EX_EMOTION_INSIGHTS = {
  amusement: [
    "Heiterkeit schafft oft einen kleinen gemeinsamen Spielraum: Zwei Menschen können denselben Witz genießen und trotzdem unterschiedliche Sorgen haben. Humor wird dann verbindend, wenn niemand die Pointe auf eigene Kosten ertragen muss.",
    "Beim Abwasch macht ein Kind einen Wortwitz; der Elternteil lacht, obwohl die offene Rechnung weiter belastet. Der heitere Moment löst die Rechnung nicht, kann aber ein Gespräch erleichtern.",
    "Lachen beide miteinander, oder lacht einer über den anderen?",
  ],
  elation: [
    "Hochgefühl lässt eine Möglichkeit größer und erreichbarer erscheinen. Ein begeisterter Moment und ein dauerhaft tragfähiger Plan sind unterschiedliche Ebenen: Die Energie kann für den nächsten kleinen Schritt genutzt werden.",
    "Nach einer Zusage will ein Sim sofort feiern und viel einkaufen. Er kann die Freude würdigen und trotzdem erst den kommenden Monatsplan prüfen.",
    "Welche Entscheidung darf auf morgen warten, während ich den Erfolg heute genieße?",
  ],
  pleasure_ecstasy: [
    "Angenehmes Erleben beantwortet die Frage, wie sich ein Moment anfühlt. Es beantwortet noch nicht, ob dieser Moment zu längerfristigen Werten, Grenzen oder einer Beziehung passt.",
    "Ein schöner Abend fühlt sich großartig an; am nächsten Morgen bleibt die Frage, ob beide dasselbe von ihrer Verbindung erwarten.",
    "Was macht diesen Moment angenehm – und was soll darüber hinaus Bestand haben?",
  ],
  contentment: [
    "Zufriedenheit hängt auch vom Maßstab ab, mit dem ein Sim sein Leben betrachtet. Genug zu haben kann mit Neugier und Weiterentwicklung zusammengehen; Zufriedenheit muss keinen Stillstand bedeuten.",
    "Ein Sim mit bescheidenem Einkommen genießt ein verlässliches Zuhause, möchte aber trotzdem wieder zeichnen lernen.",
    "Welche Erwartungen sind meine eigenen, und welche übernehme ich nur von anderen?",
  ],
  thankfulness_gratitude: [
    "Dankbarkeit richtet Aufmerksamkeit auf erhaltene Unterstützung. Für eine tragfähige Beziehung ist hilfreich, die konkrete Hilfe zu würdigen, ohne daraus eine unbegrenzte Verpflichtung abzuleiten.",
    "Eine Nachbarin bringt Essen vorbei. Der Empfänger bedankt sich dafür, muss aber nicht jeder späteren Bitte zustimmen.",
    "Wofür genau bin ich dankbar, und welche Freiheit behalten beide?",
  ],
  affection: [
    "Zuneigung kann sich als vertraute Alltagsnähe zeigen, lange bevor große Worte fallen. Entscheidend ist, ob die Geste zum Gegenüber passt: Für manche ist Hilfe willkommen, für andere zuerst ungeteilte Aufmerksamkeit.",
    "Ein Sim repariert das Fahrrad seiner Schwester; sie hätte sich heute eher ein ruhiges Zuhören gewünscht. Beide wollten Nähe, wählten aber verschiedene Wege.",
    "Welche Form von Zuwendung wünscht sich die andere Person tatsächlich?",
  ],
  infatuation: [
    "Verliebtheit lenkt Aufmerksamkeit auf mögliche Nähe. Dabei kann der Wunsch die Deutung einer freundlichen Geste färben; erwidertes Interesse braucht eigene Hinweise und eine freie Antwort.",
    "Zwei gleichaltrige 16-Jährige mögen ein gemeinsames Hobby. Eine Einladung zum Spaziergang kann Interesse erkunden, ohne Freundlichkeit als Zusage zu behandeln.",
    "Welche Beobachtung spricht für Interesse, und was habe ich selbst hineingelesen?",
  ],
  hope_enthusiasm_optimism: [
    "Hoffnung macht eine erwünschte Zukunft vorstellbar. Ein hilfreicher nächster Schritt verbindet diese Möglichkeit mit etwas Beeinflussbarem; ein Ausweichplan kann Hoffnung tragen, statt sie zu verraten.",
    "Eine Bewerberin hofft auf eine Zusage und übt das Gespräch. Gleichzeitig sucht sie eine zweite passende Stelle.",
    "Was liegt in meiner Hand, auch wenn das erhoffte Ergebnis ausbleibt?",
  ],
  triumph: [
    "Triumph betont ein überwundenes Hindernis und manchmal den Vergleich mit anderen. Ein gelungener Versuch kann Selbstvertrauen geben; die Art, ihn zu feiern, beeinflusst, ob Mitmenschen sich einbezogen oder abgewertet fühlen.",
    "Ein Team gewinnt einen Wettbewerb. Ein Sim bedankt sich bei seinen Helfern, ein anderer verspottet die Verlierer – derselbe Erfolg, andere Beziehungsspuren.",
    "Feiere ich ein Gelingen oder die Niederlage eines anderen?",
  ],
  pride: [
    "Stolz kann eine eigene Anstrengung sichtbar machen. Er wird konkreter, wenn ein Sim benennen kann, was er getan oder gelernt hat; ein Rangplatz allein erzählt wenig über diesen Weg.",
    "Nach Wochen des Übens gelingt ein Musikstück. Der Sim erkennt seine Ausdauer an, obwohl ein anderer bereits besser spielt.",
    "Auf welchen eigenen Schritt bin ich stolz, unabhängig vom Vergleich?",
  ],
  interest: [
    "Interesse eröffnet Möglichkeiten, bevor ein festes Ziel entsteht. Es kann lohnen, eine Frage zunächst spielerisch zu erkunden, statt sofort Leistung oder Nutzen daraus verlangen zu müssen.",
    "Ein Senior fragt nach dem Schulprojekt seiner Enkelin und entdeckt selbst wieder Freude an Astronomie.",
    "Was möchte ich verstehen, ohne es sofort beherrschen zu müssen?",
  ],
  awe: [
    "Staunen kann die gewohnte Perspektive unterbrechen: Die eigene Sorge bleibt real, bekommt aber einen größeren Rahmen. Das ist eine Einladung zur Neugier, kein Beweis, dass persönliche Probleme unwichtig wären.",
    "Beim Blick auf den Sternenhimmel denkt ein Sim über seine Alltagssorgen und die Menschen nach, mit denen er Zeit verbringen möchte.",
    "Was sehe ich aus einer größeren Perspektive anders?",
  ],
  astonishment_surprise: [
    "Überraschung markiert eine Abweichung von einer Erwartung. Erst die folgende Deutung entscheidet, ob der Sim darin ein Geschenk, eine Bedrohung oder eine noch offene Frage sieht.",
    "Ein Kollege wartet vor der Tür. Der Sim erwartet Kritik; tatsächlich fragt der Kollege nach Hilfe bei einer Aufgabe.",
    "Welche Erwartung wurde verletzt, und welche neue Information fehlt noch?",
  ],
  concentration: [
    "Konzentration ist hier eine momentane Ressource, keine feste Charakterbewertung. Eine schwere Aufgabe kann durch einen kleineren nächsten Schritt, weniger Unterbrechungen oder erfüllte körperliche Bedürfnisse handhabbarer werden.",
    "Ein hungriger Schüler liest dieselbe Zeile immer wieder. Nach Essen und einer klaren Teilaufgabe findet er leichter zurück.",
    "Braucht es gerade mehr Anstrengung oder bessere Bedingungen?",
  ],
  contemplation: [
    "Nachdenken kann eine Entscheidung vorbereiten; wiederholtes Kreisen ohne neue Information kann sie auch festhalten. Im Spiel hilft die Trennung zwischen gesichertem Ereignis, eigener Deutung und noch prüfbarer Frage.",
    "Eine Sim liest eine kurze Nachricht mehrfach und vermutet Ablehnung. Eine konkrete Rückfrage könnte mehr klären als die nächste gedankliche Runde.",
    "Welche Information könnte mein Nachdenken tatsächlich weiterbringen?",
  ],
  relief: [
    "Erleichterung bedeutet, dass erwarteter Druck nachlässt. Sie zeigt nicht automatisch, dass ein Problem vollständig gelöst ist: Ein Zahlungsaufschub kann Luft schaffen, während die Verpflichtung bestehen bleibt.",
    "Nach einer Ratenvereinbarung schläft ein Sim ruhiger. Für den nächsten Monat muss er weiterhin die vereinbarte Rate einplanen.",
    "Was ist wirklich erledigt, und was ist nur weniger dringend geworden?",
  ],
  longing: [
    "Sehnsucht kann auf eine Person, einen früheren Lebensabschnitt oder eine erhoffte Zukunft zielen. Hinter dem konkreten Bild kann ein allgemeiner Wunsch stehen: Zugehörigkeit, Ruhe, Abenteuer oder gesehen zu werden.",
    "Ein Sim vermisst seine alte Schulfreundin. Vielleicht fehlt ihm auch das ungezwungene gemeinsame Spielen, das er mit neuen Freunden wiederfinden könnte.",
    "Welche Qualität vermisse ich, neben der konkreten Person oder Situation?",
  ],
  teasing: [
    "Neckerei lebt von einer gemeinsam getragenen Deutung. Eine vertraute Pointe kann vor Publikum plötzlich peinlich werden; die Reaktion des Gegenübers ist wichtiger als die eigene Absicht.",
    "Zwei Freunde scherzen über ein Missgeschick. Als weitere Mitschüler dazukommen, wird einer still und möchte das Thema wechseln.",
    "Hat sich das Publikum oder die Grenze des Gegenübers verändert?",
  ],
  impatience_and_irritability: [
    "Reizbarkeit kann im Spiel aus mehreren kleinen Belastungen entstehen, die sich aufstauen. Der letzte Anlass wirkt dann größer, als er allein wäre; die passende Antwort kann sowohl eine Pause als auch eine konkrete Klärung sein.",
    "Nach wenig Schlaf, langem Warten und Hunger reagiert ein Sim scharf auf eine harmlose Frage. Der Gesprächspartner kennt diese Vorgeschichte nicht.",
    "Welche Belastungen bringe ich bereits in diese Begegnung mit?",
  ],
  sexual_lust: [
    "Erwachsenes Begehren ist ein eigener Wunsch, keine Information über den Wunsch eines Gegenübers. Eine freie, konkrete Zustimmung bleibt von Intensität, Partnerschaftsstatus und einem gelungenen W100-Versuch unabhängig.",
    "Zwei erwachsene Partner wünschen unterschiedlich viel Nähe. Sie sprechen darüber, ohne Ablehnung als Pflichtverletzung zu behandeln.",
    "Können beide ohne Druck zustimmen, ablehnen oder ihre Entscheidung ändern?",
  ],
  doubt: [
    "Zweifel kann eine offene Annahme sichtbar machen. Nützlich wird er, wenn klar ist, was überprüft werden könnte; ein Zweifel an einer einzelnen Entscheidung muss nicht zu einem Urteil über die ganze Person werden.",
    "Ein Sim zweifelt an der gewählten Ausbildung. Ein Gespräch mit einem Auszubildenden kann konkreter helfen als die Frage, ob er grundsätzlich talentiert genug ist.",
    "An welcher überprüfbaren Annahme zweifle ich gerade?",
  ],
  fear: [
    "Angst lenkt den Blick auf mögliche Verluste. In der Simulation ist eine befürchtete Zukunft von einem bereits eingetretenen Ereignis zu trennen: Wahrscheinlichkeit, Folgen und verfügbare Hilfe sind drei verschiedene Fragen.",
    "Eine Mieterin fürchtet nach einer hohen Rechnung eine Kündigung. Sie prüft zuerst die wirkliche Forderung und erreichbare Unterstützung.",
    "Was ist schon geschehen, was befürchte ich, und welche Handlung schafft Spielraum?",
  ],
  distress: [
    "Belastung entsteht hier, wenn Anforderungen und verfügbare Mittel auseinanderliegen. Mittel sind nicht nur Geld: Zeit, Schlaf, Können, Unterstützung und Entscheidungsfreiheit können ebenfalls fehlen.",
    "Ein pflegender Angehöriger hat genug Einkommen, aber kaum freie Zeit und keinen Ersatz für einen Abend. Seine Knappheit ist vor allem zeitlich.",
    "Welche Ressource fehlt wirklich, und wer könnte gezielt entlasten?",
  ],
  confusion: [
    "Verwirrung kann auf widersprüchliche Hinweise hinweisen. Eine ehrliche offene Frage ist oft eine bessere Grundlage für Kontakt als eine schnelle, aber unbelegte Erklärung.",
    "Ein Chef lobt die Arbeit und verschiebt gleichzeitig das Projekt. Der Sim weiß noch nicht, ob die Verschiebung mit ihm oder mit dem Budget zusammenhängt.",
    "Welche zwei Informationen passen für mich noch nicht zusammen?",
  ],
  embarrassment: [
    "Verlegenheit richtet Aufmerksamkeit auf den eigenen sichtbaren Eindruck. Zwischen dem, was ein Sim befürchtet, und dem, was andere tatsächlich bemerkt haben, kann eine Lücke liegen.",
    "Ein Jugendlicher verspricht sich beim Vorlesen und glaubt, alle würden ihn auslachen. Die Freundin hat vor allem gemerkt, dass ihm die Aufgabe wichtig war.",
    "Was wurde tatsächlich beobachtet, und welchen Blick anderer stelle ich mir nur vor?",
  ],
  shame: [
    "Scham kann einen konkreten Rückschlag zu einer Aussage über die ganze Person vergrößern. Eine genauere Beschreibung lässt mehr Handlungsspielraum: Ein Fehler, Geldmangel oder eine Absage erzählen jeweils nur einen Teil der Geschichte.",
    "Nach einer Absage denkt ein Sim: Ich bin zu nichts gut. Präziser wäre: Diese Stelle habe ich heute nicht bekommen; meine anderen Fähigkeiten bleiben bestehen.",
    "Kann ich das Ereignis beschreiben, ohne meinen ganzen Wert zu beurteilen?",
  ],
  disappointment: [
    "Enttäuschung zeigt den Abstand zwischen Hoffnung und Ergebnis. Sie kann helfen, Erwartungen oder Wege neu zu prüfen; ein ausgebliebener Erfolg beantwortet noch nicht, ob das Ziel weiterhin wichtig ist.",
    "Ein Kurs fällt aus. Der Sim ist enttäuscht, sucht aber weiter nach einer Möglichkeit, seine kreative Ambition zu verfolgen.",
    "Will ich das Ziel ändern oder zunächst einen anderen Weg versuchen?",
  ],
  sadness: [
    "Traurigkeit kann ausdrücken, dass etwas bedeutsam war und nun fehlt. Die erste hilfreiche Begegnung muss keine Lösung liefern: Manchmal ist Zuhören passender als eine schnelle Ablenkung.",
    "Eine ältere Sim vermisst ihren verstorbenen Partner. Beim Besuch erzählt sie gern eine Erinnerung, statt sofort über ein neues Hobby zu sprechen.",
    "Braucht die Person gerade Trost, Aufmerksamkeit oder eine konkrete Unterstützung?",
  ],
  bitterness: [
    "Bitterkeit verbindet Enttäuschung mit einer als unfair erlebten Geschichte. Diese Geschichte kann wichtige Erfahrungen enthalten und zugleich neue freundliche Begegnungen vorschnell in dieselbe Schublade stecken.",
    "Nach mehreren leeren Versprechen erwartet ein Sim auch vom neuen Nachbarn nichts Gutes. Eine kleine verlässlich eingehaltene Zusage kann eine neue Erfahrung liefern.",
    "Welche neue Beobachtung würde meine alte Erwartung tatsächlich verändern?",
  ],
  contempt: [
    "Verachtung fasst ein Gegenüber leicht zu einem abwertenden Gesamturteil zusammen. Für eine klare Konfliktklärung ist die konkrete Handlung oft hilfreicher als eine feste Schublade über den Charakter.",
    "Ein Sim nennt einen Kollegen faul. Bekannt ist bisher nur, dass eine Aufgabe liegen geblieben ist; der Grund fehlt noch.",
    "Welche konkrete Handlung kritisiere ich, statt die ganze Person abzuwerten?",
  ],
  disgust: [
    "Ekel signalisiert eine starke Abwehr. In der Simulation muss die körperliche Reaktion von einem moralischen Urteil getrennt bleiben; Unbehagen ist keine verlässliche Aussage über den Wert anderer Menschen.",
    "Eine Sim fühlt sich in einer schmutzigen Küche unwohl. Sie kann Reinigung vereinbaren, ohne den Bewohner deshalb als minderwertig zu behandeln.",
    "Richtet sich meine Abwehr auf eine Situation oder inzwischen ungerecht auf eine Person?",
  ],
  anger: [
    "Ärger kann zeigen, dass eine Grenze, Erwartung oder Vorstellung von Fairness verletzt wurde. Für den nächsten Schritt ist entscheidend, ob der Sim eine konkrete Bitte formulieren kann – und ob die vermutete Absicht des Gegenübers überhaupt belegt ist.",
    "Ein Elternteil ärgert sich über liegen gebliebene Teller und liest darin mangelnden Respekt. Das Kind dachte, jemand anderes sei heute dran; eine geklärte Zuständigkeit kann mehr lösen als ein Vorwurf.",
    "Welche Grenze oder Vereinbarung ist betroffen, und welche faire Bitte kann ich daraus machen?",
  ],
  malevolence_malice: [
    "Eine feindselige Haltung und eine schädigende Handlung sind getrennte Dinge. Das Modell muss Gedanken, Absichten, tatsächlich ausgeführte Taten und belegte Folgen auseinanderhalten, damit Misstrauen nicht automatisch Schuld erzeugt.",
    "Ein Sim fantasiert nach einem Streit über Vergeltung. Ohne ausgeführte Handlung ist daraus noch kein dokumentierter Schaden entstanden.",
    "Welche Tatsache ist belegt, und wo schreibe ich eine Befürchtung bereits als Tat fort?",
  ],
  sourness: [
    "Dieses Taxonomie-Wort ist ohne Anlass wenig aussagekräftig. Im Spiel sollte eine säuerlich-abwehrende Reaktion deshalb über ihre konkrete Quelle gelesen werden, statt daraus eine große Persönlichkeitsgeschichte zu bauen.",
    "Nach einer unangenehmen Bemerkung bleibt ein Sim kurz verstimmt. Eine spätere freundliche Klärung kann diese momentane Reaktion verändern.",
    "Welche erlebte Situation erklärt die Anzeige am besten?",
  ],
  pain: [
    "Schmerz bindet Aufmerksamkeit und kann den Alltag verändern. Ein Spielwert erklärt die Ursache nicht; praktisch relevant sind die wahrgenommenen Einschränkungen, gewünschte Hilfe und die Möglichkeit, Tätigkeiten anzupassen.",
    "Ein Senior kann einen Besuch genießen und gleichzeitig eine Pause brauchen. Seine Bedürftigkeit nimmt ihm nicht die Entscheidung darüber, welche Hilfe er möchte.",
    "Welche Tätigkeit ist gerade schwerer geworden, und welche Unterstützung ist gewünscht?",
  ],
  helplessness: [
    "Hilflosigkeit kann entstehen, wenn Einfluss fehlt oder nicht mehr sichtbar ist. Ein kleiner realer Handlungsspielraum kann sich von einer großen unerreichbaren Lösung unterscheiden; Hilfe anzunehmen kann selbst eine wirksame Handlung sein.",
    "Eine arbeitslose Sim kann den Stellenmarkt nicht steuern. Sie kann aber eine passende Bewerbung vorbereiten und eine bekannte Person um Informationen bitten.",
    "Was kann ich selbst beeinflussen, und wo brauche ich andere statt noch mehr Willenskraft?",
  ],
  fatigue_exhaustion: [
    "Erschöpfung betrifft verfügbare Energie, nicht moralische Zuverlässigkeit. Ein voller Kalender lässt sich durch Motivation allein nicht verlängern; Ruhe, weniger Aufgaben und tatsächliche Entlastung sind verschiedene Stellschrauben.",
    "Ein Angehöriger pflegt seine Mutter und schläft wenig. Ein freundliches Lob ist willkommen, ersetzt aber keinen übernommenen Besuch.",
    "Welche Aufgabe kann wirklich wegfallen oder von jemand anderem übernommen werden?",
  ],
  emotional_numbness: [
    "Ein gedämpftes Erleben kann die eigene Lage schwerer lesbar machen. Wenig sichtbares Gefühl erlaubt keinen Schluss, dass Beziehungen bedeutungslos wären; persönliche Erinnerungen und Wünsche geben weiteren Kontext.",
    "Ein Sim reagiert still auf einen Besuch, erinnert sich aber später daran als verlässlichen Kontakt. Die äußere Reaktion allein war unvollständig.",
    "Welche Bedeutung zeigt sich im Protokoll, auch wenn der Moment wenig Ausdruck hatte?",
  ],
  intoxication_altered_states_of_consciousness: [
    "Veränderte Wahrnehmung macht eigene Einschätzungen und Grenzen nicht verlässlicher. Das Spiel trennt eine dokumentierte erwachsene Erfahrung von frei erfundenem Rausch und berücksichtigt Belastungen, ohne daraus Zustimmung abzuleiten.",
    "Nach einer belegten erwachsenen Konsumerfahrung unterschätzt ein Sim eine Aufgabe. Andere planen mit ihm eine sichere Pause statt weiteren Druck.",
    "Ist die Situation sicher, und welche Entscheidung sollte unter diesen Bedingungen warten?",
  ],
  jealousy_envy: [
    "Neid vergleicht oft eigene Möglichkeiten mit denen anderer; Eifersucht richtet sich eher auf bedrohte Nähe. Beides kann einen eigenen Wunsch sichtbar machen, beweist aber weder Untreue noch Unfairness.",
    "Ein Sim sieht den Partner lange mit einer Freundin sprechen. Er kann nach Nähe fragen, ohne aus der beobachteten Unterhaltung eine geheime Absicht zu machen.",
    "Vermisse ich etwas Eigenes, oder habe ich einen konkreten Bruch einer Vereinbarung beobachtet?",
  ],
};
for (const [key, [insight, example, question]] of Object.entries(
  EX_EMOTION_INSIGHTS,
)) {
  EX_CONCEPTS[key][1] = insight;
  EX_CONCEPTS[key][2] =
    "Lies die Intensität zusammen mit den eigenen Ereignissen, Bedürfnissen und Erwartungen des Sims. Die Deutung bleibt eine Möglichkeit; neue Erfahrungen oder ein Gespräch können sie verändern.";
  EX_CONCEPTS[key][4] = question;
  EX_CONCEPTS[key][5] = example;
}
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
Object.entries({
  perma:
    "Welcher Bereich braucht gerade Aufmerksamkeit, obwohl andere bereits gut versorgt sind?",
  P: "Welchen kleinen guten Moment könnte der Sim wahrnehmen, ohne seine Sorge wegreden zu müssen?",
  E: "Passt die Herausforderung zum Können, und gibt es einen sichtbaren nächsten Schritt?",
  R: "Welche Beziehung lässt diesen Sim gesehen und unterstützt sein?",
  M: "Für wen oder was möchte der Sim mit seinem Tun einen Unterschied machen?",
  A: "Welcher kleine eigene Fortschritt verdient Anerkennung, auch ohne Applaus?",
  self_efficacy:
    "Welche konkrete Erfahrung würde dem Sim zeigen, dass sein Handeln etwas bewirken kann?",
  gross:
    "Welcher Teil des vereinbarten Lohns wird für welche Sicherung verwendet?",
  net: "Ist das Einkommen schon verfügbar oder erst für später vereinbart?",
  cold_rent:
    "Wie verändert die zusätzliche Kostenplanung den vermeintlich günstigen Wohnungspreis?",
  warm_rent: "Welche eigenen Verträge fehlen noch im angezeigten Wohnbudget?",
  health_insurance:
    "Welche Risiken werden gemeinsam getragen, statt allein vom aktuellen Guthaben abzuhängen?",
  social_insurance:
    "Welche Absicherung passt zu welchem Lebensrisiko – und welcher Topf erhält den Beitrag?",
  reserve:
    "Welche unerwartete Ausgabe könnte das laufende Budget wirklich ins Wanken bringen?",
  projection:
    "Welche Annahme verändert das Ergebnis am stärksten, wenn sie nicht eintritt?",
  liquidity:
    "Ist der Sim vermögend, zahlungsfähig oder beides – und was müsste verkauft werden?",
  deposit:
    "Welche Mittel sind vorhanden, aber für den neuen Alltag zunächst gebunden?",
  credit:
    "Welchen Spielraum schafft der Kredit heute, und welche festen Verpflichtungen erzeugt er morgen?",
  arrears:
    "Welche Kosten sind bereits entstanden und dürfen nicht als erst künftige Planung verschwinden?",
  care: "Welche Hilfe wünscht die betreute Person, und wer sorgt für die Entlastung der Helfenden?",
  care_insurance:
    "Welche Kosten werden geteilt und welcher Eigenanteil bleibt wirklich im Haushaltsbudget?",
  education:
    "Welcher Nachweis zeigt einen Abschluss, und welche tatsächliche Fähigkeit muss zusätzlich erkennbar sein?",
  grade:
    "Welche Art von Aufgabe hat dieses Ergebnis gemessen – und was gerade nicht?",
  application:
    "Was passt bereits, was lässt sich verbessern, und welche Auswahl bleibt außerhalb eigener Kontrolle?",
  probability:
    "Welche Annahmen stehen hinter dem Wert, und wie könnte neue Information ihn verändern?",
  tom: "Was hat der Sim beobachtet, was deutet er, und was müsste er sein Gegenüber fragen?",
  emotion:
    "Welche Erwartung und welches Bedürfnis verbinden das Ereignis mit diesem Gefühl?",
  need: "Welche Unzufriedenheit ist körperlich, welche sozial, und welche Handlung würde tatsächlich helfen?",
  romantic_affection:
    "Ist gewünschte Nähe gegenseitig, altersgerecht und frei von Druck?",
  social_warmth:
    "Braucht der Sim Zuhören, gemeinsames Tun, verlässliche Hilfe oder einfach Gesellschaft?",
  skill:
    "Welche konkrete Tätigkeit wurde geübt, und wie lässt sich das Können beobachten?",
  attribute:
    "Welche Voraussetzungen helfen hier, und welche Umstände verdecken sie gerade?",
  goal: "Verfolgt der Sim sein eigenes Ziel oder einen Maßstab, den andere vorgegeben haben?",
  reputation:
    "Wer weiß was aus welcher Erfahrung – und welche Aussage ist bislang nur ein Gerücht?",
  w100: "War das Ziel schwer, die Ausführung unsicher oder die Situation ungünstig?",
  status:
    "Welche Rollen geben Struktur und Zugehörigkeit, und welche Pflichten konkurrieren um Zeit?",
}).forEach(([key, question]) => (EX_CONCEPTS[key][4] = question));
Object.entries({
  perma:
    "Ein Sim kann einen anstrengenden Tag haben und trotzdem Sinn in der Betreuung eines Angehörigen erleben. Freude und Bedeutung müssen nicht gleichzeitig steigen.",
  E: "Ein neues Stück ist zu schwer, eine einfache Tonleiter langweilt. Eine passende kleine Passage gibt Herausforderung und Rückmeldung.",
  M: "Jemand hilft regelmäßig im Stadtteil, obwohl er wenig besitzt. Die Tätigkeit kann bedeutsam sein, ohne Wohlstand oder Berühmtheit vorauszusetzen.",
  self_efficacy:
    "Ein Sim hält sich vor einer Bewerbung für chancenlos. Ein selbst vorbereitetes, gelungenes Gespräch gibt eine andere eigene Erfahrung, auch wenn der Vertrag noch offen ist.",
  liquidity:
    "Ein Vermieter besitzt ein wertvolles Haus, hat aber nicht genug auf dem Konto für die heutige Reparatur. Vermögen und aktuelle Zahlungsfähigkeit fallen auseinander.",
  reserve:
    "Zwei Haushalte verdienen gleich viel. Der mit festen hohen Verpflichtungen hat nach einer unerwarteten Reparatur weniger Entscheidungsfreiheit.",
  tom: "Eine Kollegin antwortet kurz. Der Sim vermutet Ablehnung; ebenso möglich ist Zeitdruck. Eine Nachfrage kann unterscheiden, was Beobachtung und was Annahme war.",
  attribute:
    "Eine aufmerksame, ausdauernde Sim scheitert müde an einer Aufgabe. Das Ergebnis kann ihre gegenwärtigen Bedingungen zeigen, statt ihre grundsätzliche Fähigkeit zu widerlegen.",
  status:
    "Ein arbeitsloser Vater betreut Kinder und unterstützt Nachbarn. Der fehlende Arbeitsvertrag beschreibt nicht seine gesamte Tätigkeit oder seinen Beitrag.",
}).forEach(([key, example]) => (EX_CONCEPTS[key][5] = example));
const EX_PRACTICAL_INSIGHTS = {
  hunger: [
    "Hunger · körperliche Dringlichkeit",
    "Im Spiel erhöht fehlende Nahrung die körperliche Dringlichkeit und kann die Geduld eines Sims belasten. Ein anderer Sim sieht meist nur die Reaktion; die Ursache ist ihm nicht automatisch bekannt.",
    "Eine tatsächlich ausgeführte Mahlzeit senkt Hunger. Einkommen und Vorräte bestimmen, welche Mahlzeiten erreichbar sind.",
    "Welche körperliche Belastung könnte die soziale Deutung gerade färben?",
  ],
  thirst: [
    "Durst",
    "Ein leicht erfüllbares Bedürfnis kann trotzdem Aufmerksamkeit beanspruchen, wenn Wege, Kosten oder eine laufende Aufgabe die Versorgung verzögern. Körperliche Dringlichkeit und persönliche Absicht sind getrennt.",
    "Tatsächliches Trinken senkt die Dringlichkeit; bloßes Erzählen einer Absicht führt keine Handlung aus.",
    "Welche kleine Versorgung könnte den nächsten Schritt erleichtern?",
  ],
  bladder: [
    "Blase / Toilettendrang",
    "Alltagsplanung besteht auch aus unspektakulären, zeitkritischen Bedürfnissen. Ein Sim, der ein Gespräch verkürzt, kann einen praktischen Grund haben, statt die andere Person ablehnen zu wollen.",
    "Die Simulation sucht einen erreichbaren geeigneten Raum. Eine wirklich ausgeführte Toilettenhandlung senkt den Wert.",
    "Welche andere Erklärung gibt es für den abrupten Abschied?",
  ],
  fatigue: [
    "Müdigkeit",
    "Erholung ist im Spiel eine Voraussetzung für verfügbare Kräfte. Wenn Arbeit, Betreuung und Freizeit um dieselbe Zeit konkurrieren, kann mehr Motivation allein keinen zusätzlichen Schlaf schaffen.",
    "Die tatsächlichen Ruhe- und Schlafhandlungen senken die Dringlichkeit. Bedürfnisse und Belastung beeinflussen die aktuelle Leistung.",
    "Welche Verpflichtung könnte neu abgestimmt werden, damit Erholung wirklich stattfindet?",
  ],
  fun: [
    "Abwechslung",
    "Abwechslung kann selbstbestimmten Spielraum geben. Eine angenehme Freizeitaktivität muss nicht teuer sein; was zum Sim passt, hängt auch von seinen Interessen und erreichbaren Möglichkeiten ab.",
    "Passende tatsächlich ausgeführte Aktivitäten senken die Dringlichkeit. Konsum ist nur ein möglicher Weg.",
    "Welche kostenlose Tätigkeit passt zu den Interessen dieses Sims?",
  ],
  hygiene: [
    "Hygiene",
    "Körperliches Wohlbefinden und das Gefühl, im Kontakt präsent sein zu können, berühren sich. Fehlende Versorgung kann aber auch an Ressourcen oder Zeit liegen, statt an fehlender Sorgfalt.",
    "Die tatsächliche Hygienetätigkeit im geeigneten Raum senkt das Bedürfnis. Der Wert ist keine moralische Bewertung.",
    "Welche Bedingung erschwert gerade die Versorgung?",
  ],
  comfort: [
    "Komfort",
    "Ein angenehmer Rückzugsort schafft Raum zwischen Anforderungen. Komfort, Luxus und Sicherheit sind dabei unterschiedliche Dinge: Auch ein einfaches Zuhause kann verlässlich und entlastend sein.",
    "Passende tatsächliche Erholung beeinflusst den Spielwert; sichtbarer Besitz allein erfüllt das Bedürfnis nicht.",
    "Was macht diesen Ort für den Sim erholsam?",
  ],
  reasoning: [
    "Denken",
    "Ein Problem gedanklich ordnen heißt nicht, seine Lösung bereits praktisch geübt zu haben.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  coordination: [
    "Koordination",
    "Eine Handlung gut abstimmen unterscheidet sich davon, die passende Technik bereits zu kennen.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  presence: [
    "Auftreten",
    "Sichtbar und überzeugend auftreten ist nicht dasselbe wie recht haben oder Vertrauen verdient haben.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  resolve: [
    "Beharrlichkeit",
    "An einem Ziel dranzubleiben kann helfen; ein veränderter Weg kann ebenso vernünftig sein wie weiteres Beharren.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  perception: [
    "Wahrnehmung",
    "Ein Detail bemerken und seine Bedeutung richtig verstehen sind zwei verschiedene Schritte.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  stamina: [
    "Ausdauer",
    "Ausdauer beschreibt hier eine Voraussetzung; verfügbare Energie hängt zusätzlich von Erholung und Belastung ab.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
  strength: [
    "Kraft",
    "Körperliche Kraft macht bestimmte Aufgaben leichter, ersetzt aber weder Technik noch Unterstützung.",
    "Dieses Attribut wirkt zusammen mit geübter Fertigkeit und situativer Belastung auf passende W100-Versuche. Es ist ein Spielmodell, kein Urteil über die ganze Person.",
    "Welche Fertigkeit und welche Bedingungen braucht diese Voraussetzung, um hilfreich zu werden?",
  ],
};
for (const [key, [title, text, effect, question]] of Object.entries(
  EX_PRACTICAL_INSIGHTS,
))
  EX_CONCEPTS[key] = [title, text, effect, null, question];
function exConceptKey(key) {
  return EX_CONCEPTS[key] ? key : EX_CONCEPT_ALIASES[key] || null;
}
function exInfo(key) {
  const id = exConceptKey(key);
  if (!id) return "";
  const title = EX_CONCEPTS[id][0];
  const english = typeof getLang === "function" && getLang() === "en";
  const explanation = english ? `Learn about ${title}` : `${title} erklären`;
  return `<button type="button" class="ex-info" data-concept="${esc(id)}" aria-label="${esc(explanation)}" title="${esc(explanation)}">i</button>`;
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
  m.innerHTML = `<section class="ex-learning-card" role="dialog" aria-modal="true" aria-labelledby="ex-learning-title"><div class="ex-learning-top"><small>NEBENBEI VERSTEHEN</small><button type="button" class="btn btn-soft small" aria-label="Erklärung schließen">✕</button></div><h2 id="ex-learning-title">${esc(c[0])}</h2>${String(c[1]).split("\n\n").map(p=>"<p>"+esc(p)+"</p>").join("")}${c[5] ? `<div class="ex-insight-example"><b>Ein Gedankenexperiment</b><p>${esc(c[5])}</p></div>` : ""}${c[4] ? `<div class="ex-insight-question"><b>Eine hilfreiche Frage</b><p>${esc(c[4])}</p></div>` : ""}<div class="ex-note"><b>So wirkt es in Vivarium</b><p>${esc(c[2])}</p></div>${c[3] ? `<a href="${esc(c[3])}" target="_blank" rel="noopener noreferrer">Hintergrund bei der Fachquelle ↗</a>` : ""}<small class="ex-learning-note">Spielwerte sind vereinfachte Modelle. Du kannst die Erklärung schließen und direkt weiterspielen.</small></section>`;
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
