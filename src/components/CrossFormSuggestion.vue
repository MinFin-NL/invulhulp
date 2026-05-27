<template>
  <div v-if="sourceContext.length > 0" class="cross-form-suggestion">
    <div class="cross-form-header">
      <span class="cross-form-label">Beschikbaar uit {{ sourceLabel }}</span>
    </div>

    <!-- Source form answer blocks -->
    <div
      v-for="item in sourceContext"
      :key="item.id"
      class="aiia-answer-block"
    >
      <div class="aiia-question-label">{{ item.questionText }}</div>
      <div class="aiia-answer-text">{{ item.answer }}</div>
    </div>

    <!-- AI synthesis suggestion panel -->
    <div v-if="suggestion !== null" class="cross-suggestion-panel">
      <div class="cross-suggestion-header">
        <span class="suggestion-label">✦ Synthese vanuit AIIA</span>
        <span v-if="rationale" class="suggestion-rationale">{{ rationale }}</span>
      </div>

      <div v-if="noChanges" class="diff-view diff-no-changes">
        Geen wijzigingen — het huidige antwoord dekt de AIIA-informatie al.
      </div>
      <div v-else class="diff-view" aria-label="Voorgestelde invulling">
        <span
          v-for="(part, i) in diffParts"
          :key="i"
          :class="part.added ? 'diff-add' : part.removed ? 'diff-del' : 'diff-eq'"
        >{{ part.value }}</span>
      </div>

      <div class="suggestion-actions">
        <button
          type="button"
          class="rvo-button rvo-button--primary"
          style="font-size: 0.8rem; padding: 4px 12px;"
          @click="acceptSuggestion"
        >
          Overnemen
        </button>
        <button
          type="button"
          class="btn-reject"
          style="font-size: 0.8rem;"
          @click="rejectSuggestion"
        >
          Afwijzen
        </button>
      </div>
    </div>

    <!-- Action buttons (only for text-type questions) -->
    <div v-if="isTextType && suggestion === null" class="cross-form-actions">
      <button
        type="button"
        class="cross-btn cross-btn--direct"
        @click="useDirectly"
      >
        Gebruik direct
      </button>
      <button
        type="button"
        class="cross-btn cross-btn--ai"
        :disabled="isLoading"
        @click="requestSynthesis"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else>✦ AI-suggestie</span>
      </button>
    </div>

    <span v-if="error" class="improve-error" style="font-size: 0.8rem;">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import type { CrossFormMapping } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { getCachedForm } from '../services/formLoader'
import { synthesize } from '../services/llmService'

const props = defineProps<{
  mapping: CrossFormMapping
  targetQuestionText: string
  questionType: string
  currentValue: string
}>()

const emit = defineEmits<{
  'apply-suggestion': [value: string]
}>()

const store = useAssessmentStore()

// ── Resolve source question text by ID ────────────────────────────────────────

function findSourceQuestionText(sourceFormId: string, questionId: string): string {
  const form = getCachedForm(sourceFormId)
  if (!form) return questionId
  for (const section of form.sections) {
    for (const sub of section.subsections) {
      for (const q of sub.questions) {
        if (q.id === questionId) return q.text
      }
    }
  }
  return questionId
}

// ── Build context from source form answers ────────────────────────────────────

const sourceContext = computed(() => {
  const { sourceFormId, sourceQuestionIds } = props.mapping
  return sourceQuestionIds
    .map((id) => {
      const raw = store.forms[sourceFormId]?.answers[id]
      const answer =
        typeof raw === 'string'
          ? raw.replace('\n---\n', ': ')
          : Array.isArray(raw)
            ? raw.join(', ')
            : ''
      return { id, questionText: findSourceQuestionText(sourceFormId, id), answer }
    })
    .filter((item) => item.answer.trim().length > 0)
})

const sourceLabel = computed(() => props.mapping.sourceFormId.toUpperCase())

const isTextType = computed(() => props.questionType === 'text')

// ── "Use directly" ────────────────────────────────────────────────────────────

function useDirectly() {
  const combined = sourceContext.value
    .map((item) => (sourceContext.value.length > 1 ? `${item.questionText}:\n${item.answer}` : item.answer))
    .join('\n\n')
  emit('apply-suggestion', combined)
}

// ── AI synthesis ──────────────────────────────────────────────────────────────

const suggestion = ref<string | null>(null)
const rationale = ref('')
const isLoading = ref(false)
const error = ref('')

const diffParts = computed((): Change[] => {
  if (suggestion.value === null) return []
  return diffWords(props.currentValue, suggestion.value)
})

const noChanges = computed(
  () => suggestion.value !== null && suggestion.value === props.currentValue,
)

async function requestSynthesis() {
  const mapping = props.mapping
  if (sourceContext.value.length === 0) return

  error.value = ''
  isLoading.value = true
  suggestion.value = null

  const sourceAnswers: Record<string, string> = {}
  const sourceQuestions: Record<string, string> = {}

  for (const item of sourceContext.value) {
    sourceAnswers[item.id] = item.answer
    sourceQuestions[item.id] = item.questionText
  }

  try {
    const result = await synthesize({
      sourceAnswers,
      sourceQuestions,
      targetQuestion: props.targetQuestionText,
      synthesisHint: mapping.synthesisHint,
    })
    suggestion.value = result.suggestion
    rationale.value = result.rationale
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Er is een fout opgetreden.'
  } finally {
    isLoading.value = false
  }
}

function acceptSuggestion() {
  if (suggestion.value === null) return
  emit('apply-suggestion', suggestion.value)
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
.cross-form-suggestion {
  margin-top: 12px;
  border: 1px solid #b3c9e5;
  border-radius: 6px;
  background: #f0f6ff;
  padding: 12px 14px;
  font-size: 0.85rem;
}

.cross-form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.cross-form-label {
  font-weight: 600;
  color: #154273;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.aiia-answer-block {
  background: white;
  border: 1px solid #d0dff0;
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.aiia-question-label {
  font-size: 0.75rem;
  color: #5a6d88;
  font-weight: 500;
  margin-bottom: 4px;
}

.aiia-answer-text {
  color: #1a2a3a;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 100px;
  overflow-y: auto;
}

.cross-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.cross-btn {
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.15s;
}

.cross-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cross-btn--direct {
  background: #e8f0fb;
  color: #154273;
  border: 1px solid #b3c9e5;
}

.cross-btn--direct:hover:not(:disabled) {
  background: #d0e4f5;
}

.cross-btn--ai {
  background: #154273;
  color: white;
}

.cross-btn--ai:hover:not(:disabled) {
  opacity: 0.88;
}

.cross-suggestion-panel {
  background: #f0faf4;
  border: 1px solid #7ec8a0;
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 10px;
}

.cross-suggestion-header {
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
</style>
