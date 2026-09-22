# Dekkingsanalyse: normenkader v2.0 tegenover de formulieren

> **Status:** analyse + brainstorm — geen commitment. Dit document zet de 481 controls uit
> `../vendor/normenkader_v20_backup.json` naast de 22 formulier-JSON's, samen 930 vragen:

| Formulier | Vragen | `derivation` | Dekt welk cluster |
|---|---:|---|---|
| quickscan (BIO2) | 140 | harmonized | BIO2 + Quantum |
| aiia | 112 | harmonized | AI |
| dpia | 91 | generated | Privacy |
| iama | 83 | generated | AI / grondrechten |
| algoritmeregister | 40 | harmonized | AI / publicatie |
| prescandpia | 39 | generated | Privacy |
| datasetregistratie | 39 | derived | Data |
| cloudtoets | 34 | harmonized | BIO2 / inkoop |
| datakwaliteit | 32 | derived | Data |
| intake | 31 | original | Project |
| verwerkingsregister | 30 | derived | Privacy |
| modelcard | 29 | harmonized | AI |
| toegankelijkheid | 28 | harmonized | Openbaarheid (alleen WCAG) |
| restrisico | 28 | original | Besluit |
| psa | 28 | original | Architectuur |
| **ihhtoets** | **27** (waarvan 9 admin) | harmonized | Archief / IHH |
| dataethiek | 27 | derived | Data / ethiek |
| aanbiedingsformulier | 27 | original | Project |
| ppm | 23 | original | Project |
| kernvragen | 22 | harmonized | Triage |
| euaiact | 20 | harmonized | AI |

## 3. Gat 1 — vijf formulieren staan in de index maar bestaan niet

In `public/forms/index.json` staan vijf entries **zonder `file`-sleutel**, met een
`placeholder`-veld:

| id | track | placeholder |
|---|---|---|
| `bia` | initiatie | `onzeker` |
| `voortgangsrapportage` | uitvoering | `onzeker` |
| `afwijkingsformulier` | uitvoering | `onzeker` |
| `evaluatie` | afronding | `gepland` |
| `risicoimpact` | afronding | `onzeker` |

Voor het normenkader is vooral `bia` relevant: dat is de enige beoogde plek voor de
NIS2-continuïteitscontrols (`NIS2-0325` business continuity, `NIS2-08` ketenweerbaarheid,
`NIS2-09` incidentdossier, `NIS2-0322`/`NIS2-05` meldtermijnen). De andere vier zijn
projectbeheersing, niet normenkader.

## 4. Gat 2 — drie clusters zonder enig formulier

### 4A. Openbaarheid en Woo — 19 controls, nul dekking

`OPEN-0303` t/m `OPEN-0307`, `Woo-01` t/m `Woo-04`, `WEP-01`, `Who-01`, plus
`OPEN-0308`–`OPEN-0310` (pas-toe-of-leg-uit, API-standaarden, open formaten) en `NORA-01`.

Concreet ontbreekt: het Woo-meerjarenplan, actieve openbaarmaking van de zeventien
informatiecategorieën, passieve Woo-verzoeken en dossiervorming, het lakproces met
uitzonderingsgronden en herleidbaarheid, de beslistermijnen, en de **antihinderbepaling** (geen
informatie vernietigen om openbaarmaking te frustreren). Dat laatste is een systeemeis: als een
nieuwe applicatie automatisch opschoont, moet je die vraag stellen.

`toegankelijkheid.json` dekt uit dit cluster alleen `OPEN-0311` (WCAG). De IHH-toets — waar je
Woo zou verwachten — noemt openbaarheid nergens.

### 4B. Bestuursrecht / Awb — 12 controls, nul dekking

`AWB-0336` t/m `AWB-0343`, `AWB-09`, `AWB-10`, `Awb-05`, `Awb-06`: zorgvuldige voorbereiding en
dossieropbouw, motivering en herleidbaarheid, belangenafweging en evenredigheid, reconstructie bij
bezwaar en beroep, termijnen en bekendmaking, mandaat en bevoegdheid, hoorplicht, elektronische
weg (art. 2:15), dwangsom bij niet tijdig beslissen.

De IAMA raakt dit in deel 4 en `kern.bezwaar` stelt één vraag — maar allebei alleen als er een
algoritme in het spel is. Een gewoon vergunning- of subsidiesysteem zonder AI komt geen enkele
Awb-vraag tegen.

### 4C. Datagovernance op organisatie-/domeinniveau — ± 30 van de 54 controls

`datakwaliteit` en `datasetregistratie` dekken het **objectniveau** (deze dataset, deze
kwaliteitsdimensies). Wat niet gedekt is: datarollen en stewardship per gegevensdomein
(`DGV-0362`, `DGV-11`), datacatalogus en gegevenslandschap (`DGV-0363`), gegevenswoordenboek en
semantische consistentie (`DGV-12`), lineage bij besluitvorming en publicatie (`DGV-0368`,
`DGV-13`, `DG-DCAM-06`), open data en publicatiemetadata (`DGV-0366`, `DG-FAIR-01`–`04`),
DGA-data-intermediairs (`DGA-01`) en Data Act B2G-verzoeken en switching (`DA-01`, `DGV-0367`),
kritieke gegevenselementen (`DG-DCAM-07`, `DG-PUBLIC-02`) en dataproduct-eigenaarschap
(`DG-MESH-01`–`03`).

`DAMA-DMBOK-form-opportunities.md` §4D parkeerde het Data Governance Charter destijds als
"organisatieniveau, past niet in een projectdossier". Dat argument geldt nog steeds voor het
charter zelf, maar níet voor de projectvragen die eruit volgen: *welk datadomein raakt dit
project, wie is steward, staat het in de catalogus, is de lineage naar het besluit vastgelegd?*

## 5. Gat 3 — de IHH-toets is het dunste formulier ten opzichte van zijn kader

68 controls in het archiefcluster, tegenover 18 inhoudelijke vragen. En dat is geen slordigheid:
`ihhtoets.json` is `derivation: "harmonized"` en de `source.note` zegt expliciet dat de achttien
genummerde vragen, hun toelichtingen en de indeling naar DUTO-kernprocessen **woordelijk** het
CDIO-origineel volgen. Het formulier is een getrouwe transcriptie van een instrument dat zelf
ondiep is.

Wat het normenkader eist en de toets niet vraagt:

| Thema | Controls | Wat de toets nu doet |
|---|---|---|
| Selectie & waardering | `HOTSPOT-01`, `SEL-01`, `SEL-02`, `ARCH-0279` | één vrij tekstveld `ihh_a.bewaartermijn` |
| Overbrenging & e-depot | `ARCH-0282`, `DUTO-0291`, `AW21-01` (10 jaar), `ED3-01` | één radio `ihh_a.archiveringslocatie` |
| MDTO-diepte | `MDTO-0293` t/m `MDTO-0302`, `MDTO-01`, `MDTO-02` | b.3–b.5: identificatiekenmerken + "welke metadata minimaal" |
| Verblijfplaatsen | `INSP-0262`, `INSP-0263`, `ARCH-0276`, `IHH-LC-02`, **`IHH-LC-04`** (informatie buiten formele systemen: mail, chat, samenwerkruimtes) | niets |
| Duurzame formaten & vervanging | `ARCH-0281`, `DUTO-0287` | b.9 en b.10, beide ja/nee |
| Governance & assurance | `INSP-0260`, `INSP-0261`, `BIHR-01`–`03`, `GOV-01`, `GOV-02`, `ISO30301-01`, `IHH-QMS-01`–`03` (+ opzet/bestaan/werking) | niets |
| Hergebruik & ter beschikking stellen | `INSP-0272`, `DUTO-0292`, `Who-01` | stopt bij zoeken, autoriseren en loggen |
| Woo / openbaarheid | zie §4A | niets |

**Advies: verleng de IHH-toets niet in deel B–D.** Dan wijk je af van het CDIO-origineel en
verlies je de waarde van `harmonized` — dezelfde reden waarom Prescan DPIA en DPIA aparte
formulieren zijn, en waarom `restrisico` naast de DPIA staat in plaats van erin. De verdieping
hoort in een eigen, `derived` formulier.

## 6. Losse controls die als *vraag* thuishoren, niet als formulier

| Control | Waar hij hoort |
|---|---|
| `CRA-01` SBOM en vulnerability handling | `psa` §7 of `quickscan` §4 |
| `eIDAS-01` EU Digital Identity Wallet, `Wdo-01` betrouwbare inlogmiddelen | `psa` §5 applicatielaag |
| `NORA-01` NORA-basisprincipes | `psa` §2 kaders |
| `VIR-01` rubricering bijzondere informatie | `quickscan` — die vraagt BIV, niet VIR-BI |
| `BRP-01` autorisatie en terugmelding BRP | `prescandpia` §5.1 vraagt basisregistraties, niet het autorisatiebesluit |
| `Wpg-01`, `Wjsg-01` bijzondere privacyregimes | `prescandpia` deel B |
| `CIO-01` BIT/AcICT-toets, `CW-01` verantwoording IV | `aanbiedingsformulier` §5–6 |
| `OPEN-0308`–`0310` open standaarden en API-regels | `psa`, of het nieuwe openbaarheidsformulier |

## 7. Brainstorm: mogelijke volgende stappen

Vijf sporen, van klein naar groot. Ze zijn niet exclusief, maar de volgorde hieronder is wél de
volgorde waarin ik ze zou doen.

### Stap 1 — De losse vragen bijplaatsen (klein, direct waardevol)

De acht regels uit §6 zijn samen ± 15 vragen in vier bestaande formulieren. Geen nieuw bestand,
geen codewijziging, geen index-regel. Dit is de goedkoopste dekkingswinst die er is en het maakt
meteen duidelijk hoe zwaar het bijhouden van de mapping gaat wegen.

**Open vraag:** willen we bij zulke toegevoegde vragen een `sourceRef`-achtig veld zetten
(bijvoorbeeld `normenkader: ["CRA-01"]`), zodat de dekking machinaal te controleren is? Als het
antwoord ja is, moet dat *vóór* stap 1 in het schema staan, anders doen we het twee keer.

### Stap 2 — `bia.json` bouwen

Staat al als `placeholder: "onzeker"` in de index, dekt 22 NIS2/CRA-controls, en is inhoudelijk
het best afgebakende ontbrekende formulier (RTO/RPO per proces, ketenafhankelijkheden,
continuïteitsscenario's, incidentmeldroute en -termijnen). Applicability koppelen aan de
BIV-beschikbaarheidsscore uit de Quickscan zou logisch zijn — dat is precies het soort
cross-form-koppeling dat `crossFormMappings.json` al ondersteunt.

### Stap 3 — Nieuw formulier "Informatiebeheer en openbaarheid"

Het grootste inhoudelijke gat (§4A + §5 samen: ± 50 ongedekte controls) in één `derived`
formulier, track `initiatie`, naast de IHH-toets in plaats van erin. Voorlopige indeling:

- **A. Verblijfplaatsen** — waar komt de informatie te staan, inclusief informatie buiten formele
  systemen (`IHH-LC-04`)
- **B. Selectie en waardering** — selectielijstproces, hotspots, vernietigingsverklaringen
- **C. Metadata (MDTO)** — de tien MDTO-velden concreet per informatieobject
- **D. Overbrenging** — moment, e-depot, ED3/OAIS, verkorte termijn Archiefwet 2021
- **E. Openbaarheid (Woo)** — actieve openbaarmaking van de zeventien categorieën, lakproces en
  uitzonderingsgronden, beslistermijnen, antihinderbepaling
- **F. Hergebruik en open standaarden** — Who, pas-toe-of-leg-uit, open formaten

**Open vraag:** is dit één formulier of twee (archief vs. openbaarheid)? Eén formulier is
samenhangender — de Woo-vragen leunen op de metadata-vragen — maar wordt met ± 45 vragen fors, en
openbaarheid heeft een andere eigenaar dan archivering. Ik neig naar **één** formulier met een
duidelijke deel-E-knip, omdat de invulhulp per dossier werkt en niet per afdeling.

### Stap 4 — Nieuw formulier "Datagovernance in het project"

De ± 30 ongedekte datagovernance-controls uit §4C, maar **strikt projectgebonden** geformuleerd —
niet het organisatiecharter dat we in juli bewust parkeerden. Applicability op de bestaande tag
`eigen_dataset`, net als datakwaliteit en datasetregistratie. Kandidaat-secties: datadomein en
steward, catalogus en gegevenswoordenboek, lineage naar besluit en publicatie, open data en FAIR,
DGA/Data Act, kritieke gegevenselementen.

**Open vraag:** overlapt dit te veel met `datasetregistratie`? Mogelijk is uitbreiden van dat
formulier met twee secties beter dan een derde datavormulier. Dat vraagt een vragen-voor-vragen
vergelijking die dit document nog niet gemaakt heeft.

### Stap 5 — Awb-vragen: eigen formulier of kernvragen-uitbreiding?

De twaalf Awb-controls gaan over besluitvorming, niet over een systeem. Twee routes:

1. **Een klein formulier "Behoorlijk bestuur"** (± 12 vragen), applicability op een nieuwe tag
   `besluit_over_personen` — die bestaat al in `kernvragen.json` (`kern.besluit`) en wordt nu
   alleen door `aiia`, `iama` en `dataethiek` gebruikt.
2. **Uitbreiden van de kernvragen** met twee of drie vragen over mandaat, termijnen en bezwaar,
   en de rest overlaten aan de IAMA.

Route 1 is inhoudelijk vollediger; route 2 is goedkoper en voorkomt dat een projectleider zonder
AI ineens een extra formulier krijgt. Ik neig naar **route 1**, omdat de Awb juist geldt voor de
niet-AI-besluiten die nu helemaal buiten beeld vallen — maar dit is echt een keuze voor de
inhoudelijk eigenaar, niet voor de bouwer.

## 8. De onderliggende vraag: willen we de mapping expliciet maken?

Alle bovenstaande stappen dekken gaten, maar geen ervan maakt de dekking *aantoonbaar*. Het
normenkader heeft daar de velden al voor (`dependsOn`, `evidencedBy`, `bioOverheid`, `mdto`,
`legalRefs` — nu vrijwel allemaal leeg) en `connections` bevat 32 kant-en-klare thema's die
controls uit verschillende kaders koppelen, precies zoals `crossFormMappings.json` dat voor
formuliervragen doet.

Drie ambitieniveaus:

| Niveau | Wat | Kosten |
|---|---|---|
| **A. Niets** | dekking blijft impliciet, dit document veroudert | 0 |
| **B. Eén richting** | veld `normenkader: ["UID", …]` op formuliervragen + een script dat ongedekte controls rapporteert | klein: schemaveld + ± 100 regels script |
| **C. Twee richtingen** | normenkader wordt een eigen bron in de app, met een dekkingsrapport per dossier en `evidencedBy` gevuld vanuit ingevulde antwoorden | groot: nieuw datamodel, UI, onderhoud |

Niveau B lijkt me de juiste eerste zet, en zou eigenlijk vóór stap 1 moeten komen — anders
annoteren we later handmatig terug wat we nu gratis kunnen meenemen.

Twee dingen die niveau B ook zou opleveren: `termMap` (31 begrippen met synoniemen) is direct
bruikbaar als `aiContext`-verrijking voor de AI-Modus, en `sources` levert de bronvermelding die
de lineage-tabel in de README nu per formulier handmatig bijhoudt.

## 9. Wat dit document níet heeft gedaan

- Geen control-voor-control-mapping. De tellingen in §1 zijn per bronkader, niet per vraag; de
  uitspraak "dekt" betekent "er is een formulier voor dit onderwerp", niet "alle controls zijn
  geadresseerd". Voor BIO2 (262 controls tegenover 140 quickscan-vragen) is dat verschil
  waarschijnlijk aanzienlijk.
- Geen check of de bestaande formulieren controls dekken die *buiten* het normenkader vallen
  (omgekeerde richting).
- Geen beoordeling of `../vendor/normenkader_v20_backup.json` zelf actueel is. De bestandsnaam zegt
  "backup" en het bestand staat los in de repo-root, niet in `data/` of `public/`; onduidelijk is
  of dit de vigerende versie is of een momentopname.
