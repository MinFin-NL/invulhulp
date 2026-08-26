# Vergaderopname en transcriptie als brondocument

Status: **proposal**. Voegt een derde ingangsweg toe naast bestandsupload
(`/api/documents/upload`) en client-side tekstextractie: een opgenomen overleg
wordt getranscribeerd en belandt als gewoon brondocument in dezelfde
LanceDB-index.

## Doel & non-goals

**Doel:** veel van de kennis die nodig is om een DPIA, AIIA of BIO-toets in te
vullen zit in overleggen, niet in documenten. Een gebruiker moet een vergadering
kunnen opnemen (of achteraf een audiobestand uploaden), waarna het transcript
automatisch als brondocument beschikbaar is — zodat AI Modus, grounding en
bronvermelding er zonder extra werk mee omgaan.

**Non-goals (v1):**

- **Geen sprekerdiarisatie** (wie zegt wat). Vereist `pyannote` bovenop torch en
  een HuggingFace-token; dat verdubbelt de image-grootte. Het veld `speaker` zit
  wel in het datamodel zodat het later kan.
- **Geen live/streaming transcriptie** tijdens de vergadering. Alleen na afloop.
- **Geen automatische AI-samenvatting** (besluiten, actiepunten). Logische
  vervolgstap — zie fase 3 — maar niet nodig om het transcript bruikbaar te maken.
- **Geen aparte "vergaderingen"-entiteit** in het dossiermodel. Een transcript
  *is* een brondocument; dat scheelt een parallelle levenscyclus.

## Uitgangspunten

| Keuze | Besluit | Waarom |
|---|---|---|
| Waar draait transcriptie | **Pluggable**: lokaal (faster-whisper) óf Azure, via env var | Spiegelt `llm.create_backend()`; dev draait lokaal, prod kan Azure. Overheidsdata mag niet zonder verwerkersovereenkomst het pand uit. |
| Hoe wordt opgenomen | **Beide**: browseropname én bestandsupload | Niet iedereen vergadert achter de invulhulp; Teams-opnames moeten er ook in kunnen. |
| Relatie tot brondocumenten | Transcript **wordt** een brondocument | Minste nieuwe code, werkt direct in AI Modus, grounding en `SourcePanel`. |

## Architectuur

```
browser                          backend                        opslag
───────                          ───────                        ──────
MediaRecorder ─┐
               ├─► POST /api/recordings ─► mediastore.save_recording ─► MEDIA_PATH/{sub}/{id}.bin + .json
<input file>  ─┘        │                                                    status: transcribing
                        │
                        └─► asyncio.create_task(_transcribe_and_index)
                                     │
                                     ├─► transcribe.backend.transcribe(bytes) ─► tekst + segmenten
                                     │
                                     ├─► _index_and_store(...)  ◄── bestaande helper (main.py:1113)
                                     │        ├─ rag.index_document  ─► LanceDB chunks_v2
                                     │        ├─ rag.extract_ontology
                                     │        └─ docstore.save_document ─► DOCS_PATH/{sub}/{doc_id}.json
                                     │
                                     └─► mediastore.update_meta(status="done", doc_id=...)

browser pollt GET /api/recordings/{id} tot status done|error
```

De kern: **na de transcriptiestap is er niets bijzonders meer aan de hand**. De
tekst gaat door exact dezelfde helper als een geüploade PDF, dus retrieval,
citaten, ontologie en de entiteitengrafiek werken zonder aanpassing. `doc_id` van
het document is gelijk aan het `recording_id`, zodat audio en transcript aan
elkaar gekoppeld blijven zonder extra index.

## Backend

### `backend/mediastore.py` (nieuw)

Volgt `imagestore.py` op de voet — dat is bewust, want dat module lost de lastige
dingen al op (atomic writes op de Azure Files SMB-mount, padtraversal via `_safe`
uit `docstore`, sidecar-metadata naast de bytes).

- `MEDIA_PATH` (default `./data/media`, prod `/data/media` — **hetzelfde volume**
  als `DOCS_PATH` en `IMAGES_PATH`)
- `save_recording(user_sub, session_id, filename, mime, data, title) -> meta`
- `load_recording(sub, id) -> (bytes, meta) | None`
- `update_meta(sub, id, **fields) -> meta`
- `list_recordings(sub, session_id) -> list[meta]`
- `delete_recording(sub, id)`, `delete_session_recordings(sub, session_id) -> int`

Sidecar (`{id}.json`):

```json
{
  "recording_id": "…", "session_id": "…", "title": "Kickoff gegevensdeling",
  "filename": "opname.webm", "mime": "audio/webm", "size": 8123456,
  "duration_s": 1840, "created_at": 1755400000000,
  "status": "uploaded | transcribing | done | error",
  "error": null, "doc_id": "…",
  "transcript": "…", "segments": [{"start": 12.4, "end": 18.9, "text": "…", "speaker": null}]
}
```

`segments` is nodig om later vanuit een citaat naar het juiste tijdstip in de
audio te kunnen springen. Het transcript staat zowel hier als in de docstore; dat
is redundant maar houdt de opname zelfstandig leesbaar als het document verwijderd
wordt.

### `backend/transcribe.py` (nieuw)

Naar het model van `llm.py:209` — één backend per proces, gekozen op env vars,
de rest van de code weet niet welke.

```python
class TranscriptResult(TypedDict):
    text: str
    segments: list[dict]
    language: str
    duration_s: float

class TranscribeBackend(Protocol):
    async def transcribe(self, data: bytes, mime: str, language: str = "nl") -> TranscriptResult: ...

def create_transcribe_backend() -> TranscribeBackend | None:
    if os.environ.get("AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT"):
        return AzureTranscribeBackend(...)
    if os.environ.get("WHISPER_MODEL"):
        return LocalWhisperBackend(model=os.environ["WHISPER_MODEL"],
                                   device="cpu", compute_type="int8")
    return None   # feature uit
```

- **`AzureTranscribeBackend`** hergebruikt de `AsyncAzureOpenAI`-constructie uit
  `llm.py` (`client.audio.transcriptions.create(model=deployment, file=…,
  response_format="verbose_json")`). Aparte env vars, want het audio-deployment is
  zelden hetzelfde als het chat-deployment.
- **`LocalWhisperBackend`** gebruikt `faster-whisper` (CTranslate2 — geen torch).
  `WhisperModel(...).transcribe(path, language="nl", vad_filter=True)` is
  CPU-blokkerend en moet in `asyncio.to_thread`.
- `None` betekent: feature uit. De endpoints geven dan **503 met een Nederlandse
  melding**, geen stilzwijgend leeg transcript. Dat volgt de bestaande lijn
  (`PDF_NO_TEXT` → 422 met expliciete code).

### Endpoints (`backend/main.py`, bij de `/api/images`-blokken ~1312)

Authenticatie is al globaal geregeld (`app = FastAPI(dependencies=[Depends(auth.require_user)])`);
wat je toevoegt is **autorisatie** via `dossiers.resolve_session_access`, die de
`user_sub` van de dossier-eigenaar teruggeeft — zodat een editor in een gedeeld
dossier in de map van de eigenaar schrijft.

| Route | Minimale rol | Opmerking |
|---|---|---|
| `POST /api/recordings` | `editor` | `file`, `session_id`, `title`, optioneel `duration_s`. Valideert vóór opslag, start de achtergrondtaak, geeft direct `{recording_id, status}` terug |
| `GET /api/recordings?session_id=` | `viewer` | lijst zonder transcript-tekst |
| `GET /api/recordings/{id}?session_id=` | `viewer` | volledige meta incl. `status`, `transcript`, `segments` — de poll-endpoint |
| `GET /api/recordings/{id}/audio?session_id=` | `viewer` | `Response(data, media_type=meta["mime"])`. `session_id` als **query**-param, want de URL belandt in `<audio src>` — zelfde reden als bij `/api/images/{id}` |
| `DELETE /api/recordings/{id}` | `editor` | verwijdert audio, sidecar én het bijbehorende document (`rag.delete_document` + `docstore.delete_document`) |

Validatievolgorde bij upload, identiek aan de image-upload: declared mime in de
allowlist → `read(MAX+1)` en 413 bij overschrijding → **magic bytes** (de
declared content-type is niet te vertrouwen) → pas dan `resolve_session_access`.

```python
RECORDING_MAX_BYTES = 200 * 1024 * 1024
_AUDIO_MIME  = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a"}
_AUDIO_MAGIC = {"audio/webm": b"\x1aE\xdf\xa3", "audio/ogg": b"OggS", "audio/wav": b"RIFF"}
```

De allowlist is breed omdat browsers verschillen: Chrome/Firefox leveren
`audio/webm;codecs=opus`, Safari `audio/mp4`. MP3/M4A zijn er voor uploads van
buiten.

### `_transcribe_and_index(user_sub, session_id, recording_id)`

1. `mediastore.load_recording` → bytes
2. `await transcribe_backend.transcribe(...)`
3. render naar tekst met tijdstempels, één regel per segment, een lege regel na
   elke ~10 segmenten:

   ```
   [00:04:12] Ik denk dat we de bewaartermijn op vijf jaar moeten zetten.
   [00:04:20] Dat botst met de archiefwet, daar staat zeven.
   ```

   Die lege regels zijn functioneel: `rag.chunk_document` splitst op `\n\s*\n` met
   `CHUNK_TARGET_CHARS = 1600`. Zonder alinea-grenzen krijg je één blok tekst dat
   op tekenposities wordt geknipt en midden in zinnen breekt — slecht voor
   grounding.
4. `await _index_and_store(user_sub, session_id, doc_id=recording_id,
   name=f"{title} (transcript).txt", content=text,
   chunks=rag.chunk_document(text), uploaded_at=…)`
5. `mediastore.update_meta(status="done", doc_id=…, transcript=…, segments=…)`;
   bij een exception `status="error", error=str(e)`. De taak mag nooit stil
   sterven — dan blijft de frontend eeuwig pollen.

### Opruimen

`mediastore.delete_session_recordings` moet in **beide** cascades, anders lekt
audio (de grootste blobs in het systeem) op het volume:

- `dossiers.purge_dossier` (`backend/dossiers.py:210`)
- `DELETE /api/sessions/{session_id}` (`backend/main.py:1303`)

## Frontend

### `src/services/recordingService.ts` (nieuw)

Spiegelt de image-functies in `llmService.ts:300-366`:
`uploadRecording(blob, sessionId, title, durationS)`, `fetchRecording(id, sessionId)`,
`listRecordings(sessionId)`, `recordingAudioUrl(id, sessionId)`,
`deleteRecording(id, sessionId)`. FormData zonder expliciete `Content-Type` —
bestaande conventie, zodat de browser de multipart-boundary zet.

### `src/composables/useMeetingRecorder.ts` (nieuw)

Dunne wrapper om `navigator.mediaDevices.getUserMedia({ audio: true })` +
`MediaRecorder`:

- state: `status ('idle'|'recording'|'paused'|'stopping')`, `elapsedS`, `error`,
  optioneel `level` via een `AnalyserNode` voor een VU-meter
- `start()`, `pause()`, `resume()`, `stop(): Promise<Blob>`
- mimeType kiezen met `MediaRecorder.isTypeSupported`
- **Secure context vereist**: werkt op `localhost` en https, niet op een
  http-LAN-adres. Dat moet een expliciete Nederlandse foutmelding worden, anders
  lijkt het een defecte microfoon.

### `MeetingRecorder.vue` (nieuw component)

Als **tweede `<section class="portal-card">` direct onder de brondocumenten** in
`DossierDetail.vue` (na ~regel 316, vóór de `bulk-ai`-sectie). Eigen component,
want `DossierDetail.vue` is al 2059 regels; die rendert alleen
`<MeetingRecorder v-if="store.canEdit || hasRecordings" />`.

De markup kopieert het brondocumenten-paneel:

- `portal-card` / `portal-card__header` / `__title` (`<nldd-title size="2">` om een
  `<h2>`) / `__desc` (`<nldd-text>`)
- titelveld: `<nldd-form-field label="…">` met een `<nldd-text-field>` erin
- knoppen: `<nldd-button variant="primary" text="Opname starten">`,
  `<nldd-button variant="destructive" text="Opname stoppen">`, en voor het
  uploaden een `<nldd-button variant="secondary" size="sm">` die een verborgen
  `<input type="file" accept="audio/*" class="invulhulp-visually-hidden">`
  aanklikt — een `<label>` eromheen werkt niet, want de echte knop zit in de
  shadow root (zie de upload-knop in `DossierDetail.vue`)
- status: `<nldd-banner variant="accent|success|critical" size="sm">` binnen
  `<div role="status" aria-live="polite">`
- lijst opnames: `.invulhulp-item-list` / `__item`, per item een
  `<nldd-tag size="sm" color="accent">` met de status

**Toegankelijkheid (WCAG 2.2 AA):**

- de opnametijd is **zichtbare tekst** ("Opname loopt — 04:12"), nooit alleen een
  rood bolletje; informatie mag niet uitsluitend via kleur
- `aria-live="polite"` + `aria-atomic="true"` op de timerregel, maar niet op elke
  seconde-update — kondig per 30 s aan, anders ratelt de screenreader
- Nederlandse `aria-label`s, echte `<button>`-elementen (dus toetsenbord werkt),
  zichtbare focus
- alleen design tokens: `var(--primitives-space-*)`, `var(--semantics-content-*)`;
  geen hardcoded kleuren of spacing
- iconen via `<nldd-icon name="…" size="…">` uit de NLDD-registry (zie skill
  `frontend`); de oude NLDS-maskeertruc is weg en komt niet terug

### `assessmentStore.ts`

`addRecording(blob, title, durationS)` naast `addPdfDocument` (~regel 798), zelfde
optimistische patroon:

1. `uploadRecording(...)` → `recording_id`
2. optimistisch `SourceDocument { id: recording_id, name, content: '',
   indexing: true, kind: 'transcript' }` in `dossier.documents`
3. pollen op `fetchRecording` (2 s, backoff naar 5 s, timeout ~30 min) tot `done`
   of `error`
4. bij `done`: `content`, `chunkCount`, `ontology` invullen; bij `error`: de
   placeholder verwijderen en `indexError` tonen — precies zoals de
   mislukte-PDF-route dat doet, zodat er nooit een spookdocument achterblijft

`removeDocument` uitbreiden: bij `kind === 'transcript'` ook `deleteRecording`
aanroepen. `SourceDocument` in `src/models/Assessment.ts` krijgt optionele velden
`kind?: 'document' | 'transcript'`, `durationS?`, `recordedAt?` — optioneel, zodat
bestaande localStorage-state geldig blijft.

**Niet nodig:** `documents` zit niet in de payload van `schedulePush` en niet in
het CRDT; opnames zijn server-afgeleid. Wel moet de hydratie van de documentlijst
`listRecordings` meenemen, anders ziet een tweede gebruiker in een gedeeld dossier
de opnames niet.

## Valkuilen

Deze vier kosten anders gegarandeerd een debugsessie:

1. **`nginx.conf:38` heeft `client_max_body_size 30m`.** Elke opname van meer dan
   een paar minuten sneuvelt daarop met een 413 uit nginx — geen JSON, dus de
   frontend toont een nietszeggende fout. Verhogen naar ~`250m`. De vite dev-proxy
   verbergt dit volledig, dus lokaal merk je er niets van.
2. **`Dockerfile.backend` (`python:3.13-slim`) installeert geen apt-packages.**
   faster-whisper leest webm/opus in de praktijk via ffmpeg; `apt-get install -y
   ffmpeg` kost ~100 MB. Bij een Azure-only productie kun je faster-whisper in een
   `[project.optional-dependencies] local-stt`-groep zetten en het image slank
   houden.
3. **CPU-transcriptie is traag** (~1× realtime met `small`, int8). Een overleg van
   een uur bezet een uur een thread. Daarom de achtergrondtaak plus polling, en
   daarom is een wachtrij met concurrency 1 verstandig zodra meerdere gebruikers
   dit tegelijk doen.
4. **`MEDIA_PATH` moet op hetzelfde Azure Files volume** als `DOCS_PATH` en
   `IMAGES_PATH`, anders overleeft audio geen herstart van de container.
   (`LANCEDB_PATH` is juist de uitzondering: SMB wordt daar niet ondersteund.)

Nieuwe env vars om te documenteren in `docker-compose.yml` en de deploy-skill:
`MEDIA_PATH`, `WHISPER_MODEL`, `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`,
`DELETE_AUDIO_AFTER_TRANSCRIBE`.

## Privacy en AVG

Een vergaderopname bevat persoonsgegevens en een stem is bijzonder
identificerend. Voor productiegebruik minimaal:

- **Mededelingsplicht in de UI**: zichtbaar dat er wordt opgenomen, plus een
  expliciete bevestiging vóór de eerste opname in een dossier ("Alle aanwezigen
  zijn geïnformeerd dat dit overleg wordt opgenomen").
- **Bewaartermijn**: overweeg de audio te wissen zodra het transcript er is
  (`DELETE_AUDIO_AFTER_TRANSCRIBE=true`); het transcript blijft. Dat verkleint de
  blootstelling aanzienlijk en scheelt opslag.
- **Verwerkingslocatie**: de Azure-backend stuurt de opname naar Azure — alleen
  aanzetten in een tenant met de juiste verwerkersovereenkomst. De lokale
  whisper-backend houdt alles binnen de container. Dat is precies waarom de
  transcriptielaag pluggable is en niet hardgecodeerd op Azure.
- Deze feature is zelf een verwerking die in de eigen DPIA van de invulhulp thuishoort.

## Fasering

| Fase | Scope | Klaar als |
|---|---|---|
| **0 — spike** | Alleen bestandsupload, alleen lokale whisper, geen UI-glans. `mediastore` + `transcribe` + `POST/GET /api/recordings` + indexering. | Een geüploade `.m4a` verschijnt als brondocument met `chunk_count > 0`. |
| **1 — opnemen** | `useMeetingRecorder`, `MeetingRecorder.vue`, polling in de store, terugluisteren, verwijderen, cascade-cleanup. | Opnemen in de browser levert een doorzoekbaar transcript; dossier verwijderen laat geen audio achter. |
| **2 — productie** | Azure-backend, env vars, nginx-limiet, Dockerfile, privacybevestiging in de UI. | Werkt in de Container Apps-omgeving met Azure-transcriptie. |
| **3 — optioneel** | AI-samenvatting (besluiten, actiepunten) als tweede document; sprekerdiarisatie; springen naar tijdstip vanuit een citaat. | — |

## Verificatie

1. **Feature uit**: zonder `WHISPER_MODEL` en zonder Azure-vars geeft
   `POST /api/recordings` een 503 en verbergt/deactiveert het paneel zich netjes.
2. **Lokaal aan**: `WHISPER_MODEL=small`, `./start.sh --dev`, dossier openen, een
   minuut praten, stoppen. Verwacht: "Transcriberen…", daarna een nieuw document
   in de brondocumentenlijst met een chunk-count.
3. **RAG-koppeling**: draai AI Modus op een vraag waarvan het antwoord *alleen* in
   de opname zat. Verwacht: ingevuld antwoord en een `SourcePanel`-fragment met
   documentnaam "… (transcript).txt".
4. **Bestandsupload**: upload een bestaande `.m4a` of `.mp3` — zelfde resultaat.
5. **Terugluisteren**: het `<audio>`-element in de opnamelijst speelt af (test
   daarmee meteen de query-param-autorisatie op `/audio`).
6. **Grote body**: test via de nginx-container, **niet** via de vite dev-proxy, met
   een opname > 30 MB. Moet slagen na het verhogen van `client_max_body_size`.
7. **Opruimen**: dossier verwijderen → `data/media/<sub>/` bevat niets meer van die
   sessie en `rag.get_indexed_doc_ids` kent het transcript-document niet meer.
8. **Build**: `npm run build` (vue-tsc) én `npm run preview` — icoon- en
   maskregressies zie je alleen in de productiebuild.
9. **Toegankelijkheid**: tabben door het paneel met zichtbare focus, axe-scan
   zonder violations, tekstcontrast ≥ 4,5:1.
