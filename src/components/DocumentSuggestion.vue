<template>
  <div v-if="documents.length > 0" class="doc-suggestion">
    <div class="doc-suggestion__header">
      <span class="doc-suggestion__label">
        Beschikbaar uit brondocumenten ({{ documents.length }})
      </span>
    </div>

    <!-- AI extraction panel -->
    <div
      v-if="streamingText || suggestion !== null"
      class="rvo-alert rvo-alert--success rvo-alert--padding-sm doc-suggestion__panel"
      :aria-busy="isLoading"
    >
      <div class="rvo-alert__container">
        <div class="doc-suggestion__panel-header">
          <span class="doc-suggestion__panel-label">✦ Extractie uit brondocumenten</span>
          <span v-if="rationale" class="doc-suggestion__rationale">{{ rationale }}</span>
        </div>

        <!-- Live streaming view -->
        <div v-if="isLoading" class="doc-diff doc-diff--streaming" aria-live="polite">
          <span v-if="streamingText">{{ streamingText }}<span class="doc-diff__cursor" aria-hidden="true">▋</span></span>
          <span v-else class="doc-diff__empty">Verbinding maken…</span>
        </div>

        <!-- Final view -->
        <template v-else-if="suggestion !== null">
          <div v-if="isInsufficient" class="doc-diff doc-diff__empty">{{ suggestion }}</div>

          <div v-else-if="isChoiceType" class="doc-choice">
            <div v-if="!matchedOption" class="doc-diff doc-diff__empty">
              De AI stelde "{{ suggestion }}" voor, maar dit komt niet overeen met een van de beschikbare opties.
            </div>
            <template v-else>
              <div class="doc-choice__label">Voorgestelde keuze:</div>
              <div class="doc-choice__pill" :class="{ 'doc-choice__pill--selected': isAlreadySelected }">
                <span class="doc-choice__radio" aria-hidden="true">
                  <span v-if="isAlreadySelected" class="doc-choice__radio-dot"></span>
                </span>
                <span class="doc-choice__text">{{ matchedOption }}</span>
                <span v-if="isAlreadySelected" class="doc-choice__current">(al geselecteerd)</span>
              </div>
            </template>
          </div>

          <!-- Table suggestion: read-only preview of the validated rows -->
          <div v-else-if="isTableType && tableSuggestion" class="doc-table-preview">
            <table class="rvo-table doc-table-preview__table">
              <thead class="rvo-table-head">
                <tr class="rvo-table-row">
                  <th v-for="col in questionColumns" :key="col.id" class="rvo-table-header" scope="col">
                    {{ col.label }}
                  </th>
                </tr>
              </thead>
              <tbody class="rvo-table-body">
                <tr v-for="(row, i) in tableSuggestion.rows" :key="i" class="rvo-table-row">
                  <td v-for="(cell, j) in row" :key="j" class="rvo-table-cell">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="tableSuggestion.notes" class="doc-table-preview__notes">
              <strong>Toelichting:</strong> {{ tableSuggestion.notes }}
            </p>
          </div>

          <div v-else-if="noChanges" class="doc-diff doc-diff__empty">
            Geen wijzigingen — het huidige antwoord dekt de documentinhoud al.
          </div>
          <div v-else class="doc-diff" aria-label="Voorgestelde invulling">
            <span
              v-for="(part, i) in diffParts"
              :key="i"
              :class="part.added ? 'doc-diff__add' : part.removed ? 'doc-diff__del' : ''"
            >{{ part.value }}</span>
          </div>

          <!-- Source passages, so the user can verify before accepting -->
          <SourcePanel
            v-if="!isInsufficient && (displaySources.length > 0 || !suggestionGrounded)"
            :sources="displaySources"
            :answer-text="suggestionPlainText"
            :grounded="suggestionGrounded"
            :default-open="true"
            @show-document="showDocument"
            @dismiss-warning="suggestionWarningDismissed = true"
          />

          <div class="doc-suggestion__actions rvo-layout-row rvo-layout-gap--xs">
            <button
              v-if="!isInsufficient && (!isChoiceType || (matchedOption && !isAlreadySelected))"
              type="button"
              class="rvo-button rvo-button--primary rvo-button--size-sm"
              @click="acceptSuggestion"
            >
              {{ isChoiceType ? 'Selecteer deze optie' : 'Overnemen' }}
            </button>
            <button
              type="button"
              class="rvo-button rvo-button--secondary rvo-button--size-sm"
              @click="rejectSuggestion"
            >
              {{ isChoiceType && isAlreadySelected ? 'Sluiten' : 'Afwijzen' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Action button (hidden while streaming or when suggestion is shown) -->
    <div v-if="canSuggest && suggestion === null && !streamingText" class="doc-suggestion__actions">
      <button
        type="button"
        class="rvo-button rvo-button--primary rvo-button--size-sm"
        :disabled="isLoading"
        @click="requestExtraction"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else-if="isChoiceType">✦ Stel keuze voor uit documenten</span>
        <span v-else>✦ Zoek in documenten</span>
      </button>
    </div>

    <span v-if="error" class="doc-suggestion__error rvo-text rvo-text--sm" role="alert">{{ error }}</span>

    <DocumentViewerModal ref="docViewer" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import { storeToRefs } from 'pinia'
import { useAssessmentStore } from '../stores/assessmentStore'
import { extractRagStream } from '../services/llmService'
import type { AnswerSource, AnswerSourceMeta, TableColumn } from '../models/Assessment'
import { answerPlainText, filterSupportingSources, topRetrievedSources } from '../utils/sourceMatching'
import { parsePipeSuggestion, serializeTableAnswer } from '../utils/tableAnswer'
import SourcePanel from './SourcePanel.vue'
import DocumentViewerModal from './DocumentViewerModal.vue'

const props = defineProps<{
  targetQuestionText: string
  questionType: string
  currentValue: string
  questionOptions?: string[]
  questionColumns?: TableColumn[]
}>()

const emit = defineEmits<{
  'apply-suggestion': [value: string, meta?: AnswerSourceMeta]
}>()

const store = useAssessmentStore()
const { documents, sessionId } = storeToRefs(store)

const readyDocIds = computed(() =>
  documents.value.filter((d) => !d.indexing && d.chunkCount && d.chunkCount > 0).map((d) => d.id),
)

const isTextType = computed(() => props.questionType === 'text')
const isChoiceType = computed(() => props.questionType === 'radio' || props.questionType === 'checkbox')
const isTableType = computed(() => props.questionType === 'table')
const canSuggest = computed(
  () =>
    isTextType.value ||
    (isChoiceType.value && (props.questionOptions?.length ?? 0) > 0) ||
    (isTableType.value && (props.questionColumns?.length ?? 0) > 0),
)

const matchedOption = computed((): string | null => {
  if (!isChoiceType.value || suggestion.value === null) return null
  const sug = suggestion.value.trim().toLowerCase()
  return props.questionOptions?.find((opt) => opt.trim().toLowerCase() === sug) ?? null
})

const isAlreadySelected = computed(() => {
  if (!matchedOption.value) return false
  const current = props.currentValue.split('\n---\n')[0]?.trim() ?? ''
  return current === matchedOption.value
})

const suggestion = ref<string | null>(null)
const rationale = ref('')
const sources = ref<AnswerSource[]>([])
const suggestionWarningDismissed = ref(false)
const docViewer = ref<InstanceType<typeof DocumentViewerModal> | null>(null)
const isLoading = ref(false)
const error = ref('')
const streamingRaw = ref('')

const suggestionPlainText = computed(() =>
  suggestion.value === null ? '' : answerPlainText(suggestion.value),
)

const supportingSources = computed((): AnswerSource[] =>
  suggestion.value === null ? [] : filterSupportingSources(suggestionPlainText.value, sources.value),
)

// Retrieval returns the K nearest chunks regardless of relevance; only show
// the ones that actually back the suggestion. Choice questions fall back to
// the closest retrieval matches (option labels rarely appear verbatim).
const displaySources = computed((): AnswerSource[] => {
  if (supportingSources.value.length > 0) return supportingSources.value
  return isChoiceType.value ? topRetrievedSources(sources.value) : []
})

// Parsed preview of a validated table suggestion (pipe rows from the server).
const tableSuggestion = computed(() => {
  if (!isTableType.value || suggestion.value === null || isInsufficient.value) return null
  return parsePipeSuggestion(suggestion.value, props.questionColumns?.length ?? 0)
})

const suggestionGrounded = computed(() => {
  // Table cells are grounded server-side; the client heuristic false-alarms
  // on short cell fragments.
  if (suggestionWarningDismissed.value || isChoiceType.value || isTableType.value) return true
  if (suggestion.value === null || sources.value.length === 0) return true
  return supportingSources.value.length > 0
})

function showDocument(source: AnswerSource) {
  docViewer.value?.open(source, suggestionPlainText.value)
}

const streamingText = computed((): string => {
  if (!streamingRaw.value) return ''
  const afterOpen = streamingRaw.value.match(/<suggestie>([\s\S]*)/i)
  if (!afterOpen) return ''
  const content = afterOpen[1]
  const beforeClose = content.match(/([\s\S]*?)<\/suggestie>/i)
  return (beforeClose ? beforeClose[1] : content).trim()
})

const isInsufficient = computed(
  () => suggestion.value !== null && /onvoldoende informatie/i.test(suggestion.value),
)

const diffParts = computed((): Change[] => {
  if (suggestion.value === null || isInsufficient.value) return []
  return diffWords(props.currentValue, suggestion.value)
})

const noChanges = computed(
  () => suggestion.value !== null && suggestion.value === props.currentValue,
)

async function requestExtraction() {
  if (documents.value.length === 0) return

  error.value = ''
  isLoading.value = true
  suggestion.value = null
  streamingRaw.value = ''
  rationale.value = ''
  sources.value = []
  suggestionWarningDismissed.value = false

  await extractRagStream(
    {
      sessionId: sessionId.value,
      targetQuestion: props.targetQuestionText,
      options: props.questionOptions,
      questionType: props.questionType,
      columns: props.questionColumns,
      docIds: readyDocIds.value,
    },
    (chunk) => {
      streamingRaw.value += chunk
    },
    (result) => {
      suggestion.value = result.suggestion
      rationale.value = result.rationale
      sources.value = result.sources ?? []
      streamingRaw.value = ''
      isLoading.value = false
    },
    (errMsg) => {
      error.value = errMsg
      streamingRaw.value = ''
      isLoading.value = false
    },
  )
}

function acceptSuggestion() {
  if (suggestion.value === null) return
  let value = isChoiceType.value && matchedOption.value ? matchedOption.value : suggestion.value
  // Tables are stored as serialized JSON, not the pipe wire format.
  if (isTableType.value && tableSuggestion.value) {
    value = serializeTableAnswer(tableSuggestion.value)
  }
  const meta: AnswerSourceMeta | undefined = displaySources.value.length > 0 || !suggestionGrounded.value
    ? { sources: displaySources.value, grounded: suggestionGrounded.value, createdAt: Date.now() }
    : undefined
  emit('apply-suggestion', value, meta)
  suggestion.value = null
  rationale.value = ''
  sources.value = []
}

function rejectSuggestion() {
  suggestion.value = null
  rationale.value = ''
  sources.value = []
  error.value = ''
}
</script>

<style scoped>
.doc-suggestion {
  margin-block-start: var(--rvo-space-sm);
  border: 1px solid var(--rvo-color-donkergeel-300);
  border-radius: var(--rvo-border-radius-md);
  background: var(--rvo-color-donkergeel-150);
  padding: var(--rvo-space-sm) var(--rvo-space-md);
  font-size: var(--rvo-font-size-sm);
}

.doc-suggestion__header {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
}

.doc-suggestion__label {
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-oranje-750);
  font-size: var(--rvo-font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.doc-suggestion__panel {
  margin-block: var(--rvo-space-2xs) var(--rvo-space-xs);
}

.doc-suggestion__panel :deep(.rvo-alert__container) {
  flex-direction: column;
  align-items: flex-start;
}

.doc-suggestion__panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-xs);
  flex-wrap: wrap;
}

.doc-suggestion__panel-label {
  font-weight: var(--rvo-font-weight-bold);
  font-size: var(--rvo-font-size-xs);
  color: var(--rvo-color-groen-750);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.doc-suggestion__rationale {
  font-size: var(--rvo-font-size-xs);
  color: var(--rvo-color-groen-600);
  font-style: italic;
  text-align: right;
}

.doc-suggestion__actions {
  margin-block-start: var(--rvo-space-xs);
  align-items: center;
}

.doc-suggestion__error {
  color: var(--rvo-color-rood);
  margin-block-start: var(--rvo-space-2xs);
  display: block;
}

.doc-diff {
  font-size: var(--rvo-font-size-md);
  line-height: var(--rvo-line-height-md);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--rvo-color-wit);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
}

.doc-diff__empty {
  color: var(--invulhulp-color-text-subtle);
  font-style: italic;
}

.doc-diff__cursor {
  display: inline-block;
  margin-inline-start: 2px;
  color: var(--rvo-color-grijs-500);
  animation: invulhulp-blink 1s steps(2, start) infinite;
}

.doc-diff__add {
  background: var(--rvo-color-groen-150);
  color: var(--rvo-color-groen-750);
}

.doc-diff__del {
  background: var(--rvo-color-rood-150);
  color: var(--rvo-color-rood-750);
  text-decoration: line-through;
}

.doc-choice {
  margin-block-end: var(--rvo-space-xs);
}

.doc-table-preview {
  background: var(--rvo-color-wit);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
  overflow-x: auto;
}

.doc-table-preview__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--rvo-font-size-sm);
}

.doc-table-preview__table .rvo-table-header,
.doc-table-preview__table .rvo-table-cell {
  text-align: start;
  padding: var(--rvo-space-3xs, 4px) var(--rvo-space-2xs);
  border-block-end: 1px solid var(--invulhulp-color-border);
}

.doc-table-preview__notes {
  margin: var(--rvo-space-2xs) 0 0;
  font-size: var(--rvo-font-size-sm);
}

.doc-choice__label {
  font-size: var(--rvo-font-size-xs);
  color: var(--invulhulp-color-text-muted);
  font-weight: var(--rvo-font-weight-semibold);
  margin-block-end: var(--rvo-space-2xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.doc-choice__pill {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  background: var(--rvo-color-wit);
  border: 2px solid var(--rvo-color-lintblauw);
  border-radius: 999px;
  font-size: var(--rvo-font-size-md);
  color: var(--rvo-color-lintblauw);
  font-weight: var(--rvo-font-weight-semibold);
}

.doc-choice__pill--selected {
  background: var(--rvo-color-groen-150);
  border-color: var(--rvo-color-groen);
  color: var(--rvo-color-groen-750);
}

.doc-choice__radio {
  inline-size: 16px;
  block-size: 16px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-choice__radio-dot {
  inline-size: 7px;
  block-size: 7px;
  background: currentColor;
  border-radius: 50%;
}

.doc-choice__current {
  font-size: var(--rvo-font-size-xs);
  font-style: italic;
  color: var(--rvo-color-groen);
}
</style>
