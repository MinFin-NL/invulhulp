# Addendum: meer beslishulpen, en de lineage opnieuw bekeken

> **Status:** ontwerp / verkenning, zonder toezeggingen en zonder code. Addendum bij
> [`beslishulp-integration-design.md`](beslishulp-integration-design.md), geschreven nadat de
> Beslishulp AI-verordening daadwerkelijk is gebouwd. Het oorspronkelijke ontwerp beschreef een
> *iframe-embed* met een uitkomst-contract; wat er staat is iets anders en beters (een gevendorde,
> geconverteerde beslisboom die lokaal draait). Dit document beschrijft (1) wat het toevoegen van
> een *tweede* beslishulp blokkeert, (2) welke beslishulpen kandidaat zijn, en (3) waarom de
> lineage van de tool nu uit drie losse systemen bestaat die niets van elkaar weten.
>
> Zie ook: [`sporen-en-roadmap.md`](sporen-en-roadmap.md) (§4 roadmap, §3 eenheid van analyse),
> [`cross-form-connecties.md`](cross-form-connecties.md), README § *Form lineage*.

## 1. Wat er nu staat

| Onderdeel | Waar |
|---|---|
| Beslisboom als runtime-asset | `public/beslishulp/ai-verordening.json`: 22 vragen, 50 conclusies, 108 definities |
| Gepinde upstream-kopie | `vendor/ai-verordening-beslishulp/` (MinBZK, EUPL-1.2) |
| Conversie | `scripts/convert-beslishulp.mjs`, `npm run beslishulp:build` |
| Engine | `src/utils/beslishulp.ts`: guard-AST, `replay`, `answerStep`, risicoladder |
| Laden | `src/services/beslishulpLoader.ts` |
| UI | `BeslishulpModal.vue`, `BeslishulpTile.vue` (vastgeplakt aan de euaiact-kaart), `RiskClassification.vue` |
| Opslag | `FormState.beslishulp` op `euaiact`, via `store.beslishulpRun` |

De **engine is al generiek**: het is een labelmachine met een vooraf geparseerde guard-AST; niets
in `evaluateGuard`, `replay` of `answerStep` weet iets van de AI-verordening. De uitbreiding
vraagt dus geen herbouw.

## 2. Wat een tweede beslishulp blokkeert

Drie plekken coderen "er is er precies één":

| Plek | Wat er hardcoded staat |
|---|---|
| `src/services/beslishulpLoader.ts:16` | vaste URL `/beslishulp/ai-verordening.json`, één gecachete promise |
| `src/utils/beslishulp.ts:121` | `BESLISHULP_HOST_FORM_ID = 'euaiact'`: de run woont op de state van een *formulier*; de comment erboven geeft toe dat dat een PoC-afkorting is |
| `src/utils/beslishulp.ts:262/271/307` | `RISK_LADDER`, `RISK_NEUTRAL_LABELS`, `OUT_OF_SCOPE_CONCLUSION_PREFIX`: AI-verordening-semantiek in engine-code |

Voorstel, in deze volgorde:

1. **Register.** `public/beslishulp/index.json`, analoog aan `public/forms/index.json`:
   `{id, file, title, shortDescription, hostFormId?, source}`. De loader wordt
   `loadBeslishulpTree(id)` met een `Map<id, Promise>` in plaats van één promise.
2. **Opslag op dossierniveau.** `dossier.beslishulps: Record<BeslishulpId, BeslishulpRun>` in
   plaats van `forms.euaiact.beslishulp`. Dit raakt `src/models/Assessment.ts`,
   `assessmentStore.ts`, de CRDT-codec (`src/collab/dossierDoc.ts`) en het backend-payloadmodel:
   precies de vier plekken die het oorspronkelijke ontwerp wilde vermijden. Met één beslishulp was
   dat de juiste afweging; met een register is het niet meer vol te houden, want een
   AVG-rolbepaling hoort niet op de euaiact-state.
3. **Uitkomst-mapping in het asset.** De ladder, de risiconeutrale labels en de out-of-scope-regel
   verhuizen naar een `outcome`-blok in de tree-JSON, geëmitteerd door `convert-beslishulp.mjs`.
   Zo blijft de uitputtendheidstest in `beslishulp.test.ts` (elk label is óf gemapt óf expliciet
   risiconeutraal) *per boom* werken in plaats van alleen voor deze ene.

Pas daarna is een nieuwe beslishulp toevoegen wat een nieuw formulier nu al is: een bestand plus
een regel in een index.

## 3. Kandidaat-beslishulpen

Gerangschikt op of de uitkomst iets **scopet dat de tool al heeft**. Dat is het criterium uit de
README: een beslishulp bepaalt de scope, findocs vult in.

### 3.1 Tier 1: de uitkomst bepaalt welk bestaand instrument van toepassing is

| Beslishulp | Bepaalt | Voedt |
|---|---|---|
| **AVG-rolbepaling** (verwerkingsverantwoordelijke / gezamenlijk / verwerker) | welke rol je hebt, en daarmee of je een register onder art. 30 lid 1 of lid 2 moet bijhouden | verwerkingsregister (structureel, niet alleen een veld), DPIA "betrokken partijen met AVG-rol per partij", roadmap #6 verwerkersovereenkomst-checklist |
| **Meldplicht datalek** (AVG art. 33/34) | melden aan de AP ja/nee, betrokkenen informeren ja/nee | roadmap #8 incidentregistratie; dit *is* de beslispoort van dat formulier, en het vult het lege `beheer`-spoor |
| **Doorgifte buiten de EER / TIA** (Schrems II; EDPB-aanbevelingen 01/2020, zes stappen) | adequaatheidsbesluit / SCC + aanvullende maatregelen / niet toegestaan | DPIA-doorgiftesectie, doorgiftevelden van het verwerkingsregister (nu vrije tekst waar men naar raadt) |
| **Inkoop vs. zelfbouw AI** (PIANOo, EU-modelcontractbepalingen AI) | welke verplichtingen bij jou landen als inkopende partij | roadmap #5 inkoop- & leverancierstoets; de splitsing gekocht/gebouwd is bij uitstek een scopebeslissing |
| **Archiefwet: bewaren of vernietigen** (selectielijst) | bewaartermijn en grondslag | roadmap #10 uitfaseringsplan, bewaartermijnen in het verwerkingsregister |
| **Mag deze dataset open?** (Woo / Who, hergebruik) | open / beperkt / gesloten, met grond | gebruiksvoorwaarden in de dataset-registratie; dit is IBDS/ICTU-terrein, dus eerst navragen bij teamIBDS@ictu.nl |

### 3.2 Tier 2: klein, regelgebaseerd, zonder upstream-boom

- **AcICT/BIT-toets en CIO-oordeel: drempel gehaald?** (> € 5 mln): pure drempellogica, voedt het
  aanbiedingsformulier.
- **Valt deze dienst onder het Tijdelijk besluit digitale toegankelijkheid, en welke
  nalevingsstatus?** Voedt de toegankelijkheidsverklaring, die nu veronderstelt dat de gebruiker
  dat al weet.
- **Risicoafweging Rijksbreed cloudbeleid 2022**: voedt de PSA.

### 3.3 Bestaande beslishulpen van derden

De README noemt naast de MinBZK-boom ook de **AI & Algoritmes Kwalificatie Tool (AI AQT)** van
Algorithm Audit (EUPL-1.2). Die overlapt grotendeels met de MinBZK-boom (AI-verordening +
rol/status + risico) maar voegt AVG-kwalificatie toe. Overwegen als *alternatief* naast de
MinBZK-boom heeft weinig zin zolang beide hetzelfde beantwoorden; interessanter is de vraag of het
AVG-deel ervan de rolbepaling uit §3.1 al invult. Uitzoeken vóór we die zelf bouwen.

De IBDS-overzichtspagina (ICTU) verzamelt meer beslishulpen dan hier genoemd; het register uit §2
is er juist om die te kunnen opnemen zonder codewijziging.

### 3.4 Twee bestaande formulieren zijn eigenlijk beslishulpen

[`sporen-en-roadmap.md`](sporen-en-roadmap.md) §1 constateert al dat **Quickscan BIO2** en
**Prescan DPIA** "hetzelfde instrumenttype" zijn: een triage die bepaalt of een zwaarder instrument
nodig is. Dat is letterlijk de definitie van een beslishulp in de README. Beide zijn beslisbomen
die als vragenlijst zijn gerenderd: de quickscan leidt naar een BBN-niveau plus "is een DPIA
nodig", de prescan naar "is een volledige DPIA verplicht" volgens de AP/EDPB-criteria.

Ze omzetten naar beslishulpen zou de scope→invullen-verhaallijn consistent maken, en de prescan is
toch al `generated` uit een gevendorde MinBZK-definitie, dus die blijft hoe dan ook gevendord.
Maar het verandert wat er in `index.json` staat en wat een dossier oplevert (een beslishulprun is
geen in te vullen document met export). **Dit is een besluit, geen taak.** Het staat hier expliciet
opgeschreven zodat het een keer echt gewogen wordt in plaats van steeds opnieuw opgemerkt.

### 3.5 De asymmetrie die beslishulpen mogelijk maken

§3 van de sporenroadmap parkeert organisatiebrede instrumenten (AI Governance Charter,
maturityscan, Shadow AI, Data Governance Charter) omdat een *formulier* een eenheid van analyse
heeft die bij het dossier moet passen. Een **beslishulp levert een scopebeslissing op, geen
document**, en heeft die eenheid van analyse dus niet op dezelfde manier. Een
NIS2/Cyberbeveiligingswet-zelfevaluatie (RDI) of een organisatiebrede
verplichtingenscan kan daarom wél op organisatieniveau bestaan zonder de dossierstructuur te
breken, mits de uitkomst buiten het dossier wordt opgeslagen.

Dat is een uitweg voor de geparkeerde instrumenten, **zonder nieuw spoor**, want dat
was juist de fout die §1 van de sporenroadmap opruimt.

## 4. Lineage, opnieuw bekeken

Er zijn nu **drie** herkomstsystemen, en ze weten niets van elkaar:

| # | Systeem | Waar | Wat het vastlegt |
|---|---|---|---|
| 1 | **Formulier-lineage** | `source`-blok per form-JSON (`FormSource`), samengevat in README § *Form lineage* | instrument, uitgever, exacte referentie, `derivation` ∈ {generated, harmonized, derived, original} |
| 2 | **Beslishulp-herkomst** | `source: {repository, commit, licence, publisher, algoritmekader}` in het tree-asset; `treeVersion` in elke `BeslishulpRun` | gepinde commit + de versie waarmee een concrete uitspraak is gedaan |
| 3 | **Antwoord-lineage** | `public/forms/crossFormMappings.json`, 152 koppelingen | welk antwoord uit welk ander antwoord is afgeleid |

Systeem 2 is **sterker dan systeem 1**: het pint een commit én bewaart per run met welke versie het
oordeel tot stand kwam. Systeem 1 blijft steken bij prozaherkomst waar niets in de runtime van
afhangt. Daaruit volgen drie dingen.

### (a) Beslishulpen hebben een eigen `derivation`-vocabulaire nodig, los van dat van de formulieren

Voorstel:

| Waarde | Betekenis |
|---|---|
| `vendored` | Upstream levert een machineleesbare boom. Gepinde commit, geconverteerd door een script. **Niet met de hand bewerken.** (de AI-verordening-boom) |
| `transcribed` | Upstream publiceert een beslisboom als figuur/PDF/webpagina. Wij coderen hem getrouw en citeren de exacte figuur. (AP-datalekbeslisboom, EDPB-TIA) |
| `derived` | Niemand publiceerde een boom; wij hebben hem uit de wettekst opgebouwd. (AcICT-drempel) |

Het onderscheid weegt hier zwaarder dan bij formulieren. Een formulier stelt vragen; een
**beslishulp doet een uitspraak** die de gebruiker als kwalificatie overneemt. Een `derived` boom
is dus een juridische claim in onze naam en vraagt de disclaimerbehandeling uit §8 van het
hoofdontwerp ("een uitkomst is een hulpmiddel, geen besluit") plus een genoemde inhoudelijke
eigenaar, zoals de MinBZK-boom nu naar ai-verordening@minbzk.nl verwijst.

Zet beslishulpen vervolgens **in dezelfde README-lineagetabel** als de formulieren. Nu staat de
AI-verordening-boom alleen in een feature-bullet en in de vergelijkingstabel, en ontbreekt hij in
de enige tabel die iemand leest die de herkomst van de tool audit.

### (b) Pin de commit ook bij formulieren

Beslishulpruns pinnen `treeVersion`; de `generated` formulieren (prescandpia, dpia, iama) pinnen
niets vergelijkbaars in de form-JSON. `vendor/par-dpia-form/PROVENANCE.md` bestaat, maar is vanuit
een antwoord niet bereikbaar. Zelfde discipline, één veld in het `source`-blok.

### (c) Het echte gat: de beslishulp-uitkomst zit niet in de antwoord-lineage

De uitkomst bereikt de formulieren nu op twee manieren, en geen van beide is de bestaande
mapping-graaf:

1. **Expliciete adoptie** in `RiskClassification.vue`: de gebruiker neemt het oordeel over als
   risiconiveau van de AIIA. Bewust expliciet, en dat mag zo blijven.
2. **Als instructie in prozavorm**: `public/forms/algoritmeregister.json:160` vraagt de gebruiker
   *met de hand* de uitkomst van de beslishulp over te nemen. Dat is een mappingkoppeling die als
   begeleidende tekst is geschreven.

Voorstel: maak de run een eersterangs bron in `crossFormMappings.json`, met
`sourceFormId: "beslishulp:ai-verordening"` en het label of de conclusie-id als
`sourceQuestionIds`. Dan vullen `euaiact` (rol, risiconiveau), `modelcard`
(risicoclassificatie) en het algoritmeregister zich via het mechanisme dat er al is, in plaats van
via drie eigen codepaden, en erft elk zo gevuld antwoord de `treeVersion`-herkomst. Daarmee is een
antwoord herleidbaar tot een *versie van een boom*, niet slechts tot "er is ooit een beslishulp
gedraaid".

Dat zet meteen roadmap #7 (periodieke herijking, spoor `beheer`) op: `replay()` stopt nu stilletjes
zodra een opgeslagen spoor niet meer op de boom past (zie de comment bij de `break` in
`src/utils/beslishulp.ts`). Met één boom is dat zeldzaam; met zes is het routine. Een
"dit oordeel is geveld met boom v1.0.0, de boom staat nu op v1.2.0; opnieuw doorlopen"-signaal is
hetzelfde mechanisme als "wat is er veranderd sinds de vorige DPIA".

## 5. Volgorde

1. **Register + dossierniveau-opslag + uitkomst-mapping in het asset** (§2). Deblokkeert de rest,
   voegt geen inhoud toe, en is te doen zonder één juridische bewering te schrijven.
2. **AVG-rolbepaling** als tweede boom (§3.1). Hoogste structurele opbrengst: de uitkomst bepaalt
   *welk* art. 30-register je moet bijhouden, niet alleen de waarde van een veld.
3. **Beslishulprijen + het `derivation`-vocabulaire in de README-lineagetabel** (§4a).
4. **`beslishulp:<id>` als bron in `crossFormMappings.json`** (§4c), te beginnen met het vervangen
   van de handmatige-overname-instructie in `algoritmeregister.json`.

> Zoals overal in deze docs: de artikelverwijzingen hierboven zijn de *aanleiding*, niet de inhoud.
> Verifieer elke grondslag tegen de actuele wettekst en de actuele upstream-beslisboom voordat er
> gebruikersgerichte tekst in een beslishulp komt. Bij een beslishulp geldt dat scherper dan bij
> een formulier, omdat de tool hier een uitspraak doet in plaats van een vraag stelt.

## 6. Open vragen

- Dekt het AVG-deel van **AI AQT** de rolbepaling uit §3.1 al af? Zo ja, vendoren in plaats van
  bouwen.
- Welke beslishulpen staan er op de **IBDS-lijst** die hier niet genoemd zijn, en welke daarvan
  hebben een machineleesbare bron (`vendored`) in plaats van alleen een webpagina
  (`transcribed`)?
- Worden **quickscan** en **prescandpia** beslishulpen (§3.4)? Dat is de enige vraag hier die
  bestaande gebruikersfunctionaliteit verandert.
- Waar landt de uitkomst van een **organisatiebrede** beslishulp (§3.5) als het dossier niet de
  juiste plek is? Dat raakt hetzelfde ontbrekende organisatieniveau als §3 van de sporenroadmap.
