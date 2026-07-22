import { computed, ref, watch, onUnmounted, type Ref } from 'vue'
import type * as Y from 'yjs'
import { useAssessmentStore } from '../stores/assessmentStore'
import { getProvider, onProviderReady, getLocalUser } from './dossierTransport'

/** Everything a collaborative Tiptap editor needs for one rich-text answer:
 *  the shared fragment to bind to, the live provider (reactive — appears once
 *  connected, for the caret), and the local user's caret label. */
export function useCollab(questionId: Ref<string>) {
  const store = useAssessmentStore()

  // Empty id ⇒ not a rich-text question; return null so we don't create a
  // spurious text fragment (which would mis-type a checkbox/table answer).
  const fragment = computed<Y.XmlFragment | null>(() =>
    questionId.value ? store.textFragmentFor(questionId.value) : null,
  )

  const provider = ref<unknown>(null)
  let unsub: (() => void) | null = null
  watch(
    () => store.activeDossierId,
    (id) => {
      unsub?.()
      unsub = null
      provider.value = id ? getProvider(id) : null
      if (id) unsub = onProviderReady(id, () => (provider.value = getProvider(id)))
    },
    { immediate: true },
  )
  onUnmounted(() => unsub?.())

  const lu = getLocalUser()
  const user = lu ? { name: lu.name, color: lu.color } : { name: 'Gebruiker', color: '#888888' }

  return { fragment, provider, user }
}
