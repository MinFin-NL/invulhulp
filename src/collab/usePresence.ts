import { ref, watch, onUnmounted, type Ref } from 'vue'
import { onPresence, type PresentUser } from './dossierTransport'

/** Reactive roster of collaborators present on a dossier (Yjs awareness).
 *  Re-subscribes when the dossier id changes. */
export function usePresence(dossierId: Ref<string | null | undefined>) {
  const users = ref<PresentUser[]>([])
  let unsub: (() => void) | null = null

  watch(
    dossierId,
    (id) => {
      unsub?.()
      unsub = null
      users.value = []
      if (id) unsub = onPresence(id, (u) => (users.value = u))
    },
    { immediate: true },
  )

  onUnmounted(() => unsub?.())
  return users
}
