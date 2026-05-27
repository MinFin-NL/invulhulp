<template>
  <div v-if="documents.length > 0" class="doc-suggestion">
    <div class="doc-header">
      <span class="doc-label">Beschikbaar uit brondocumenten ({{ documents.length }})</span>
    </div>

    <!-- AI extraction panel -->
    <div v-if="streamingText || suggestion !== null" class="doc-panel">
      <div class="doc-panel-header">
        <span class="suggestion-label">✦ Extractie uit brondocumenten</span>
        <span v-if="rationale" class="suggestion-rationale">{{ rationale }}</span>
      </div>

      <!-- Live streaming view -->
      <div v-if="isLoading" class="diff-view streaming-view">
        <span v-if="streamingText">{{ streamingText }}<span class="streaming-cursor">▋</span></span>
        <span v-else class="diff-no-changes">Verbinding maken…</span>
      </div>

      <!-- Final view -->
      <template v-else-if="suggestion !== null">
        <!-- Insufficient info -->
        <div v-if="isInsufficient" class="diff-view diff-no-changes">
          {{ suggestion }}
        </div>

        <!-- Choice question (radio/checkbox): show suggested option as a pill -->
        <div v-else-if="isChoiceType" class="choice-suggestion">
          <div v-if="!matchedOption" class="diff-view diff-no-changes">
            De AI stelde "{{ suggestion }}" voor, maar dit komt niet overeen met een van de beschikbare opties.
          </div>
          <template v-else>
            <div class="choice-label">Voorgestelde keuze:</div>
            <div class="choice-pill" :class="{ 'choice-pill--selected': isAlreadySelected }">
              <span class="choice-pill-radio" aria-hidden="true">
                <span v-if="isAlreadySelected" class="choice-pill-radio-dot"></span>
              </span>
              <span class="choice-pill-text">{{ matchedOption }}</span>
              <span v-if="isAlreadySelected" class="choice-pill-current">(al geselecteerd)</span>
            </div>
          </template>
        </div>

        <!-- Text question: diff view -->
        <div v-else-if="noChanges" class="diff-view diff-no-changes">
          Geen wijzigingen — het huidige antwoord dekt de documentinhoud al.
        </div>
        <div v-else class="diff-view" aria-label="Voorgestelde invulling">
          <span
            v-for="(part, i) in diffParts"
            :key="i"
            :class="part.added ? 'diff-add' : part.removed ? 'diff-del' : 'diff-eq'"
          >{{ part.value }}</span>
        </div>

        <!-- Action row -->
        <div v-if="!isInsufficient" class="suggestion-actions">
          <button
            v-if="!isChoiceType || (matchedOption && !isAlreadySelected)"
            type="button"
            class="rvo-button rvo-button--primary"
            style="font-size: 0.8rem; padding: 4px 12px;"
            @click="acceptSuggestion"
          >
            {{ isChoiceType ? 'Selecteer deze optie' : 'Overnemen' }}
          </button>
          <button
            type="button"
            class="btn-reject"
            style="font-size: 0.8rem;"
            @click="rejectSuggestion"
          >
            {{ isChoiceType && isAlreadySelected ? 'Sluiten' : 'Afwijzen' }}
          </button>
        </div>
        <div v-else class="suggestion-actions">
          <button type="button" class="btn-reject" style="font-size: 0.8rem;" @click="rejectSuggestion">
            Sluiten
          </button>
        </div>
      </template>
    </div>

    <!-- Action button (hidden while streaming or when suggestion is shown) -->
    <div v-if="canSuggest && suggestion === null && !streamingText" class="doc-actions">
      <button
        type="button"
        class="doc-btn doc-btn--ai"
        :disabled="isLoading"
        @click="requestExtraction"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else-if="isChoiceType">✦ Stel keuze voor uit documenten</span>
        <span v-else>✦ Zoek in documenten</span>
      </button>
    </div>

    <span v-if="error" class="improve-error" style="font-size: 0.8rem;">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import { storeToRefs } from 'pinia'
import { useAssessmentStore } from '../stores/assessmentStore'
import { extractFromDocumentsStream } from '../services/llmService'

const props = defineProps<{
  targetQuestionText: string
  questionType: string
  currentValue: string
  questionOptions?: string[]
}>()

const emit = defineEmits<{
  'apply-suggestion': [value: string]
}>()

const store = useAssessmentStore()
const { documents } = storeToRefs(store)

const isTextType = computed(() => props.questionType === 'text')
const isChoiceType = computed(() => props.questionType === 'radio' || props.questionType === 'checkbox')
const canSuggest = computed(() => isTextType.value || (isChoiceType.value && (props.questionOptions?.length ?? 0) > 0))

// Match the LLM suggestion to one of the available options (case-insensitive)
const matchedOption = computed((): string | null => {
  if (!isChoiceType.value || suggestion.value === null) return null
  const sug = suggestion.value.trim().toLowerCase()
  return props.questionOptions?.find((opt) => opt.trim().toLowerCase() === sug) ?? null
})

const isAlreadySelected = computed(() => {
  if (!matchedOption.value) return false
  // For radio, currentValue can include follow-up text after "\n---\n"
  const current = props.currentValue.split('\n---\n')[0]?.trim() ?? ''
  return current === matchedOption.value
})

const suggestion = ref<string | null>(null)
const rationale = ref('')
const isLoading = ref(false)
const error = ref('')
const streamingRaw = ref('')

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

  await extractFromDocumentsStream(
    {
      documents: documents.value.map((d) => ({ name: d.name, content: d.content })),
      targetQuestion: props.targetQuestionText,
      options: props.questionOptions,
      questionType: props.questionType,
    },
    (chunk) => {
      streamingRaw.value += chunk
    },
    (result) => {
      suggestion.value = result.suggestion
      rationale.value = result.rationale
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
  // For choice questions, emit the matched option (canonical form) so casing matches exactly
  const value = isChoiceType.value && matchedOption.value ? matchedOption.value : suggestion.value
  emit('apply-suggestion', value)
  suggestion.value = null
  rationale.value = ''
}

function rejectSuggestion() {
  suggestion.value = null
  rationale.value = ''
  error.value = ''
}
</script>

<style scoped>
.doc-suggestion {
  margin-top: 12px;
  border: 1px solid #d9c089;
  border-radius: 6px;
  background: #fdf8ec;
  padding: 12px 14px;
  font-size: 0.85rem;
}

.doc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.doc-label {
  font-weight: 600;
  color: #6b4e16;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.doc-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.doc-btn {
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.15s;
}

.doc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.doc-btn--ai {
  background: #8a6d2e;
  color: white;
}

.doc-btn--ai:hover:not(:disabled) {
  opacity: 0.88;
}

.doc-panel {
  background: #f0faf4;
  border: 1px solid #7ec8a0;
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 4px;
  margin-bottom: 10px;
}

.doc-panel-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-label {
  font-weight: 700;
  font-size: 0.8rem;
  color: #1a6b3a;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.suggestion-rationale {
  font-size: 0.75rem;
  color: #3a7a52;
  font-style: italic;
}

.diff-view {
  font-size: 0.85rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: #fafafa;
  border-radius: 3px;
  padding: 6px 8px;
  margin-bottom: 8px;
}

.diff-no-changes {
  color: #666;
  font-style: italic;
}

.diff-add {
  background: #d4edda;
  color: #155724;
}

.diff-del {
  background: #f8d7da;
  color: #721c24;
  text-decoration: line-through;
}

.diff-eq {
  color: #333;
}

.choice-suggestion {
  margin-bottom: 8px;
}

.choice-label {
  font-size: 0.75rem;
  color: #5a6d88;
  font-weight: 500;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.choice-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: white;
  border: 2px solid #154273;
  border-radius: 999px;
  font-size: 0.9rem;
  color: #154273;
  font-weight: 500;
}

.choice-pill--selected {
  background: #e6f4ea;
  border-color: #2e7d32;
  color: #1b5e20;
}

.choice-pill-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.choice-pill-radio-dot {
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: 50%;
}

.choice-pill-text {
  white-space: normal;
}

.choice-pill-current {
  font-size: 0.75rem;
  font-style: italic;
  color: #2e7d32;
}

.streaming-cursor {
  display: inline-block;
  margin-left: 2px;
  color: #999;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to { visibility: hidden; }
}

.suggestion-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-reject {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 4px 8px;
  text-decoration: underline;
}

.btn-reject:hover {
  color: #333;
}

.improve-error {
  color: #c0392b;
  margin-top: 6px;
  display: block;
}
</style>
