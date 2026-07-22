<template>
  <div v-if="others.length" class="presence-bar" :aria-label="`${others.length} andere bewerker(s) aanwezig`">
    <span
      v-for="u in others"
      :key="u.clientId"
      class="presence-avatar"
      :style="{ backgroundColor: u.color }"
      :title="`${u.name || 'Onbekende gebruiker'} bewerkt dit dossier`"
    >{{ initials(u.name) }}</span>
    <span class="presence-label">bewerkt dit dossier</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePresence } from '../collab/usePresence'
import { toRef } from 'vue'

const props = defineProps<{ dossierId: string | null | undefined }>()
const users = usePresence(toRef(props, 'dossierId'))

// Show collaborators other than this browser tab. Two tabs of the same account
// are distinct clients, so a solo user testing still sees presence work.
const others = computed(() => users.value.filter((u) => !u.isSelf))

function initials(name: string): string {
  // Words that start with a letter, so "Ontwikkelaar (dev)" -> "O", not "O(".
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  if (!words.length) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
</script>

<style scoped>
.presence-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs, 0.25rem);
}

.presence-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 1.75rem;
  block-size: 1.75rem;
  border-radius: 50%;
  color: #fff;
  font-size: 0.7rem;
  font-weight: var(--rvo-font-weight-bold, 700);
  border: 2px solid var(--rvo-color-wit, #fff);
  margin-inline-start: -0.5rem;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.presence-avatar:first-child {
  margin-inline-start: 0;
}

.presence-label {
  margin-inline-start: var(--rvo-space-xs, 0.5rem);
  font-size: var(--rvo-font-size-sm, 0.875rem);
  color: var(--invulhulp-color-text-muted, #6b7280);
  font-style: italic;
}
</style>
