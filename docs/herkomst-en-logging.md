# Herkomst van antwoorden en logging

> **Status:** idee voor een brainstorm, niets gebouwd. Komt voort uit stap 3 van
> [`werkplan-kompas.md`](werkplan-kompas.md) ("Herkomst zichtbaar"), die op 6 oktober 2026
> is geparkeerd. Beslissing van toen: de herkomst van antwoorden komt **niet** in de
> Word-export. Wel komt er op termijn een loggingstap. Hoe die eruitziet, is nog open.

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
  `SourcePanel` toont dat in de UI. Na gladstrijken staat er `smoothedAt`.
- **Copy-mappings**: bij het openen van een formulier meldt een banner hoeveel vragen zijn
  overgenomen en waaruit. Per vraag wordt niets bewaard.

## Wat er niet wordt vastgelegd

Op deze plekken komt modeltekst een antwoord binnen zonder spoor:

| Waar | Code | Wat er nu bewaard wordt |
|---|---|---|
| Synthese uit een ander formulier (✦ AI-suggestie) | `CrossFormSuggestion.vue`, `acceptSuggestion` | niets |
| Verbeter tekst | `TiptapEditor.vue` | niets |
| Gladstrijken | `useAiMode.ts`, `smoothFormAnswers` | alleen `smoothedAt` als er al citaten waren |
| AI Modus en documentsuggestie | `llmService.ts`, `DocumentSuggestion.vue` | citaten, maar niet de gegenereerde tekst zelf |

Daardoor is achteraf niet te zeggen of een antwoord nog de tekst is die het model schreef,
of dat iemand hem heeft aangepast.

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
