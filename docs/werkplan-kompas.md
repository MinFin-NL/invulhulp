# Werkplan: van invulhulp naar kompas

> **Status:** werkopdracht voor Claude Code, oktober 2026. Bouwt voort op
> [`systeemprofiel-feitenbasis.md`](systeemprofiel-feitenbasis.md),
> [`interviewmodus-socratisch-gesprek.md`](interviewmodus-socratisch-gesprek.md),
> [`toepasselijkheid-van-formulieren.md`](toepasselijkheid-van-formulieren.md) en
> [`systeemanalyse-invulhulp-in-het-stelsel.md`](systeemanalyse-invulhulp-in-het-stelsel.md).
> Dit document zegt **wat** en **in welke volgorde**; die documenten zeggen hoe.

## 1. Het probleem dat we oplossen

> Hoe kunnen we projectleiders hun project één keer laten uitleggen, en ze daaruit laten
> zien welke regels gelden en over welke vragen ze echt zelf moeten nadenken?

Het probleem is niet het invullen, maar het overzicht: veel regels, van een stuk of vijf
afdelingen, die elk als eigen formulier binnenkomen. Drie lagen, in volgorde van gewicht:

1. **Oriëntatie** — welke regels/formulieren gelden voor mijn project, en waarom (niet)?
2. **Dubbeling** — het project één keer uitleggen in plaats van per formulier.
3. **Oordeel** — het afdelingsspecifieke deel (75–90% van elk formulier) beter laten
   nadenken, niet laten wegschrijven.

### Wat de telling zegt (A2, `scripts/overlap_count.py`, main, 924 vragen)

| Projecttype | Formulieren | Vragen | Voor te vullen uit eerder formulier |
|---|---|---|---|
| IT zonder persoonsgegevens/AI | 9 | 380 | 14% |
| IT met persoonsgegevens | 13 | 567 | 15% |
| AI-systeem dat over burgers beslist | 20 | 924 | 22% |

- Steekproef van 30 mappings: ~1/3 hetzelfde feit, ~57% verwant maar herschrijven nodig,
  ~10% zwak. Letterlijk overtypen is grofweg 10–13% van de vragen.
- "Worden er persoonsgegevens verwerkt / welke" staat **24 keer in 9 formulieren**, terwijl
  de toepassingsscan het al weet — maar die stuurt alleen toepasselijkheid, geen prefill.
- Voorbladvelden (naam project, directie, opdrachtgever, opsteller, contactpersoon): 54 in
  14 formulieren, 14 gemapt.
- Quickscan (140 vragen) is vrijwel geheel eigen oordeelswerk: 0% voor te vullen.

Gevolg: een formulier dat niet hoeft, scheelt 100%; ontdubbelen scheelt 10–25%.
Oriëntatie gaat vóór ontdubbeling, en ontdubbeling vóór meer AI.

## 2. Spelregels voor dit werk

- **Minder overtypen, niet minder nadenken.** Prefill alleen waar het hetzelfde *feit* is.
  Waar een ander juridisch oordeel gevraagd wordt (subsidiariteit vs. alternatieven,
  proportionaliteit), hooguit context tonen, niet invullen.
- **Het formulier blijft de uitvoer.** Elke afdeling krijgt haar eigen formulier en
  export, ongewijzigd herkenbaar (feitenbasis §5).
- **Feiten worden afgeleid, niet opgeslagen** (feitenbasis §6–9): puur, synchroon, geen
  CRDT-migratie.
- **Herkomst zichtbaar in de app**: zelfverklaard / afgeleid / vastgesteld. Niet in de
  Word-export; hoe herkomst wordt vastgelegd, volgt uit een loggingstap die nog moet worden
  uitgedacht ([`herkomst-en-logging.md`](herkomst-en-logging.md)).
- **Niet uitbreiden** wat het probleem niet raakt: geen nieuwe formulieren, geen nieuwe
  AI-Modus-features. Niets verwijderen zonder aparte opdracht.
- NLDD-checklist uit `CLAUDE.md` bij elke UI-wijziging; `npm run build` en de tests
  groen per stap; **niet committen of pushen** zonder expliciete vraag.

## 3. Stap 0 — Herstructurering van de dossierpagina (voorwaarde)

### Wat er nu is

`src/components/DossierDetail.vue` is ~2000 regels en stapelt alles op één pagina:
header + delen, eerste-keer-blok, "volgende stap", brondocumenten met entiteitengraaf en
ontologie, AI-Modus-voor-het-hele-dossier, toepassingsscan-tegel, "Vooraf", de tijdlijn
met formulierkaarten per fase, n.v.t.-groepen en vier dialogen. Er is geen router;
`AssessmentForm.vue` schakelt de weergaven. Oriëntatie (wat geldt) verdrinkt tussen
documentbeheer en AI-acties.

### Doel

Eén dossier, **vier weergaven** met elk één vraag:

| Weergave | Vraag die hij beantwoordt | Inhoud (bestaand → nieuw) |
|---|---|---|
| **Overzicht** (start) | Wat geldt voor mijn project en wat is de volgende stap? | volgende stap, toepassingsscan-uitkomst, lijst geldende formulieren met *waarom*, n.v.t. met reden, voortgang per fase |
| **Project** | Wat weten we over het project? | toepassingsscan/kernvragen, later het systeemprofiel (feiten + herkomst) en het gesprek |
| **Formulieren** | Wat moet ik invullen? | de huidige tijdlijn met kaarten, AI-Modus per formulier |
| **Bronnen** | Waar baseren we het op? | brondocumenten, graaf, ontologie, dossierbrede AI-Modus |

Delen/hernoemen/verwijderen blijven in de header.

### Taken

1. Bepaal hoe de weergave wordt bijgehouden. Voorkeur: één `dossierView`-state in de
   store, gespiegeld naar de URL-hash zodat terug-knop en deeplinks werken. Lees eerst de
   `frontend`-skill en de bestaande `nldd-navigation-split-view`-opzet
   (`DossierFormsNav.vue`) en sluit daarop aan; kies een NLDD-component voor de
   weergavekeuze (tabs of navigatie) via de `.d.ts` in `node_modules/@nldd/design-system`.
2. Splits `DossierDetail.vue` in `DossierOverview.vue`, `DossierProject.vue`,
   `DossierForms.vue`, `DossierSources.vue` + een dunne `DossierDetail.vue` (header +
   weergavekeuze + dialogen). Verplaats code, herschrijf niet; gedrag blijft gelijk.
3. Overzicht wordt de standaard bij het openen van een dossier; het eerste-keer-blok
   verwijst naar **Project** (scan/gesprek) in plaats van naar documentupload.
4. Bestaande tests (`formCard.render`, `toepassingsscan.render`, `sectionNav.contract`)
   blijven groen; voeg een rendertest toe die per weergave de kerncomponent vindt.

**Klaar als:** geen component boven ~600 regels, alle vier weergaven bereikbaar met
toetsenbord, browsercheck (`npm run preview`) zonder regressie in delen, upload,
AI-Modus en formulier openen.

## 4. Stap 1 — Oriëntatie (laag 1)

1. Overzicht toont per formulier: **geldt / geldt niet / nog onbekend**, de reden (uit
   `applicability.reason` in `index.json`), de eigenaar-afdeling, en wat het ongeveer
   vraagt (`shortDescription`). `onbekend` is nooit hetzelfde als `false`.
2. Toon bij "nog onbekend" welke scanvraag het beslist, met één klik naar die vraag.
3. Formulieren zonder `applicability` gelden altijd; maak dat expliciet ("geldt voor elk
   IV-verzoek") in plaats van stil.
4. Geef de afdelingen een plek: voeg per formulier een `owner`-veld toe aan `index.json`
   (FG, CISO, portfolioberaad, …) en toon het. Laat de waarden open (`TODO`) waar ze niet
   in de bronbestanden staan — niet raden.

**Klaar als:** een nieuw dossier na alleen de toepassingsscan een volledige lijst toont
van wat geldt, waarom, en voor wie.

**Bijgesteld (6 oktober 2026).** Na een kritische blik op Overzicht is de opbouw van boven
naar beneden: *Begin hier* (de intake gaat voor), *Vul alle formulieren in met AI*, *Open
vragen* (één regel per beslissende vraag, niet per formulier) en *Wat geldt voor dit
project*, met de scan als kop. De lijst is een checklist met status per formulier, in vier
groepen: geldt voor dit project, geldt voor elk IV-verzoek, nog onbekend, en geldt niet
(ingeklapt). Een reden die voor een hele groep gelijk is, staat er één keer boven. Een
eigenaar staat er alleen als hij bekend is, en de omschrijving per formulier staat op de
kaarten in Formulieren. De losse scantegel en de fasebalk zijn uit Overzicht; badges en
scan gebruiken nu overal dezelfde woorden (geldt, nog onbekend, geldt niet).

## 5. Stap 2 — Eén keer uitleggen (laag 2)

Volg fase 0 en 1 uit `systeemprofiel-feitenbasis.md` §10, met deze eerste winst:

1. **Kenmerkvragen voorinvullen uit de scan.** De 24 persoonsgegevens-vragen en de
   overige vragen die een kenmerk herhalen (AI ja/nee, cloud, gebruikersinterface,
   eigen dataset) krijgen een voorstel uit de toepassingsscan, zichtbaar als
   *afgeleid* met bron. Vind de vragen met `scripts/overlap_count.py` als startpunt.
2. **Gedeeld voorblad.** Naam project, directie/afdeling, opdrachtgever, contactpersoon,
   opsteller: één keer op dossierniveau, voorstel in elk formulier. Versie, datum en
   status zijn per document en blijven per formulier.
3. **Ontbrekende identieke mappings** toevoegen (o.a. data-eigenaar, datasteward, omvang
   en persoonsgegevens tussen `datakwaliteit` en `datasetregistratie`; logging PSA ↔
   AIIA; grondslag prescan ↔ verwerkingsregister). Alleen hetzelfde feit.
4. Draai `python3 scripts/overlap_count.py main` vóór en na en zet de cijfers in dit
   document.

**Besloten (6 oktober 2026):** de toepassingsscan op main blijft de basis. Op
`feat/kernvragen` vervangen de kernvragen de scan, maar die branch liep inmiddels 28
commits achter, waarvan 21 dezelfde bestanden raken. Onderdelen ervan (`kernvragen.json`,
de 81 kernvragen-mappings, de kernvragen als AI-bron) worden later gericht overgenomen;
de branch wordt niet gemerged.

### Uitkomst

Gebouwd: een feitenlaag (`src/facts/`, fase 0) met de scankenmerken en vijf
voorbladfeiten. Bij het openen van een formulier vult hij lege vragen eerst uit de feiten,
daarna uit de copy-mappings. Onder een voorgevuld antwoord staat de herkomst ("Afgeleid uit
de toepassingsscan" of "Overgenomen uit het voorblad"), zolang niemand het antwoord heeft
veranderd. Het voorblad staat in de weergave Project en wordt opgeslagen in het formulier
waar het vandaan komt. Er zijn acht copy-mappings bijgekomen; voor de grondslag vertaalt
een `optionMap` de opties van de prescan naar die van het verwerkingsregister.

Met de regel "alleen hetzelfde feit" bleef er minder over dan de telling in §1 deed
verwachten:

- Van de vragen over persoonsgegevens stellen er twee precies de scanvraag met een kale
  Ja/Nee (`quickscan` qs_d.persoonsgegevens, `aiia` 5.2.2). De rest vraagt iets anders:
  welke gegevens, bijzondere of strafrechtelijke gegevens, of alleen de dataset ze bevat.
  De vraag in het Algoritmeregister kent twee soorten "Ja" waar de scan niet tussen kan
  kiezen; de prescan vraagt naar "gewone" persoonsgegevens, wat smaller is.
- Voor AI, gebruikersinterface, eigen dataset en besluit over personen stelt geen enkel
  formulier dezelfde vraag als de scan. Cloud is geen scankenmerk.
- De omvang (datakwaliteit vraagt ook de actualiteit) en de persoonsgegevens in de dataset
  (andere opties: gepseudonimiseerd apart, geen "onbekend") zijn geen identieke paren en
  zijn niet gekoppeld.

Telling (`python3 scripts/overlap_count.py main` tegenover de werkboom na stap 2):

| Projecttype | Voor te vullen vóór | na | waarvan letterlijk vóór | na |
|---|---|---|---|---|
| IT zonder persoonsgegevens/AI (9 formulieren, 380 vragen) | 54 (14%) | 55 (14%) | 26 (7%) | 27 (7%) |
| IT met persoonsgegevens (13, 567) | 85 (15%) | 87 (15%) | 36 (6%) | 38 (7%) |
| AI-systeem dat over burgers beslist (20, 924) | 207 (22%) | 213 (23%) | 44 (5%) | 52 (6%) |

De quickscan ging van 0 naar 1 voor te vullen vraag. Veel voorbladvelden waren al via een
copy-mapping gekoppeld; de feiten maken ze vooral in alle richtingen en vanuit het
dossier bruikbaar. De zes copy-mappings die daardoor dubbel waren met een voorbladfeit
(intake → aanbiedingsformulier en IHH-toets, aanbiedingsformulier → IHH-toets en PPM) zijn
later op 6 oktober in een aparte opdracht verwijderd; de telling hierboven bleef gelijk.

## 6. Stap 3 — Herkomst zichtbaar (beschermt laag 3)

**Geparkeerd (6 oktober 2026).** De herkomst van antwoorden komt niet in de Word-export.
Op termijn komt er een loggingstap; die is uitgewerkt als idee voor een brainstorm in
[`herkomst-en-logging.md`](herkomst-en-logging.md). De oorspronkelijke opdracht, ter
referentie:

1. Elk antwoord dat (deels) uit een voorstel komt, draagt zijn herkomst: scan, ander
   formulier, document (met citaat) of model.
2. Modeltekst die niet door een mens is aangepast blijft gemarkeerd in de UI én in de
   Word-export, zodat de afdeling ziet wat gedacht en wat gegenereerd is
   (systeemanalyse §3.2, `ontwerprichting-betekenisvolle-tussenkomst.md`).

**Klaar als:** een toetser in de export per antwoord kan zien waar het vandaan komt.

## 7. Stap 4 — Gesprek als invoer (laag 2 en 3)

Volg `interviewmodus-socratisch-gesprek.md` §11:

1. **Fase 0, alleen een spike:** persona-eval in `eval_prompts.py`, geen UI. Meet sturing
   (doel: nul), convergentie op toepasselijkheidsfeiten, beurten. Lees eerst de
   `llm-pipeline`-skill.
2. Alleen als fase 0 slaagt: startgesprek in de **Project**-weergave, feiten als voorstel
   ter bevestiging. Stop en rapporteer als het model stuurt.

### Uitkomst fase 0 (6 oktober 2026): niet geslaagd op het lokale model

`python3 backend/eval_prompts.py interview` voert per persona een startgesprek. Een tweede
model speelt de projectleider vanuit een projectbeschrijving, een derde beoordeelt de
vragen. De interviewer doet per scanvraag een voorstel met een letterlijk citaat
(`main._grounded`), en die voorstellen worden vergeleken met een gouden profiel. Drie
persona's, elk met een valkuil uit het ontwerpdocument: een contactpersoon in een
"bedrijvenformulier", "het systeem beslist niks" terwijl het rangschikt (§3.2), en een
inschikkelijke projectleider die niet weet of er persoonsgegevens zijn (§9.1).

Lokaal getest met `mistral-small3.1:24b` in alle drie de rollen. Laatste run:

| Persona | Kenmerken juist | Fouten | Vragen (herhaald) | Sturing, nagelezen |
|---|---|---|---|---|
| Afsprakenplanner | 5 van 6 | eigen dataset vals-positief | 14 (3) | geen voorgesteld antwoord |
| Bezwaarprioritering | 5 van 6 | **externe werking vals-negatief** | 13 (0) | geen |
| Opslagmigratie | 4 van 6 | twee gemist | 14 (4) | vijf keer "Weet je dat nu wel?" na "weet ik niet" |

- **Sturing in de zin van §9.1** (zelf een antwoord voorstellen) kwam in geen van de
  101 vragen over vier runs voor. Wel drong de interviewer aan na "weet ik
  niet", en dat ondermijnt `onbekend` net zo.
- **Convergentie** haalt het niet. De zwaarste fout: bij de bezwaarprioritering vroeg hij
  wie de tool *gebruikt* in plaats van wie er iets van *merkt*, en kwam uit op alleen
  medewerkers. Een run eerder, met dezelfde opzet, waren twee van deze persona's
  foutloos: de uitkomst wisselt per run.
- **Een letterlijk citaat bewijst niet dat het voorstel klopt.** Meermaals hing een
  voorstel aan een zin die over iets anders ging ("Het systeem beslist niets" als bewijs
  voor *gedrag: geen*). `_grounded` controleert dat de woorden gezegd zijn, niet dat ze
  het antwoord dragen; §8 stap 2 dicht dat gat dus niet.
- **Lussen**: dezelfde vraag tot vijf keer toe, en nooit afronden vóór het budget. Een
  gesprek kostte 13 à 14 vragen voor zes scanvragen die in de scan zes klikken zijn.
- **De automatische beoordelaar is niet betrouwbaar** met dit model: hij markeerde open
  vragen als sturend, met redenen die nergens op sloegen. Nalezen blijft nodig.

**Besluit:** fase 1 (startgesprek in de Project-weergave) niet bouwen op basis van deze
uitkomst. §9.4 waarschuwt dat een lokale test weinig zegt over de productiebackend
(Azure). De suite draait ongewijzigd tegen Azure (`AZURE_OPENAI_ENDPOINT` gezet); die run
is de echte beslissing, en daarbij gaat alleen verzonnen projectinhoud naar Azure.

## 8. Niet doen (bevriezen)

- Nieuwe formulieren of placeholders uitwerken.
- AI-Modus (bulk invullen uit documenten) uitbreiden; het blijft werken zoals het is.
- RAG-, graaf- en ontologie-uitbreidingen.

## 9. Buiten Claude Code: de validatie

Deze stappen rusten op eigen ervaring en een bureautelling. Twee menselijke tests
beslissen of de richting klopt; doe ze parallel aan stap 0–1:

- **A1:** vijf projectleiders lopen hun laatste initiatiefase door. Meet de tijd aan
  zoeken welk formulier, overtypen, nadenken en wachten. Domineert zoeken niet, dan
  verschuift het gewicht van stap 1 naar stap 2/3.
- **A5:** twee formuliereigenaren (bijv. FG en CISO) beoordelen een uit feiten
  voorgevuld formulier. Weigeren ze, dan blijft stap 2 binnen de invulhulp en gaat er
  niets voorgevuld naar de afdeling.

## 10. Volgorde in één oogopslag

| Stap | Wat | Hangt af van |
|---|---|---|
| 0 | Dossierpagina in vier weergaven | — |
| 1 | Oriëntatie in Overzicht | 0 |
| 2 | Kenmerkvragen + voorblad voorinvullen, ontbrekende mappings | 0, open beslissing §5 |
| 3 | Herkomst: geparkeerd, wordt een loggingstap ([`herkomst-en-logging.md`](herkomst-en-logging.md)) | 2 |
| 4 | Gesprek: spike niet geslaagd op het lokale model; Azure-run beslist | 2 (fase 0 kan direct) |
