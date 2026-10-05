<template>
  <div v-if="others.length" class="presence-bar">
    <!-- color="inherit" fills each avatar from --context-content-color and picks the
         contrasting text colour itself; the group draws the overlap rings. -->
    <nldd-avatar-group size="28" accessible-label="Andere bewerkers">
      <nldd-avatar
        v-for="u in others"
        :key="u.clientId"
        color="inherit"
        :style="{ '--context-content-color': u.color }"
        :name="u.name || 'Onbekende gebruiker'"
        :initials="initials(u.name)"
      />
    </nldd-avatar-group>
    <span class="presence-label">bewerkt dit dossier</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePresence } from '../collab/usePresence'
import { toRef } from 'vue'
import { initials } from '../utils/initials'

const props = defineProps<{ dossierId: string | null | undefined }>()
const users = usePresence(toRef(props, 'dossierId'))

// Show collaborators other than this browser tab. Two tabs of the same account
// are distinct clients, so a solo user testing still sees presence work.
const others = computed(() => users.value.filter((u) => !u.isSelf))
</script>

<style scoped>
.presence-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-4);
}

.presence-label {
  margin-inline-start: var(--primitives-space-8);
  font-size: var(--primitives-font-size-90);
  color: var(--invulhulp-color-text-muted);
  font-style: italic;
}
</style>
