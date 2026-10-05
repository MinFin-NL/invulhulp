# Plan: mogelijke nieuwe assessments & formulieren op basis van de AI Body of Knowledge

> **Status:** verkenning / brainstorm, zonder toezeggingen. Dit document inventariseert welke
> assessments en formulieren we *zouden kunnen* toevoegen aan de invulhulp op basis van
> `docs/AI-Body-of-Knowledge-EN-v4.pdf` (AI-BOK v1.0, Jan Willem van Veen, 2026).
>
> Elk nieuw formulier is in dit systeem een JSON-bestand in `public/forms/` + één regel in
> `public/forms/index.json` (zie [`project_form_registry`](../CLAUDE.md) / geheugen). Geen
> codewijzigingen nodig. Dat maakt de drempel om er een paar toe te voegen laag.
>
> **Update (juli 2026):** de vijf templates uit §2 zijn alle vijf gebouwd, en drie ervan zijn
> daarna weer **verwijderd**: Maturity Quick Scan (C), Shadow AI Inventory (D) en Governance
> Charter (E) beschrijven een *organisatie* of *afdeling*, terwijl een dossier één project of
> systeem beschrijft. Ze staan in de git-historie. Alleen de EU AI Act Checklist (A) en de Model
> Card (B) zijn gebleven. Zie [`sporen-en-roadmap.md`](sporen-en-roadmap.md) voor de indeling en
> het criterium; §3 en verder van dit document zijn nog wél open.

## 1. Wat we nu al hebben

| Spoor (`track`) | Formulier | Dekt |
|---|---|---|
| verkennen | intake, quickscan (BIO/BBN), prescandpia | afbakening, beveiligingsniveau, DPIA-triage |
| besluiten | aanbiedingsformulier, restrisico | business case, portfolioafweging & restrisico-acceptatie |
| ontwerpen | ppm, psa, datakwaliteit, datasetregistratie | projectplan, architectuur & de datalaag |
| toetsen | dpia, aiia, iama, euaiact, dataethiek | privacy, AI-impact, grondrechten, EU AI Act, data-ethiek |
| ingebruikname | modelcard, algoritmeregister, verwerkingsregister, toegankelijkheid | registratie & publicatieverplichtingen |
| beheer | *(leeg)* | — |

**Gaten die de AI-BOK destijds aanwees:** we hadden *impact*-assessments (DPIA/AIIA/IAMA) maar
géén **EU AI Act-conformiteit**, géén **AI-systeemregistratie/model card**, géén
**organisatie-brede volwassenheidsmeting**, en géén **shadow-AI-inventarisatie**. De eerste twee
zijn gedicht (A en B). De laatste twee zijn *bewust* open gelaten: het zijn geen gaten in deze
tool, want ze gaan over de organisatie in plaats van over een project.

## 2. Direct bruikbare templates uit de AI-BOK (laaghangend fruit)

De AI-BOK-appendix bevat 5 uitgewerkte templates die zich 1-op-1 laten omzetten naar een
invulhulp-formulier. Ze zijn al gestructureerd als velden/tabellen/checkboxes, het
formaat dat ons JSON-schema aankan.

### A. EU AI Act Compliance Checklist  ⭐ hoogste prioriteit
- **Bron:** Template 3 (p. 196–198).
- **Wat:** risiconiveau bepalen (minimaal / beperkt / hoog / onaanvaardbaar) en per niveau een
  cumulatieve checklist afwerken (M1–M5, B1–B8, H1–H15, O1–O3).
- **Spoor:** `toetsen` · **domains:** `["ai"]`.
- **Waarom sterk:** vult het grootste inhoudelijke gat; complementeert AIIA/IAMA (impact) met
  *wettelijke conformiteit*. Sluit aan op onze checkbox-ondersteuning en `decision gate`-patroon
  (risiconiveau stuurt welke secties verplicht zijn). Zeer geschikt voor AI-modus bulk-invullen.
- **Cross-form:** "DPIA vereist? [ja/nee]" (H3) → koppelen aan onze `prescandpia`/`dpia`;
  risiconiveau → kan `aiia` triggeren.

### B. AI-systeemregistratie / Model Card  ⭐
- **Bron:** Template 2 (p. 194–196).
- **Wat:** centrale registratie per AI-systeem: basisinfo, eigenaar, beoogd gebruik, gebruikte
  data, technische details, beperkingen & bias, compliance-status (DPIA vereist/uitgevoerd,
  conformiteitsbeoordeling, goedkeuringsstatus, evaluatiedata).
- **Spoor:** `ingebruikname` · **domains:** `["ai", "data"]`.
- **Waarom sterk:** dit is het overheids-"algoritmeregister"-equivalent op systeemniveau; een
  natuurlijk sluitstuk na intake/PSA. Veel velden zijn afleidbaar uit reeds ingevulde formulieren
  → sterke cross-form mapping (intake → model card).

### C. AI Maturity Assessment (Quick Scan)
- **Bron:** Template 4 (p. 199–201).
- **Wat:** 12 vragen (één per kennisgebied KA1–KA12), score 1–5, optelling → volwassenheidsniveau
  met interpretatie en aanbevelingen.
- **Spoor:** geen; **verwijderd** (organisatieniveau, past niet in een projectdossier).
- **Waarom interessant:** een *organisatie/afdeling*-brede zelfscan i.p.v. per-systeem. Nieuw
  type invulhulp (scoringsmodel + berekend totaal). Vergt lichte featurecheck: kunnen we een
  som/gemiddelde tonen? Zo niet, dan als tekstuele score-invoer met interpretatietabel.

### D. Shadow AI Inventory
- **Bron:** Template 5 (p. 201–204).
- **Wat:** per afdeling inventariseren welke (ongeautoriseerde) AI-tools in gebruik zijn, met
  datatype, risicoclassificatie, eigenaar en actie (formaliseren/blokkeren/monitoren) + checklist
  van veelvoorkomende tools (ChatGPT, Copilot, Claude, Gemini, …).
- **Spoor:** geen; **verwijderd** (afdelingsniveau, past niet in een projectdossier).
- **Waarom interessant:** sterk tabel-gedreven → past bij onze table-question-ondersteuning.
  Goede "instap"-oefening voor organisaties die nog niets hebben.

### E. AI Governance Charter (1 pagina)
- **Bron:** Template 1 (p. 192–193).
- **Wat:** scope, 5–6 principes, governance-organen, rollen & verantwoordelijkheden.
- **Spoor:** geen; **verwijderd** (organisatieniveau, past niet in een projectdossier).
- **Kanttekening:** minder een "assessment", meer een beleidsdocument. Waardevol als
  document-generator, maar minder afhankelijk van AI-modus/grounding. Lagere prioriteit.

## 3. Verder: assessments afgeleid van de 12 kennisgebieden (KA1–KA12)

De AI-BOK definieert 12 kennisgebieden. Elk kan een gerichte deelassessment worden. Meest
kansrijk voor de invulhulp (governmental IV-context):

| KA | Kennisgebied | Mogelijk formulier |
|---|---|---|
| KA9 | AI Risk Management & Safety | AI-risicoassessment (adversarial, prompt injection, drift, red teaming); vult de risicokant naast de BIO-quickscan |
| KA10 | AI Compliance & Audit | zie EU AI Act-checklist (A) + audit-checklist |
| KA11 | AI Ethics & Responsible AI | Ethische toets / Responsible-AI-review (complementair aan IAMA grondrechten) |
| KA5 | Data & Semantics | Datakwaliteit- & datasheet-assessment ("Datasheets for Datasets"); sluit aan op onze RAG/ontologie |
| KA6 | Model Management | Model-validatie & drift-monitoring checklist |
| KA7 | AI Interaction & UX | Prompt/UX-review (transparantie, vertrouwen, human-in-the-loop) |

De overige KA's (governance, strategie, architectuur, lifecycle, operations, kennisbeheer) zijn
meer organisatie- dan systeemgericht en overlappen deels met de Maturity Quick Scan (C).

## 4. Aanbevolen volgorde (indien we doorgaan)

1. **EU AI Act Compliance Checklist** (A): grootste gat, sterkste fit met bestaande features.
2. **Model Card / AI-systeemregistratie** (B): natuurlijk sluitstuk, sterke cross-form mapping.
3. **AI Maturity Quick Scan** (C): nieuw scoringstype; eerst featurecheck of totaalscore kan.
4. **Shadow AI Inventory** (D): tabelgedreven, goede instap.
5. **AI Governance Charter** (E): beleidsdocument, lagere prioriteit.

## 5. Aandachtspunten vóór implementatie

- **Taal:** AI-BOK-PDF is Engels; onze formulieren zijn Nederlands. Vertaling + afstemming op
  Rijks-terminologie (zoals eerder bij DPIA/PAR-harmonisatie) nodig.
- **Bron & licentie:** de templates mogen vrij worden gebruikt en aangepast ("may be freely used
  and adapted", p. 204). Bronvermelding (Jan Willem van Veen, AI-BOK v1.0) opnemen.
- **Featurecheck maturity-scan:** controleer of het schema berekende velden (som/gemiddelde)
  ondersteunt; anders als handmatige score + interpretatietabel.
- **Cross-form mappings:** EU AI Act-checklist en Model Card delen velden met intake/DPIA/AIIA;
  uitbreiden van `crossFormMappings.json` zou dubbel invullen voorkomen.
- **Decision gates:** het cumulatieve risiconiveau van de EU AI Act-checklist leent zich voor het
  bestaande gate-patroon (hoger risico ⇒ meer verplichte secties).

---
*Bron: AI Body of Knowledge (AI-BOK) v1.0, Jan Willem van Veen, 2026, Appendix "Templates,
Checklists and Quick Start" (p. 190–204) en Module 1 (kennisgebieden KA1–KA12).*
