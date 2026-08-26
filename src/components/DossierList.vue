<template>
  <div class="dossier-list-page">
    <div class="invulhulp-measure invulhulp-measure--lg invulhulp-measure--pad">

      <!-- Hero -->
      <section class="dossier-list-hero">
        <div class="dossier-list-hero__content">
          <nldd-title size="1"><h1 class="dossier-list-hero__title">FinDocs</h1></nldd-title>
          <nldd-text size="lg" color="inherit" class="dossier-list-hero__subtitle">
            Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
          </nldd-text>
        </div>
      </section>

      <!-- Dossier overview -->
      <section aria-labelledby="dossiers-title">
        <div class="dossier-list__header">
          <div>
            <nldd-title size="2"><h2 class="dossier-list__title" id="dossiers-title">Mijn dossiers</h2></nldd-title>
            <!-- ensureDossier() maakt altijd een dossier aan, dus de lege staat
                 van deze lijst bestaat niet en er was nergens een eerste
                 instructie. Bij één ongebruikt dossier staat die hier. -->
            <nldd-text size="sm" color="inherit" class="dossier-list__desc" v-if="isFirstVisit">
              Open je dossier en upload je eerste document — daarna vult FinDocs de formulieren
              voor je in, met een bronverwijzing per antwoord.
            </nldd-text>
            <nldd-text size="sm" color="inherit" class="dossier-list__desc" v-else>
              Een dossier groepeert brondocumenten en formulierantwoorden rond één project of systeem.
            </nldd-text>
          </div>
          <nldd-button
            variant="primary"
            text="Nieuw dossier"
            start-icon="plus"
            @click="openCreateDialog"
          />
        </div>

        <!-- De volgorde is te wijzigen, dus staat er ook op het scherm hoe. -->
        <nldd-text
          v-if="canReorder"
          id="dossier-reorder-hint"
          size="sm"
          color="inherit"
          class="dossier-list__hint"
        >
          Sleep aan het greepje om een dossier te verplaatsen. Of activeer het greepje:
          dan verschijnen er pijlknoppen en werken ook de pijltjestoetsen.
        </nldd-text>

        <ul
          class="dossier-grid"
          :class="{ 'dossier-grid--dragging': dragId !== null }"
          ref="gridEl"
        >
          <li
            v-for="(d, index) in store.dossierList"
            :key="d.id"
            class="dossier-grid__item"
            :class="{
              'dossier-grid__item--dragging': dragId === d.id,
              'dossier-grid__item--moving': moveModeId === d.id,
            }"
          >
            <div class="invulhulp-card dossier-card">
              <!-- Openen en verplaatsen zijn twee knoppen naast elkaar, niet in
                   elkaar: een knop in een knop is ongeldige HTML en een
                   screenreader kondigt dan alleen de buitenste aan. -->
              <button
                type="button"
                class="dossier-card__open"
                @click="store.openDossier(d.id)"
              >
                <nldd-icon class="dossier-card__icon" name="folder" size="32" color="accent" />
                <span class="dossier-card__body">
                  <span class="invulhulp-heading--md dossier-card__name">{{ d.name }}</span>
                  <nldd-tag v-if="d.sharedWithMe" size="sm" color="accent" class="dossier-card__shared">
                    Gedeeld door {{ d.ownerName ?? 'een collega' }}
                    <template v-if="d.myRole"> · {{ roleLabels[d.myRole] }}</template>
                  </nldd-tag>
                  <span class="invulhulp-text--sm dossier-card__meta">
                    {{ d.documents.length }} {{ d.documents.length === 1 ? 'document' : 'documenten' }}
                    · {{ summaryFor(d).done }}/{{ summaryFor(d).total }} formulieren afgerond
                  </span>
                  <!-- One segment per lifecycle phase, in order, filled to the
                       share of that phase's forms that are done. Hidden from AT:
                       de knop zou er anders vijf clausules bij krijgen, en de
                       regel hierboven noemt het totaal al. De per-fase-aantallen
                       staan op de dossierpagina, onder echte fasekoppen. -->
                  <span class="dossier-card__phases" aria-hidden="true">
                    <span
                      v-for="p in phasesFor(d)"
                      :key="p.track"
                      class="dossier-card__phase"
                      :class="{ 'dossier-card__phase--empty': p.total === 0 }"
                    >
                      <span
                        class="dossier-card__phase-fill"
                        :style="{ inlineSize: p.total ? `${(p.done / p.total) * 100}%` : '0' }"
                      />
                    </span>
                  </span>
                  <span class="invulhulp-text--sm dossier-card__date">
                    Laatst bewerkt: {{ formatDate(d.updatedAt ?? d.createdAt) }}
                  </span>
                </span>
              </button>

              <!-- Het greepje: slepen met muis of vinger, en bij activeren de
                   verplaatsmodus. Slepen is nooit de énige weg — zie de
                   knoppenbalk hieronder (WCAG 2.5.7). -->
              <button
                v-if="canReorder"
                type="button"
                class="dossier-card__handle"
                :ref="(el) => setHandle(d.id, el)"
                :aria-label="`Verplaats ${d.name}, nu positie ${index + 1} van ${store.dossierList.length}`"
                :aria-pressed="moveModeId === d.id"
                aria-describedby="dossier-reorder-hint"
                @pointerdown="onPointerDown($event, index)"
                @click="onHandleClick(d.id)"
                @keydown="onHandleKeydown($event, index)"
              >
                <!-- Hetzelfde greepje als nldd-drag-handle-cell tekent: dat
                     component is een lijstcel en past niet in een raster, maar
                     de vorm hoort wél hetzelfde te zijn. -->
                <svg class="dossier-card__grip" width="10" height="22" viewBox="0 0 10 22"
                     xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                  <circle cx="2" cy="2" r="2" fill="currentColor" />
                  <circle cx="8" cy="2" r="2" fill="currentColor" />
                  <circle cx="2" cy="8" r="2" fill="currentColor" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                  <circle cx="2" cy="14" r="2" fill="currentColor" />
                  <circle cx="8" cy="14" r="2" fill="currentColor" />
                  <circle cx="2" cy="20" r="2" fill="currentColor" />
                  <circle cx="8" cy="20" r="2" fill="currentColor" />
                </svg>
              </button>

              <!-- WCAG 2.5.7 Dragging Movements: verslepen mag nooit de enige
                   manier zijn. Deze knoppen doen met één klik hetzelfde, en zijn
                   met muis, vinger én toetsenbord te bedienen. -->
              <div v-if="moveModeId === d.id" class="dossier-card__mover">
                <nldd-icon-button
                  size="sm"
                  variant="neutral-tinted"
                  icon="arrow-left"
                  tooltip-timing="never"
                  :disabled="index === 0"
                  :accessible-label="`${d.name} een plaats naar voren`"
                  @click="move(index, index - 1)"
                />
                <nldd-icon-button
                  size="sm"
                  variant="neutral-tinted"
                  icon="arrow-up"
                  tooltip-timing="never"
                  :disabled="index === 0"
                  :accessible-label="`${d.name} een rij omhoog`"
                  @click="move(index, index - columnCount())"
                />
                <nldd-icon-button
                  size="sm"
                  variant="neutral-tinted"
                  icon="arrow-down"
                  tooltip-timing="never"
                  :disabled="index === store.dossierList.length - 1"
                  :accessible-label="`${d.name} een rij omlaag`"
                  @click="move(index, index + columnCount())"
                />
                <nldd-icon-button
                  size="sm"
                  variant="neutral-tinted"
                  icon="arrow-right"
                  tooltip-timing="never"
                  :disabled="index === store.dossierList.length - 1"
                  :accessible-label="`${d.name} een plaats naar achteren`"
                  @click="move(index, index + 1)"
                />
                <nldd-button
                  size="sm"
                  variant="secondary"
                  text="Klaar"
                  @click="endMoveMode(d.id)"
                />
              </div>
            </div>
          </li>
        </ul>

        <!-- Elke verplaatsing wordt uitgesproken; zonder dit is de nieuwe
             positie alleen zichtbaar, en dus onbruikbaar zonder zicht. -->
        <p class="invulhulp-visually-hidden" role="status" aria-live="polite">{{ announcement }}</p>
      </section>

    </div>

    <ConfirmDialog
      ref="createDialog"
      title="Nieuw dossier"
      message="Geef het dossier een naam."
      kind="prompt"
      input-label="Naam"
      confirm-label="Aanmaken"
      @confirm="onCreateConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import { useFormProgress } from '../composables/useFormProgress'
import { TRACK_IDS } from '../utils/tracks'
import { clampIndex, gridReorderTarget } from '../utils/gridReorder'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useAssessmentStore()
const { dossierSummary, trackSummary } = useFormProgress()
const createDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const roleLabels = { viewer: 'Lezen', editor: 'Bewerken', owner: 'Eigenaar' } as const

onMounted(() => {
  store.ensureDossier()
})

// Precies één dossier, zonder documenten en zonder afgeronde formulieren: dit
// is iemands eerste keer.
const isFirstVisit = computed(() => {
  const list = store.dossierList
  return list.length === 1 && list[0].documents.length === 0 && dossierSummary(list[0]).done === 0
})

function summaryFor(d: Dossier) {
  return dossierSummary(d)
}

function phasesFor(d: Dossier) {
  const counts = trackSummary(d)
  return TRACK_IDS.map((track) => ({ track, ...counts[track] }))
}

const dateFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' })

function formatDate(ts: number): string {
  return dateFormat.format(new Date(ts))
}

function openCreateDialog() {
  createDialog.value?.open()
}

function onCreateConfirmed(name: string) {
  const trimmed = name.trim() || `Dossier ${store.dossierList.length + 1}`
  // createDossier activates the new dossier and lands on its detail page
  store.createDossier(trimmed)
}

/* ---- Herordenen -------------------------------------------------------
 *
 * NLDD kent herordenen alleen in één richting: nldd-list (verticaal) en
 * nldd-document-tab-bar (horizontaal). Voor een raster is er niets, en de
 * sleepwiskunde van nldd-list is puur verticaal (clientY), dus die valt ook
 * niet om te buigen. Alles hieronder is daarom met de hand, inclusief het
 * deel dat je bij NLDD gratis zou krijgen: toetsenbordbediening, een
 * niet-slepend alternatief voor de aanwijzer, aankondigingen en focusherstel.
 */

const gridEl = ref<HTMLElement | null>(null)
const canReorder = computed(() => store.dossierList.length > 1)

/** De greepjes per dossier-id, zodat de focus na een verplaatsing terug kan
 *  naar het greepje dat hem had — het element verhuist in de DOM en raakt de
 *  focus daarbij in sommige browsers kwijt. */
const handles = new Map<string, HTMLButtonElement>()

function setHandle(id: string, el: unknown) {
  if (el instanceof HTMLButtonElement) handles.set(id, el)
  else handles.delete(id)
}

const announcement = ref('')

/** Twee keer dezelfde zin wordt door een screenreader niet opnieuw
 *  uitgesproken; even leegmaken maakt er weer een wijziging van. */
function announce(message: string) {
  announcement.value = ''
  nextTick(() => { announcement.value = message })
}

/** Het aantal kolommen komt uit de berekende grid-template en niet uit een
 *  eigen breakpoint-tabel: het raster is `auto-fill`, dus alleen de layout
 *  weet hoeveel kolommen er nu staan. */
function columnCount(): number {
  const el = gridEl.value
  if (!el) return 1
  const columns = getComputedStyle(el).gridTemplateColumns
  if (!columns || columns === 'none') return 1
  return columns.split(' ').filter(Boolean).length
}

/** Het element dat de focus écht heeft. `document.activeElement` stopt bij de
 *  host van een web component, en de knoppen van de verplaatsbalk zijn
 *  nldd-icon-buttons — de echte knop zit in hun shadow root. */
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement
  return el
}

/** Eén verplaatsing, met begrenzing, aankondiging en focusherstel.
 *
 *  De focus gaat terug naar de knop die hem had — het greepje bij een
 *  pijltjestoets, de pijlknop bij een klik — en pas als die weg is naar het
 *  greepje van het verplaatste dossier. Vue verhuist het element in de DOM en
 *  in sommige browsers verdwijnt de focus daarbij. */
function move(fromIndex: number, toIndex: number) {
  const list = store.dossierList
  const total = list.length
  const target = clampIndex(toIndex, total)
  const dossier = list[fromIndex]
  if (!dossier) return
  if (target === fromIndex) {
    announce('Verder kan niet in deze richting.')
    return
  }
  const hadFocus = deepActiveElement()
  store.moveDossier(fromIndex, target)
  announce(`${dossier.name} verplaatst naar positie ${target + 1} van ${total}.`)
  nextTick(() => {
    if (hadFocus?.isConnected) hadFocus.focus()
    else handles.get(dossier.id)?.focus()
  })
}

/* ---- Verplaatsmodus (toetsenbord en losse klik) ---- */

const moveModeId = ref<string | null>(null)

/** Een sleep eindigt in een `click` op het greepje. Die moet de
 *  verplaatsmodus niet aanzetten: het verplaatsen is dan al gebeurd. Een eigen
 *  vlag en niet `didDrag` zelf, want `didDrag` moet tijdens de klik nog waar
 *  zijn en mag daarna niet blijven staan — Enter en spatie op het greepje
 *  geven ook een `click`, zonder pointerdown die hem zou resetten. */
let suppressClick = false

function onHandleClick(id: string) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  moveModeId.value = moveModeId.value === id ? null : id
  if (moveModeId.value) announce('Verplaatsmodus aan. Gebruik de pijlknoppen of de pijltjestoetsen.')
}

function endMoveMode(id: string) {
  if (moveModeId.value !== id) return
  moveModeId.value = null
  announce('Verplaatsmodus uit.')
  nextTick(() => handles.get(id)?.focus())
}

function onHandleKeydown(event: KeyboardEvent, index: number) {
  // Enter en spatie activeren het greepje; een blijven hangen vlag van een
  // eerdere sleep mag die klik niet opeten.
  if (event.key === 'Enter' || event.key === ' ') suppressClick = false
  if (event.key === 'Escape') {
    if (!moveModeId.value) return
    event.preventDefault()
    moveModeId.value = null
    announce('Verplaatsmodus uit.')
    return
  }
  const target = gridReorderTarget(event.key, index, columnCount(), store.dossierList.length)
  if (target === null) return
  // Anders scrollt de pagina mee onder de verplaatsing door.
  event.preventDefault()
  move(index, target)
}

/* ---- Slepen met muis of vinger ---- */

const dragId = ref<string | null>(null)
/** Losse variabelen, geen refs: dit is sleepmechaniek per gebaar, geen state
 *  waar het scherm op hoeft te reageren. */
let dragIndex = -1
let dragOriginIndex = -1
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
let didDrag = false

// Onder deze afstand is het een klik en geen sleep. Zonder drempel zou elke
// klik op het greepje al als een (lege) verplaatsing tellen.
const DRAG_THRESHOLD_PX = 5

function onPointerDown(event: PointerEvent, index: number) {
  if (!canReorder.value) return
  // Alleen de primaire knop; rechtsklik opent het contextmenu.
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const handle = event.currentTarget as HTMLButtonElement
  dragPointerId = event.pointerId
  dragIndex = index
  dragOriginIndex = index
  dragStartX = event.clientX
  dragStartY = event.clientY
  didDrag = false
  handle.setPointerCapture(event.pointerId)
  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', onPointerUp)
  handle.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onDragKeydown)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  if (!didDrag) {
    const travelled = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY)
    if (travelled < DRAG_THRESHOLD_PX) return
    didDrag = true
    const dossier = store.dossierList[dragIndex]
    dragId.value = dossier?.id ?? null
    if (dossier) announce(`${dossier.name} opgepakt.`)
  }
  const over = itemIndexAt(event.clientX, event.clientY)
  if (over === -1 || over === dragIndex) return
  // Live verplaatsen: de kaarten schuiven onder de aanwijzer door, zodat je
  // ziet waar hij landt in plaats van het te moeten raden.
  store.moveDossier(dragIndex, over)
  dragIndex = over
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const dossier = store.dossierList[dragIndex]
  const moved = didDrag && dragIndex !== dragOriginIndex
  const position = dragIndex + 1
  finishDrag(event)
  suppressClick = didDrag
  if (moved && dossier) {
    announce(`${dossier.name} neergezet op positie ${position} van ${store.dossierList.length}.`)
  } else if (didDrag) {
    announce('Volgorde ongewijzigd.')
  }
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  finishDrag(event)
  announce('Verplaatsen geannuleerd.')
}

/** Escape tijdens het slepen zet het dossier terug. Eén element terugzetten op
 *  zijn oude index herstelt de hele volgorde: de rest hield onderling dezelfde
 *  volgorde. */
function onDragKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !didDrag) return
  event.preventDefault()
  store.moveDossier(dragIndex, dragOriginIndex)
  dragIndex = dragOriginIndex
  finishDrag(null)
  announce('Verplaatsen geannuleerd.')
}

function finishDrag(event: PointerEvent | null) {
  const handle = (event?.currentTarget as HTMLButtonElement | null)
    ?? (dragId.value ? handles.get(dragId.value) ?? null : null)
  if (handle) {
    if (dragPointerId !== -1 && handle.hasPointerCapture?.(dragPointerId)) {
      handle.releasePointerCapture(dragPointerId)
    }
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', onPointerUp)
    handle.removeEventListener('pointercancel', onPointerCancel)
  }
  window.removeEventListener('keydown', onDragKeydown)
  dragId.value = null
  dragPointerId = -1
}

/** De kaart onder een punt. Een hittest op de kaarten zelf, niet
 *  `elementFromPoint`: die geeft het diepste element terug — meestal een span
 *  binnen in de kaart die er toevallig onder ligt. */
function itemIndexAt(x: number, y: number): number {
  const items = gridEl.value?.querySelectorAll<HTMLElement>('.dossier-grid__item')
  if (!items) return -1
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
  }
  return -1
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDragKeydown)
})
</script>

<style scoped>
.dossier-list-page {
  padding: var(--primitives-space-48) 0 var(--primitives-space-64);
  background: var(--semantics-surfaces-tinted-background-color);
  min-height: 100%;
}

/* NLDD's hero lives inside nldd-page-sections, which this page does not use;
   the band is drawn here on the tinted-surface tokens instead. */
.dossier-list-hero {
  margin-block-end: var(--primitives-space-48);
  background: var(--semantics-categories-accent-tinted-background-color);
  color: var(--semantics-categories-accent-tinted-content-color);
  border-radius: var(--primitives-corner-radius-md);
  padding: var(--primitives-space-48) var(--primitives-space-32);
}

.dossier-list-hero__content {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
}

.dossier-list-hero__title {
  margin: 0;
}

.dossier-list-hero__subtitle {
  max-inline-size: 52ch;
}

.dossier-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-24);
}

.dossier-list__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.dossier-list__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.dossier-list__hint {
  color: var(--invulhulp-color-text-subtle);
  margin-block-end: var(--primitives-space-16);
  max-inline-size: 66ch;
}

.dossier-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--primitives-space-16);
}

.dossier-grid__item {
  display: flex;
}

.dossier-card {
  position: relative;
  display: flex;
  align-items: stretch;
  inline-size: 100%;
  padding: 0;
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  transition: box-shadow var(--invulhulp-duration-fast), border-color var(--invulhulp-duration-fast);
}

.dossier-card:hover {
  border-color: var(--semantics-content-accent-color);
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

/* De kaart die je vasthebt: gedempt én met een duidelijke rand. Niet alleen
   kleur — de demping en de rand dragen het samen, en de aankondiging zegt het
   in woorden. */
.dossier-grid__item--dragging .dossier-card {
  opacity: 0.65;
  border-color: var(--semantics-content-accent-color);
  box-shadow: 0 4px 14px rgb(21 66 115 / 0.2);
}

.dossier-grid__item--moving .dossier-card {
  border-color: var(--semantics-content-accent-color);
  box-shadow: inset 0 0 0 1px var(--semantics-content-accent-color);
}

/* Tijdens het slepen niets selecteren: de muis sleept een kaart, hij trekt
   geen tekstselectie over de kaarten heen. */
.dossier-grid--dragging {
  user-select: none;
}

/* De hele kaart minus het greepje is de openknop. */
.dossier-card__open {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-16);
  flex: 1;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: start;
  padding: var(--primitives-space-16);
  padding-inline-end: var(--primitives-space-8);
  border-radius: inherit;
}

.dossier-card__open:focus-visible {
  outline: var(--semantics-focus-ring-outline);
  outline-offset: calc(var(--semantics-focus-ring-outline-offset) * -1);
}

.dossier-card__icon {
  flex-shrink: 0;
}

.dossier-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
  min-inline-size: 0;
  flex: 1;
}

.dossier-card__name {
  color: var(--semantics-content-accent-color);
  margin: 0;
  overflow-wrap: anywhere;
}

.dossier-card__meta {
  color: var(--semantics-content-color);
}

.dossier-card__shared {
  align-self: flex-start;
  font-size: var(--primitives-font-size-80);
}

/* Phase bar: the same five lifecycle steps as the dossier timeline, so the
   overview already shows how far a dossier is along the process. */
.dossier-card__phases {
  display: flex;
  gap: 3px;
  inline-size: 100%;
  margin-block: var(--primitives-space-2);
}

.dossier-card__phase {
  display: block;
  flex: 1;
  block-size: 5px;
  border-radius: 999px;
  background: var(--semantics-dividers-color);
  overflow: hidden;
}

/* A phase without forms yet (afronding) — visibly present, visibly unfillable. */
.dossier-card__phase--empty {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--semantics-content-secondary-color);
}

.dossier-card__phase-fill {
  display: block;
  block-size: 100%;
  background: var(--semantics-content-accent-color);
}

.dossier-card__date {
  color: var(--invulhulp-color-text-subtle);
}

/* Het greepje: dezelfde maten en tokens als nldd-drag-handle-cell, zodat het
   raster aanvoelt als de lijsten elders in de app. `touch-action` houdt de
   vinger bij het slepen weg van het scrollen van de pagina. */
.dossier-card__handle {
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-inline-end: var(--primitives-space-8);
  /* WCAG 2.5.8: ruim boven de doelgrootte van 24×24 CSS-pixels. */
  inline-size: var(--semantics-controls-sm-min-size);
  block-size: var(--semantics-controls-md-min-size);
  border: none;
  border-radius: var(--semantics-controls-md-corner-radius);
  background-color: var(--semantics-grab-handles-background-color);
  color: var(--semantics-grab-handles-grip-color);
  padding: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  appearance: none;
}

.dossier-card__handle:active {
  cursor: grabbing;
}

.dossier-card__handle[aria-pressed='true'] {
  color: var(--semantics-content-accent-color);
}

.dossier-card__handle:focus-visible {
  outline: var(--semantics-focus-ring-outline);
  outline-offset: var(--semantics-focus-ring-outline-offset);
  box-shadow: var(--semantics-focus-ring-box-shadow);
}

.dossier-card__grip {
  display: block;
}

/* De knoppenbalk van de verplaatsmodus. Hij hangt onder de kaart in plaats van
   erin, zodat de kaartinhoud niet verspringt bij het aanzetten. */
.dossier-card__mover {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-end: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
  margin-block-start: var(--primitives-space-4);
  padding: var(--primitives-space-4);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-content-accent-color);
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: 0 4px 14px rgb(21 66 115 / 0.2);
}

/* WCAG 2.3.3: de kaarten verspringen bij een verplaatsing. Wie beweging heeft
   uitgezet, krijgt de overgangen niet. */
@media (prefers-reduced-motion: reduce) {
  .dossier-card {
    transition: none;
  }
}
</style>
