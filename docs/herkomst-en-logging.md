# Herkomst van antwoorden en logging

> **Status:** idee voor een brainstorm. Komt voort uit stap 3 van
> [`werkplan-kompas.md`](werkplan-kompas.md) ("Herkomst zichtbaar"), die op 6 oktober 2026
> is geparkeerd. Beslissing van toen: de herkomst van antwoorden komt **niet** in de
> Word-export. Wel komt er op termijn een loggingstap. Hoe die eruitziet, is nog open.
> Sinds 27 oktober 2026 is er een eerste stap gebouwd: een revisielog per antwoord en een
> aparte LJSON-export voor de TekstOntleder (zie hieronder).

## Waar het om gaat

Een antwoord in een formulier kan op verschillende manieren ontstaan: iemand typt het,
het komt uit de toepassingsscan, het wordt overgenomen uit een ander formulier, AI Modus
haalt het uit de brondocumenten, of een model herschrijft het. De systeemanalyse (§3.2)
en de ontwerprichting (§3.3, §4.4) stellen dat een toetser moet kunnen zien wat iemand
heeft bedacht en wat er is gegenereerd. Stap 3 wilde dat oplossen met een herkomstregel per
antwoord, tot in de export. Dat is van tafel; de vraag erachter blijft.

## Wat er nu al is

- **Scan en voorblad** (stap 2): onder een voorgevuld antwoord staat "Afgeleid uit de
  toepassingsscan" of "Overgenomen uit het voorblad", zolang niemand het heeft
  veranderd. Dit wordt live afgeleid uit `src/facts/` en niet opgeslagen. Alleen in de UI.
- **Brondocumenten**: AI Modus en "AI-suggestie uit documenten" bewaren per vraag
  `answerSources` (`AnswerSourceMeta` in `src/models/Assessment.ts`): de citaten, of het
  antwoord in de bron terug te vinden is (`grounded`) en wanneer het is gemaakt.
  `SourcePanel` toont dat in de UI. Antwoorden die vóór oktober 2026 zijn gladgestreken
  hebben nog `smoothedAt`; het gladstrijken zelf is verwijderd.
- **Copy-mappings**: bij het openen van een formulier meldt een banner hoeveel vragen zijn
  overgenomen en waaruit. Per vraag wordt niets bewaard.

## Revisielog en LJSON-export (gebouwd 27 oktober 2026)

Elk antwoord houdt een korte geschiedenis bij (`answerHistory`, `AnswerRevision` in
`src/models/Assessment.ts`): na elke stap de platte tekst, met wie of wat hem schreef.

| Stap | Waar vastgelegd | Soort |
|---|---|---|
| Typen (na 1,5 s stilte), radio, checkbox | `assessmentStore.setAnswer`, `TiptapEditor` `local-edit` | `human`, de ingelogde gebruiker |
| AI Modus | `useAiMode.ts` | `ai`, `ai-modus` |
| AI-suggestie uit documenten of uit een ander formulier | `QuestionItem.vue` | `ai`, `suggestie` |
| Verbeter tekst | `TiptapEditor` `ai-applied` | `ai`, `tekst-verbeteren` |
| Overnemen uit een ander formulier, scan of voorblad | `useCrossFormPrefill.ts`, `QuestionItem.vue` | `copied` |

Opeenvolgende bewerkingen van dezelfde persoon vallen samen tot één revisie; per antwoord
blijven er hoogstens 50. De log staat in de CRDT-staat, onder één sleutel per vraag
(`history:<id>` in `meta`), zodat twee mensen die tegelijk verschillende antwoorden
bewerken elkaars revisies niet overschrijven.

"Download herkomst (LJSON)" op de samenvattingspagina (`src/services/ljsonExport.ts`) zet
één formulier om naar LJSON 1.0, het formaat van de TekstOntleder. De export vergelijkt
opeenvolgende revisies woord voor woord: woorden die een revisie overneemt houden hun
auteur, nieuwe woorden zijn van die revisie. De titel, sectietitels en vragen zijn
`copied` uit de formulierdefinitie (`/forms/<id>.json`: naam met URN, hash van het bestand,
plek in het bestand), gekopieerd door "Invulhulp <versie>". Tekst die geen revisie verklaart
(ingevuld vóór de log bestond) en de systeemnaam krijgen geen span. Het extra veld
`structure` zegt per stuk tekst of het titel, sectie, vraag of antwoord is; de TekstOntleder
maakt de tekst daarmee op als koppen en antwoorden. In AI-tekst zoekt de export
daarnaast naar stukken van minstens acht woorden die letterlijk in een van de geciteerde
fragmenten (`answerSources`) staan, ongeacht hoofdletters, accenten en leestekens. Zo'n
stuk wordt een `copied`-span binnen het AI-span, met de documentnaam en de plek in het
document; ontbreekt de documenttekst, dan de plek binnen het fragment. Een voorbeeld staat in
[`ljson/ai-belastingtelefoon.ljson`](ljson/ai-belastingtelefoon.ljson); dat bestand wordt
door `src/services/ljsonExport.demo.test.ts` gemaakt en bewaakt.

Grenzen:

- De naam in een revisie komt van de client. Het is een spoor, geen bewijs: iemand die
  de client aanpast kan een andere naam meesturen. Een log die als bewijs moet dienen,
  hoort op de server (vraag 3 hieronder).
- Typen twee mensen binnen dezelfde 1,5 seconde in hetzelfde antwoord, dan krijgt wie het
  eerst vastlegt beide stukken.
- Het model staat erin (`/api/ai/limits` geeft het mee), de prompt niet: `prompt_hash` is
  "niet vastgelegd" en `parameters` is leeg.

## Richting: een loggingstap

In plaats van herkomst per antwoord in de export: een logboek van wat er met antwoorden
gebeurt. Denkbare gebeurtenissen: een voorstel is overgenomen (uit scan, formulier,
document of model), een antwoord is daarna door een persoon aangepast, gladgestreken of
teruggezet.

## Vragen voor de brainstorm

1. **Voor wie is de log?** De toetser (FG, CISO) die een formulier beoordeelt, de invuller
   zelf, of een audit achteraf? Dat bepaalt of hij in de app zichtbaar is, apart te
   exporteren, of alleen op de server staat.
2. **Wat is een gebeurtenis?** Per antwoord, per wijziging, of alleen de overgangen
   (voorstel overgenomen, door mens aangepast)?
3. **Waar staat hij?** Op de server naast het dossier, of mee in de CRDT-staat? De
   dossiers zijn gedeeld en realtime bewerkbaar, dus "wie deed wat" vraagt waarschijnlijk
   een serverkant. Het werkplan legt op dat feiten afgeleid worden en dat er geen
   CRDT-migratie komt; een log is geen feit, maar geschiedenis.
4. **Hoe lang en onder welke rechten?** Bewaartermijn, wie de log mag lezen, en of hij
   meegaat bij het delen of verwijderen van een dossier.
5. **Bestaande standaard?** Voor verwerkingenlogging bestaat de Logius-standaard Logboek
   Dataverwerkingen. Of die hier past (het gaat om bewerkingen aan een dossier, niet om
   verwerkingen van persoonsgegevens) is een open punt.
6. **Wat blijft in de UI?** De herkomstregel van stap 2 en de citaten in `SourcePanel`
   blijven staan. Moet modeltekst die niemand heeft aangepast ook in de UI gemarkeerd
   worden, of volgt dat uit de log?

## Raakvlakken

- [`systeemanalyse-invulhulp-in-het-stelsel.md`](systeemanalyse-invulhulp-in-het-stelsel.md)
  §3.2 en de ontwerpkeuze "Laat modeltekst nooit doorgaan voor mensentekst".
- [`ontwerprichting-betekenisvolle-tussenkomst.md`](ontwerprichting-betekenisvolle-tussenkomst.md)
  §3.3 (herkomst per antwoord: gegenereerd-ongewijzigd, gegenereerd-bewerkt,
  mensgeschreven) en §4.4 (herkomst als instrument van de toetser).
- [`interviewmodus-socratisch-gesprek.md`](interviewmodus-socratisch-gesprek.md) §9.2: een
  bevestigd feit bewaart het citaat, niet een parafrase.
