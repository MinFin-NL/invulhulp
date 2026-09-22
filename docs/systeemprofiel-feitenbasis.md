# Systeemprofiel: de feitenbasis onder de formulieren

> **Status:** analyse + ontwerp — geen commitment. Vervolg op
> `docs/normenkader-dekkingsanalyse.md` §8 en op `docs/toepasselijkheid-van-formulieren.md`
> §5. Dit document beantwoordt een vraag die breder is dan dekking: *is een
> formulierengedreven invulhulp eigenlijk wel de goede vorm, of pakken we het verkeerde
> object beet?* §1–4 zijn de analyse, §5–9 het concrete ontwerp, §10 de gefaseerde aanpak,
> §11 wat dit document níet doet.

## 1. De vraag

Er is een normenkader (`../vendor/normenkader_v20_backup.json`, 481 controls). Teams hebben daar
deelverzamelingen uit genomen en er formulieren van gemaakt. Die formulieren zitten in deze
invulhulp — 22 stuks, 930 vragen. Het voelt achterstevoren om de *formulieren* aan te
pakken in plaats van de *normen*. Tegelijk mist het normenkader de ethiek, en dat is de
reden dat de kernvragen zijn toegevoegd.

Twee vragen dus:

1. Is formulier-eerst een verkeerde volgorde, en zijn de normen het echte object?
2. Wat is de ontbrekende schakel — of is deze stap juist noodzakelijk om de organisatie
   mee te krijgen?

## 2. Het normenkader is geen betere baas dan de formulieren

Kijk naar wat een control feitelijk *is* in v2.0:

```json
{
  "uid": "BIO2-0001",
  "title": "Informatiebeveiligingsbeleid",
  "questions": [
    "Is voor informatiebeveiligingsbeleid beleid/proces vastgesteld?",
    "Is de maatregel aantoonbaar geïmplementeerd voor relevante informatie, systemen en ketens?",
    "Wordt de werking periodiek getoetst en verbeterd?"
  ]
}
```

Die drieslag — *vastgesteld? aantoonbaar? periodiek getoetst?* — is over het overgrote deel
van de 481 controls gesjabloneerd. Het normenkader beschrijft niet wat een goed systeem is;
het is een machine die auditbeweringen genereert. Het selecteert op wat goedkoop als
aanwezig/afwezig te verifiëren valt.

Daarmee is ook meteen verklaard waarom de ethiek ontbreekt. Dat is geen omissie maar een
eigenschap van het genre: een normenkader kan alleen opnemen wat afvinkbaar is. Ethiek is
betwist, contextueel en vraagt deliberatie; die komt er hoogstens in als procedurele proxy
("is er een IAMA gedaan?"), en dan is het weer een formulier. **Normen-eerst had dit niet
opgelost — het had 481 stuks hetzelfde papierwerk opgeleverd, anders gerangschikt.**

De conclusie is niet "de formulieren zijn dus goed". De conclusie is dat *geen van beide*
het echte object is.

## 3. Het echte object is het systeem — en het schema staat er al

Lees `public/forms/kernvragen.json` terug met andere ogen. Het is geen formulier. Het is een
**datamodel van een systeem**:

| Kernvraag | Feit over het systeem |
|---|---|
| `kern.doel`, `kern.aanleiding`, `kern.beschrijving` | wat het is en waarom het bestaat |
| `kern.gedrag`, `kern.oplevering` | wat het doet en in welke vorm |
| `kern.doelgroep`, `kern.betrokkenen` | wie het raakt, en wie niet kan weglopen |
| `kern.besluit`, `kern.menselijke_rol` | of het over personen beslist |
| `kern.persoonsgegevens`, `kern.eigen_dataset`, `kern.gegevens` | welke gegevens erin omgaan |
| `kern.grondslag` | op grond waarvan het mag |
| `kern.waarden`, `kern.ongelijke_uitwerking`, `kern.risicos` | wat er op het spel staat |
| `kern.eigenaar`, `kern.transparantie`, `kern.bezwaar`, `kern.monitoring`, `kern.exit` | wie verantwoording aflegt |

Tweeëntwintig velden die elk ander artefact in de invulhulp nodig heeft. Dat is de
ontbrekende schakel in zijn meest concrete vorm: **de kernvragen moeten ophouden formulier
nummer 0 te zijn en de feitenbasis van het dossier worden.** Formulieren worden dan
*weergaven* van die feiten plus hun eigen delta. Controls worden *beweringen* over die
feiten.

### 3.1 De koppelingskosten zijn het signaal

`public/forms/crossFormMappings.json` telt **351 mappings** tussen 22 formulieren, waarvan
er al 81 uit de kernvragen komen — de op één na grootste bron, na de AIIA. Dat bestand is de
met de hand geschreven, kwadratische versie van precies deze feitenbasis. Elke nieuwe
formulier-vraag die iets herhaalt wat elders al staat, kost N nieuwe regels.

Ongeveer 22 formulieren en 930 vragen is de plek waar "formulieren zijn het datamodel"
ophoudt te lonen en begint te belasten.

### 3.2 Dit verandert ook het antwoord op §8 van de dekkingsanalyse

De dekkingsanalyse stelde niveau B voor: een veld `normenkader: ["CRA-01"]` op
formuliervragen. Dat koppelt controls aan **vraag-id's** — een mapping die breekt bij elke
formulierherziening, en die precies de artefacten als anker neemt waarvan §2 zegt dat ze het
object niet zijn. Controls koppelen aan **feiten over het systeem** is stabiel over
formulierwijzigingen heen. Doe niveau B tegen de feitenbasis, niet tegen vraag-id's.

## 4. Drie dingen die echt ontbreken

Op volgorde van hoeveel ze aan het gereedschap zouden veranderen.

**1. Een werkings-as.** Het normenkader heeft `assurance: {opzet, bestaan, werking}` — overal
leeg. Alle 22 formulieren dekken alleen *opzet*. En juist de kernvragen waarvan het antwoord
het meest telt (`kern.ongelijke_uitwerking`, `kern.monitoring`, `kern.exit`) zijn niet
eerlijk te beantwoorden vóór ingebruikname. Ondertussen staan `evaluatie`,
`voortgangsrapportage` en `risicoimpact` in `index.json` als placeholder zonder bestand. Dat
is geen toeval: het gereedschap eindigt nu op het moment van de minste informatie. Ethiek
die je één keer bij de start toetst en nooit herziet, is per constructie ritueel — hoe goed
de vragen ook zijn.

**2. Een tegenpartij voor de ethische antwoorden.** Elk ander formulier heeft iemand met
bevoegdheid die erop wacht: de DPIA een FG, de quickscan een CISO, het
aanbiedingsformulier een portfolioberaad. De kernvragen hebben geen geadresseerde en kunnen
niets blokkeren. Dát, en niet een gat in het normenkader, is de reden dat ethiek wegzakt.
`restrisico.json` staat er al: route `kern.waarden`, `kern.ongelijke_uitwerking` en
`kern.bezwaar` naar de beslissing, zodat iemand tekent voor *"ik accepteer deze restschade,
voor deze mensen, om deze reden"*. Goedkoop, en het maakt van ethiek een besluit met een
naam eronder in plaats van een tekstveld.

**3. Een product voor degene op wie het systeem wordt toegepast.** De invulhulp produceert nu
22 documenten voor 22 functionarissen en nul voor de burger uit `kern.doelgroep` die er niet
voor kan kiezen. Geen van de 481 controls produceert dat document ook. De kernvragen staan
al in gewone taal — dat is precies het materiaal voor een **systeemverklaring**: wat dit
systeem doet, wat het over u beslist, wat er gebeurt als het misgaat, hoe u bezwaar maakt.
Samengesteld uit kernvragen + algoritmeregister + restrisico. Dat is het ene artefact dat het
normenkader structureel niet kan opleveren.

De feitenbasis uit §5 is de voorwaarde voor alle drie: een systeemverklaring is een
rendering van feiten, een werkings-as is een feit met een tweede meetmoment, en een
restrisicobesluit is een feit met een handtekening.

## 5. Is formulier-eerst dan een verkeerde stap? Nee — en dit is de grens

Ja, noodzakelijk, en niet als compromis. De formulieren zijn de **vertrouwensmunt van de
organisatie**: de privacy-officer is verantwoordelijk voor een DPIA, niet voor "het
gereedschap zegt dat AVG-04 groen is". Een normen-eerst gereedschap zou aan elke balie
worden afgewezen, en terecht. Formulier-eerst is het bruggenhoofd: je ontmoet iedere
eigenaar in zijn eigen artefact en verdient daarmee het recht op de gegevens eronder.

Het wordt achterstevoren op precies één grens: **wanneer formulieren het datamodel zijn in
plaats van de presentatielaag.** Daar staan we nu. Steek die grens bewust over — laat elk
formulier exact zoals de eigenaar het herkent, en trek de feitenbasis eronder vandaan — dan
hoeft de organisatie nooit in te stemmen met een reorganisatie die ze zou weigeren.

Kort door de bocht: het normenkader weet wat *aantoonbaar* moet zijn, de formulieren weten
wie moet *tekenen*, en alleen de kernvragen weten wat het ding *is* en op wie het landt. De
invulhulp behandelt de derde als extraatje, terwijl dat de enige van de drie is die draagt.

---

# Ontwerp: de feitenbasis

## 6. Wat er al staat

Het ontwerp hieronder is een **generalisatie van bestaande code**, geen nieuw subsysteem.

`src/utils/toepasselijkheid.ts` heeft nu:

- een vocabulaire van 7 `KenmerkId`'s, gedeeld tussen de kernvragen (die ze afleiden) en
  `index.json` (die ze toetst);
- drie-waardigheid: `true | false | 'onbekend'`, met de expliciete regel dat `onbekend` géén
  synoniem is van `false`;
- `KENMERK_SOURCE`: per kenmerk of het uit een **zelfverklaring** (kernvragen) of uit een
  **instrument** (beslishulp) komt — herkomst, dus, en het onderscheid dat §5.3 van het
  toepasselijkheidsdocument al maakt;
- een pure, synchrone regelmachine (`evaluateApplicability`).

`src/utils/kernvragen.ts` heeft de andere helft: `KEUZEVRAGEN` mapt antwoordoptie → kenmerk,
en `deriveKenmerken` is een **projectie**: kenmerken worden afgeleid uit antwoorden, nooit
opgeslagen. Daardoor kunnen ze niet verouderen, hoeven ze niet door de CRDT-codec, en is er
geen migratie.

Dat zijn alle bouwstenen. Wat ontbreekt is dat het vocabulaire alleen booleans kent, alleen
door toepasselijkheid wordt gelezen, en dat de andere drie consumenten (prefill,
AI-grounding, dekking) elk hun eigen bedrading hebben.

## 7. Het model

Eén nieuw begrip: het **systeemprofiel**, de verzameling *feiten* over het systeem waar het
dossier over gaat.

```ts
// src/facts/vocabulaire.ts

export type FeitId =
  | 'doel' | 'aanleiding' | 'beschrijving' | 'alternatieven'
  | 'gedrag' | 'algoritme_of_ai' | 'ai_verordening_in_scope' | 'ai_risicoklasse'
  | 'oplevering' | 'gebruikersinterface'
  | 'doelgroep' | 'raakt_burgers' | 'betrokkenen' | 'besluit_over_personen' | 'menselijke_rol'
  | 'persoonsgegevens' | 'eigen_dataset' | 'gegevens' | 'biv_classificatie'
  | 'grondslag' | 'waarden' | 'ongelijke_uitwerking' | 'risicos'
  | 'eigenaar' | 'transparantie' | 'bezwaar' | 'monitoring' | 'exit'

export type FeitWaarde =
  | { soort: 'bool'; waarde: boolean | 'onbekend' }   // de huidige kenmerken
  | { soort: 'keuze'; waarde: string | null }         // radio
  | { soort: 'verzameling'; waarde: string[] }        // checkbox
  | { soort: 'tekst'; waarde: string }                // vrije tekst (HTML-contract)

/** Waar de waarde vandaan komt. Generaliseert KENMERK_SOURCE. */
export interface Herkomst {
  soort: 'kernvraag' | 'formulier' | 'instrument' | 'waarneming'
  formId?: string
  questionId?: string
  instrument?: string        // 'beslishulp' | 'quickscan' | ...
  op?: number                // wanneer vastgesteld
}

/** Hoe hard het feit is. Expliciet, want de UI mag het eerste nooit als het
 *  tweede tonen — zie kernvragenSource.ts over `derived`. */
export type Hardheid = 'zelfverklaard' | 'afgeleid' | 'vastgesteld'

export interface Feit {
  id: FeitId
  waarde: FeitWaarde
  herkomst: Herkomst | null   // null = nog niet beantwoord
  hardheid: Hardheid
}

export type Systeemprofiel = Record<FeitId, Feit>
```

Eén functie eromheen, met exact de eigenschappen van `deriveKenmerken`: puur, synchroon,
afgeleid, nooit opgeslagen.

```ts
export function resolveFeiten(dossier: Dossier): Systeemprofiel
```

Per feit staat in het vocabulaire een **resolverketen** in volgorde van hardheid: eerst het
instrument dat het echt vaststelt, dan het formulier dat het beweert, dan de kernvraag die
het zelfverklaart. `ai_verordening_in_scope` is het bestaande voorbeeld: kernvragen kunnen
hem op `false` zetten (geen AI ⇒ geen verordening), maar alleen een afgeronde beslishulprun
mag hem op `true` zetten. Diezelfde structuur maakt straks `biv_classificatie` (uit de
quickscan) en `ai_risicoklasse` (uit de beslishulp) tot gewone feiten.

**Kenmerken worden een deelverzameling.** `KenmerkId` blijft bestaan als het booleaanse deel
van `FeitId`, en `deriveKenmerken` wordt een adapter van drie regels over `resolveFeiten`.
Toepasselijkheid, `index.json` en alle bestaande tests veranderen op dag één niet.

## 8. De vier consumenten

Het punt van de feitenbasis is niet de abstractie, maar dat vier bestaande mechanismen hun
eigen bedrading kwijtraken.

| Consument | Nu | Straks |
|---|---|---|
| **Toepasselijkheid** | leest `Kenmerken` uit `deriveKenmerken` | leest het booleaanse deel van het profiel — ongewijzigd gedrag |
| **Cross-form prefill** | 351 handgeschreven paren, 81 vanuit kernvragen | een vraag declareert `feit: "doel"`; prefill leest het feit |
| **AI-grounding** | `kernvragenSource.ts` rendert de kernvragen als transcript-document | rendert het profiel — beslishulp- en quickscanfeiten komen er gratis bij |
| **Normenkaderdekking** | bestaat niet (§8 niveau A) | control → `feiten: [...]`, dekkingsrapport zonder vraag-id's |

De prefill-winst is de meest tastbare. Een vraag in een formulier-JSON krijgt een optioneel
veld:

```json
{ "id": "d1.1", "text": "Beschrijf het project", "feit": "beschrijving", "feitModus": "copy" }
```

`feitModus` is het bestaande `CrossFormMode`-onderscheid (`copy` letterlijk overnemen,
`synthesize` via de ✦-knop herschrijven) — dat blijft, want twee formulieren die hetzelfde
feit gebruiken vragen er niet altijd in dezelfde vorm naar. Wat verdwijnt zijn de
N×M-paren: zeven formulieren die `beschrijving` nodig hebben zijn zeven `feit`-annotaties in
plaats van (bij groei) 21 mappings.

**Eerlijk over de opbrengst:** alleen de `copy`-mappings die *hetzelfde feit* betreffen
verdwijnen. Het merendeel van de 351 zijn `synthesize`-mappings tussen inhoudelijk
verschillende vragen (AIIA → DPIA), en die blijven. De schatting van wat opgaat in feiten
moet nog gemaakt worden — zie §11.

## 9. Waarom afgeleid en niet opgeslagen

De verleiding is om het profiel als object in het dossier te zetten. Doe dat niet, om vier
redenen die alle vier al in de codebase gedocumenteerd staan:

1. **Geen CRDT-migratie.** Alles wat in `Dossier` staat moet door `ydocCodec` en
   `dossierDoc` heen; `docs/realtime-collab-plan.md` en de collab-lessen laten zien wat dat
   kost. Een afgeleid profiel raakt de codec niet.
2. **Kan niet verouderen.** Precies het argument dat `deriveKenmerken` nu al maakt: live
   herberekenen zodat een beslishulprun ná de kernvragen het beeld bijwerkt.
3. **Geen tweede waarheid.** Het antwoord blijft het antwoord; het feit is een lezing ervan.
   Dat is ook wat de honesty-eis uit `kernvragenSource.ts` beschermt: een AI-antwoord dat het
   transcript citeert is een herformulering van de invuller, geen bevestiging door een bron.
4. **Terugtrekbaar.** Gaat het ontwerp niet vliegen, dan is er niets te ontmigreren.

De uitzondering komt pas bij §4-punt-1: **waarnemingen** (een feit dat na ingebruikname is
gemeten) zijn per definitie niet afleidbaar uit formulierantwoorden en hebben wél opslag
nodig. Dat is bewust fase 4 en niet eerder.

## 10. Fasering

| Fase | Wat | Verandert voor de gebruiker | Kosten |
|---|---|---|---|
| **0** | `src/facts/vocabulaire.ts` + `resolveFeiten`; `deriveKenmerken` herschreven als adapter | niets — bewijsbaar via de bestaande `kernvragen.test.ts` en `toepasselijkheid.test.ts` | 1 bestand + adapter |
| **1** | `feit`-veld op vragen; prefill leest feiten vóór `crossFormMappings`; de opgegane mappings verwijderd | niets zichtbaar; minder onderhoud | schemaveld + prefill-tak + annotaties |
| **2** | `kernvragenSource.ts` rendert het profiel | AI-Modus kent nu ook BIV-classificatie en AI-risicoklasse | klein |
| **3** | Niveau B tegen feiten: `feiten: [...]` per control + dekkingsscript | dekkingsrapport per dossier | script + annotatiewerk |
| **4** | Profiel overleeft het dossier (systeemregister) + `waarneming`-feiten | herbeoordeling bij wijziging; werking naast opzet | groot — nieuw datamodel |

Fase 0 is een refactor met nul gedragsverandering en is het hele risico van het voorstel:
gaat die niet schoon door de bestaande tests, dan klopt de aanname dat de kernvragen
werkelijk het schema zijn niet, en stopt het hier.

Fase 1 tot en met 3 zijn elk zelfstandig waardevol en in willekeurige volgorde te doen. De
gaten uit de dekkingsanalyse (`bia`, informatiebeheer/openbaarheid, Awb) blijven gewoon
nuttig werk, maar het is *dekking*, geen richting — en elk nieuw formulier op het huidige
model vergroot de koppeling die fase 1 juist afbouwt.

## 11. Wat dit document niet doet

- **Geen telling van welke van de 351 mappings opgaan in feiten.** Dat vraagt een
  vraag-voor-vraag vergelijking en is de eerste harde cijfer-check die fase 1 rechtvaardigt
  of onderuithaalt.
- **Geen feit-voor-feit resolverketen.** §7 geeft het model en één uitgewerkt voorbeeld
  (`ai_verordening_in_scope`); de overige 27 zijn nog niet uitgeschreven.
- **Geen ontwerp voor de systeemverklaring of het restrisicobesluit** (§4-punten 2 en 3).
  Beide leunen op de feitenbasis maar zijn eigen ontwerpen.
- **Geen uitspraak over eigenaarschap.** Wie beheert het vocabulaire als het van 7 kenmerken
  naar 28 feiten gaat? Nu is dat impliciet de bouwer.

## 12. Twee open vragen die het ontwerp raken

1. **Sterft een dossier met het project, of blijft het systeem bestaan en moet het bij elke
   wijziging opnieuw beoordeeld worden?** Bij het tweede moet de feitenbasis het dossier
   overleven, en volgt fase 4 vrijwel vanzelf uit de rest.
2. **Is er iemand die de ethische antwoorden wíl hebben** — een ethiekcommissie, een CIO die
   ze leest — of zou een systeemverklaring vandaag geen lezer hebben? Dat bepaalt of §4-punt
   3 een bouwopdracht is of een lobby.
