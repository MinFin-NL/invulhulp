<template>
  <header data-rvo-on-dark class="invulhulp-header">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">
      <!-- Top bar: logo + reset button -->
      <div class="rvo-layout-row rvo-layout-gap--md invulhulp-header__topbar">
        <button
          type="button"
          @click="goHome"
          class="invulhulp-header__logo-btn"
          aria-label="Ga naar startpagina"
        >
          <div class="rvo-logo invulhulp-header__logo">
            <img class="rvo-logo__emblem" :src="emblemUrl" alt="" />
            <div class="rvo-logo__wordmark">
              <p class="rvo-logo__title">Ministerie van&#10;Financiën</p>
            </div>
          </div>
        </button>
        <div class="invulhulp-header__actions">
          <button
            v-if="store.activeFormId !== null && store.currentView !== 'home'"
            @click="openResetDialog"
            class="rvo-button rvo-button--secondary rvo-button--size-sm"
          >
            Opnieuw beginnen
          </button>
          <button
            v-if="auth.isAdmin"
            @click="auth.userManagementOpen = !auth.userManagementOpen"
            class="invulhulp-header__ghost-btn"
            :aria-pressed="auth.userManagementOpen"
          >
            {{ auth.userManagementOpen ? 'Terug naar dossiers' : 'Gebruikersbeheer' }}
          </button>
          <span v-if="auth.isAdmin" class="invulhulp-header__divider" aria-hidden="true" />
          <span v-if="auth.user" class="invulhulp-header__user">
            {{ auth.user.name ?? auth.user.email }}
          </span>
          <button
            @click="auth.logout()"
            class="invulhulp-header__ghost-btn invulhulp-header__logout"
          >
            <span class="invulhulp-header__logout-icon" aria-hidden="true" />
            Uitloggen
          </button>
        </div>
      </div>

      <!-- Breadcrumb: dossier › formulier -->
      <nav v-if="showBreadcrumb" class="invulhulp-header__breadcrumb" aria-label="Kruimelpad">
        <button
          v-if="store.activeFormId !== null"
          type="button"
          class="invulhulp-header__crumb invulhulp-header__crumb--link"
          @click="store.goToPortal()"
        >
          <span class="invulhulp-header__crumb-icon" aria-hidden="true" />
          {{ store.activeDossier.name }}
        </button>
        <span v-else class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
          <span class="invulhulp-header__crumb-icon" aria-hidden="true" />
          {{ store.activeDossier.name }}
        </span>
        <template v-if="activeFormTitle">
          <span class="invulhulp-header__crumb-sep" aria-hidden="true">›</span>
          <span class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
            {{ activeFormTitle }}
          </span>
        </template>
      </nav>
    </div>
  </header>

  <ConfirmDialog
    ref="resetDialog"
    :title="resetTitle"
    :message="`Al uw antwoorden in dit formulier worden gewist.`"
    confirm-label="Opnieuw beginnen"
    cancel-label="Annuleren"
    variant="warning"
    @confirm="store.resetActive()"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import emblemUrl from '@nl-rvo/assets/images/emblem.svg'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useAssessmentStore()
const auth = useAuthStore()
const availableForms = ref<FormIndexEntry[]>([])
const resetDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

onMounted(async () => {
  availableForms.value = await loadAvailableForms()
})

const showBreadcrumb = computed(
  () => store.screen === 'dossier' && !auth.userManagementOpen && store.activeDossier.name !== '',
)

const activeFormTitle = computed(() => {
  if (store.activeFormId === null) return null
  return availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? null
})

const resetTitle = computed(() => {
  const label = availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? 'dit formulier'
  return `"${label}" opnieuw beginnen?`
})

function goHome() {
  auth.userManagementOpen = false
  store.goToDossierList()
}

function openResetDialog() {
  resetDialog.value?.open()
}
</script>

<style scoped>
.invulhulp-header {
  background-color: var(--rvo-color-lintblauw);
  color: var(--rvo-color-wit);
  padding: 0;
}

.invulhulp-header__topbar {
  padding-block: var(--rvo-space-sm);
  align-items: center;
  justify-content: space-between;
}

.invulhulp-header__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-sm);
}

/* Ghost-style buttons for secondary header actions (gebruikersbeheer, uitloggen):
   plain translucent text like the user-name label and tab links, instead of a
   bordered rvo-button that reads as the primary action on the dark header. */
.invulhulp-header__ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 0.75);
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  white-space: nowrap;
  padding: var(--rvo-space-3xs) var(--rvo-space-xs);
  border-radius: var(--rvo-radius-md, 4px);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.invulhulp-header__ghost-btn:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--rvo-color-wit);
}

.invulhulp-header__ghost-btn:focus-visible {
  outline: 2px solid var(--rvo-color-wit);
  outline-offset: 2px;
}

.invulhulp-header__logout {
  gap: var(--rvo-space-xs);
}

/* Mirror the "inloggen" glyph so the arrow points out the door = uitloggen.
   The mask URL is a static stylesheet reference so Vite resolves and encodes
   the NL Design System icon correctly in the production build (a runtime
   `url(${dataUri})` breaks once Vite inlines the SVG). */
.invulhulp-header__logout-icon {
  display: inline-block;
  inline-size: 1.125rem;
  block-size: 1.125rem;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: url('@nl-rvo/assets/icons/functioneel/inloggen.svg') center / contain no-repeat;
  mask: url('@nl-rvo/assets/icons/functioneel/inloggen.svg') center / contain no-repeat;
  transform: scaleX(-1);
}

.invulhulp-header__divider {
  inline-size: 1px;
  block-size: 1.25rem;
  background: rgb(255 255 255 / 0.25);
}

.invulhulp-header__user {
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  color: rgb(255 255 255 / 0.9);
  white-space: nowrap;
}

.invulhulp-header__logo-btn {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

.invulhulp-header__logo {
  --rvo-logo-color: var(--rvo-color-wit);
  --rvo-logo-font-family: inherit;
  --rvo-logo-font-weight: bold;
}

.invulhulp-header__breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--rvo-space-2xs);
  border-block-start: 1px solid rgb(255 255 255 / 0.15);
  padding-block: var(--rvo-space-xs) var(--rvo-space-sm);
}

.invulhulp-header__crumb {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  white-space: nowrap;
  padding: var(--rvo-space-3xs) var(--rvo-space-xs);
  border-radius: var(--rvo-radius-md, 4px);
}

.invulhulp-header__crumb--current {
  color: var(--rvo-color-wit);
}

.invulhulp-header__crumb--link {
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 0.75);
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.invulhulp-header__crumb--link:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--rvo-color-wit);
}

.invulhulp-header__crumb--link:focus-visible {
  outline: 2px solid var(--rvo-color-wit);
  outline-offset: 2px;
}

/* Static mask URL so Vite resolves the NLDS icon in the production build —
   a runtime url(...) binding renders as a white square. */
.invulhulp-header__crumb-icon {
  display: inline-block;
  inline-size: 1.125rem;
  block-size: 1.125rem;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: url('@nl-rvo/assets/icons/op-kantoor/map-vol-documenten.svg') center / contain no-repeat;
  mask: url('@nl-rvo/assets/icons/op-kantoor/map-vol-documenten.svg') center / contain no-repeat;
}

.invulhulp-header__crumb-sep {
  color: rgb(255 255 255 / 0.4);
  user-select: none;
}
</style>
