<template>
  <div class="invulhulp-table-question">
    <div class="invulhulp-table-question__scroll">
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
              <input
                type="text"
                class="rvo-text-input invulhulp-table-question__cell-input"
                :value="row[colIndex] ?? ''"
                :aria-label="`${col.label}, rij ${rowIndex + 1}`"
                :placeholder="col.hint"
                @input="onCellInput(rowIndex, colIndex, $event)"
              />
            </td>
            <td class="rvo-table-cell invulhulp-table-question__actions-cell">
              <button
                type="button"
                class="rvo-button rvo-button--tertiary rvo-button--sm invulhulp-table-question__remove-btn"
                :aria-label="`Rij ${rowIndex + 1} verwijderen`"
                @click="removeRow(rowIndex)"
              >
                Verwijderen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <button
      type="button"
      class="rvo-button rvo-button--tertiary rvo-button--sm invulhulp-table-question__add-btn"
      :disabled="table.rows.length >= maxRows"
      @click="addRow"
    >
      + Rij toevoegen
    </button>

    <div class="rvo-form-field invulhulp-table-question__notes">
      <label :for="`${questionId}-notes`" class="rvo-form-field__label invulhulp-table-question__notes-label">
        {{ notesLabel }}
      </label>
      <textarea
        :id="`${questionId}-notes`"
        class="rvo-textarea invulhulp-table-question__notes-input"
        rows="3"
        :value="table.notes"
        @input="onNotesInput($event)"
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { Question, TableColumn } from '../models/Assessment'
import { parseTableAnswer, serializeTableAnswer, type TableAnswer } from '../utils/tableAnswer'

const props = defineProps<{
  question: Question
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const columns = computed<TableColumn[]>(() => props.question.columns ?? [])
const minRows = computed(() => Math.max(props.question.minRows ?? 1, 0))
const maxRows = computed(() => props.question.maxRows ?? 25)
const notesLabel = computed(() => props.question.notesLabel ?? 'Toelichting')
const questionId = computed(() => props.question.id)

function blankRow(): string[] {
  return columns.value.map(() => '')
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

function emitValue() {
  emit('update:modelValue', serializeTableAnswer(table))
}

function onCellInput(rowIndex: number, colIndex: number, event: Event) {
  table.rows[rowIndex][colIndex] = (event.target as HTMLInputElement).value
  emitValue()
}

function onNotesInput(event: Event) {
  table.notes = (event.target as HTMLTextAreaElement).value
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
.invulhulp-table-question__scroll {
  overflow-x: auto;
}

.invulhulp-table-question__table {
  width: 100%;
  border-collapse: collapse;
}

.invulhulp-table-question__table .rvo-table-header {
  text-align: start;
  font-size: var(--rvo-font-size-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  background: var(--invulhulp-color-surface, #f0f4f8);
  border-block-end: 1px solid var(--invulhulp-color-border);
}

.invulhulp-table-question__table .rvo-table-cell {
  padding: var(--rvo-space-3xs, 4px) var(--rvo-space-2xs);
  border-block-end: 1px solid var(--invulhulp-color-border);
  vertical-align: middle;
}

.invulhulp-table-question__cell-input {
  width: 100%;
  min-width: 8rem;
  font-size: var(--rvo-font-size-sm);
  padding: var(--rvo-space-3xs, 4px) var(--rvo-space-2xs);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm, 4px);
}

.invulhulp-table-question__actions-header,
.invulhulp-table-question__actions-cell {
  width: 1%;
  white-space: nowrap;
}

.invulhulp-table-question__remove-btn,
.invulhulp-table-question__add-btn {
  font-size: var(--rvo-font-size-sm);
}

.invulhulp-table-question__add-btn {
  margin-block-start: var(--rvo-space-2xs);
}

.invulhulp-table-question__notes {
  margin-block-start: var(--rvo-space-sm);
}

.invulhulp-table-question__notes-label {
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-bold);
}

.invulhulp-table-question__notes-input {
  width: 100%;
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm, 4px);
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
