# Research Harness — MVP-Entwurf

**Stand:** 2026-09-15 · Entwurf zur Freigabe · noch nicht implementiert

Dieses Dokument beschreibt den Zuschnitt des ersten auslieferbaren Stücks des
Claude-Code-Plugins `research-harness`. Es ist die Grundlage für den
Implementierungsplan, nicht der Plan selbst.

---

## 1 · Zweck

Der Harness soll Paper-Projekte AI-first führen, ohne dass der Forschende die
Entscheidungsgewalt abgibt. Der MVP leistet davon genau eines: **er macht den
Zustand eines Paper-Vorhabens dauerhaft, prüfbar und mit Evidenzstatus versehen
sichtbar** — und trennt dabei erzwungenermaßen, was ein Agent vorschlägt, von
dem, was ein Mensch angenommen hat.

Alles andere — Schreiben, Belegmaschinerie, Board, Stage-Gates — kommt später
und dockt an dieser Aufzeichnung an.

### Warum dieser Zuschnitt

Drei unabhängige Linien zeigen auf dieselbe Sache:

1. **Toolsheds Wachstumsgeschichte.** Der erste Commit (`88007652`, 2026-06-13)
   war 12 Dateien / 1.148 Zeilen, davon 8 Dateien / 942 Zeilen das eigentliche
   Plugin — und davon 802 Zeilen Prosa gegen 140 Zeilen Maschinerie. Ein
   Hook-Event, zwei Skills, `references/`. Es blieb acht Tage allein. Sidequest
   startete ohne MCP, ohne Dispatch, ohne Gates; die Reihenfolge war **erfassen
   und sichtbar machen → übergeben → prüfen und verriegeln.**
2. **Daniels eigenes Vault-Format.** Die Areas unter `~/dh-hq/vault/areas/`
   tragen bereits `## Status`, `## Kontext`, `## Entscheidungen` (mit
   *Entschieden / Warum / Verworfen / Offen*) und `## Offene Fragen` — und die
   Marker `[stated]` / `[tentative]` (dokumentiert in `CONVENTIONS.md:239-242`).
   Das ist die Unterscheidung zwischen Vorschlag und angenommener Behauptung,
   erprobt im Alltag. Der Harness erfindet sie nicht, er verlegt sie ins
   Paper-Repo und zwingt den Agenten hinein.
3. **Der Ursprung von `junior-gap`.** Ein reales Problem, keine Literaturlücke —
   phänomenfokussierte Problematisierung im Sinne der MISQ-Editorial. Genau die
   Stelle, an der ungezügelte AI ein Paper zuverlässig mittelmäßig macht: sie
   produziert unbegrenzt plausible Lücken und nie eine angegriffene Annahme.

---

## 2 · Was der MVP ist — und was nicht

**Ist:** der Canvas eines Paper-Vorhabens als dauerhafter, versionierter
Projektzustand im Paper-Repo, mit Evidenzmarkern, Abhängigkeitsprüfung,
append-only Entscheidungslog, Kontextinjektion bei Sitzungsbeginn, einem
erzwungenen Freigabekanal und einer klickbaren Sitzungsansicht.

**Ist nicht:** kein Board, keine Tickets, kein Dispatch, keine Stage-Gates über
die Abhängigkeitsprüfung hinaus. Kein Schreiben (`/abstract`,
`/significance-statement`, Absatz-Review). Keine Belegmaschinerie (Zitat gegen
Transkript, erzwungene Provenienz, gehashte Prompt-Versionen). Kein MCP-Server,
kein SQLite, kein Mehrautoren-Modell, keine Journal-Recherche.

### Der Vertrag

Der Vertrag des Plugins ist **„ein Paper-Projekt-Repo"**. Wo dieses liegt, ist
Konfiguration. `~/dh-research/` ist die lokale Konvention des Autors und darf
nirgends im Plugin vorkommen. Die einzige Wurzel, die ein Hook kennt, ist
`${CLAUDE_PLUGIN_ROOT}`; das Projektverzeichnis kommt über die Kette
`process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd()`.

**Erkennung eines Paper-Projekts:** die Existenz von `research/canvas.md`. Keine
Pfadliste, kein Frontmatter, keine Konfigurationsdatei. In jedem anderen Repo
schweigt das Plugin vollständig. Damit ist die offene Frage aus der Area-Notiz
(„Marker-Datei, Konfigurationsliste oder Vault-Frontmatter?") beantwortet.

---

## 3 · Vorab festgelegt, weil später teuer

Toolsheds Geschichte weist als **billig änderbar** aus: Speicherformat (JSON →
SQLite nach elf Tagen), Zugangsweg (CLI → MCP nach sechs Tagen), Sprache (JS →
TS nach siebzehn Tagen), Plugin-Grenze (neun von fünfzehn Plugins wurden
umbenannt, aufgeteilt, absorbiert oder zurückgezogen). Diese vier werden hier
**nicht** entschieden.

Teuer sind nur Bezeichner, die Nutzerspuren hinterlassen, und die
Autorisierungsachse.

| Festlegung | Wert |
|---|---|
| Marketplace-Repo | `research-harness` |
| Plugin | `research-harness` (Slash-Präfix `/research-harness:`) |
| Skills | `canvas`, `canvas-review` |
| Zustandsort | `<paper-repo>/research/` — **sichtbar, in Git**, kein Punkt-Ordner |
| Dateien | `research/canvas.md`, `research/decisions.md` |
| Override Zustandsort | `RESEARCH_HARNESS_DIR` |
| Override Bibliothek | `RESEARCH_HARNESS_LIBRARY` |
| Marker-Vokabular | `[proposed]` `[tentative]` `[stated]` `[accepted]` |

**Warum sichtbar und in Git, entgegen Toolshed:** Sidequest legt den
Board-Zustand bewusst außerhalb jedes Repos ab, nicht in Git, ohne Historie —
begründet mit projektübergreifender Aufmerksamkeit. Für ein Paper ist das falsch
herum: der Entscheidungsverlauf ist selbst ein Ergebnis, muss archivierbar sein,
mit dem Repo umziehen und bei einer Einreichung als Supplement mitgehen können.
Toolshed löst das an anderer Stelle bereits so — `.gitignore:17-20` checkt
`.claude/live-rules/**` und `.claude/.codebase-info/**` per Negation bewusst ein.

---

## 4 · Datenmodell

### 4.1 Die neun Elemente

Aus Dorobantu, Gruber, Ravasi & Wellman (2024), AMJ 67(5):1163–1174. Vier
Bereiche, neun Elemente, durchnummeriert — die Nummern sind die Sprache im
Meeting („gehen wir auf 2.3").

| Nr. | Element | Bereich |
|---|---|---|
| 1 | Puzzle | Framing |
| 2 | Audience and Prior Research | Framing |
| 3 | Research Question | Framing |
| 4 | Theoretical Constructs and Relationships | Theoretischer Rahmen |
| 5 | Research Setting | Empirische Methodik |
| 6 | Research Design and Analysis | Empirische Methodik |
| 7 | Findings | Schlussfolgerungen |
| 8 | Contributions | Schlussfolgerungen |
| 9 | Boundary Conditions and Limitations | Schlussfolgerungen |

Jedes Element enthält nummerierte Teilfragen (`1.1`, `1.2`, …) aus dem
Fragenwerk in `references/canvas-elements.md`.

### 4.2 `research/canvas.md`

```markdown
---
project: junior-gap
created: 2026-09-15
mode: import
canvas-schema: 1
---

# 1 · Puzzle

## 1.1 Welche breite Managementfrage adressiert dieses Vorhaben?

Wie Berufseinsteigende ... [accepted]

## 1.2 Was soll erklärt oder besser verstanden werden?

Der Bruch zwischen ... [stated]
Eine zweite Lesart wäre ... [proposed]

## 1.3 Warum ist dieses Puzzle wichtig?

_(leer)_
```

**Regeln:**

- Marker stehen **am Ende einer Aussage**, wie in Daniels Vault. Eine Aussage ist
  ein Absatz.
- Rangfolge: `[proposed]` < `[tentative]` < `[stated]` < `[accepted]`.
- Ein Element hat den Status seiner **schwächsten** Aussage. Ein Element ohne
  Aussage ist leer. „Element 3 ist `[accepted]`" heißt also: *jede* Aussage in
  Element 3 trägt `[accepted]`.
- **Ein leeres Element ist ein zulässiger, ausdrücklich erwünschter Zustand.**
  Es ist besser als plausible Füllung. Das ist die Anti-Fabrikations-Regel auf
  Canvas-Ebene.

### 4.3 Marker und die zwei Autorisierungsklassen

| Marker | Bedeutung | Modell darf anlegen | Modell darf ändern/entfernen |
|---|---|---|---|
| `[proposed]` | vom Agenten vorgeschlagen, ungeprüft | ja | ja |
| `[tentative]` | Fund, noch nicht bestätigt | ja | ja |
| `[stated]` | der Forschende hat es gesagt oder geschrieben | ja — als Mitschrift | **nein** |
| `[accepted]` | Festlegung des Vorhabens | **nein** | **nein** |

`[stated]` und `[tentative]` sind Daniels bestehende Vault-Marker, unverändert
übernommen.

**Warum `[stated]` angelegt werden darf und `[accepted]` nicht.** `[stated]` ist
eine *Mitschrift*: der Forschende sagt etwas im Gespräch, der Agent hält es fest.
Kein Hook kann prüfen, ob eine Mitschrift stimmt — und sie zu verbieten würde den
Dialog unbrauchbar machen, weil der Agent nicht notieren dürfte, was gerade gesagt
wurde. Erzwingbar und bedeutsam ist etwas anderes, und darauf sitzt das Gate:

- Das Modell darf **nie ändern oder löschen, was der Mensch gesagt hat.**
- Das Modell darf **nie eine Festlegung erklären.**

Damit haben die beiden Marker unterschiedliche Erzwingung und sind beide nötig.
Die Restfläche bleibt: ein Agent kann `[stated]` für etwas vergeben, das so nicht
gesagt wurde. Das ist nicht maschinell prüfbar; `canvas-review` listet deshalb
alle `[stated]`-Aussagen zur periodischen Durchsicht auf, und die Ansicht hebt sie
hervor. Der Harness soll das über sich selbst aussagen können, statt es zu
verschweigen.

**Diese Achse ist der Kern des Vorhabens.** Sidequest hat sie nicht: sein
`verdict`-Tool nimmt `outcome: accepted|rejected|inconclusive` entgegen und prüft
an keiner Stelle die Herkunft (`src/lib/mcp-lifecycle.ts:651-675`) — das Modell
kann sein eigenes Urteil sprechen. Der einzige echte Kanalschutz in Toolshed ist
ein Modul-Symbol (`store.ts:507`), und das schützt die Integration gegen
Executoren, nicht die Entscheidung gegen das Modell.

Die Achse muss von Anfang an im Datenmodell liegen, weil jede Gate-Stelle, jeder
Refusal-Text und jede Skill-Anweisung daran hängt. Nachrüsten ist teuer.

### 4.4 Abhängigkeiten statt Stufensperre

Der Canvas ist **kein Ablauf**. Dorobantu et al. schreiben, er sei *„arranged as
a puzzle because each element must 'fit' with related elements"*, und ausdrücklich
*„not … impose a universal template for doing research or writing papers"*. Die
MISQ-Editorial warnt vor *„script-following or check-box behavior … that runs
counter to the spirit of qualitative inquiry"*. Colquitt & George merken an, dass
die Themenentscheidung *„years earlier"* fällt als die Einreichung — die
Schreibreihenfolge ist nicht die Arbeitsreihenfolge. Und das Diskussionspapier
sagt: *„It should not become a rigid research lifecycle."*

Deshalb **keine Sperre gegen Überspringen.** Stattdessen ein Graph:

```
1 Puzzle          ←  —
2 Prior Research  ←  1
3 Research Q.     ←  1, 2
4 Constructs      ←  3
5 Setting         ←  3, 4
6 Design          ←  4, 5
7 Findings        ←  6
8 Contributions   ←  2, 3, 7
9 Boundaries      ←  5, 6, 7
```

**Die Regel:** Ein Element darf nicht `[accepted]` tragen, solange ein Element,
von dem es abhängt, es nicht trägt. `canvas-review` meldet jede Verletzung. Es
blockiert nichts.

Das leistet mehr als eine Sperre: Wer Element 1 wieder auf `[tentative]` setzt,
macht 3, 8 und alles Nachgelagerte automatisch inkonsistent und damit sichtbar.
Bei einem Stage-Gate ist Zurückgehen ein Verwaltungsakt; hier zeigt es sofort,
was jetzt auf Sand steht.

Der Graph ist aus dem Worksheet selbst abgeleitet — es fragt bei der Research
Question wörtlich *„How does answering your research question advance prior
research and our understanding of the puzzle?"* (→ 3 hängt an 1 und 2).

### 4.5 `research/decisions.md`

Append-only. Historie wird nie editiert; eine Korrektur hängt einen neuen Eintrag
an und benennt den überholten.

```markdown
# Entscheidungslog — junior-gap

## [#12] 2026-09-15 · DECISION · 3 Research Question
Die Frage zielt auf den Übergang, nicht auf das Ergebnis. [accepted]
**Warum:** ...
**Verworfen:** ...

## [#13] 2026-09-16 · DISCOVERY · 2 Prior Research
Zwei Studien widersprechen sich in ... [tentative]
**Ersetzt:** #7
```

Arten: `DECISION` (Festlegung), `CONSTRAINT` (Randbedingung, die Optionen
ausschließt), `DISCOVERY` (Befund, der die Lage ändert). Übernommen aus
Sidequests Story-Log — dem einzigen Mechanismus, der von Toolshed auf Paper-Arbeit
wirklich überträgt. Die laufende Nummer trägt den Sitzungs-Ledger (§5.2).

---

## 5 · Bausteine

```
research-harness/                          ← Marketplace-Repo
  .claude-plugin/marketplace.json
  plugins/research-harness/
    .claude-plugin/plugin.json
    hooks/
      hooks.json
      inject-state.js                      ← SessionStart, fail-open
      guard-promotion.js                   ← PreToolUse, fail-closed
    references/
      canvas-elements.md
      amj-map.md
      problematization.md
    skills/
      canvas/SKILL.md
      canvas-review/SKILL.md
    bin/canvas-serve.js                    ← Stufe 2
    dashboard/canvas.html                  ← Stufe 2
    test/guard-promotion.test.js
    README.md
```

Kein `package.json`, kein Build, kein `lib/` — reines Node-stdlib-CommonJS, wie
fünf der sechs Toolshed-Plugins. Tests werden konventionsbasiert gefunden
(`node --test "test/*.test.js"`).

### 5.1 Manifeste

`marketplace.json`: vier Top-Level-Felder (`name`, `owner`, `description`,
`version`) und ein `plugins[]`-Array mit einem Eintrag. `plugin.json`: `name`,
`version`, `description`, `author`, `license`. `description` und `version` stehen
doppelt; ein kurzes Guard-Skript vergleicht sie, weil sie sonst auseinanderlaufen.

**Kein `commands/`.** Toolshed hatte es vier Tage und entfernte alle Wrapper
(`a6c42e49`): `commands/x.md` und `skills/x/SKILL.md` mappen beide auf `/x`, der
Harness lädt den dünnen Wrapper und hält den Skill danach für „already loaded" —
die echten Schritte werden nie injiziert.

### 5.2 `inject-state.js` — SessionStart

Injiziert über `hookSpecificOutput.additionalContext`, dem einzigen Kanal zum
Modell (`systemMessage` liest das Modell nicht). Budget **unter 4 KiB**, bei
Überlauf UTF-8-sicher gekürzt mit Wasserzeichen und dem Hinweis, wie nachzuladen
ist.

Inhalt: welche der neun Elemente leer sind; welche nur `[proposed]`/`[tentative]`
tragen; Verletzungen der Abhängigkeitsregel; die Einträge aus `decisions.md`, die
diese Sitzung noch nicht gesehen hat; der Modus (`brainstorming` / `seed` /
`import`).

Der Sitzungs-Ledger liegt unter `~/.claude/research-harness/` (flüchtiger
Zustand, gehört nicht ins Paper) und merkt sich die zuletzt injizierte laufende
Nummer.

**Fail-open:** Fehlt `research/canvas.md`, ist es unlesbar oder fehlerhaft,
injiziert der Hook nichts und beendet mit 0. Ein Hook darf nie einen Prompt
anhalten.

### 5.3 `guard-promotion.js` — PreToolUse

Matcher auf `Edit|Write|NotebookEdit|Bash`. Greift bei Schreibzugriffen auf
`canvas.md` und `decisions.md` im Zustandsverzeichnis (`research/`, oder was
`RESEARCH_HARNESS_DIR` sagt) — und ab Stufe 2 zusätzlich bei `Bash`-Aufrufen
gegen den Port des Canvas-Servers (§7).

**Regel für `canvas.md`** — drei Verbote, sonst alles erlaubt:

1. Keine Aussage mit `[accepted]` anlegen.
2. Keine bestehende Aussage mit `[stated]` oder `[accepted]` ändern oder entfernen
   — auch nicht ihren Marker herabstufen.
3. Keine Aussage mit `[proposed]`/`[tentative]` in `[stated]`/`[accepted]` heben.

Erlaubt bleibt: `[proposed]`- und `[tentative]`-Aussagen anlegen, ändern,
entfernen; und `[stated]` als Mitschrift **neu** anlegen (§4.3).

Verstoß → `permissionDecision: "deny"` mit einem `permissionDecisionReason`, der
die legale nächste Aktion nennt: „schlage die Änderung als `[proposed]` daneben
vor, oder der Forschende übernimmt sie selbst über die Canvas-Ansicht."

**Regel für `decisions.md`:** nur Anhängen. Jede Änderung an bestehendem Inhalt
wird verweigert.

**Fail-closed — bewusste Abweichung von Toolsheds Doktrin.** Toolshed schreibt
fail-soft vor („a malformed rule file degrades to 'skip that rule'"), aber das
gilt für Kontextinjektion. Ein Berechtigungswächter, der bei einem Fehler
durchlässt, ist ein Loch. Kann `guard-promotion.js` den Diff nicht sicher
beurteilen, verweigert er mit einer Begründung, die das sagt.

Refusal-Texte sind Teil des Produkts: jeder nennt die nächste legale Aktion,
sonst blockiert der Harness sich selbst.

### 5.4 Die zwei Skills

Frontmatter minimal (`name`, `description` als *„Use when …"*-Satz), wie 15 der
17 Toolshed-Skills. Alles Längere liegt in `references/` und wird im Skill-Text
explizit zum Lesen angewiesen — sonst frisst jeder Aufruf Kontext.

**`/research-harness:canvas`** legt `research/canvas.md` an und arbeitet die
Elemente im Dialog durch. Schreibt ausschließlich `[proposed]` und `[tentative]`.
Lässt Elemente leer, für die keine Antwort vorliegt.

**`/research-harness:canvas-review`** liest Canvas und — falls vorhanden —
Manuskript und meldet vier Dinge:

1. leere Elemente,
2. Verletzungen der Abhängigkeitsregel (§4.4),
3. Elemente, die inhaltlich nicht zueinander passen (Contributions beantworten
   die Research Question nicht; Boundary Conditions widersprechen dem Setting),
4. Aussagen mit `[stated]`/`[accepted]`, die das Manuskript nicht mehr deckt.

Schreibt nur `[proposed]`-Notizen und hängt an `decisions.md` an. Dieser Skill
ist bereits der größte Teil des späteren Prüfwerkzeugs (B).

### 5.5 `references/` — Struktur ohne fremden Text

**Das Plugin liefert keine geschützten Texte aus.** Es kodiert ein eigenes,
nachgebildetes Fragenwerk, nennt zu jedem Element die vollständige Quellenangabe
mit DOI und verweist über `RESEARCH_HARNESS_LIBRARY` auf eine lokale Kopie, falls
vorhanden. Belege in `REFERENCES.md`.

| Element | AMJ-Teil | Zusatzmodul |
|---|---|---|
| 1 Puzzle | 1 · Topic Choice (Colquitt & George 2011) | fünf Kriterien: *significance, novelty, curiosity, scope, actionability* |
| 2 Prior Research | 3 · Setting the Hook (Grant & Pollock 2011) | **Problematisierung** (Monteiro et al. 2022) |
| 3 Research Question | 3 · Setting the Hook | |
| 4 Constructs | 4 · Grounding Hypotheses (Sparrowe & Mayer 2011) | |
| 5 Setting | 2 · Research Design (Bono & McNamara 2011) | 7 · Qualitative (Bansal & Corley 2012) |
| 6 Design & Analysis | 2 · Research Design | 5 · Methods and Results (Zhang & Shaw 2012) |
| 7 Findings | 5 · Methods and Results | |
| 8 Contributions | 6 · Discussing the Implications (Geletkanycz & Tepper 2012) | |
| 9 Boundaries | 6 · Discussing the Implications | |

`problematization.md` trägt die vier Sensibilitäten aus Monteiro et al. —
Dialog mit dem empirischen Feld; Annahmen angreifen; fragen, wie wir hierher
gekommen sind; das Unsichtbare sichtbar machen — gekreuzt mit *what / when /
where*. Es hängt an Element 2 und ist die Antwort auf die Worksheet-Frage *„What
assumptions do prior studies make about the phenomenon? Are they accurate?"*,
die der Canvas stellt, aber nicht operationalisiert.

---

## 6 · Die drei Modi

Aus Daniels ursprünglicher Core-Liste („via brainstorming / braindump / import
mode"). Der Modus steht im Frontmatter und steuert, wo `canvas` einsteigt.

| Modus | Ausgangslage | Einstieg |
|---|---|---|
| `brainstorming` | nichts liegt vor | Element 1, Dialog, Colquitts fünf Kriterien |
| `seed` | Material und Phänomen liegen vor, kein Manuskript, keine Literaturfestlegung | Element 1 über das Problematisierungs-Modul, nicht über Prior Research |
| `import` | ein Manuskript liegt vor | Rekonstruktion rückwärts aus dem Text |

**Harte Regel für `import`:** Alles, was der Agent aus dem Manuskript liest, ist
`[proposed]`. Nie `[stated]`, auch wenn es wörtlich im Text steht — der Agent
liest ein Manuskript, er hört nicht den Autor. Die Promotion macht der Mensch.
Damit ist Import ohne Sonderregel sicher.

---

## 7 · Der klickbare Canvas (Stufe 2)

Der Originalcanvas ist als *„ready-to-copy"*-Posterausdruck gedacht. Die digitale
Entsprechung ist eine Sitzungsansicht für Autorenteam-Meetings und Solo-Reviews.

- **Zoom-out:** das Puzzle-Layout, neun Felder, Marker farbig, Abhängigkeits­
  verletzungen hervorgehoben.
- **Zoom-in:** ein Element mit Fragenwerk, Inhalt, Markern, Quellenangabe.
- **Nummerierung:** jedes Feld und jede Teilfrage trägt ihre Nummer sichtbar.
- **Editieren und kommentieren:** Kommentare gehen als `DISCOVERY` nach
  `decisions.md`.

**Eine Wahrheit.** Die Ansicht wird aus `canvas.md` erzeugt und schreibt dorthin
zurück. Sie lebt nicht daneben.

**Sie ist der Freigabepfad.** Hier setzt der Mensch `[stated]` und `[accepted]` —
per Klick. `bin/canvas-serve.js` bindet auf `127.0.0.1`, zufälliger Port, und
schreibt die Promotion direkt in die Datei. Der Deny-Hook bleibt die Gegenprobe
auf der Modellseite. Damit sind es zwei getrennte Wege in dieselbe Datei: einer
für den Agenten, einer für den Menschen.

**Und eine ehrliche Grenze.** Ein lokaler HTTP-Server ist keine kryptografische
Schranke gegen ein Modell, das `Bash` hat. Der Guard verweigert deshalb
zusätzlich `Bash`-Aufrufe gegen den Server-Port. Die Sicherheitseigenschaft ist
trotzdem **Sichtbarkeit und Absichtlichkeit, nicht Unmöglichkeit**: eine
Promotion erfordert einen bewussten, sichtbaren Akt. Das ist strikt mehr als
Sidequest hat, aber es ist nicht absolut, und der Harness soll das über sich
selbst aussagen können.

**Nicht im Plugin:** die Veröffentlichung als Artifact für entfernte Koautoren.
Das hängt an einem Konto; das Plugin liefert die lokale, kontofreie Variante,
damit es bei fremden Forschenden funktioniert.

---

## 8 · Bauen in zwei Stufen

| Stufe | Inhalt | Größenordnung |
|---|---|---|
| **1 · Aufzeichnung** | Manifeste, `inject-state.js`, `guard-promotion.js` + Test, zwei Skills, `references/` | ~950 Zeilen, überwiegend Prosa |
| **2 · Freigabepfad und Sitzungsansicht** | `bin/canvas-serve.js`, `dashboard/canvas.html`, Guard-Erweiterung auf den Server-Port | ~850 Zeilen |

Nach Stufe 1 gibt es ein benutzbares Werkzeug; der Freigabepfad ist dann „der
Mensch editiert die Datei selbst" — ehrlich und ausreichend. Zusammen rund 1.800
Zeilen, unter Sidequests erstem Commit (2.828 Zeilen, der bereits Store, lokalen
HTTP-Server, CLI und selbstgenügsames Dashboard-HTML enthielt).

---

## 9 · Validierung an `junior-gap`

Dieselbe Studie in zwei Zuständen. `research-harness-paper` scheidet als
Canvas-Testfall aus: der AMJ-Canvas ist für **empirische** Managementforschung
gebaut, ein konzeptionelles Design-Science-Paper füllt die Hälfte der Elemente
nicht oder nur metaphorisch.

**Lauf A — Import.** Den Canvas aus dem R2-Manuskript rekonstruieren.
*Erfolgskriterium:* `canvas-review` findet mindestens eine **inhaltliche**
Inkohärenz, die Daniel als real anerkennt — nicht nur Formalien wie fehlende
Elemente. Der Abhängigkeitsgraph muss an einem Paper in Revision weitgehend
erfüllt sein; ist er es nicht, stimmt entweder der Graph nicht oder das Paper hat
ein echtes Problem.

**Lauf B — Seed.** Nur Material und Phänomen, kein Manuskript, keine
Literaturfestlegung, Einstieg über das Problematisierungs-Modul.
*Erfolgskriterium:* eine Rahmung, die sich von der heutigen substanziell
unterscheidet. Ob besser oder schlechter — beides ist informativ.

**Der Vergleich beider Läufe ist der Befund**, und er ist zugleich das Artefakt,
das `research-harness-paper` für den OrgSci-Call braucht („a prototype or
equivalent research artifact"). Ein Harness, der an einer laufenden Studie in
zwei Modi lief und deren Rahmungen vergleicht, ist stärker als einer, der auf
sich selbst angewandt wurde.

**Daten:** lokal, unter bestehender Ethikfreigabe. Lauf B sieht Material aus
`_raw/`; Lauf A liest nur das Manuskript. Nichts davon wird ausgeliefert.

---

## 10 · Was diesen Entwurf widerlegen würde

Nach dem Muster des Projektcharters aus `02-pilot-and-toolkit.md`: „Evidence that
would make us narrow, redesign, or abandon the approach."

- **Die neun Elemente lassen sich für eine qualitative Studie nur verzerrt
  füllen.** → Der Canvas ist das falsche Instrument; ein genre-spezifisches
  Profil muss her, bevor irgendetwas gebaut wird.
- **`canvas-review` findet nur Formalien, nie Inhaltliches.** → Es ist eine
  Checkliste, kein Harness. Genau das, wovor die MISQ-Editorial warnt.
- **Die Promotion über die Ansicht fühlt sich als Reibung an und Daniel editiert
  stattdessen von Hand.** → Der Freigabepfad ist Theater; die Achse braucht eine
  andere Form.
- **Der Seed-Modus produziert nur Gap-Spotting.** → Das
  Problematisierungs-Modul funktioniert als Prompt nicht und muss anders
  gebaut werden.
- **Der Abhängigkeitsgraph meldet an einem Paper in Revision dauernd
  Verletzungen.** → Der Graph bildet Forschungspraxis falsch ab.

---

## 11 · Offene Fragen

**Für SQ-6 (Sichtung der drei Bestände) — geschärfter Auftrag:** Nicht offen
sichten, sondern **gegen diesen Entwurf prüfen.** Trägt das Fragenwerk die Regeln
aus `junior-gap/material/misq-research-note/`? Widerspricht die Marker-Achse dem
Oracle-Gate in `research-harness-paper/AGENTS.md`? Welche der Regeln, die in den
drei driftenden `AGENTS.md` doppelt stehen, fällt unter diesen MVP, welche erst
unter das Schreibhandwerk oder die Belegmaschinerie?

**Für SQ-7 (Fixture-Strategie) — entblockt:** Die Fixture für diesen MVP ist ein
synthetischer Canvas plus ein erfundenes Manuskript. Kein personenbezogenes
Material, keine Einwilligungsfrage. Die Transkript-Frage bleibt offen und muss
beantwortet werden, bevor die Belegmaschinerie gebaut wird — sie hält den MVP
aber nicht mehr auf.

**Noch nicht entschieden:**

- Wie oft ein Agent `[stated]` für etwas vergibt, das so nicht gesagt wurde. Das
  ist die bekannte Restfläche der Achse (§4.3) und nicht maschinell prüfbar. Am
  echten Fall zu beobachten: Wenn es häufig vorkommt, muss `[stated]` ebenfalls
  über den Freigabepfad — um den Preis, dass jeder Dialogschritt einen Klick
  braucht.
- Ob `decisions.md` bei längerer Laufzeit zu groß für die Injektion wird und eine
  Verdichtung braucht.
- Wie ein Koautor, der das Repo teilt, den Freigabepfad benutzt. Der MVP ist
  ausdrücklich Einzelplatz.
- Ob `research/` bei Journals kollidiert, die ein eigenes Ordnerschema für
  Supplements vorschreiben.

---

## 12 · Wo B und C andocken

- **B (Prüfwerkzeug)** ist `canvas-review` erweitert: Rekonstruktion aus
  fremden Manuskripten, `/tell-me-why` für Abschlussarbeitende, Devil's Advocate
  gegen einzelne Elemente.
- **C (Schreibhandwerk)** liest den Canvas als Kontext und nutzt dieselbe
  `references/`-Zuordnung: `/abstract` aus den Elementen 1, 3, 7, 8;
  `/significance-statement` aus 8 und 9; der Absatz-für-Absatz-Review-Modus
  („but I like to write") mit Versionierung im Entscheidungslog.

Beides braucht keine Änderung am Datenmodell.

---

## Belege

Alle in [`REFERENCES.md`](../../../REFERENCES.md). Volltexte lokal unter
`_literature/` (nicht versioniert), PDFs in `~/dh-library/pdf/`.

Toolshed-Befunde stammen aus einer Untersuchung des Marketplace-Repos
(`~/.claude/plugins/marketplaces/eigenwise-toolshed`, 3.979 Commits) vom
2026-09-15; Datei- und Commit-Angaben sind im Text belegt.
