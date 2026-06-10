import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { loadForm, flattenFormQuestions } from '../services/formLoader'
import { bulkExtractFromDocument, verifyDocuments } from '../services/llmService'

// Module-level singleton — shared across all component instances
const aiModeActive = ref<Set<string>>(new Set())
const aiModeProgress = ref<Record<string, { filled: number; total: number }>>({})
const aiModeDone = ref<Record<string, number>>({})
const aiModeError = ref<Record<string, string>>({})
const aiModeCancelled: Record<string, boolean> = {}

export function useAiMode() {
  const store = useAssessmentStore()

  const readyDocIds = computed(() =>
    store.documents
      .filter((d) => !d.indexing && d.chunkCount && d.chunkCount > 0)
      .map((d) => d.id),
  )

  async function startAiMode(formId: string) {
    if (aiModeActive.value.has(formId) || readyDocIds.value.length === 0) return

    let formConfig
    try {
      formConfig = await loadForm(formId)
    } catch {
      return
    }

    const questions = flattenFormQuestions(formConfig)
    if (questions.length === 0) return

    // Pre-flight: verify documents are actually in the vector store
    const { missing } = await verifyDocuments(store.sessionId, readyDocIds.value)
    if (missing.length === readyDocIds.value.length) {
      // All documents are missing from the index — stale browser state
      aiModeError.value = { ...aiModeError.value, [formId]: 'documenten_niet_gevonden' }
      return
    }

    delete aiModeError.value[formId]
    aiModeCancelled[formId] = false
    aiModeActive.value = new Set([...aiModeActive.value, formId])
    aiModeProgress.value = { ...aiModeProgress.value, [formId]: { filled: 0, total: questions.length } }
    delete aiModeDone.value[formId]

    const filled = await bulkExtractFromDocument({
      sessionId: store.sessionId,
      docIds: readyDocIds.value,
      questions,
      formContext: formConfig.aiContext,
      onAnswer: (qId, value) => store.setAnswerForForm(formId, qId, value),
      onSources: (qId, meta) => store.setAnswerSourcesForForm(formId, qId, meta),
      onProgress: (f, t) => {
        aiModeProgress.value = { ...aiModeProgress.value, [formId]: { filled: f, total: t } }
      },
      isCancelled: () => aiModeCancelled[formId] === true,
    })

    aiModeActive.value = new Set([...aiModeActive.value].filter((id) => id !== formId))

    if (!aiModeCancelled[formId]) {
      aiModeDone.value = { ...aiModeDone.value, [formId]: filled }
    }
    delete aiModeCancelled[formId]
  }

  function cancelAiMode(formId: string) {
    aiModeCancelled[formId] = true
    aiModeActive.value = new Set([...aiModeActive.value].filter((id) => id !== formId))
    const progress = aiModeProgress.value[formId]
    if (progress && progress.filled > 0) {
      aiModeDone.value = { ...aiModeDone.value, [formId]: progress.filled }
    }
  }

  function dismissAiModeDone(formId: string) {
    const next = { ...aiModeDone.value }
    delete next[formId]
    aiModeDone.value = next
  }

  function dismissAiModeError(formId: string) {
    const next = { ...aiModeError.value }
    delete next[formId]
    aiModeError.value = next
  }

  return {
    aiModeActive,
    aiModeProgress,
    aiModeDone,
    aiModeError,
    readyDocIds,
    startAiMode,
    cancelAiMode,
    dismissAiModeDone,
    dismissAiModeError,
  }
}
