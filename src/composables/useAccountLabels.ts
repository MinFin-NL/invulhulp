import { computed } from 'vue'
import { useAuthStore } from '../stores/authStore'

/** How the signed-in account is named in the header and its account menu. */
export function useAccountLabels() {
  const auth = useAuthStore()

  const userLabel = computed(() => auth.user?.name ?? auth.user?.email ?? 'Account')

  // The e-mail under the name, unless it already is the name line.
  const userSupportingText = computed(() => {
    const email = auth.user?.email ?? ''
    return email === userLabel.value ? '' : email
  })

  return { userLabel, userSupportingText }
}
