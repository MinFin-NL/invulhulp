<template>
  <header ref="headerEl" class="invulhulp-header">
    <div class="invulhulp-header__inner">
      <!-- Top bar: logo + reset button -->
      <div class="invulhulp-header__topbar">
        <button
          type="button"
          @click="goHome"
          class="invulhulp-header__logo-btn"
          aria-label="Ga naar startpagina"
        >
          <div class="invulhulp-header__logo">
            <img class="invulhulp-header__emblem" :src="rijkslogoUrl" alt="" />
            <p class="invulhulp-header__wordmark">Ministerie van&#10;Financiën</p>
          </div>
        </button>
        <div class="invulhulp-header__actions">
          <nldd-button
            v-if="showResetButton"
            variant="inherit-tinted"
            size="sm"
            text="Opnieuw beginnen"
            @click="openResetDialog"
          />
          <nldd-button
            v-if="auth.isAdmin"
            variant="inherit-transparent"
            size="sm"
            :text="auth.userManagementOpen ? 'Terug naar dossiers' : 'Gebruikersbeheer'"
            @click="auth.userManagementOpen = !auth.userManagementOpen"
          />
          <span v-if="auth.isAdmin" class="invulhulp-header__divider" aria-hidden="true" />
          <span v-if="auth.user" class="invulhulp-header__user">
            {{ auth.user.name ?? auth.user.email }}
          </span>
          <nldd-button
            variant="inherit-transparent"
            size="sm"
            start-icon="arrow-right-out-bucket"
            text="Uitloggen"
            @click="auth.logout()"
          />
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
          <nldd-icon name="folder" size="20" />
          {{ store.activeDossier.name }}
        </button>
        <span v-else class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
          <nldd-icon name="folder" size="20" />
          {{ store.activeDossier.name }}
        </span>
        <!-- Lifecycle phase of the open form. Not a link: there is no
             per-phase destination, the phase only exists as a grouping. -->
        <template v-if="activePhaseLabel">
          <span class="invulhulp-header__crumb-sep invulhulp-header__crumb-sep--phase" aria-hidden="true">›</span>
          <span class="invulhulp-header__crumb invulhulp-header__crumb--phase">
            {{ activePhaseLabel }}
          </span>
        </template>
        <template v-if="activeFormTitle">
          <span class="invulhulp-header__crumb-sep" aria-hidden="true">›</span>
          <span class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
            {{ activeFormTitle }}
          </span>
        </template>
        <PresenceBar :dossier-id="store.activeDossierId" class="invulhulp-header__presence" />
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import rijkslogoUrl from '../assets/rijkslogo.svg'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { trackIdFor, trackLabel } from '../utils/tracks'
import ConfirmDialog from './ConfirmDialog.vue'
import PresenceBar from './PresenceBar.vue'

const store = useAssessmentStore()
const auth = useAuthStore()
const availableForms = ref<FormIndexEntry[]>([])
const resetDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const headerEl = ref<HTMLElement | null>(null)

onMounted(async () => {
  availableForms.value = await loadAvailableForms()
})

// The header is not a fixed height: the breadcrumb row wraps, the phase crumb
// drops out below 640px, and the presence bar appears only in a shared dossier.
// The form sidebar sticks right under it, so publish the measured height as a
// custom property instead of letting every consumer hardcode a guess.
let headerObserver: ResizeObserver | null = null

onMounted(() => {
  if (!headerEl.value) return
  headerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the header may grow padding or a border
    // later and the sidebar has to clear all of it.
    const height = entry.target.getBoundingClientRect().height
    document.documentElement.style.setProperty(
      '--invulhulp-header-height',
      `${Math.round(height)}px`,
    )
  })
  headerObserver.observe(headerEl.value)
})

onBeforeUnmount(() => {
  headerObserver?.disconnect()
  headerObserver = null
  document.documentElement.style.removeProperty('--invulhulp-header-height')
})

// Reset applies to a single form, so only offer it while a form is actually
// open — not on the dossier list or dossier detail page, where activeFormId
// can still hold a stale value from the last visited form.
const showResetButton = computed(
  () =>
    store.screen === 'dossier' &&
    !auth.userManagementOpen &&
    store.activeFormId !== null &&
    store.currentView !== 'home',
)

const showBreadcrumb = computed(
  () => store.screen === 'dossier' && !auth.userManagementOpen && store.activeDossier.name !== '',
)

const activeFormTitle = computed(() => {
  if (store.activeFormId === null) return null
  return availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? null
})

const activePhaseLabel = computed(() => {
  if (store.activeFormId === null) return null
  const track = availableForms.value.find((f) => f.id === store.activeFormId)?.track
  // A form with a typo'd track is already surfaced on the dossier page; don't
  // repeat "Niet ingedeeld" in the breadcrumb of every one of its views.
  if (!track || trackIdFor(track, store.activeFormId) === 'onbekend') return null
  return trackLabel(track)
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
  background-color: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
  padding: 0;
  /* Stays put: the form sidebar sticks to the header's underside via
     --invulhulp-header-height, which only lines up if the header itself never
     leaves. Above the AI banner (z-index 20); native <dialog> modals render in
     the top layer and are unaffected by this. */
  position: sticky;
  top: 0;
  z-index: 30;
}

.invulhulp-header__inner {
  max-inline-size: var(--semantics-page-sections-body-max-width, 80rem);
  margin-inline: auto;
  padding-inline: var(--semantics-page-sections-md-margin-inline, var(--primitives-space-16));
}

/* Push the "who's here" avatars to the trailing edge of the breadcrumb row. */
.invulhulp-header__presence {
  margin-inline-start: auto;
}

/* The bar renders on the dark header — lighten its label + avatar rings. */
.invulhulp-header__presence :deep(.presence-label) {
  color: rgba(255, 255, 255, 0.85);
}

.invulhulp-header__presence :deep(.presence-avatar) {
  border-color: var(--semantics-content-accent-color);
}

.invulhulp-header__topbar {
  display: flex;
  gap: var(--primitives-space-16);
  padding-block: var(--primitives-space-12);
  align-items: center;
  justify-content: space-between;
}

.invulhulp-header__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-12);
}

/* The header sits on the accent surface, so its buttons use the inherit-*
   variants: those derive their colours from currentColor rather than the
   default light-surface palette. Nothing here can reach inside their shadow
   roots, which is why the old ghost-button rules are gone. */

.invulhulp-header__divider {
  inline-size: 1px;
  block-size: 1.25rem;
  background: rgb(255 255 255 / 0.25);
}

.invulhulp-header__user {
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
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
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-12);
  text-align: start;
}

/* 1:2 portrait mark — fix the height, let the width follow. */
.invulhulp-header__emblem {
  block-size: 2.75rem;
  inline-size: auto;
}

.invulhulp-header__wordmark {
  margin: 0;
  /* The two-line "Ministerie van / Financiën" arrives as a literal newline. */
  white-space: pre-line;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: var(--primitives-line-height-tight);
  color: var(--semantics-surfaces-base-background-color);
}

.invulhulp-header__breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  border-block-start: 1px solid rgb(255 255 255 / 0.15);
  padding-block: var(--primitives-space-8) var(--primitives-space-12);
}

.invulhulp-header__crumb {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-8);
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  white-space: nowrap;
  padding: var(--primitives-space-2) var(--primitives-space-8);
  border-radius: var(--primitives-corner-radius-md, 4px);
}

.invulhulp-header__crumb--current {
  color: var(--semantics-surfaces-base-background-color);
}

.invulhulp-header__crumb--link {
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 0.75);
  font: inherit;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  cursor: pointer;
  transition: background var(--invulhulp-duration-fast), color var(--invulhulp-duration-fast);
}

.invulhulp-header__crumb--link:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--semantics-surfaces-base-background-color);
}

.invulhulp-header__crumb--link:focus-visible {
  outline: 2px solid var(--semantics-surfaces-base-background-color);
  outline-offset: 2px;
}

.invulhulp-header__crumb-sep {
  color: rgb(255 255 255 / 0.4);
  user-select: none;
}

/* The phase is context, not a destination — quieter than the two crumbs it
   sits between, and the first thing to go when the row gets tight. */
.invulhulp-header__crumb--phase {
  color: rgb(255 255 255 / 0.75);
  font-weight: var(--primitives-font-weight-body-regular);
}

@media (max-width: 640px) {
  .invulhulp-header__crumb--phase,
  .invulhulp-header__crumb-sep--phase {
    display: none;
  }
}
</style>
