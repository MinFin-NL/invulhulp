# Ontwerprichting: betekenisvolle menselijke tussenkomst in de invulhulp

> **Status:** ontwerprichting — geen commitment, geen bouwbesluit. Dit document is het vervolg
> op [`systeemanalyse-invulhulp-in-het-stelsel.md`](systeemanalyse-invulhulp-in-het-stelsel.md)
> §3.2 en §3.4: die beschrijven *dat* de tool mensen tot stempelmachine kan maken, dit document
> beschrijft *wat je daaraan doet*. §1–2 zijn de probleemstelling, §3 de optieruimte (inclusief
> wat is afgevallen), §4 de zeven ingrepen op volgorde van hefboom, §5 het ontwerpdoel eronder.
>
> Een vormgegeven, Engelstalige versie van beide documenten staat op
> <https://claude.ai/artifact/EMMK8Fg88yqrC5vN7GZ5pk> (privé; delen via het Share-menu).

## 1. Wat een stempelmachine precies is

Een *stempelmachine* — in AVG-termen: het ontbreken van **betekenisvolle menselijke
tussenkomst** — is een mens wiens aanwezigheid aan een eis voldoet zonder het oordeel te
leveren waarvoor die eis geschreven is.

Er zijn vier voorwaarden voor, en ze zijn alle vier nodig:

| # | Voorwaarde | Wat hem in stand houdt |
|---|---|---|
| **V1** | Het artefact arriveert al af — er valt niets te maken, alleen te aanvaarden | AI Modus als eerste beweging |
| **V2** | Afwijzen kost meer dan aanvaarden | geen adviesrol, geen diff, 91 vragen per toets |
| **V3** | Niets stroomafwaarts spreekt de aanvaarding ooit tegen | alle instrumenten zijn ex ante; `beheer` is leeg |
| **V4** | Niemand buiten de lus leest het ooit | 22 documenten voor 22 functionarissen, nul voor de betrokkene |

Elke ingreep in §4 valt aan op ten minste één van deze vier. Een maatregel die er geen van
raakt is versiering, hoe goedbedoeld ook. Gebruik deze tabel als toets bij elk volgend voorstel.

## 2. De recursie — en waarom die de scherpste test is

Dit is geen bijkomstigheid maar de kern van de zaak:

> **Een tool die ambtenaren tot stempelmachine maakt, terwijl hij menselijk toezicht op
> AI-systemen documenteert, voert precies de fout uit die hij toetst.**

AI-verordening art. 26 en AVG art. 22 bestaan om stempelmachines in *uitgerolde* systemen te
voorkomen. De voorwaarden voor echt toezicht dáár — begrijpen wat je beoordeelt, kunnen
afwijken, gevolgen dragen, tijd hebben — zijn exact dezelfde vier als hierboven.

Daaruit volgt een goedkope, harde en ongemakkelijke zelftest: **laat de invulhulp de
toezichtvragen uit `iama.json` en `aiia.json` op zichzelf beantwoorden.** Begrijpt de mens in
de lus wat hij goedkeurt? Kan hij afwijken? Gebeurt er iets als hij het mis heeft? Een tool die
zijn eigen grondrechtentoets niet doorstaat, heeft geen positie om hem af te nemen.

## 3. De optieruimte

Gegroepeerd naar het *mechanisme* waar ze op steunen, niet naar feature. Ook wat is afgevallen
staat erbij — anders komt het over een half jaar terug als een nieuw idee.

### 3.1 Cognitief

- **Blind eerst antwoorden.** De invuller antwoordt vóór hij enige AI-tekst ziet. Het
  *generation effect* is een van de robuustste bevindingen uit de cognitieve psychologie: je
  begrijpt wat je zelf hebt voortgebracht, niet wat je hebt goedgekeurd. Herkennen is geen
  weten.
- **Terugvertellen bij het besluit.** Alleen op het beslispunt: de tekenaar formuleert het
  risico in eigen woorden; het model toetst dat op tegenspraak met de feiten in het dossier,
  niet op stijl.
- **Uitleg op het moment zelf.** Bij elke vraag: waaróm hij bestaat, plus één echte casus waarin
  het antwoord fout was en er iets misging. Werkt rechtstreeks tegen het verlies van eigen
  vakmanschap (§3.4 van de systeemanalyse).

### 3.2 Tegenspraak

- **Het model als tegenstander, nooit als schrijver.** Zijn taak is aanvallen: de tegenstrijdigheid
  vinden tussen antwoord 12 en antwoord 407, het sterkste bezwaar formuleren dat de advocaat van
  een burger zou maken, benoemen wat het antwoord gemakshalve weglaat.
- **Twee-pettenregel.** Wie met AI heeft gesteld, is niet degene die bevestigt.
- **Roulerende advocaat van de duivel** in het dossier, bemenst door een collega-projectleider —
  geen compliance-functionaris.

### 3.3 Aandacht en economie

- **Herkomst per antwoord** — gegenereerd-ongewijzigd / gegenereerd-bewerkt / mensgeschreven —
  en de tool stuurt het uur van de toetser naar waar het het meest waard is.
- **Steekproefaudits met gepubliceerde trefkans.** Alles lezen kan niet; lees 5% tot op het bot
  en publiceer wat je vindt. Uitgerekend MinFin kent de economie van de aselecte controle.
- **Afwijkingsdetectie:** "dit antwoord is ongebruikelijk voor dit type systeem" is leesbaar,
  91 antwoorden zijn dat niet.

### 3.4 Gevolg

- **Handtekeningen die iets zeggen.** Niet `restrisico geaccepteerd: ja`, maar een zin die
  benoemt wélke mensen wélke restschade dragen en waarom, in de eigen woorden van de tekenaar.
- **Publicatie als standaard.** Wat voor buitenstaanders geschreven wordt, wordt overdacht; wat
  voor het dossier geschreven wordt niet.
- **Falsificatie achteraf.** Incidenten, bezwaren en monitoringbevindingen koppelen terug aan
  het antwoord dat ze had moeten voorzien.

### 3.5 Structureel

- **Asymmetrische automatisering** — automatiseer het administratieve, verbied het op het
  afwegende.
- **Omkering:** maak de systeemverklaring het primaire artefact en genereer de 22 formulieren
  daaruit.
- **Verplaats de handtekening** naar wie het systeem gaat beheren, niet naar wie het erdoor wil
  krijgen.

### 3.6 Bewust afgevallen

| Idee | Waarom niet |
|---|---|
| Generieke wrijving (tijdsloten, verplicht doorscrollen, leestimers) | Mensen omzeilen theatrale wrijving en leren er minachting voor de tool bij. Wrijving werkt alleen op het beslispunt, en alleen als ze iets vraagt dat je uitsluitend dénkend kunt leveren. |
| AI helemaal verbieden | Je verliest juist het enige waar het model beter in is dan élke mens hier: 930 antwoorden tegelijk overzien. |
| Nog een goedkeuringslaag | Voegt stempelmachines toe in plaats van ze weg te nemen; elke laag gaat ervan uit dat de vorige het gelezen heeft. |

## 4. De zeven ingrepen, op volgorde van hefboom

De eerste drie zijn goedkoop genoeg voor dit kwartaal.

### 4.1 Keer de rol van de AI om — mens eerst, model spreekt tegen

> Breekt **V1**. Kosten: een flowwijziging en een promptherziening; de infrastructuur staat er.

Maak AI Modus structureel ongeschikt als eerste versie. De invuller antwoordt; *daarna* reageert
het model, in drie vaste bewegingen:

1. wat je bronnen zeggen en jij niet zei;
2. waar dit botst met een ander antwoord in het dossier;
3. wat je weglaat dat een criticus als eerste zou noemen.

Dit is de grootste enkele hefboom in de lijst, omdat het het model verandert van *datgene wat
het denken wegneemt* in *datgene wat erom vraagt* — en omdat het de werkelijke meerwaarde van
het model gebruikt. Consistentie over antwoorden heen is het enige wat geen mens in dit proces
kan. [`systeemprofiel-feitenbasis.md`](systeemprofiel-feitenbasis.md) §3 zag dit al: de
tegenstrijdigheid zit tussen twee *feiten*, dus ze is deterministisch te detecteren en het model
hoeft haar alleen in gewone taal voor te leggen.

**Let op de valkuil uit [`interviewmodus-socratisch-gesprek.md`](interviewmodus-socratisch-gesprek.md)
§9.1:** tegenspreken mag nooit verschuiven naar voorzeggen. Het model stelt geen inhoudelijk
antwoord voor op een feitvraag, ook niet verpakt als vraag.

### 4.2 Maak de automatisering asymmetrisch per vraagtype

> Breekt **V1**. Kosten: één veld in het formulierschema plus beleid.

Voeg aan het schema een veld toe — `modus: extractief | afwegend`. Op extractieve vragen (welke
systemen, welke bewaartermijn, welke basisregistraties) mag het model vrij stellen; dat is
administratief werk en dat automatiseren is pure winst. Op afwegende vragen — `kern.waarden`,
`kern.ongelijke_uitwerking`, `kern.bezwaar`, de proportionaliteitsdelen van de IAMA — **mag het
model vragen en tegenspreken, nooit antwoorden.**

Dat haalt de ergste faalwijze uit het systeem: de machine die de ethiekparagraaf schrijft. En
het legt in het product zelf vast wat deze organisatie wel en niet delegeerbaar acht — een
bestuurlijke uitspraak die het waard is om expliciet te hebben.

### 4.3 Verander het scorebord

> Breekt **V2** en **V3**. Kosten: instrumentatie, geen nieuw formulier.

De tool telt nu voltooiingspercentage. Voltooiingspercentage is bij uitstek de maat van de
stempelmachine: hij stijgt het snelst als er niet wordt nagedacht.

Meet in plaats daarvan, op de plek waar nu het percentage staat:

- gevonden tegenstrijdigheden, en hoe ze zijn opgelost;
- openstaande `onbekend`-antwoorden (de code behandelt onbekend al níet als nee — maak dat
  zichtbaar in plaats van gênant);
- **besluiten die door een assessment zijn veranderd.**

Die laatste is de eerlijke maat van het hele regime. Een verantwoordingsstelsel dat nooit een
ontwerp verandert is theater, en deze tool is het eerste in het departement dat dat met data
kan aantonen — in beide richtingen. Het is bovendien de maat die, zodra de leiding erop kijkt,
al het andere gedrag meetrekt.

### 4.4 Maak er het instrument van de toetser van

> Breekt **V2**. Hangt samen met [`rollen-en-rechten-advies.md`](rollen-en-rechten-advies.md).

Vandaag is de tool de schrijfmachine van de invuller. Het knelpunt is de toetser (§3.1 van de
systeemanalyse), en de stempelmachine die het eerst opduikt is degene met de handtekening.

Geef de FG en de CISO: herkomst per antwoord, een diff ten opzichte van de vorige versie, de
lijst tegenstrijdigheden, en de drie antwoorden die hun uur het meest waard zijn. Plus de
adviesrol, zodat bezwaar maken kan zonder mede-invuller te worden.

Dit lost het doorstroomprobleem en het stempelmachineprobleem met dezelfde bouw op. Het is het
waardevolste werk in de repo dat nu niet op de roadmap staat.

### 4.5 Geef de handtekening zijn gewicht terug

> Breekt **V4** (deels **V3**). Kosten: klein; `restrisico.json` staat er al.

Verander wat deel D vraagt: een zin in de eigen woorden van de tekenaar die benoemt wélke
mensen wélke restschade dragen en om welke reden — gerouteerd vanuit `kern.waarden`,
`kern.ongelijke_uitwerking` en `kern.bezwaar`. Met naam, in eigen woorden, en waar het mag:
openbaar.

Daarmee wordt ethiek een besluit met een naam eronder in plaats van een tekstveld — precies wat
[`systeemprofiel-feitenbasis.md`](systeemprofiel-feitenbasis.md) §4.2 al bepleit.

### 4.6 Maak assessments achteraf falsifieerbaar

> Breekt **V3** — de enige voorwaarde die met ontwerp aan de voorkant niet te raken is.

De werkings-as, met tanden: als er een incident, een bezwaar of een monitoringbevinding
binnenkomt, koppel die aan het antwoord dat hem had moeten voorzien. Zodra een DPIA later
zichtbaar *fout* kan blijken, lezen mensen hem anders terwijl ze hem schrijven.

Dit is dezelfde beweging als de `backprop`-skill van deze repo, toegepast op verantwoording in
plaats van op code: fout → herleid naar de bewering die hem had moeten vangen → versterk de
invariant.

### 4.7 Lever de systeemverklaring

> Breekt **V4**.

Het enige artefact dat de lus opent naar de mensen over wie die lus zogenaamd gaat. Uitgewerkt
in [`systeemprofiel-feitenbasis.md`](systeemprofiel-feitenbasis.md) §4.3; de systeemanalyse
§3.7 legt uit waarom het niet alleen een output is maar de enige plek waar een corrigerend
signaal binnen kan komen.

## 5. Het ontwerpdoel eronder

Je kunt mensen niet tot nadenken verplichten. Je kunt alleen **het eerlijke pad goedkoper maken
dan het rituele pad.**

De goedkoopste route door de tool is nu: AI Modus → export → tekenen. Elk voorstel hierboven is
een manier om een andere route de goedkoopste te maken — niet door het ritueel duurder te maken,
maar door het denkpad sneller, beter ondersteund en beter beloond te maken dan het nu is.

En de toets of dat gelukt is staat in §2: laat de invulhulp zijn eigen toezichtvragen
beantwoorden, en kijk of het antwoord standhoudt.

## 6. Verantwoording

Voortgekomen uit de systeemanalyse van 23 september 2026 en de documenten die daar zijn
opgesomd. De voorwaarden V1–V4 en de indeling van §3 zijn van dit document; de onderliggende
observaties komen uit
[`systeemprofiel-feitenbasis.md`](systeemprofiel-feitenbasis.md),
[`interviewmodus-socratisch-gesprek.md`](interviewmodus-socratisch-gesprek.md),
[`normenkader-dekkingsanalyse.md`](normenkader-dekkingsanalyse.md) en
[`rollen-en-rechten-advies.md`](rollen-en-rechten-advies.md).

Eén waarschuwing in de geest van [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §4.2: de
verwijzingen naar AVG art. 22 en AI-verordening art. 26 zijn hier de *aanleiding*, niet de
inhoud. Toets ze tegen de actuele wettekst voordat er gebruikersgerichte tekst uit voortkomt.
