# Plan: mogelijke nieuwe forms op basis van DAMA-DMBOK

> **Status:** verkenning / brainstorm, zonder toezeggingen. Dit document inventariseert welke
> assessments en formulieren we *zouden kunnen* toevoegen aan de invulhulp op basis van
> `docs/DAMA-DMBOK (2nd Edition) Data Management Body of Knowledge (DAMA International).pdf`
> (DAMA-DMBOK2, DAMA International, 2017).
>
> Elk nieuw formulier is in dit systeem een JSON-bestand in `public/forms/` + één regel in
> `public/forms/index.json`, met een bestaand `track` (levensfase) en `domains: ["data"]`.
> Geen codewijzigingen nodig. Zie het zusterdocument
> [`AI-BOK-form-opportunities.md`](AI-BOK-form-opportunities.md).
>
> **Update (juli 2026):** de drie projectgebonden voorstellen zijn **gebouwd**: §4A
> Datakwaliteit-assessment (`datakwaliteit`), §4C Dataset-registratie (`datasetregistratie`) en
> §4E Data-ethiektoets (`dataethiek`). §4B (volwassenheidsscan) en §4D (Data Governance Charter)
> blijven **geparkeerd**: organisatieniveau, past niet in een projectdossier. De gebouwde
> formulieren zijn `derived`: de concepten komen uit DAMA-DMBOK, de vragen zijn van ons; er is
> geen tekst overgenomen. Zie de lineage-tabel in de README.

## 1. Wat we nu al hebben

| Spoor (`track`) | Formulier | Dekt |
|---|---|---|
| verkennen | intake, quickscan (BIO/BBN), prescandpia | afbakening, beveiligingsniveau, DPIA-triage |
| besluiten | aanbiedingsformulier, restrisico | business case, portfolioafweging & restrisico-acceptatie |
| ontwerpen | ppm, psa, datakwaliteit, datasetregistratie | projectplan, architectuur & de datalaag |
| toetsen | dpia, aiia, iama, euaiact, dataethiek | privacy, AI-impact, grondrechten, EU AI Act, data-ethiek |
| ingebruikname | modelcard, algoritmeregister, verwerkingsregister, toegankelijkheid | registratie & publicatieverplichtingen |
| beheer | *(leeg)* | — |

**Het gat dat DAMA-DMBOK aanwijst:** onze forms draaien om *AI, privacy en beveiliging*, maar de
**datalaag daaronder** (datakwaliteit, metadata/dataset-registratie, datagovernance, data-ethiek)
is nauwelijks als eigenstandig instrument aanwezig. Juist die datalaag is de fundering waarop DPIA,
AIIA en de Model Card leunen (bijv. AIIA-vragen 5.1.x over trainingsdata en datakwaliteit, en de
Model Card-velden over inputdata en trainingsdata-bron). DAMA-DMBOK is dé referentie voor dat
fundament.

> **Niet toevallig:** de AI-BOK is *expliciet gemodelleerd naar* DAMA-DMBOK (centraal
> governance-gebied omringd door thematische kennisgebieden, elk met activiteiten, rollen,
> deliverables en metrics). DAMA-forms toevoegen versterkt dus de datazijde waarnaar de
> AI-BOK (KA5: Data & Semantics) al verwijst.

## 2. Belangrijk verschil met de AI-BOK

De AI-BOK-appendix leverde **kant-en-klare invul-templates** (Charter, Model Card, checklist, …).
DAMA-DMBOK doet dat niet: het is een **referentiekader** dat per kennisgebied *activiteiten,
deliverables, rollen en metrics* beschrijft. De forms hieronder zijn dus **afgeleid** van die
deliverables en van breed geaccepteerde DAMA-concepten (de DQ-dimensies, het maturity-model, de
Belmont-principes), niet één-op-één overgenomen. Dat vraagt iets meer ontwerp, maar de inhoud is
goed verankerd.

## 3. De 17 kennisgebieden (hoofdstukken) en hun form-potentieel

| Hfdst. | Kennisgebied | Form-potentieel |
|---|---|---|
| 2 | Data Handling Ethics | ⭐ Data-ethiektoets (Belmont: respect, weldoen, rechtvaardigheid) |
| 3 | Data Governance | ⭐ Data Governance Charter + readiness assessment |
| 4 | Data Architecture | Readiness-/risk assessment (laag; overlap met PSA) |
| 5 | Data Modeling & Design | Datamodel-review checklist (laag) |
| 6 | Data Storage & Operations | — (operationeel) |
| 7 | Data Security | Dataclassificatie & toegang (overlap met BIO-quickscan) |
| 8 | Data Integration & Interoperability | Koppelvlak-/interoperabiliteitsintake (niche) |
| 9 | Document & Content Management | — |
| 10 | Reference & Master Data | MDM-registratie-intake (niche) |
| 11 | Data Warehousing & BI | — |
| 12 | Metadata Management | ⭐ Dataset-/metadata-registratie (datasheet) |
| 13 | Data Quality | ⭐ Datakwaliteit-assessment (DQ-dimensies + regels + SLA) |
| 14 | Big Data & Data Science | Data-science-intake (niche) |
| 15 | Data Management Maturity Assessment | ⭐ Data-management volwassenheidsscan (niveaus 0–5) |
| 16 | Data Management Organization | Rollen/RACI (deels in Charter) |
| 17 | Organizational Change Management | — |

## 4. Kansrijke forms (laaghangend fruit)

### A. Datakwaliteit-assessment (DQA)  ⭐ hoogste prioriteit
- **Bron:** hoofdstuk 13 (Data Quality).
- **Wat:** per dataset/gegevensverwerking scoren op de **kern-DQ-dimensies** die DAMA noemt:
  *volledigheid (completeness), uniciteit (uniqueness), tijdigheid (timeliness), validiteit
  (validity), juistheid (accuracy), consistentie (consistency)*, plus optioneel bruikbaarheid,
  flexibiliteit, vertrouwen en waarde. Aangevuld met DQ-regels, meetmethode, geconstateerde issues
  en een DQ-SLA/verbeteractie.
- **Spoor:** `ontwerpen` · **domains:** `["data"]` · **gebouwd** als `datakwaliteit` (juli 2026).
- **Waarom sterk:** vult het grootste inhoudelijke gat; direct koppelbaar (cross-form) aan AIIA
  5.1.x (trainingsdata/datakwaliteit) en de Model Card (`mc_b.inputdata`, `mc_c.trainingsdata_bron`).
  Past op onze table- en radio/score-patronen.
- **Harmoniseren met:** DAMA-NL **DDQ** (60 datakwaliteitsdimensies), **ISO/IEC 25012**, beide al
  door de AI-BOK (KA5) genoemd.

### B. Data-management volwassenheidsscan  ⭐
- **Bron:** hoofdstuk 15 (Data Management Maturity Assessment).
- **Wat:** organisatie-/afdelingsbrede zelfscan per DAMA-kennisgebied op een schaal **0–5**:
  *0 = geen capability, 1 = initieel/ad hoc, 2 = herhaalbaar, 3 = gedefinieerd, 4 = beheerst,
  5 = geoptimaliseerd*. Gemiddelde → algeheel volwassenheidsniveau met aanbevelingen.
- **Spoor:** geen; **geparkeerd**: organisatieniveau, past niet in een projectdossier (zie [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §3).
- **Waarom sterk:** hergebruikt exact het patroon van de bestaande **AI Maturity Quick Scan**
  (`maturityscan`): snel te bouwen, alleen andere kennisgebieden en niveaus. Complementair: AI-
  volwassenheid naast data-volwassenheid.

### C. Dataset-/metadata-registratie (datasheet)  ⭐
- **Bron:** hoofdstuk 12 (Metadata Management), met hoofdstuk 10 (Reference & Master Data).
- **Wat:** registratie per dataset: naam, eigenaar/steward, bron & herkomst (lineage), inhoud,
  classificatie, bewaartermijn, kwaliteit, gebruiksvoorwaarden, licentie. In feite een *"Datasheet
  for Datasets"* (Gebru et al.) op overheidsniveau.
- **Spoor:** `ontwerpen` · **domains:** `["data", "privacy"]` · **gebouwd** als `datasetregistratie` (juli 2026).
- **Waarom sterk:** logisch sluitstuk naast de **AI Model Card** (systeem); dit is de *data*-kant.
  Sterke cross-form mapping vanuit PSA (`psa_d.gegevensmodel`) en naar AIIA/Model Card.
- **Harmoniseren met:** **DCAT-AP-NL** (Geonovum) en **MIM 1.2** (Geonovum/VNG) voor dataset-
  metadata; **SKOS/NL-SBB** voor begrippen, allemaal al in de AI-BOK-referenties.

### D. Data Governance Charter + readiness assessment
- **Bron:** hoofdstuk 3 (Data Governance), activiteiten 2.2 (readiness) en 2.5–2.8 (charter,
  operating model, principes).
- **Wat:** datagovernance-mandaat (scope, principes, organen, rollen/stewardship, besluitvorming,
  escalatie) + een readiness-/regelgevingstoets.
- **Spoor:** geen; **geparkeerd**: organisatieniveau, past niet in een projectdossier (zie [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §3).
- **Waarom interessant:** spiegelt het bestaande **AI Governance Charter**; samen dekken ze AI- én
  data-governance. Grotendeels tabelgedreven (past op onze table-questions).

### E. Data-ethiektoets
- **Bron:** hoofdstuk 2 (Data Handling Ethics), §3.1 (Belmont-principes, aangepast voor data).
- **Wat:** ethische toets van een gegevensverwerking langs **respect voor personen**, **weldoen
  (do no harm / baten-schade)** en **rechtvaardigheid (gelijke behandeling)**, met concrete
  reflectievragen (geïnformeerde toestemming, transparantie, minst-ingrijpende alternatief,
  ongelijke behandeling van groepen).
- **Spoor:** `toetsen` · **domains:** `["data", "privacy"]` · **gebouwd** als `dataethiek` (juli 2026).
- **Waarom interessant:** complementair aan IAMA (grondrechten) en AIIA (proportionaliteit); legt de
  *data*-ethiek vast die daar impliciet blijft. Vooral tekst/radio, dus geschikt voor AI-modus.

## 5. Harmonisatie: waarmee lijnen we uit?

Anders dan bij de AI-BOK (waar we 1-op-1 aansloten op MinBZK-instrumenten uit `par-dpia-form` en
`task-registry`), zijn er voor de datalaag geen kant-en-klare MinBZK-invulinstrumenten. Wel bestaan
er gezaghebbende **NL-overheid data-standaarden** om mee te harmoniseren, grotendeels dezelfde die
de AI-BOK (KA5) al aanhaalt:

| Form | Harmoniseren met | Waarom |
|---|---|---|
| Datakwaliteit-assessment | DAMA-NL DDQ (60 dimensies), ISO/IEC 25012 | gestandaardiseerde DQ-dimensies & meetmethoden |
| Dataset-/metadata-registratie | DCAT-AP-NL (Geonovum), MIM 1.2, SKOS/NL-SBB | overheidsstandaard voor dataset-metadata & begrippen |
| Data Governance Charter | DAMA-DMBOK operating model; COBIT/AVG voor regelgevingstoets | governance-structuur & compliance |
| Data-ethiektoets | Belmont (US-HSS 1979); AVG-beginselen | ethische verankering + juridische koppeling |
| Logging/verwerkingen (optioneel) | NEN 7513 / **Logboek Dataverwerkingen** (Logius) | transparantie AVG (zie skill `standaarden:ls-logboek`) |

> In de repo zitten al skills die hierbij helpen: `developer-overheid-nl-agent-skills:don-data`
> (data delen, DCAT-AP, basisregistraties, data governance) en de Logius `standaarden:ls-*`-skills.
> Die kunnen de Nederlandse terminologie en veldnamen aanscherpen bij het daadwerkelijk bouwen.

## 6. Aanbevolen volgorde (indien we doorgaan)

1. **Data-management volwassenheidsscan** (B): snelst: hergebruikt het `maturityscan`-patroon.
2. **Datakwaliteit-assessment** (A): grootste inhoudelijke gat; sterke cross-form links.
3. **Dataset-/metadata-registratie** (C): datacomplement van de Model Card; DCAT-AP-NL-harmonisatie.
4. **Data Governance Charter** (D): spiegelt het AI Governance Charter.
5. **Data-ethiektoets** (E): verdiept de ethiek naast IAMA/AIIA.

## 7. Aandachtspunten vóór implementatie

- **Géén nieuwe track.** `track` is uitsluitend de *levensfase*; het onderwerpsdomein is een facet
  (`domains: ["data"]`) dat als tag op de kaart verschijnt. Een `data`-track zou de
  as-vermenging terugbrengen die in juli 2026 is opgeruimd; zie
  [`sporen-en-roadmap.md`](sporen-en-roadmap.md).
- **Computed scores:** net als bij de AI Maturity Scan heeft ons schema geen berekende velden; som/
  gemiddelde blijven handmatig, met interpretatietabel in de guidance.
- **Overlap bewaken:** Data Security (hfdst. 7) en Data Architecture (hfdst. 4) overlappen met de
  BIO-quickscan en de PSA, dus daar géén dubbel instrument bouwen.
- **Cross-form mappings:** de sterkste winst zit in koppelingen tussen de data-forms en de bestaande
  AI-forms (DQA/dataset-registratie → AIIA 5.1.x en Model Card `mc_b`/`mc_c`).
- **Licentie/bron:** DAMA-DMBOK2 is auteursrechtelijk beschermd (DAMA International). We nemen geen
  tekst over, maar leiden forms af van algemeen geaccepteerde concepten; bronvermelding opnemen.

---
*Bron: DAMA-DMBOK2: Data Management Body of Knowledge, 2nd Edition (DAMA International, 2017),
o.a. hfdst. 2 (Data Handling Ethics), 3 (Data Governance), 12 (Metadata), 13 (Data Quality),
15 (Maturity Assessment). Zie ook het zusterdocument `AI-BOK-form-opportunities.md`.*
