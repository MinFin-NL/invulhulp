import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { resolveFeiten } from '../facts/resolveFeiten'

/** The active dossier's facts, live: every answer or scan change re-derives them. */
export function useFeiten() {
  const store = useAssessmentStore()
  return computed(() => resolveFeiten({ forms: store.activeDossier.forms, kenmerken: store.kenmerken }))
}
