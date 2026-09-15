# research-harness

Ein Research Harness für das Steuern von Paper-Projekten, als Claude-Code-Plugin —
so wie Toolshed samt Sidequest es für Software-Projekte ist: Verfahren, Aufzeichnungen,
Checks und Entscheidungsrechte für AI-gestützte Forschung.

**Stand:** Repo angelegt, MVP noch nicht entworfen.

## Geltungsbereich

Zunächst ausschließlich **Paper-Projekte** (Journal, Conference; Buchbeiträge fallen mit
hinein). Anträge, Betreuung und Reviews sind die nächsten Kandidaten — entschieden wird
das am echten Fall, nicht vorab.

## Ein Vertrag, kein Pfad

Der Vertrag ist **„ein Paper-Projekt-Repo"**. Wo dieses Repo liegt, ist Konfiguration.

Das Plugin darf keine Wurzel fest verdrahten — insbesondere nicht `~/dh-research/`, die
lokale Konvention seines Autors. Es soll über Toolshed an andere Forschende gehen, und
die haben diese Wurzel nicht. Dieselbe Beziehung hat Toolshed zu `~/dh-appdev`.

## Wo was liegt

| Ebene | Ort |
|---|---|
| Vorhaben, Entscheidungen, Status | `~/dh-hq/vault/areas/research-harness.md` |
| Dieses Plugin | dieses Repo (öffentlich auf GitHub über Toolshed geplant) |
| Erster Anwendungsfall | Vorhaben `research-harness-paper` — das Paper *über* Research Harnesses, geschrieben *mit* dem Harness |

Der erste Prototyp der Idee — Manuskript als Git-Repo, Writing-Profile, Oracle-Gate als
menschliches Qualitätsurteil, `AGENTS.md` mit Anti-Fabrikations-Regeln — lebt als gelebte
Instanz im Paper-Repo und ist die Vorlage, aus der hier ein verallgemeinertes Template
abgeleitet wird.
