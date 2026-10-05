# Toepasselijkheid van formulieren: wanneer geldt een formulier niet?

**Status: stap 2 en 3 van §5.8 zijn gebouwd.** Zie §7 voor wat er staat, welke open punten
daarbij zijn beslist en wat er nog niet is. Dit document legt daarnaast de oorspronkelijke
vraag, analyse en opties vast. De aanleiding is de toegankelijkheidsverklaring, maar de vraag
is algemener. §1–4 zijn de oorspronkelijke analyse op basis van dat ene formulier; **§5 is de
richting die is uitgevoerd** en gaat uit van een veel bredere scope (persoonsgegevens en AI),
waardoor optie C alsnog de voorkeur kreeg.

## 1. De aanleiding

Op dit moment tonen alle dossiers alle formulieren. Dat klopt zolang elk formulier voor
vrijwel elk IV-verzoek relevant is, maar dat houdt op bij de
**toegankelijkheidsverklaring** (`toegankelijkheid.json`, spoor `ingebruikname`): een
koppelvlak, een datapipeline of een stuk backoffice-software zonder gebruikersinterface valt
er domweg niet onder. Een formulier dat zichtbaar leeg blijft omdat het niet van toepassing
is, is niet te onderscheiden van een formulier dat vergeten is, en dat verschil zou een
dossier moeten vastleggen.

## 2. Het juridische criterium is níet "publiek toegankelijk"

De intuïtieve regel ("alleen bij publieke websites") is te smal. Het **Tijdelijk besluit
digitale toegankelijkheid overheid** (uitvoering van Richtlijn (EU) 2016/2102) geldt voor
*websites en mobiele applicaties van overheidsinstanties*, en dat omvat **intranet en
extranet**. Een besloten webapplicatie achter een login valt eronder: een medewerker met een
schermlezer heeft dezelfde aanspraak als een burger. De overgangsuitzondering voor
intranet/extranet zag alleen op content die vóór 23 september 2019 was gepubliceerd, tot aan
een ingrijpende herziening. Voor alles wat nu gebouwd wordt geldt die uitzondering dus niet meer.

Het onderscheidende criterium is **wel of geen (web)gebruikersinterface**, niet publiek of
intern. Publiek versus intern bepaalt alleen *waar* de verklaring wordt gepubliceerd
(centraal register versus het intranet zelf) en hoe zwaar remediatie weegt, en niet óf het
formulier van toepassing is.

Buiten bereik vallen in de praktijk:

- backoffice- of desktopsoftware die niet via de browser wordt aangeboden
- API's en koppelvlakken, batch- en dataverwerking zonder eigen interface
- een model of dataset zonder eigen interface
- infrastructuur- en hardwaretrajecten

Daarnaast kent het besluit inhoudelijke uitzonderingen (archieven, kaarten, content van
derden): die zitten al ín het formulier bij `tv_a.uitzonderingen` en zijn een andere laag
dan de vraag hier.

Twee dingen die makkelijk misgaan bij het formuleren van een triggervraag:

1. **Inkoop telt mee.** De verplichting rust op de instantie die de voorziening *publiceert of
   aanbiedt*, ook bij ingekochte SaaS. Een leveranciersverklaring (VPAT) ontslaat MinFin niet
   van de plicht zelf een verklaring te publiceren. De vraag moet dus gaan over "levert dit
   project een voorziening op die MinFin aanbiedt", niet over "bouwen we zelf iets".
2. **Verifieer vóór gebruikersgerichte tekst.** Conform de waarschuwing in
   [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §4.2: bovenstaande verwijzingen zijn de
   aanleiding, niet de inhoud. Toets ze tegen de actuele tekst van het besluit en
   digitoegankelijk.nl voordat er iets van in een formulier belandt.

## 3. Opties

### Optie A: gate-sectie ín het formulier

Een `Deel 0: Van toepassing?` bovenaan `toegankelijkheid.json`: één radio plus een verplichte
motivatie bij "nee".

- **Voor:** geen enkele codewijziging; werkt ook als het dossier geen intake heeft; legt de
  negatieve beslissing mét reden vast ("niet van toepassing, want koppelvlak zonder
  gebruikersinterface"), en dat is zelf een auditwaardig product.
- **Tegen:** per formulier opnieuw uitgevonden; het formulier blijft in de lijst staan alsof
  het openstaat, dus het lost het "leeg of vergeten"-probleem in het overzicht niet op.

### Optie B: één scopevraag in de intake

Een herbruikbare vraag (bijv. `intake_b.opleverproduct`, type `checkbox`): *"Wat levert dit
project op?"* met opties als publieke website · besloten webapplicatie (login) · mobiele app ·
intranet/extranet · backoffice-software zonder webinterface · API of koppelvlak ·
dataproduct/model zonder eigen interface · infrastructuur/hardware.

De eerste vier ⇒ toegankelijkheid van toepassing.

- **Voor:** één vraag die meer dan één formulier kan gaten; sluit aan op het bestaande
  `crossFormMappings`-idee dat antwoorden hergebruikt worden.
- **Tegen:** doet op zichzelf nog niets zichtbaars; heeft optie C nodig om effect te hebben,
  of blijft een signaal dat alleen de invuller zelf leest.

### Optie C: `applicability` in `index.json` + drie buckets in het overzicht

Een veld per formulier in `public/forms/index.json`, bijvoorbeeld:

```jsonc
"applicability": {
  "sourceFormId": "intake",
  "sourceQuestionId": "intake_b.opleverproduct",
  "appliesWhenAnyOf": ["Publieke website", "Besloten webapplicatie (login)",
                       "Mobiele app", "Intranet/extranet"]
}
```

`DossierDetail.vue` groepeert de kaarten dan in *verplicht* / *mogelijk relevant* / *niet van
toepassing* (ingeklapt, met reden), naast de bestaande spoorindeling.

- **Voor:** het juiste eindplaatje; maakt "niet van toepassing" een expliciete, zichtbare
  toestand in plaats van een leeg formulier.
- **Tegen:** echt codewerk (`FormIndexEntry` in `formLoader.ts`, `trackGroups` en de
  kaartweergave in `DossierDetail.vue`, plus een fallback voor dossiers zonder ingevulde
  intake). Een engine bouwen voor één regel.

## 4. Voorlopige aanbeveling

**A + B nu, C zodra er een derde formulier is dat het nodig heeft.** Toegankelijkheid is het
eerste formulier met een echte toepasselijkheidsvraag; `algoritmeregister` en
`verwerkingsregister` zijn de waarschijnlijke volgende kandidaten. Zolang het bij één regel
blijft, is de gate-sectie goedkoper en robuuster dan een generieke motor, en optie B kost
één intakevraag die later ongewijzigd de input van optie C is.

Openstaande punten voor het besluit:

- Moet "niet van toepassing" het formulier verbergen, of doorstrepen mét zichtbare motivatie?
  (Voorkeur: het tweede, want verbergen maakt de beslissing onvindbaar.)
- Wat gebeurt er bij een dossier zonder ingevulde intake: alles tonen, of alles als
  "mogelijk relevant"?
- Wordt de toepasselijkheidsbeslissing meegenomen in de PDF-export van het dossier?

## 5. Actuele richting: een toepassingsscan als dossier-eigenschap

De aanbeveling in §4 ("A + B nu, C later") ging uit van één regel. Zodra je dezelfde vraag
stelt voor **persoonsgegevens** en **AI** vallen er niet één maar circa tien van de negentien
formulieren onder een toepasselijkheidsregel, en dan is een generieke motor goedkoper dan
tien losse gate-secties. Dit hoofdstuk beschrijft die motor.

### 5.1 Waar de gate hoort

Niet in de formulieren zelf, en ook niet in de intake, maar als **eigenschap van het
dossier**. Redenen:

- **Kip-ei.** De prescan DPIA is zélf het instrument dat bepaalt of een DPIA nodig is; die kan
  dus niet gegate worden door een antwoord uit de DPIA. Hetzelfde geldt voor de beslishulp en
  de EU AI Act-checklist.
- **Herhaalbaarheid.** Scope verandert (er komt in maand vier een LLM-feature bij). De intake
  is een aanvraagformulier met een afgerond besluit van de Intakeboard; die wil je niet
  heropenen om een toepasselijkheidsvraag bij te stellen.
- **Dossiers zonder intake** moeten ook werken.

De vragen worden drie keer verspreid al gesteld (`quickscan.qs_d.persoonsgegevens`,
`prescandpia.d1.1.1`, `prescandpia.d6.1.1`). Die blijven staan als inhoudelijke vragen, maar
zijn te laat en te versnipperd om de formulierlijst mee te sturen.

### 5.2 Precedent: hetzelfde patroon als de beslishulp

De beslishulp doet nu al precies dit soort werk op dossierniveau en levert het bouwpatroon:

| Beslishulp vandaag | Toepassingsscan |
|---|---|
| `BeslishulpTile.vue` op de dossierpagina, gefuseerd met de EU AI Act-kaart | eigen tegel bovenaan de dossierpagina, boven de spoorgroepen |
| `BeslishulpModal.vue` als wizard | zelfde modal, maar één pagina (zie §7.2) |
| Uitkomst één keer per dossier opgeslagen, gelezen via een store-getter | idem |
| `labels` + `conclusionId` → `verdictSummary()` → badge met kleur | afgeleide **kenmerken** → zichtbare tags op de dossierpagina |

**Zichtbaarheid is expliciet onderdeel van het ontwerp:** de uitkomst van de scan wordt
getoond als een rij tags op de dossierpagina (bijv. `persoonsgegevens` · `bijzondere pg` ·
`AI-systeem` · `besluit over personen` · `gebruikersinterface`), net zoals de beslishulp haar
verdict toont. Die tags zijn tegelijk de verklaring waaróm bepaalde formulieren verplicht of
niet van toepassing zijn; klikken op een tag zou de betrokken formulieren kunnen markeren.
Ze staan naast, niet in plaats van, de bestaande `domains`-facettags op de formulierkaarten:
`domains` beschrijft wat een formulier ís, de kenmerken beschrijven wat dit dossier heeft.

**Opslagkeuze, nog te maken.** De beslishulp hangt haar run aan een *host-formulier*
(`FormState.beslishulp` op `euaiact`, zie `BESLISHULP_HOST_FORM_ID`) omdat `FormState` er al
was. Voor de scan is de nettere plek het dossierobject zelf. Dat raakt wél de serverkant
(`dossierstore.py`, de grants en de CRDT-sync) waar het host-form-trucje dat ontloopt. Als dat
te duur blijkt: hetzelfde trucje, met de intake als host. Zie ook `collab`-notities over
generatiebumps bij schemawijzigingen.

### 5.3 Tussenlaag: benoemde kenmerken, geen vraag-ids

Formulieren verwijzen nooit rechtstreeks naar een scanvraag. De scan leidt **kenmerken** af;
formulieren declareren condities over die kenmerken:

```jsonc
{
  "persoonsgegevens": true,
  "bijzondere_persoonsgegevens": false,
  "grootschalig": true,
  "besluit_over_personen": true,
  "algoritme_of_ai": true,
  "ai_verordening_in_scope": true,   // uit de beslishulp-conclusie (11.x = buiten scope)
  "gebruikersinterface": false,
  "eigen_dataset": true,
  "raakt_burgers": true
}
```

Dat ontkoppelt vraagteksten van de motor: je mag vragen herformuleren zonder negentien
formulieren te breken, en het omzeilt de bekende val dat vraag-ids de persistence key zijn.

Kenmerken hebben **twee bronnen**, en dat onderscheid is wezenlijk:

| Bron | Voorbeeld | Karakter |
|---|---|---|
| Scan-antwoord | "verwerkt persoonsgegevens" | zelfverklaring, goedkoop, zwak bewijs |
| Uitkomst van een formulier | prescan-verdict, beslishulp-conclusie, BBN uit de quickscan | afgeleid, duurder, sterk bewijs |

De DPIA hangt daarom aan de tweede soort (de prescan-uitkomst), niet aan de eerste. De scan
bepaalt alleen of de *prescan zelf* zin heeft. Een kenmerk mag ook `onbekend` zijn; dat is
een derde waarde, geen `false`.

### 5.4 Matrix

| Formulier | Van toepassing wanneer | Voorbeeld van n.v.t. |
|---|---|---|
| intake, quickscan BIO | altijd | — |
| prescan DPIA | `persoonsgegevens` | infrastructuurvervanging zonder pg |
| DPIA | prescan-uitkomst = verplicht | — |
| verwerkingsregister | `persoonsgegevens` | — |
| data-ethiektoets | `persoonsgegevens` OF data over mensen | sensordata gebouwbeheer |
| dataset-registratie, datakwaliteit | `eigen_dataset` of eigen datalevering | standaard SaaS zonder eigen data |
| AIIA | `algoritme_of_ai` EN impact op mensen | — |
| IAMA | `algoritme_of_ai` EN `besluit_over_personen` | voorspellend onderhoud van gebouwen |
| EU AI Act-checklist | `ai_verordening_in_scope` (beslishulp) | — |
| Model Card | `algoritme_of_ai` | — |
| Algoritmeregister | `algoritme_of_ai` EN `raakt_burgers` EN publieke taak | intern hulpmiddel zonder externe werking |
| Toegankelijkheids­verklaring | `gebruikersinterface` (zie §2) | API of koppelvlak |
| PPM, PSA, aanbiedings­formulier, restrisico | omvang/budget — **andere as** | klein IV-verzoek |

Let op de kruisgevallen: AI *zonder* persoonsgegevens zet IAMA en DPIA uit maar Model Card en
datakwaliteit áán; persoonsgegevens *zonder* AI is het spiegelbeeld. Eén enkele "gebruikt u
AI?"-vlag volstaat dus niet.

De laatste rij is een tweede toepasselijkheidsas (projectomvang). Zelfde motor, andere
kenmerken. Dat is een extra argument om de motor generiek te bouwen in plaats van per formulier.

### 5.5 Hoe je de vragen stelt

Hier staat het incentive verkeerd: "nee" invullen scheelt zes formulieren.

**Vraag naar gedrag, niet naar labels.** Niemand herkent zijn Excel-scoringsregel of de "smart
suggestions" van een leverancier als AI. Dus niet *"gebruikt u AI?"* maar: rangschikt, scoort
of prioriteert het systeem mensen of zaken? · genereert het tekst, beeld of code? · leert het
van data of past het zich aan? · ondersteunt of vervangt het een besluit over een persoon? ·
zit er een ingekochte component in die als "slim" of "AI" wordt aangeprezen? Eén ja ⇒ de
AI-tak aan, en dan **doorverwijzen naar de bestaande beslishulp** voor het echte oordeel.

Idem voor persoonsgegevens: niet *"verwerkt u persoonsgegevens?"* maar: staan er gegevens in
die, ook indirect, naar een persoon te herleiden zijn (IP-adres, personeelsnummer,
dossiernummer, logging, pseudoniemen)? · gaat het (ook) om eigen medewerkers? · worden er
gegevens uit een basisregistratie gebruikt?

Dezelfde valkuil als in §2 bij inkoop: de vraag gaat over wat het project *oplevert of
aanbiedt*, niet over wat MinFin zelf bouwt.

**Bij "niet van toepassing" hoort een verplichte motivatie**, plus wie en wanneer. Voor het n.v.t. verklaren van een DPIA hoort een tweede paar ogen (FG of privacy
officer); daar past een akkoordveld bij, ook als dat proces buiten de tool loopt.

### 5.6 Toestanden, drift en overrides

Vier kaarttoestanden: **verplicht** · **mogelijk relevant** (aanbevolen, of kenmerk onbekend) ·
**niet van toepassing** (ingeklapte groep, met reden) · **onbepaald** (scan niet gedaan → alles
neutraal, met een banner die naar de scan wijst). Nooit verbergen, want dat maakt de beslissing
onvindbaar, conform de voorkeur in §4.

- **Scope-drift.** Als een herziene scan een formulier van n.v.t. naar verplicht laat springen,
  moet dat een zichtbare melding zijn ("scope gewijzigd: IAMA is nu van toepassing"), geen
  stille verschijning in de lijst. Andersom: reeds ingevulde antwoorden worden nooit
  weggegooid wanneer iets n.v.t. wordt.
- **Overrides in beide richtingen**, altijd met reden vastgelegd.

### 5.7 Aansprakelijkheidsrand

"Een DPIA is niet nodig" wordt in de praktijk gelezen als juridisch oordeel. Houd de
formulering op *"op basis van je antwoorden lijkt X niet van toepassing; leg dit voor aan
FG/CISO"*, met de gebruikte kenmerken zichtbaar erbij. En neem de n.v.t.-verklaringen op als
bijlage in de dossier-PDF ("Niet van toepassing verklaarde onderdelen, met motivatie").

### 5.8 Bouwvolgorde

1. **Nu, zonder code:** een `Deel 0 – Van toepassing?`-sectie in `toegankelijkheid`, `iama`,
   `algoritmeregister` en `dataethiek`. Levert meteen de auditwaardige "nee, want…" op.
2. **Scan + kenmerken:** dossiertegel, wizard, kenmerken in de store en als tags zichtbaar op
   de dossierpagina, nog zonder effect op de formulierlijst.
3. **`applicability` in `index.json` + kaarttoestanden** (`FormIndexEntry` in `formLoader.ts`,
   `trackGroups` en de kaartweergave in `DossierDetail.vue`).
4. **Overrides, driftdetectie, export-bijlage.**

Stap 1 en 2 zijn onafhankelijk en goedkoop; stap 3 is het echte werk maar heeft dan zijn input
al klaar.

### 5.9 Nog open

- Mag de motor "niet van toepassing" automatisch zetten, of moet een mens elke n.v.t.
  bevestigen? (Trager, maar aanzienlijk verdedigbaarder.)
- Kenmerken op het dossierobject (netjes, raakt sync) of op een host-formulier (goedkoop,
  volgt de beslishulp)?
- Zijn de kenmerktags klikbaar: filteren ze de formulierlijst, of zijn ze puur informatief?

## 6. Raakvlakken

- [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §5: waar `track`/`domains`/`index.json` in
  de code zitten; optie C haakt daar direct op aan.
- [`beslishulp-integration-design.md`](beslishulp-integration-design.md): de beslisboom van
  de AI-verordening doet iets verwants (bepalen wat er geldt), maar op verplichtingenniveau
  binnen één formulier, niet op formulierniveau. Bij optie C is het de moeite waard te kijken
  of de twee patronen elkaar moeten kennen.

## 7. Wat er gebouwd is

Stap 2 en 3 van §5.8. Stap 1 (losse `Deel 0`-secties in vier formulieren) is bewust
overgeslagen: met de motor erbij zou dat dezelfde vraag een tweede keer stellen, op een plek
waar het antwoord niets aanstuurt.

| Onderdeel | Waar |
|---|---|
| Kenmerken, scanvragen, afleiding, drie-waardige toepasselijkheidsregels | `src/utils/toepassingsscan.ts` |
| Regels per formulier (data) | `applicability` in `public/forms/index.json` |
| Vragenformulier (één pagina) | `src/components/ToepassingsscanModal.vue` |
| Dossiertegel met kenmerktags | `src/components/ToepassingsscanTile.vue` |
| Kaarttoestanden + ingeklapte n.v.t.-groep per fase | `src/components/DossierDetail.vue` |
| Opslag + sync | `FormState.toepassingsscan`, `assessmentStore.setToepassingsscanRun`, `DossierDoc.setToepassingsscan`, codec |
| Tests (32 + render-smoke + codec-roundtrip) | `src/utils/toepassingsscan.test.ts`, `src/components/toepassingsscan.render.test.ts`, `src/collab/ydocCodec.test.ts` |

### 7.1 Beslissingen op de open punten uit §4 en §5.9

- **Verbergen of doorstrepen?** Doorstrepen. N.v.t.-formulieren staan per fase in een
  ingeklapte groep, met reden, en zijn met "Toch openen" gewoon te openen.
- **Dossier zonder scan?** Alles blijft staan zoals voorheen; elk oordeel is dan `onbepaald`
  en er verschijnt geen enkele badge.
- **Kenmerken op het dossierobject of op een host-formulier?** Host-formulier: de intake,
  via dezelfde constructie als de beslishulp (`TOEPASSINGSSCAN_HOST_FORM_ID`). Dat scheelt
  een wijziging in `dossierstore.py`, de grants en het CRDT-schema; een echte dossier-eigen
  plek blijft de nettere optie zodra er meer dossier-brede state komt.
- **Mag de motor automatisch n.v.t. zetten?** Ja, maar alleen als *advies*: de tekst zegt dat
  het geen juridisch oordeel is, de reden staat erbij, en er is niets dat een formulier
  onbereikbaar maakt.
- **Zijn de kenmerktags klikbaar?** Nee, voorlopig puur informatief.
- **Verplicht versus mogelijk relevant.** Een regel met `advisory: true` levert "mogelijk
  relevant" op ook als de conditie klopt. Dat is precies het DPIA-geval uit §5.3: alleen de
  prescan maakt een DPIA verplicht, persoonsgegevens op zichzelf niet.

### 7.2 Vereenvoudiging (SCAN_VERSION 2)

De eerste versie stelde acht vragen in een wizard van negen schermen. Bij review bleek de
helft van dat gewicht niets te sturen:

- **Twee kenmerken zonder afnemer.** Geen enkele regel in `index.json` testte
  `bijzondere_persoonsgegevens` of `grootschalig`; ze leverden alleen een tag op. De twee
  vragen die ze bepaalden (`bijzonder`, 9 opties; `schaal`, 5 opties) zijn vervallen. De
  prescan en de DPIA vragen die details wél op de plek waar ze werk doen. Een test bewaakt
  nu de omgekeerde richting: elk kenmerk in `KENMERK_IDS` moet door minstens één regel in
  `index.json` gelezen worden.
- **De gate-machinerie is daarmee weg** (`alleenAls`, `questionApplies`, `visibleQuestions`).
  Dat ruimde ook een inconsistentie op: `visibleQuestions` toonde een gated vraag zolang de
  gate `onbekend` was, terwijl `deriveKenmerken` de antwoorden dan juist weggooide: wie
  "Weet ik niet" antwoordde op persoonsgegevens kreeg twee schermen te zien die niets deden.
  En de voortgangsteller sprong ("vraag 2 van 6" werd "vraag 2 van 8" zodra de gate opende).
- **Zes onafhankelijke vragen passen op één pagina.** Geen stappen, geen voortgangsbalk, geen
  Vorige/Volgende. De gevolgenlijst staat eronder en werkt live mee: een antwoord verplaatst
  meteen een formulier in die lijst.
- **De disclaimer stond er drie keer** (samenvatting, n.v.t.-groep in `DossierDetail`, footer),
  in drie formuleringen. Nu één zin op elk van de twee plekken waar iemand hem nodig heeft.

Oude runs blijven geldig: `answers` is een blob, `deriveKenmerken` negeert antwoorden op
vragen die niet meer bestaan, en de kenmerken worden live herleid, niet uit de opgeslagen
snapshot.

### 7.3 Wat nog niet is gebouwd

- **Stap 4:** overrides in beide richtingen, driftdetectie ("scope gewijzigd: IAMA is nu van
  toepassing") en de n.v.t.-bijlage in de dossier-PDF (§5.7).
- **Kenmerken uit formulier-uitkomsten.** Alleen `ai_verordening_in_scope` komt uit een ander
  instrument (de beslishulp). De prescan-uitkomst en de BBN uit de quickscan zijn nog geen
  kenmerk; de DPIA hangt daarom voorlopig aan een `advisory`-regel op `persoonsgegevens`.
- **Motivatie bij n.v.t.** De scan legt vast *dat* iets niet van toepassing is en waarom
  volgens de kenmerken, maar er is nog geen vrij motivatieveld en geen akkoordveld voor een
  tweede paar ogen (FG/privacy officer), zoals §5.5 beschrijft.
- **Dossieroverzicht.** De voortgangsbalk op de dossierkaarten in `DossierList.vue` telt nog
  alle formulieren mee; alleen de fasetelling op de dossierpagina zelf houdt rekening met
  n.v.t.
