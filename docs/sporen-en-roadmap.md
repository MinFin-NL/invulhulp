# Sporen: de indeling, en de roadmap van wat er nog ontbreekt

> **Status:** de indeling is doorgevoerd (juli 2026). De roadmap in §4 is een voorstel —
> geen commitment.
>
> **Herzien 12 augustus 2026 — de sporen zijn hernoemd naar de projectfasering van de
> organisatie** (zie `docs/nieuwe_indeling.md`): `intake` → `aanbieding` → `initiatie` →
> `uitvoering` → `afronding`. Intake en aanbieding zijn géén fase; ze staan wel in de
> tijdlijn maar krijgen geen fasenummer. Het spoor `beheer` is vervallen: `afronding`
> dekt het einde van het traject. De redenering in §1–§3 hieronder — één as, domein als
> facet — blijft onverkort gelden; alleen de namen en de knip tussen de fasen zijn
> veranderd. `TRACK_META` in `src/utils/tracks.ts` is de bron van waarheid.

Dit document legt vast *waarom* de formulieren zijn ingedeeld zoals ze zijn ingedeeld, zodat
de volgende persoon die een formulier toevoegt niet opnieuw hoeft te gokken. Het vervangt de
vorige indeling (Project / Compliance / Assessments / AI-governance).

## 1. Wat er mis was met de vorige indeling

De vier oude sporen waren vier *verschillende classificatie-assen* door elkaar:

| Oud spoor | Impliciete as | Vraag die het beantwoordde |
|---|---|---|
| Projectspoor | levensfase | wanneer in het traject? |
| Compliancespoor | juridische drijfveer | waarom moet ik dit? |
| Assessments | instrumenttype | wat voor document is dit? |
| AI-governance | onderwerpsdomein | waar gaat het over? |

Elk formulier scoort tegelijk op alle vier de assen, dus de categorieën konden per definitie
niet wederzijds uitsluitend zijn. Dat is de klassieke fout uit de informatie-architectuur: een
*facet* platslaan tot een *hiërarchie*. Het symptoom is altijd hetzelfde — overlap, wezen, en
auteurs die niet kunnen kiezen.

De symptomen waren allemaal aanwezig:

- **De DPIA is wettelijk verplicht (AVG art. 35) maar stond niet in Compliance.** De *EU AI
  Act Compliance Checklist* had "compliance" in de eigen titel en stond in Assessments.
  "Compliance" betekende dus niets consistents.
- **Quickscan BIO2 en Prescan DPIA zijn hetzelfde instrumenttype** — een triage die bepaalt of
  een zwaarder instrument nodig is — en stonden in verschillende sporen.
- **Het Compliancespoor had n=1.** Een categorie van één is geen categorie.
- **De cross-form-graaf sprak de sporen tegen.** Bijna elke van de 87 mappings in
  `crossFormMappings.json` kruiste een spoorgrens: `quickscan`→`prescandpia`,
  `aiia`→`modelcard`, `psa`→ vier formulieren in twee andere sporen. Als de sporen de
  werkelijke werkvolgorde beschreven, zouden de meeste kanten *binnen* een spoor lopen.
- **De eigen brainstormdocumenten konden niet classificeren.** In
  `AI-BOK-form-opportunities.md` en `DAMA-DMBOK-form-opportunities.md` kregen negen
  voorgestelde formulieren negen keer een slash of een "of": "`assessment` (of nieuwe track
  `eu-ai-act`)", "nieuw `data` of bestaand `compliance`", "`governance`/`data`". Een taxonomie
  die de eigen auteur niet kan bedienen, bedient de gebruiker ook niet.

## 2. De regel: één as, de rest wordt facet

**`track` = de levensfase.** Dat is de enige groeperingsas. Het is de as die de pijlen in de
UI al suggereerden, die de cross-form-graaf feitelijk volgt, en die de vraag beantwoordt die
de gebruiker heeft op het moment dat hij een dossier opent: *waar ben ik?*

**`domains` = het onderwerpsdomein**, als tag op de kaart: `privacy` · `beveiliging` · `ai` ·
`data` · `project`. Een formulier mag er meerdere hebben. Dit is bewust géén kop, want het is
een facet — het antwoordt op *wat raakt dit?*, een andere vraag.

> **Voeg nooit een spoor toe om een domein uit te drukken.** Een datakwaliteitsformulier is
> `track: "ontwerpen"` + `domains: ["data"]`, niet `track: "data"`. Precies die verwarring is
> hierboven opgeruimd.

## 3. De indeling

| Spoor (`track`) | Formulieren nu |
|---|---|
| `verkennen` — Verkennen & afbakenen | intake, quickscan (BIO), prescandpia |
| `besluiten` — Onderbouwen & besluiten | aanbiedingsformulier, restrisico |
| `ontwerpen` — Ontwerpen | ppm, psa, datakwaliteit, datasetregistratie |
| `toetsen` — Toetsen | dpia, aiia, iama, euaiact, dataethiek |
| `ingebruikname` — In gebruik nemen | modelcard, algoritmeregister, verwerkingsregister, toegankelijkheid |
| `beheer` — Beheren & evalueren | *(leeg, bewust zichtbaar)* |

`beheer` is leeg en wordt tóch getoond, met een `emptyHint` in `TRACK_META`. Het gat
zichtbaar maken is een doel van deze indeling, geen bijvangst: zolang de as klopt, is een leeg
spoor eerlijker dan een indeling die doet alsof er niets ontbreekt.

### Waarom de organisatiebrede formulieren zijn verwijderd

Drie formulieren zijn bij deze herindeling **verwijderd**: `governancecharter` (AI Governance
Charter), `maturityscan` (AI Maturity Quick Scan) en `shadowai` (Shadow AI Inventarisatie).
Ze staan in de git-historie en zijn daaruit terug te halen.

De reden is de eenheid van analyse. Alle formulieren in de tool beschrijven een *object*, en
dat object moet passen bij het dossier dat ze bevat:

| Formulier | Eenheid van analyse |
|---|---|
| intake, aanbiedingsformulier, ppm, psa, restrisico | **project** |
| prescandpia, dpia, verwerkingsregister, dataethiek | **verwerking** |
| aiia, iama, euaiact, modelcard, algoritmeregister | **AI-systeem** |
| quickscan, toegankelijkheid | **informatiesysteem / voorziening** |
| datakwaliteit, datasetregistratie | **dataset** |
| ~~governancecharter~~ | ~~organisatie~~ |
| ~~maturityscan~~ | ~~organisatie / afdeling~~ |
| ~~shadowai~~ | ~~afdeling~~ |

`Dossier` (`src/stores/assessmentStore.ts`) = één project, met `forms: Record<FormId,
FormState>` — één exemplaar van *elk* formulier. Je vult één governance charter in voor je
ministerie, niet één per project; de tool nodigde uit om dat veertig keer te doen. Dat de
drie **nul cross-form-mappings** hadden, in noch uit, was daar het meetbare symptoom van: ze
deelden niets met de rest omdat ze ergens anders over gingen.

Een eigen spoor eronder loste dat niet op — het gaf de mismatch alleen een nettere naam. Een
echte oplossing is een organisatieniveau *naast* de dossiers, met een eigen levensduur en
eigen rechten, wat `Dossier`-state, persistence, sharing en collab raakt. Tot dat er is, is
niets tonen eerlijker dan iets tonen dat structureel verkeerd staat.

**Consequentie voor nieuwe formulieren:** een instrument dat over de organisatie of een
afdeling gaat hoort niet in een dossier, en dus (voorlopig) niet in deze tool. Dat raakt ook
twee voorstellen in [`DAMA-DMBOK-form-opportunities.md`](DAMA-DMBOK-form-opportunities.md):
de data-management volwassenheidsscan (§4B) en het Data Governance Charter (§4D) zijn om
dezelfde reden geparkeerd.

De frictie project ↔ verwerking ↔ systeem is subtieler maar even echt: één project levert
drie systemen en vijf verwerkingen op, en dat is nu niet uitdrukbaar.

**Die frictie is met de uitbreiding van juli 2026 groter geworden, niet kleiner.** Het
verwerkingsregister beschrijft één *verwerking* (art. 30 AVG kent geen 'project'), en de
datakwaliteit- en dataset-formulieren beschrijven één *dataset*. Beide zijn fijnmaziger dan een
dossier: een project met drie datasets zou drie datasheets moeten opleveren, en `Dossier` biedt
er één. Dat is een andere fout dan bij de organisatiebrede formulieren — daar was het object
te *groot* voor het dossier, hier is het te *klein* — maar het is dezelfde onderliggende
beperking: `forms: Record<FormId, FormState>` staat precies één exemplaar van elk formulier toe.
Anders dan de organisatiebrede formulieren zijn deze wél in het dossier bruikbaar (ze koppelen
sterk aan de rest en beschrijven de kern van het project), dus ze zijn gebouwd met de kanttekening
in de intro van elk formulier: registreer de belangrijkste dataset of verwerking, en neem de
andere op als aanvullende registratie. Een echte oplossing vraagt herhaalbare formulierinstanties
binnen een dossier — dat raakt `Dossier`-state, persistence, export en collab, en is daarmee
hetzelfde soort ingreep als het organisatieniveau hierboven.

## 4. Roadmap: wat er ontbreekt

### 4.1 Het structurele gat: alles ná het besluit

Elk instrument in de tool is *ex ante*. In PDCA-termen: alleen Plan, niets voor Check en Act.
Dat is niet alleen theoretisch onbevredigend — het is precies waar de wetgeving doorlopende
verplichtingen legt, o.a. AI Act art. 26 (menselijk toezicht), art. 72 (post-market
monitoring), art. 73 (melden ernstige incidenten) en art. 12 (logging); AVG art. 35 lid 11
(herbeoordeling bij gewijzigd risico) en art. 33 (meldplicht datalek); en de Archiefwet voor
bewaren en vernietigen. Vandaar dat `beheer` als leeg spoor zichtbaar is.

### 4.2 Voorgestelde formulieren, geprioriteerd

Volgorde op (waarde × wettelijke hardheid) ÷ bouwkosten. Nrs. 1–4 zijn JSON-only en vormen
samen de sterkste sprong.

> **Status juli 2026:** nrs. **1, 2, 3, 4 en 9 zijn gebouwd** — samen met de data-ethiektoets
> (`DAMA-DMBOK-form-opportunities.md` §4E) zijn dat zeven nieuwe formulieren. Nrs. 5–8 en 10 staan
> nog open; nrs. 7, 8 en 10 vullen het lege `beheer`-spoor en daarmee het structurele gat uit §4.1,
> dus dáár zit nu de grootste winst. Herkomst per formulier: de `source`-blokken in de form-JSON en
> de lineage-tabel in de README.

| # | Formulier | Spoor | Grondslag / bron | Waarom |
|---|---|---|---|---|
| 1 ✅ | **Verwerkingsregister** | `ingebruikname` | AVG art. 30 | Breder verplicht dan een DPIA en nu volledig afwezig. Sterk tabelgedreven → past op de bestaande table-questions. Vult zich grotendeels uit dpia + intake via `crossFormMappings`. |
| 2 ✅ | **Restrisico-acceptatie / besluitformulier** | `besluiten` | sluitstuk van DPIA/AIIA/BIO | Klein formulier, groot effect. In elk risicoraamwerk is acceptatie door de verantwoordelijke eigenaar de sluitsteen; zonder handtekening bungelen alle assessments. Trekt restrisico's uit dpia/aiia/quickscan. |
| 3 ✅ | **Toegankelijkheidsverklaring** | `ingebruikname` | Tijdelijk besluit digitale toegankelijkheid overheid; EN 301 549 / WCAG 2.1 AA | Wettelijk verplicht voor overheidsdiensten en nergens gedekt. **Er bestaat een officieel model** (DigiToegankelijk) — harmoniseren zoals bij `par-dpia-form`, niet zelf verzinnen. |
| 4 ✅ | **Algoritmeregister-publicatie** | `ingebruikname` | Standaard van het Algoritmeregister | Vast veldenschema upstream → zelfde harmonisatie-aanpak. Sluit direct aan op de Model Card; veel velden zijn afleidbaar. |
| 5 | **Inkoop- & leverancierstoets AI** | `ontwerpen` | ARBIT/GIBIT; EU-modelcontractbepalingen AI-inkoop (PIANOo); NeRDS "open, tenzij" | De overheid bouwt zelden zelf. Voor ingekochte AI is dit het dominante risico-oppervlak en er is geen instrument voor. Geen kant-en-klaar NL-invulinstrument → afleiden. Neem exit-strategie / vendor lock-in expliciet op. |
| 6 | **Verwerkersovereenkomst-checklist** | `ontwerpen` | AVG art. 28 | Geen contract, wél een checklist of alle verplichte elementen erin staan. Klein en concreet. |
| 7 | **Periodieke herijking** | `beheer` | AVG art. 35 lid 11; AI Act art. 72 | Vraagt een nieuw patroon — "wat is er veranderd sinds de vorige DPIA/AIIA" verwijst terug naar eerdere antwoorden. **Mogelijk codewerk** (versievergelijking). |
| 8 | **Incidentregistratie & melding** | `beheer` | AVG art. 33/34; AI Act art. 73 | Tabelgedreven, JSON-only, met een beslisboom voor de meldplicht (past op het bestaande decision-gate-patroon). |
| 9 ✅ | **Datakwaliteit + dataset-registratie** | `ontwerpen` | DAMA-DMBOK; ISO/IEC 25012; DCAT-AP-NL, MIM 1.2 | Al uitgewerkt in [`DAMA-DMBOK-form-opportunities.md`](DAMA-DMBOK-form-opportunities.md) §4A en §4C — dat document is de spec. DPIA, AIIA en Model Card leunen allemaal op de datalaag die nu nergens wordt vastgelegd. |
| 10 | **Uitfaseringsplan** | `beheer` | Archiefwet; AVG art. 5 lid 1 sub e | Sluit de levenscyclus. Laagste urgentie, maar zonder dit blijft `beheer` half. |

> **Bij het bouwen:** de artikelverwijzingen hierboven zijn de *aanleiding*, niet de inhoud.
> Verifieer elke grondslag tegen de actuele wettekst voordat er gebruikersgerichte tekst in een
> formulier komt — mensen steunen op wat de tool zegt.

### 4.3 Bewust niet op de lijst

- **Een volledig BIO2-/ENSIA-instrument.** BIO2/ISO 27001 vraagt risicoanalyse,
  maatregelenmatrix en in-controlverklaring, met een eigen keten en een auditor. Dat is een
  eigen product en past slecht in de dossier-vorm. Beter ernaar verwijzen dan half nabouwen.
  (De Quickscan BIO2 v2.0 blijft wat hij is: een classificatietoets op beschikbaarheid,
  integriteit en vertrouwelijkheid, met een selectie van toepasselijke BIO2-maatregelen als
  input voor het risicoacceptatieformulier — geen risicoanalyse en geen in-controlverklaring.)

### 4.4 Open ontwerpvraag: toepasselijkheid per formulier

Alle dossiers tonen nu alle formulieren. Dat houdt op bij de toegankelijkheidsverklaring (nr.
3): een koppelvlak of dataproduct zonder gebruikersinterface valt er niet onder, en een leeg
formulier is niet te onderscheiden van een vergeten formulier. Analyse, opties en een
voorlopige aanbeveling staan in
[`toepasselijkheid-van-formulieren.md`](toepasselijkheid-van-formulieren.md) — nog te
besluiten, er is niets aan de formulieren gewijzigd.

### 4.5 Losse inhoudelijke observatie

44 van de 87 cross-form-mappings lopen tussen DPIA en AIIA (23 heen, 21 terug). Dat is een
sterk signaal van inhoudelijke duplicatie. De vraag of AIIA en IAMA allebei als volledig
formulier moeten bestaan — of dat één ervan een module binnen de ander wordt — is het
overwegen waard, maar staat los van de indeling.

## 5. Waar het in de code zit

- `public/forms/index.json` — `track`, `order`, `domains` per formulier
- `src/utils/tracks.ts` — `TRACK_META` (labels, beschrijvingen, volgorde, `emptyHint`),
  `TrackId`, `TRACK_IDS`, `groupFormsByTrack`, `trackLabel`, `connectorGlyph`
- `src/components/DossierDetail.vue` — de fasebalk bovenaan (`.phase-rail`, met per fase
  een NLDD-icoon in een cirkel die zich vult naar `done/total`), de verticale tijdlijn
  (`.track-timeline`) en `DOMAIN_LABELS`. De faseknoppen scrollen naar `#fase-<track>`.
  De icoon-maskers staan als **statische** `url()`-regels in het `<style>`-blok, één per
  fase — een runtime `:style`-binding levert in de productiebuild witte vierkanten op.
- `src/composables/useFormProgress.ts` — `trackSummary`: afgerond/totaal per fase
- `src/components/DossierList.vue` — de fasebalk op de dossierkaart
- `src/components/AppHeader.vue` — de fase-kruimel (`dossier › Toetsen › DPIA`)
- `src/services/formLoader.ts` — `FormIndexEntry`, `FormDomain`
- `.claude/skills/forms/SKILL.md` — de dev-contract voor het toevoegen van een formulier

> **Woordkeuze:** de gebruikersinterface zegt consequent **"fase"**; *spoor* / `track`
> blijft de term in de code, de form-registry en deze documentatie. Uitzondering: de
> `console.warn` bij een onbekende track en de beschrijving van het `onbekend`-spoor
> richten zich op de ontwikkelaar die `index.json` bewerkt en zeggen dus "spoor".

Een onbekende `track` in `index.json` belandt in een zichtbaar `onbekend`-spoor en logt een
`console.warn` — vroeger viel zo'n typo stil in de assessments-groep.
