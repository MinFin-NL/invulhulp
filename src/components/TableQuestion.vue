<template>
  <div class="invulhulp-table-question">
    <!-- Optional grid, still closed: the toelichting below is the whole answer
         until the user asks for a table. -->
    <nldd-text color="inherit" size="sm" class="invulhulp-table-question__optional-hint" v-if="!gridOpen">
      Een tabel is hier optioneel. Beantwoord de vraag in de toelichting hieronder, of voeg een tabel toe.
    </nldd-text>
    <nldd-button
      variant="neutral-transparent"
      class="invulhulp-table-question__toggle-btn"
      text="+ Tabel toevoegen"
      v-if="!gridOpen && !store.readOnly"
      @click="openGrid"
    />

    <div v-show="gridOpen" class="invulhulp-table-question__viewport">
      <div class="invulhulp-table-question__scroll" ref="scrollEl" @scroll="updateScrollState">
      <table class="rvo-table invulhulp-table-question__table">
        <thead class="rvo-table-head">
          <tr class="rvo-table-row">
            <th
              v-for="col in columns"
              :key="col.id"
              class="rvo-table-header"
              :title="col.hint"
              scope="col"
            >
              {{ col.label }}
            </th>
            <th class="rvo-table-header invulhulp-table-question__actions-header" scope="col">
              <span class="rvo-visually-hidden">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody class="rvo-table-body">
          <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex" class="rvo-table-row">
            <td v-for="(col, colIndex) in columns" :key="col.id" class="rvo-table-cell">
              <!-- Dropdown cell (upstream select/radio column) -->
              <!-- nldd-dropdown wraps a native <select>: the options stay
                   ordinary markup and the component supplies the chrome. -->
              <nldd-dropdown
                v-if="col.type === 'select'"
                class="invulhulp-table-question__cell-input"
                size="sm"
                :accessible-label="`${col.label}, rij ${rowIndex + 1}`"
                :disabled="store.readOnly"
                @change="onCellValue(rowIndex, colIndex, $event)"
              >
              <select :value="row[colIndex] ?? ''" :title="col.hint">
                <option value="">–</option>
                <option
                  v-if="row[colIndex] && !colOptions(col).includes(row[colIndex])"
                  :value="row[colIndex]"
                >{{ row[colIndex] }}</option>
                <option v-for="opt in colOptions(col)" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              </nldd-dropdown>

              <!-- Free-text cell with suggestions (upstream checkbox/multiselect column) -->
              <!-- allow-custom keeps the old <datalist> behaviour: the options
                   are suggestions, not a closed list. -->
              <nldd-combo-box
                v-else-if="col.type === 'suggest'"
                class="invulhulp-table-question__cell-input"
                size="sm"
                allow-custom
                :text="row[colIndex] ?? ''"
                :accessible-label="`${col.label}, rij ${rowIndex + 1}`"
                :placeholder="cellPlaceholder(col)"
                :disabled="store.readOnly"
                @input="onCellValue(rowIndex, colIndex, $event)"
              >
                <nldd-menu>
                  <nldd-menu-item v-for="opt in colOptions(col)" :key="opt" :text="opt" />
                </nldd-menu>
              </nldd-combo-box>

              <!-- Plain text cell -->
              <nldd-text-field
                v-else
                class="invulhulp-table-question__cell-input"
                size="sm"
                :value="row[colIndex] ?? ''"
                :accessible-label="`${col.label}, rij ${rowIndex + 1}`"
                :placeholder="cellPlaceholder(col)"
                :disabled="store.readOnly"
                @input="onCellValue(rowIndex, colIndex, $event)"
              />
            </td>
            <td class="rvo-table-cell invulhulp-table-question__actions-cell">
              <nldd-button
                variant="neutral-transparent"
                class="invulhulp-table-question__remove-btn"
                text="✕"
                v-if="!store.readOnly"
                :aria-label="`Rij ${rowIndex + 1} verwijderen`"
                title="Rij verwijderen"
                @click="removeRow(rowIndex)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <!-- Clickable scroll buttons — the explicit affordance. -->
      <button
        v-show="overflowing && !atStart"
        type="button"
        class="invulhulp-table-question__scroll-btn invulhulp-table-question__scroll-btn--left"
        aria-label="Toon vorige kolommen"
        @click="scrollStep(-1)"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <button
        v-show="overflowing && !atEnd"
        type="button"
        class="invulhulp-table-question__scroll-btn invulhulp-table-question__scroll-btn--right"
        aria-label="Toon volgende kolommen"
        @click="scrollStep(1)"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <p v-if="overflowing && gridOpen" class="invulhulp-table-question__scroll-hint">
      <span class="invulhulp-table-question__scroll-hint-icon" aria-hidden="true">↔</span>
      Deze tabel heeft {{ columns.length }} kolommen — scroll of gebruik de pijlen om ze allemaal te zien.
    </p>

    <div v-if="gridOpen && !store.readOnly" class="invulhulp-table-question__grid-actions">
      <nldd-button
        variant="neutral-transparent"
        class="invulhulp-table-question__add-btn"
        text="+ Rij toevoegen"
        :disabled="table.rows.length >= maxRows"
        @click="addRow"
      />
      <!-- Only offered while the grid is still empty: closing it drops the rows,
           and silently discarding typed cells would be a data loss. -->
      <nldd-button
        variant="neutral-transparent"
        class="invulhulp-table-question__toggle-btn"
        text="Tabel weglaten"
        v-if="optionalTable && !hasRowContent"
        @click="closeGrid"
      />
    </div>

    <nldd-form-field :label="notesLabel" class="invulhulp-table-question__notes">
      <nldd-multi-line-text-field
        class="invulhulp-table-question__notes-input"
        :rows="3"
        :value="table.notes"
        :disabled="store.readOnly"
        @input="onNotesValue($event)"
      />
    </nldd-form-field>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Question, TableColumn } from '../models/Assessment'
import { parseTableAnswer, serializeTableAnswer, type TableAnswer } from '../utils/tableAnswer'
import { useAssessmentStore } from '../stores/assessmentStore'
import { mergedOptions } from '../utils/answerRefs'
import { getCachedForm } from '../services/formLoader'

const props = defineProps<{
  question: Question
  modelValue: string
}>()

const store = useAssessmentStore()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const columns = computed<TableColumn[]>(() => props.question.columns ?? [])
const minRows = computed(() => Math.max(props.question.minRows ?? 1, 0))
const maxRows = computed(() => props.question.maxRows ?? 25)
const notesLabel = computed(() => props.question.notesLabel ?? 'Toelichting')

// Horizontal-scroll affordance: track whether the grid overflows its viewport
// and where we are in the scroll, to drive the edge fades + "scroll voor meer"
// hint. Recomputed on scroll, on resize, and when rows/columns change.
const scrollEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const atStart = ref(true)
const atEnd = ref(true)

function updateScrollState() {
  const el = scrollEl.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  overflowing.value = max > 1
  atStart.value = el.scrollLeft <= 1
  atEnd.value = el.scrollLeft >= max - 1
}

// Scroll the grid roughly one screenful in the given direction (-1 left, +1 right).
function scrollStep(dir: number) {
  const el = scrollEl.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  updateScrollState()
  resizeObserver = new ResizeObserver(() => updateScrollState())
  if (scrollEl.value) resizeObserver.observe(scrollEl.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

function blankRow(): string[] {
  return columns.value.map(() => '')
}

// Only short hints belong in a cell as placeholder text (e.g. "bijv. BSN").
// Long ones — like the "Alleen relevant indien…" conditional notes — would clip
// awkwardly, so they live only in the header tooltip (`th[title]`).
function cellPlaceholder(col: TableColumn): string | undefined {
  return col.hint && col.hint.length <= 40 ? col.hint : undefined
}

// Choices for a select/suggest column: its static options plus any live values
// pulled from another answer via `optionsFrom`.
function colOptions(col: TableColumn): string[] {
  return mergedOptions(
    col.options,
    col.optionsFrom,
    store.getAnswer,
    store.activeFormId ? getCachedForm(store.activeFormId) : undefined,
  )
}

// Questions converted from free text to table can carry an old prose/HTML
// answer. Rescue it into the toelichting field so nothing is lost; it only
// reserializes to the JSON table shape once the user edits.
function legacyAnswer(value: string): TableAnswer | null {
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return null
  return { rows: [], notes: text }
}

function parseModelValue(value: string): TableAnswer | null {
  return parseTableAnswer(value) ?? (value.trim() ? legacyAnswer(value) : null)
}

function normalize(answer: TableAnswer | null): TableAnswer {
  const rows = (answer?.rows ?? []).map((row) => {
    const cells = [...row]
    while (cells.length < columns.value.length) cells.push('')
    return cells.slice(0, columns.value.length)
  })
  while (rows.length < minRows.value) rows.push(blankRow())
  if (rows.length === 0) rows.push(blankRow())
  return { rows, notes: answer?.notes ?? '' }
}

const table = reactive<TableAnswer>(normalize(parseModelValue(props.modelValue)))

// `optionalTable` questions start without a grid: not every respondent has
// something to tabulate, and an empty grid reads as an obligation. It opens on
// request, and by itself as soon as rows arrive (AI Modus, an imported answer,
// a collaborator).
const optionalTable = computed(() => props.question.optionalTable === true)
const hasRowContent = computed(() => table.rows.some((row) => row.some((cell) => cell.trim() !== '')))
const gridRequested = ref(false)
const gridOpen = computed(() => !optionalTable.value || gridRequested.value || hasRowContent.value)

function openGrid() {
  gridRequested.value = true
  nextTick(updateScrollState)
}

function closeGrid() {
  gridRequested.value = false
  // Only reachable while every cell is empty, so this discards nothing.
  table.rows = [blankRow()]
  emitValue()
}

// External updates (AI Modus fill, suggestion accept, dossier switch) rewrite
// the grid; guard against echoing our own emits back into the state.
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal === serializeTableAnswer(table)) return
    const next = normalize(parseModelValue(newVal))
    table.rows = next.rows
    table.notes = next.notes
  },
)

// Re-measure the scroll affordance when the grid's rows or columns change.
watch(
  () => [columns.value.length, table.rows.length],
  () => nextTick(updateScrollState),
)

function emitValue() {
  emit('update:modelValue', serializeTableAnswer(table))
}

/** The NLDD input components report their value in the event detail; the
 *  target is the custom element, not the inner <input>. */
function onCellValue(rowIndex: number, colIndex: number, event: Event) {
  table.rows[rowIndex][colIndex] = (event as CustomEvent<{ value: string }>).detail.value
  emitValue()
}

function onNotesValue(event: Event) {
  table.notes = (event as CustomEvent<{ value: string }>).detail.value
  emitValue()
}

function addRow() {
  if (table.rows.length >= maxRows.value) return
  table.rows.push(blankRow())
}

function removeRow(rowIndex: number) {
  table.rows.splice(rowIndex, 1)
  // Deleting is always allowed; the grid just refills to the minimum with
  // blank rows so there is always something to type in.
  while (table.rows.length < Math.max(minRows.value, 1)) table.rows.push(blankRow())
  emitValue()
}
</script>

<style scoped>
.invulhulp-table-question__viewport {
  position: relative;
}

.invulhulp-table-question__scroll {
  overflow-x: auto;
}

/* NL Design System secondary-button styling for the edge scroll controls:
   white surface, hemelblauw border + icon, invert on hover/focus. */
.invulhulp-table-question__scroll-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  padding: 0;
  color: var(--semantics-content-accent-color, #007bc7);
  background: var(--semantics-surfaces-base-background-color, #fff);
  border: 1px solid var(--semantics-content-accent-color, #007bc7);
  border-radius: var(--primitives-corner-radius-md, 8px);
  box-shadow: 0 1px 4px rgb(21 66 115 / 0.18);
  cursor: pointer;
  transition: background-color var(--invulhulp-duration-instant), color var(--invulhulp-duration-instant);
}
.invulhulp-table-question__scroll-btn:hover {
  background: var(--semantics-content-accent-color, #007bc7);
  color: var(--semantics-surfaces-base-background-color, #fff);
}
.invulhulp-table-question__scroll-btn:focus-visible {
  outline: var(--semantics-content-accent-color, #01689b) solid 2px;
  outline-offset: 2px;
}
.invulhulp-table-question__scroll-btn--left {
  inset-inline-start: 0.25rem;
}
.invulhulp-table-question__scroll-btn--right {
  /* Left of the sticky delete column so it never covers the delete button. */
  inset-inline-end: 3rem;
}

/* Prominent info bar spelling out that the table scrolls. */
.invulhulp-table-question__scroll-hint {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
  margin: var(--primitives-space-8) 0 0;
  padding: var(--primitives-space-4) var(--primitives-space-12);
  background: var(--semantics-surfaces-tinted-background-color, #e5f0f8);
  border-inline-start: 4px solid var(--semantics-content-accent-color, #007bc7);
  border-radius: var(--primitives-corner-radius-sm, 4px);
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold, 600);
  color: var(--semantics-content-accent-color, #154273);
}
.invulhulp-table-question__scroll-hint-icon {
  font-size: 1.15rem;
  line-height: 1;
}

.invulhulp-table-question__table {
  /* Fill the card when there are few columns, but grow past it (and scroll
     inside .__scroll) when there are many, so columns stay readable instead of
     cramming. */
  width: auto;
  min-width: 100%;
  table-layout: auto;
  /* `collapse` breaks position:sticky on cells in Chrome; `separate` with
     zero spacing renders identically because borders are per-cell. */
  border-collapse: separate;
  border-spacing: 0;
}

/* Give every data column a readable floor; wide tables then overflow-scroll. */
.invulhulp-table-question__table .rvo-table-header,
.invulhulp-table-question__table .rvo-table-cell {
  min-inline-size: 8.5rem;
}
.invulhulp-table-question__table .invulhulp-table-question__actions-header,
.invulhulp-table-question__table .invulhulp-table-question__actions-cell {
  min-inline-size: 2.75rem;
}

.invulhulp-table-question__table .rvo-table-header {
  text-align: start;
  font-size: var(--primitives-font-size-90);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  background: var(--invulhulp-color-surface, #f0f4f8);
  border-block-end: 1px solid var(--invulhulp-color-border);
}

.invulhulp-table-question__table .rvo-table-cell {
  padding: var(--primitives-space-2, 4px) var(--primitives-space-4);
  border-block-end: 1px solid var(--invulhulp-color-border);
  vertical-align: middle;
}

.invulhulp-table-question__cell-input {
  width: 100%;
  min-width: 0;
  font-size: var(--primitives-font-size-90);
  padding: var(--primitives-space-2, 4px) var(--primitives-space-4);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm, 4px);
}

/* Pinned to the right edge of the scroll container so the delete action
   stays visible even when the table itself scrolls horizontally. */
.invulhulp-table-question__actions-header,
.invulhulp-table-question__actions-cell {
  width: 2.75rem;
  white-space: nowrap;
  position: sticky;
  inset-inline-end: 0;
  background: var(--invulhulp-color-background, #fff);
}

.invulhulp-table-question__actions-header {
  background: var(--invulhulp-color-surface, #f0f4f8);
}

.invulhulp-table-question__remove-btn {
  padding: var(--primitives-space-2, 4px) var(--primitives-space-4);
  line-height: 1;
}

.invulhulp-table-question__remove-btn,
.invulhulp-table-question__add-btn {
  font-size: var(--primitives-font-size-90);
}

.invulhulp-table-question__grid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  align-items: center;
}

.invulhulp-table-question__add-btn,
.invulhulp-table-question__toggle-btn {
  margin-block-start: var(--primitives-space-4);
  font-size: var(--primitives-font-size-90);
}

.invulhulp-table-question__optional-hint {
  margin: 0;
  color: var(--invulhulp-color-text-muted);
}

.invulhulp-table-question__notes {
  margin-block-start: var(--primitives-space-12);
}

.invulhulp-table-question__notes-label {
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-bold);
}

.invulhulp-table-question__notes-input {
  width: 100%;
  font: inherit;
  font-size: var(--primitives-font-size-90);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm, 4px);
  resize: vertical;
}

.rvo-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
