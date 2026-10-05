# Design/opportunities: beslishulpen integreren in findocs

> **Status:** ontwerp / verkenning, zonder toezeggingen en zonder code. Dit document beschrijft *hoe* we
> externe **beslishulpen** (kwalificatietools) in findocs zouden kunnen integreren, met behoud van
> **eigenaarschap bij de bronrepo (MinBZK)**.
>
> Uitgangspunt (README, sectie "Beslishulpen"): een **beslishulp bepaalt de scope** (welke
> instrumenten van toepassing zijn), **findocs vult ze in**. Dit ontwerp maakt die overdracht
> concreet *binnen een dossier*.
>
> Zie ook: [`AI-BOK-form-opportunities.md`](AI-BOK-form-opportunities.md),
> [`DAMA-DMBOK-form-opportunities.md`](DAMA-DMBOK-form-opportunities.md).
>
> **Inmiddels achterhaald op één punt.** De Beslishulp AI-verordening is gebouwd, maar niet als
> iframe-embed met een uitkomst-contract (§4): de beslisboom is gevendord, geconverteerd naar een
> runtime-asset en draait lokaal in de app. Wat er daarna nog ontbreekt (een register voor
> meerdere beslishulpen, kandidaat-beslishulpen en de herkomstvraag) staat in
> [`beslishulp-uitbreiding-en-lineage.md`](beslishulp-uitbreiding-en-lineage.md).

## 0. Referenties (beslishulpen)

| Bron | Link | Wat |
|---|---|---|
| Beslishulp AI-verordening (gehost) | https://algoritmes.rijksapp.nl/beslishulp-ai-verordening | Vragenboom → is de AI-verordening van toepassing, welke rol, welke risicocategorie |
| Broncode beslishulp | https://github.com/MinBZK/ai-verordening-beslishulp | MinBZK, EUPL-1.2, Vue (zelfde stack als findocs); eigenaarschap blijft hier |
| IBDS beslishulpen-overzicht | https://realisatieibds.nl/page/view/ad94d97c-4d48-443c-aedd-235b2d0ca8b6/teamIBDS@ictu.nl | ICTU / team IBDS (Interbestuurlijke Datastrategie); verzamelt meerdere beslishulpen. Contact: teamIBDS@ictu.nl |

## 1. Doel en scope

Integreer bestaande overheidsbeslishulpen zó dat de gebruiker binnen findocs:
1. een beslishulp **in een modal** opent en doorloopt;
2. de uitkomst wordt **getransformeerd naar een classificatie** (bijv. "AI-verordening van
   toepassing · rol = aanbieder · risicocategorie = hoog");
3. de **afgeronde beslishulp wordt opgeslagen zoals de brondocumenten**: als artefact in de
   documentenlijst van het dossier, dus ook doorzoekbaar/citeerbaar door RAG en AI-modus.

**Harde eis van de opdrachtgever:** het **eigenaarschap blijft bij de MinBZK-repo**. We bouwen de
vragenboom *niet* na en forken de inhoud niet; we **embedden** de upstream-tool en consumeren haar
uitkomst.

### Eerste doelwit
- **Beslishulp AI-verordening**, gehost op https://algoritmes.rijksapp.nl/beslishulp-ai-verordening,
  broncode [MinBZK/ai-verordening-beslishulp](https://github.com/MinBZK/ai-verordening-beslishulp)
  (EUPL-1.2, Vue: dezelfde stack als findocs).
- Bredere bron: de **IBDS-overzichtspagina** (ICTU / team IBDS, zie sectie 0) verzamelt meerdere
  beslishulpen. Het ontwerp moet **meerdere** beslishulpen aankunnen (een register).

## 2. Wat findocs al heeft (bouwstenen)

| Bouwsteen | Waar | Hergebruik |
|---|---|---|
| Classificatie-concept | `assessmentStore` heeft per form `riskLevel` + `goDecision`; `riskClassification`-specialview + `riskLevelInfo` (AIIA/euaiact) | model voor een **dossier-brede** classificatie/profiel |
| Brondocument-opslag | `backend/docstore.py` → JSON `{doc_id, session_id, name, content, uploaded_at}`; `POST /api/documents/index`; `GET /api/documents`; RAG-index in LanceDB | een afgeronde beslishulp opslaan als document |
| Cross-form pre-fill | `public/forms/crossFormMappings.json` | classificatie → velden voorvullen (rol, risiconiveau) |
| Modals | bestaande modal-componenten (bijv. `DocumentViewerModal.vue`) | de beslishulp-modal |
| Tracks/aanbevelingen | `DossierDetail.vue` `TRACK_META` + `index.json` | welke forms tonen/aanraden o.b.v. de uitkomst |

Het meeste bestaat dus al. Nieuw zijn alleen de dossier-brede classificatie en de embed-brug.

## 3. Voorgestelde flow

```
Dossier ──▶ [knop: "Start beslishulp ▸ AI-verordening"]
        └─▶ MODAL opent  ──(iframe)──▶  MinBZK-beslishulp (upstream, ongewijzigd)
                                              │
                          gebruiker doorloopt de vragenboom
                                              │
                     beslishulp is klaar ─────┤
                                              ▼
                    UITKOMST-CONTRACT (postMessage / geëxporteerde JSON)
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                                ▼                               ▼
   (a) CLASSIFICATIE                (b) BRONDOCUMENT                (c) AANBEVELING/PRE-FILL
   dossier-profiel opslaan          POST /api/documents/index       forms activeren + velden
   {aiVerordening, rol,             name: "Beslishulp AI-           voorvullen via
    risicocategorie, bron, datum}   verordening — <datum>"          crossFormMappings-achtige map
                                    content: gestructureerde
                                    samenvatting van de uitkomst
```

## 4. Het uitkomst-contract (kernvraag, eigenaarschap-vriendelijk)

Omdat de tool upstream blijft, hebben we een **nette manier nodig om de uitkomst uit de embed te
krijgen**. Drie opties, van meest naar minst geïntegreerd:

### Optie A: `postMessage` uit de iframe  ⭐ aanbevolen
De beslishulp stuurt bij afronden `window.parent.postMessage({type: 'beslishulp:result', …})`.
findocs luistert en verwerkt de payload.
- **Eigenaarschap:** blijft 100% upstream; wij consumeren alleen een event.
- **Actie:** controleren of de MinBZK-beslishulp dit al uitzendt. Zo niet: een **kleine PR upstream**
  (EUPL, open source) die een gestructureerd resultaat post. Dat is *bijdragen aan*, niet *forken van*
  de repo, en dat past bij de open-source-werkwijze.
- **Aandachtspunt:** `targetOrigin` vastzetten; alleen berichten van de bekende host accepteren.

### Optie B: geëxporteerde uitkomst importeren
De beslishulp heeft (of krijgt) een **export** (JSON en/of PDF). De gebruiker rondt af, exporteert,
en importeert het bestand in findocs (of we lezen de download automatisch uit).
- **Eigenaarschap:** volledig upstream; geen runtime-koppeling nodig.
- **Nadeel:** extra handmatige stap; JSON-schema van de export moet stabiel zijn.

### Optie C: zelf-gehoste vendored build met dunne adapter
De upstream *build* (niet de inhoud) als static asset meeleveren, met een dun adapter-laagje dat de
uitkomst doorgeeft.
- **Eigenaarschap:** inhoud blijft upstream, maar wij hosten een snapshot → vraagt een
  refresh-/provenance-afspraak (zoals `vendor/par-dpia-form/PROVENANCE.md`).

> **Aanbeveling:** begin met **B** (laagste koppeling, snel te bewijzen), migreer naar **A** zodra de
> upstream een `postMessage`-contract heeft (evt. via onze PR). **C** alleen als embedden van de
> gehoste versie (CSP/iframe-restricties) niet mag.

## 5. Datamodel

### (a) Dossier-brede classificatie (nieuw)
Een klein profiel op **dossier**-niveau (niet per form), bijv.:
```jsonc
{
  "beslishulpId": "ai-verordening",
  "bron": "MinBZK/ai-verordening-beslishulp",
  "afgerondOp": 1753900000000,
  "uitkomst": {
    "aiVerordeningVanToepassing": true,
    "rol": "aanbieder",              // aanbieder | gebruiksverantwoordelijke | importeur | distributeur
    "risicocategorie": "hoog"        // onaanvaardbaar | hoog | beperkt | minimaal
  },
  "documentId": "beslishulp-ai-verordening-2026-07-29"  // link naar het opgeslagen brondocument
}
```
Opslag: naast de bestaande dossier-JSON (`dossierstore.py`), of als sectie in het dossierobject.

### (b) Opslaan als brondocument (bestaande weg)
Bij afronden roept findocs de **bestaande** document-index-route aan:
`POST /api/documents/index` met
`{ session_id, doc_id, name: "Beslishulp AI-verordening — 29-07-2026", content: <gestructureerde samenvatting> }`.
Gevolg:
- verschijnt in de **documentenlijst** van het dossier, net als een geüpload brondocument;
- wordt **RAG-geïndexeerd** → AI-modus/extractie kan eruit citeren (bijv. de risicocategorie
  onderbouwen in de EU AI Act-checklist);
- de `content` is de leesbare uitkomst; optioneel de geëxporteerde **PDF** als bijlage/afbeelding.

Zo is aan de eis "opslaan zoals de brondocumenten" letterlijk voldaan: het *is* een brondocument.

## 6. Van classificatie naar actie (de "scope → invullen"-brug)

De uitkomst stuurt twee dingen aan, met **bestaande** mechanismen:
- **Aanbevelen welke forms/tracks te tonen.** Bijv. `risicocategorie: hoog` + `rol: aanbieder` →
  benadruk EU AI Act Compliance Checklist + AIIA + Model Card (+ later: technische documentatie).
  Implementatie: een mapping-tabel `uitkomst → aanbevolen formIds`, getoond in `DossierDetail.vue`.
- **Velden voorvullen.** De classificatie zet o.a. `euaiact.eaa_a.rol`, `euaiact.eaa_a.risiconiveau`,
  `aiia` risico en `modelcard.mc_a.risicoclassificatie` voor, via het bestaande
  `crossFormMappings.json`-patroon (bron = "beslishulp"), zodat gedeelde info één keer wordt bepaald.

## 7. Fasering (voorstel)

1. **Fase 0: profiel bewijzen (klein).** Handmatige import van de beslishulp-uitkomst (Optie B) →
   dossier-classificatie opslaan + tonen. Nog geen embed.
2. **Fase 1: modal-embed.** Beslishulp in een modal (iframe, gehoste MinBZK-versie); uitkomst via
   export-import of `postMessage`.
3. **Fase 2: opslaan als brondocument.** Afgeronde beslishulp via `/api/documents/index` in de
   documentenlijst + RAG.
4. **Fase 3: scope-brug.** Aanbevelingen + pre-fill van de AI-forms vanuit de classificatie.
5. **Fase 4: register van beslishulpen.** Meerdere beslishulpen (IBDS-lijst) als config-lijst
   (id, titel, embed-URL, uitkomst-mapping), analoog aan `public/forms/index.json`.

## 8. Aandachtspunten / open vragen

- **Embedbaarheid.** Staat `algoritmes.rijksapp.nl` iframing toe (`X-Frame-Options`/CSP
  `frame-ancestors`)? Zo niet → Optie C (zelf-gehoste build) of Optie B (export-import).
- **Uitkomst-schema.** Zendt de MinBZK-beslishulp al een gestructureerd resultaat uit? Anders: PR
  upstream (past bij het open-source-eigenaarschap dat de opdrachtgever wil behouden).
- **Versiebeheer.** De AI-verordening/beslishulp evolueert; leg vast met welke versie een dossier is
  geclassificeerd (opslaan in het profiel; provenance-afspraak bij vendoring).
- **Meer dan classificatie.** Dit is nieuw t.o.v. het toevoegen van forms (JSON-only): het vraagt
  **echte code**: dossier-profielstate, de embed-brug, en een uitkomst→forms-mapping. Het is de
  logische **laag boven** de forms, niet een drop-in.
- **Juridische status.** Een beslishulp-uitkomst is een hulpmiddel, geen besluit; dat moet in de
  UI/het opgeslagen document duidelijk blijven (zoals de bestaande beslishulpen zelf ook stellen).

---
*Bronnen: MinBZK/ai-verordening-beslishulp (EUPL-1.2); IBDS/ICTU beslishulpen-overzicht; findocs
`backend/docstore.py`, `backend/main.py` (`/api/documents/*`), `src/stores/assessmentStore.ts`,
`public/forms/crossFormMappings.json`, `src/components/DossierDetail.vue`.*
