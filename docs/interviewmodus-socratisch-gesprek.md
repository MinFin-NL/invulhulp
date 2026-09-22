# Interviewmodus: een gesprekspartner in plaats van een invulveld

> **Status:** ontwerp — geen commitment. Bouwt voort op
> `docs/systeemprofiel-feitenbasis.md` (de feiten die een gesprek vult) en op
> `docs/normenkader-dekkingsanalyse.md` §4 (waarom de ethiek niet in een formulier past).
> §1–3 zijn de motivering, §4–8 het ontwerp, §9 de risico's — dat is de belangrijkste
> sectie —, §10 de evaluatie, §11 de fasering.

## 1. Het idee

Een invulhulp die vraagt in plaats van laat invullen. De projectleider krijgt geen
tekstvakken maar een gesprekspartner die doorvraagt over het systeem: wat het is, wie het
raakt, wat er misgaat als het misgaat. Uit dat gesprek rollen de feiten, en uit de feiten
rollen de formulieren.

## 2. Waarom dit precies de ontbrekende invoerkant is

`docs/systeemprofiel-feitenbasis.md` betoogt dat formulieren moeten ophouden het *datamodel*
te zijn. Dit document is de tweede helft van diezelfde beweging: formulieren moeten ook
ophouden de *invoermodus* te zijn.

```
nu:      mens leest 22 formulieren  →  mens schrijft 930 antwoorden  →  dossier
straks:  mens praat  →  feiten  →  formulieren renderen zichzelf  →  mens corrigeert
```

De invulhulp keert daarmee om: hij houdt op een stapel vragenlijsten te zijn en wordt een
gesprek met een dossier als bijproduct.

## 3. Waarom een gesprek hier beter is dan een formulier — vier specifieke redenen

Niet "AI is fijn", maar vier dingen die een formulier structureel niet kan.

**3.1 Doorvragen is waar de inhoud zit.** `kern.betrokkenen` vraagt: *"Wie van hen kan er
niet voor kiezen, en zitten daar kwetsbare groepen bij?"* In een tekstvak levert dat één
regel op. Een interviewer die "ondernemers" hoort, vraagt door: *en ondernemers zonder
DigiD-machtiging? en wie doet dit namens iemand anders?* Een formulier kan alleen vertakken
op de *waarde* van een keuzeoptie, nooit op de *betekenis* van een vrij antwoord.

**3.2 De consistentiecheck — het enige dat 930 vragen structureel niet kunnen.** Vragen
staan los van elkaar; niemand legt antwoord 12 naast antwoord 407. Een interviewer wel:

> *U zei dat het systeem geen besluit over personen neemt, maar ook dat het aanvragen
> rangschikt op urgentie. Wie krijgt er dan als eerste antwoord, en wat betekent dat voor
> wie onderaan staat?*

Dat is precies de tegenstrijdigheid die nu pas maanden later bij een DPIA of een IAMA boven
water komt. En dankzij de feitenbasis is het goedkoop: de tegenstrijdigheid zit tussen twee
*feiten*, niet tussen twee lappen tekst. Regels als "`besluit_over_personen` = nee terwijl
`gedrag` ⊇ rangschikt" zijn deterministisch te detecteren; het model hoeft de spanning alleen
nog in gewone taal voor te leggen.

**3.3 De ethische vragen zijn precies de vragen die een formulier het slechtst behandelt.**
Een tekstvak met *"welke publieke waarden worden geraakt"* nodigt uit tot een
compliance-klinkend non-antwoord. Deliberatie heeft een tegenover nodig. Het gesprek is
*geen* vervanging van de ontbrekende tegenpartij met bevoegdheid uit
`normenkader-dekkingsanalyse.md` §4 — een model tekent niets en accepteert geen restrisico —
maar het is het verschil tussen een vraag die gesteld wordt en een vraag die beantwoord
wordt.

**3.4 Het lost de koude start beter op dan de huidige truc.** AI-Modus weigert zonder
documenten, en dat is de juiste standaard. `src/services/kernvragenSource.ts` bestaat om die
impasse te breken: de kernvragen worden als transcript geïndexeerd zodat er iets te
citeren valt. Een interview is dezelfde truc, beter uitgevoerd — het produceert dat
brondocument pratend, in de eigen woorden van de invuller, en daarmee meteen het materiaal
voor de systeemverklaring uit `normenkader-dekkingsanalyse.md` §4.

## 4. Er ligt al een precedent in de code

Dit is geen greenfield-feature. `/api/improve` doet dit al één beurt lang:

- `backend/main.py` — de improve-prompt mag `<verduidelijking>jouw vraag</verduidelijking>`
  teruggeven in plaats van een suggestie;
- `_sse_stream(..., allow_clarification=True)` vangt die tag af en zendt een SSE-event
  `clarification` in plaats van `done`;
- `src/components/TiptapEditor.vue` rendert de vraag, neemt het antwoord aan en herstart de
  aanroep met `clarification_question` + `clarification_answer`;
- en er staat een expliciete rem op: `allow_clarification=not req.clarification_answer.strip()`
  — *"Never re-ask after a clarification round, to avoid loops."*

Een interview is exact die lus, bewust aangezet en van een budget voorzien. Het patroon, het
SSE-contract, de XML-uitvoerconventie en zelfs de UI-vorm bestaan dus al; wat ontbreekt is
beurtbeheer, een doel om naartoe te werken (de feitenbasis) en de remmen uit §9.

## 5. Drie gesprekken, niet één

| Modus | Wanneer | Wat het vult | Waarom een gesprek wint |
|---|---|---|---|
| **Startgesprek** | begin van het dossier | de feitenbasis (§7 van het feitendocument) | doorvragen op abstracte antwoorden |
| **Verdiepingsgesprek** | per formulier, na AI-Modus | de vragen die documenten niet konden beantwoorden | het weet al wat het niet weet |
| **Herijkingsgesprek** | na ingebruikname | waarnemingsfeiten | er *is* geen vaste vragenlijst |

Het derde is waar een gesprek het grootste voordeel heeft en is niet toevallig de
ontbrekende **werkings-as** uit `normenkader-dekkingsanalyse.md` §4. *"U zei bij de start dat
u zou letten op ongelijke uitwerking. Wat hebt u sindsdien gezien?"* is geen formuliervraag;
het antwoord bestond nog niet toen het formulier werd geschreven.

Fase 1 (§11) bouwt alleen het startgesprek.

## 6. Wat maakt het socratisch — de zettenset

Zonder expliciete zettenset wordt dit een chatbot die formulieren voorleest. De interviewer
mag:

1. **Doorvragen op abstractie.** "Burgers" → *welke burgers, en wie van hen kan niet weg?*
2. **Een tegenvoorbeeld leggen.** *Wat gebeurt er bij iemand die geen DigiD heeft?*
3. **Twee eerdere antwoorden naast elkaar leggen** (§3.2) — de sterkste zet, en de enige die
   deterministisch getriggerd kan worden.
4. **De negatieve vraag stellen.** *Wat gaat er mis, wie merkt het als eerste, en hoe komt
   die erachter?*
5. **Spiegelen en laten bevestigen.** *Ik hoor: het systeem beslist niet, maar bepaalt wel de
   volgorde. Klopt dat?*
6. **Afsluiten.** Weten wanneer het genoeg is, en dat zeggen.

En expliciet niet:

- **Nooit een inhoudelijk antwoord voorstellen op een feitvraag.** Zie §9.1 — dit is de
  hoofdregel, niet een nuance.
- Geen juridisch oordeel ("dit is een hoog-risico AI-systeem"). Dat doet de beslishulp, een
  instrument met een herleidbare uitkomst.
- Niet moraliseren. De interviewer legt spanningen voor, hij beoordeelt ze niet.

## 7. Techniek

### 7.1 Server blijft staatloos

`LLMBackend.chat(system, user)` in `backend/llm.py` kent geen berichtgeschiedenis — Azure en
Ollama delen die ene signatuur. Twee opties: de interface uitbreiden met berichten, of het
transcript per beurt in het user-bericht vouwen.

**Kies het tweede.** Een startgesprek is grofweg 20 tot 40 korte beurten; dat past ruim, het
houdt beide backends symmetrisch, en het houdt de server staatloos zoals `/api/extract` en
`/api/synthesize` dat al zijn. De gesprekstoestand hoort in het dossier, niet in het model.

### 7.2 Eén endpoint, bestaand SSE-contract

```
POST /api/interview/stream
{
  "modus": "start" | "verdieping" | "herijking",
  "transcript": [{ "rol": "interviewer" | "invuller", "tekst": "…" }],
  "profiel":   { "<feitId>": { "waarde": …, "hardheid": … } },   // wat al vaststaat
  "open":      ["betrokkenen", "grondslag", …],                   // wat nog ontbreekt
  "spanningen":[{ "feiten": ["besluit_over_personen","gedrag"], "waarom": "…" }],
  "beurt": 12, "budget": 30
}
```

Uitvoer via `_sse_stream`, met de bestaande events plus één nieuwe:

| Event | Payload | Bestaat al |
|---|---|---|
| `chunk` | tekst, token voor token | ja |
| `vraag` | `{ vraag, waarvoor: FeitId[] }` — de volgende beurt | **nieuw** |
| `voorstel` | `{ feitId, waarde, citaat }` — een feit uit een uitspraak | **nieuw** |
| `done` | `{ klaar: true, samenvatting }` | ja |
| `error` | `{ detail }` | ja |

De XML-uitvoerconventie van de bestaande prompts wordt doorgetrokken:
`<vraag>`, `<waarvoor>`, `<voorstel feit="…">`, `<klaar/>`. `_xml_tag` doet het parsen al.

De **spanningen** worden op de client deterministisch berekend uit het profiel (§3.2) en
meegestuurd. Het model verzint geen tegenstrijdigheden; het verwoordt de tegenstrijdigheden
die de regels vinden. Dat scheelt precies de categorie hallucinatie die hier het meeste
kwaad zou doen.

### 7.3 Opslag: het transcript is een run, geen antwoord

Precedent: `BeslishulpRun` en `ToepassingsscanRun` liggen als blob op een gastformulier
(`src/stores/assessmentStore.ts`), rijden mee door `ydocCodec` en hebben allebei een
round-trip-test.

```ts
export interface InterviewRun {
  modus: 'start' | 'verdieping' | 'herijking'
  beurten: { rol: 'interviewer' | 'invuller'; tekst: string; op: number }[]
  bevestigd: Record<FeitId, { citaat: string; op: number; door?: string }>
  model: string          // welk model dit gesprek voerde
  promptVersie: string   // welke promptversie
  gestartOp: number
  afgerondOp?: number
}
```

`model` en `promptVersie` zijn niet optioneel. Een dossier moet reconstrueerbaar zijn, en een
gesprek dat door een ander model anders zou zijn gelopen moet dat kunnen laten zien.

### 7.4 Het transcript als bron

`syncKernvragenSource` indexeert nu de kernvragen als document met `derived: 'kernvragen'`,
juist zodat `SourcePanel` kan zeggen dat een citaat een herformulering van de invuller is en
geen bevestiging door een bron. Het interviewtranscript krijgt exact dezelfde behandeling en
dezelfde waarschuwing. Het is meer tekst, geen hardere tekst.

### 7.5 UI

Nieuw scherm naast `KernvragenView.vue`, niet ervoor in de plaats (§9.5). NLDD-conform: de
bestaande verduidelijkings-UI in `TiptapEditor.vue` is het visuele precedent — geen
zelfgebouwde chatbubbels, wel `nldd-card` per beurt, `nldd-text-field` voor het antwoord,
`nldd-button` met `text=`-attribuut, en het voorstellenpaneel als `nldd-banner` met
bevestigknop. De hele beurtenlijst moet met het toetsenbord te doorlopen zijn en elke nieuwe
vraag moet door een schermlezer worden aangekondigd (`aria-live="polite"`); een gesprek dat
alleen visueel voortgang toont is voor een schermlezergebruiker een stilstaand scherm.

## 8. Hoe feiten uit een gesprek komen

Niet door het model een formulier te laten invullen. Per bevestigd feit geldt:

1. Het model doet een **voorstel** met een **letterlijk citaat** uit de uitspraak van de
   invuller.
2. `_grounded()` in `backend/main.py` toetst dat citaat tegen het transcript — dezelfde
   deterministische controle die AI-Modus tegen bronhallucinatie beschermt, nu met het
   transcript als bron.
3. De invuller **bevestigt** het voorstel op een echte, niet-gegenereerde control (een
   radio, dezelfde als in de kernvragen).
4. Pas dan krijgt het feit `hardheid: 'zelfverklaard'` en herkomst
   `{ soort: 'kernvraag', … }`.

Stap 3 is niet-onderhandelbaar voor de feiten die toepasselijkheid bepalen
(`persoonsgegevens`, `besluit_over_personen`, `algoritme_of_ai`, `eigen_dataset`,
`raakt_burgers`, `gebruikersinterface`). Zie §9.1.

## 9. Risico's

### 9.1 Sturende vragen — het hoofdrisico

Een interviewer die een antwoord voorstelt, krijgt zijn eigen antwoord terug. *"Dus er zitten
geen persoonsgegevens in?"* levert "klopt" op van een projectleider die het niet zeker weet.
Dat is hier geen schoonheidsfout: die feiten bepalen welke formulieren gelden, en dus welke
wettelijke verplichtingen in beeld komen. Een sturende vraag kan een DPIA laten verdwijnen.

Drie remmen, cumulatief:

1. **De interviewer mag nooit een inhoudelijk antwoord voorstellen op een feitvraag** — hij
   vraagt, spiegelt en vraagt door. Harde promptregel, en toetsbaar in de eval (§10).
2. **Toepasselijkheidsfeiten worden nooit door het gesprek gezet**, alleen *gerouteerd*: het
   gesprek brengt de invuller bij de keuzevraag, de invuller kiest zelf. `deriveKenmerken`
   blijft de enige weg van antwoord naar kenmerk.
3. **"Weet ik niet" blijft een volwaardig antwoord.** `onbekend` is geen `false` — dat is de
   bestaande regel in `src/utils/toepasselijkheid.ts`, en een gesprek dat mensen naar een
   ja/nee praat ondermijnt precies die eigenschap.

### 9.2 Woorden van het model als woorden van de invuller

Een samengevat antwoord dat aan de invuller wordt toegeschreven, is erger dan geen antwoord:
het ziet eruit als een verklaring en is het niet. Daarom slaat `InterviewRun.bevestigd` een
**citaat** op, niet een parafrase, en toont de UI bij elk afgeleid feit de oorspronkelijke
uitspraak. Voor de systeemverklaring geldt hetzelfde: publiceer wat de mens zei.

### 9.3 Lussen en uitputting

De bestaande code kiest de veilige kant (nooit opnieuw vragen). Een interview kan dat niet,
dus heeft het een expliciet budget: maximaal *n* beurten per feit, een totaalbudget, en een
altijd zichtbare uitgang. Het gesprek moet op elk moment af te breken en later te hervatten
zijn, en een half gesprek moet een geldig, incompleet profiel opleveren — niet een
foutmelding. Vraagmoeheid is een echt risico: een gesprek dat langer duurt dan het formulier
is een slechter formulier.

### 9.4 Modelkwaliteit en degradatie

`backend/eval_prompts.py` liet eerder zien dat Mistral 7B al moeite heeft met
checkbox-extractie en synthese; de Ollama-standaard in `create_backend()` is nog steeds
`mistral`. Interviewen is aanzienlijk moeilijker dan extraheren. Daarom: de interviewmodus
wordt **gated op backendcapaciteit** en degradeert zichtbaar naar het gewone formulier in
plaats van een slecht gesprek te voeren. Een lokale ontwikkelopstelling is geen bewijs dat
het werkt.

### 9.5 Het formulier moet blijven

Niet iedereen wil praten, niet iedereen kan vlot typen, en sommige mensen hebben het antwoord
al ergens staan. Het startgesprek staat **naast** `KernvragenView.vue` en vult dezelfde
antwoorden; de invuller mag halverwege wisselen. Dat is ook de goedkoopste terugtrekweg als
het gesprek niet blijkt te werken.

### 9.6 Vertrouwelijkheid

Een gesprek lokt meer uit dan een formulier — dat is het punt, en het betekent dat er
gevoeliger materiaal in het transcript belandt dan de invuller in een tekstvak zou zetten
("we weten eigenlijk niet of dit mag"). Het transcript is dossierinhoud en valt onder de
bestaande deelrechten (`docs/rollen-en-rechten-advies.md`), maar de invuller moet **vóór** het
gesprek zien wie het straks kan lezen, en achteraf een beurt kunnen verwijderen. Bij een
Azure-backend geldt bovendien de gewone vraag naar dataclassificatie: dit is meer vrije tekst
dan de invulhulp tot nu toe naar buiten stuurde.

## 10. Evalueren

Een interview is moeilijker te evalueren dan een extractie: er is geen enkel juist antwoord.
`eval_prompts.py` kan wel worden uitgebreid met **persona's** — een verzonnen project met een
vastgelegd gouden profiel — waarbij een tweede model de invuller speelt en het gesprek
automatisch wordt gevoerd. Meet dan drie dingen, in deze volgorde van belang:

1. **Geen sturing.** Hoe vaak stelt de interviewer een inhoudelijk antwoord voor op een
   feitvraag? Doelwaarde nul; dit is een blokkerende meting, geen kwaliteitsmeting.
2. **Convergentie.** Komt het bevestigde profiel overeen met het gouden profiel — en let
   vooral op vals-negatieven op de toepasselijkheidsfeiten (een gemiste
   `persoonsgegevens: ja` is veel erger dan een gemiste vrije tekst).
3. **Beurten tot afronding.** Ter vergelijking met de tijd die het formulier kost.

Een vierde meting kan niet geautomatiseerd worden en is toch de belangrijkste: **vinden
projectleiders het gesprek de moeite waard?** Dat vraagt vijf echte gesprekken met echte
projecten voordat er iets breed wordt uitgerold.

## 11. Fasering

| Fase | Wat | Afhankelijk van |
|---|---|---|
| **0** | Promptspike in `eval_prompts.py`, geen UI: haalt een gesprek met een persona het gouden profiel? | — |
| **1** | Startgesprek naast de kernvragen; feiten als **voorstel**, bevestiging in de bestaande kernvragen-UI | fase 0 van `systeemprofiel-feitenbasis.md` |
| **2** | Transcript vervangt het kernvragentranscript als AI-bron | fase 1 |
| **3** | Verdiepingsgesprek per formulier, na AI-Modus, over wat de documenten niet dekten | fase 1 + RAG |
| **4** | Herijkingsgesprek en waarnemingsfeiten — de werkings-as | fase 4 van het feitendocument |

Fase 0 is een spike van een dag of wat en beslist alles. Blijkt daar dat het model stuurt
(§9.1) of niet convergeert, dan is het antwoord "niet doen" en heeft het niets gekost.

## 12. Wat dit document niet doet

- **Geen promptontwerp.** §6 geeft de zettenset, niet de tekst. Die hoort in `backend/main.py`
  bij de andere prompts en moet door de eval heen voordat hij ergens anders wordt genoemd.
- **Geen kostenraming.** Een gesprek van 30 beurten met het transcript per beurt meegestuurd
  is kwadratisch in tokens; bij Azure is dat een echt bedrag per dossier dat nog niemand heeft
  uitgerekend.
- **Geen keuze tussen spraak en tekst.** Alles hierboven gaat uit van typen.
  `docs/vergaderopname-en-transcriptie.md` raakt hetzelfde onderwerp van de andere kant en
  verdient een gezamenlijke blik.
- **Geen uitspraak over of het gesprek verplicht kan worden.** Nu is het een aanbod. Wordt
  het ooit de enige route, dan is §9.5 een toegankelijkheidsprobleem in plaats van een
  voorkeur.
