<template>
  <header data-rvo-on-dark class="invulhulp-header">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">
      <!-- Top bar: logo + reset button -->
      <div class="rvo-layout-row rvo-layout-gap--md invulhulp-header__topbar">
        <button
          type="button"
          @click="store.goToPortal()"
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
          <span v-if="auth.user" class="invulhulp-header__user">
            {{ auth.user.name ?? auth.user.email }}
          </span>
          <button
            @click="auth.logout()"
            class="rvo-button rvo-button--secondary rvo-button--size-sm invulhulp-header__logout"
          >
            <span class="invulhulp-header__logout-icon" aria-hidden="true" />
            Uitloggen
          </button>
        </div>
      </div>

      <!-- Grouped form tabs with track labels and sequence arrows -->
      <nav class="invulhulp-header__tab-bar" aria-label="Formulieren">
        <div v-for="(group, gIdx) in trackGroups" :key="group.track" class="invulhulp-header__tab-group">
          <div v-if="gIdx > 0" class="invulhulp-header__tab-divider" aria-hidden="true" />
          <div class="invulhulp-header__tab-group-inner">
            <h2 class="invulhulp-header__track-label">{{ group.label }}</h2>
            <ul class="rvo-tabs invulhulp-header__tabs">
              <template v-for="(form, idx) in group.forms" :key="form.id">
                <li v-if="idx > 0" class="invulhulp-header__tab-arrow" aria-hidden="true">
                  {{ group.track === 'assessment' ? '↔' : '→' }}
                </li>
                <li class="rvo-tabs__item">
                  <button
                    type="button"
                    class="rvo-tabs__item-link"
                    :class="{ 'rvo-tabs__item-link--active': store.activeFormId === form.id }"
                    :aria-current="store.activeFormId === form.id ? 'page' : undefined"
                    @click="switchTo(form.id)"
                  >
                    {{ form.title }}
                  </button>
                </li>
              </template>
            </ul>
          </div>
        </div>
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
import type { FormId } from '../stores/assessmentStore'
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

const TRACK_META: Record<string, { label: string; order: number }> = {
  project: { label: 'Projectspoor', order: 1 },
  privacy: { label: 'Privacyspoor', order: 2 },
  assessment: { label: 'Assessments', order: 3 },
}

const trackGroups = computed(() => {
  const byTrack: Record<string, FormIndexEntry[]> = {}
  for (const form of availableForms.value) {
    const t = form.track ?? 'assessment'
    if (!byTrack[t]) byTrack[t] = []
    byTrack[t].push(form)
  }
  return Object.entries(byTrack)
    .sort(([a], [b]) => (TRACK_META[a]?.order ?? 99) - (TRACK_META[b]?.order ?? 99))
    .map(([track, forms]) => ({
      track,
      label: TRACK_META[track]?.label ?? track,
      forms: [...forms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))
})

const resetTitle = computed(() => {
  const label = availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? 'dit formulier'
  return `"${label}" opnieuw beginnen?`
})

function switchTo(id: FormId) {
  store.setActiveForm(id)
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

.invulhulp-header__tab-bar {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--rvo-space-md) var(--rvo-space-lg);
  border-block-start: 1px solid rgb(255 255 255 / 0.15);
  padding-block: var(--rvo-space-sm) var(--rvo-space-md);
}

.invulhulp-header__tab-group {
  display: flex;
  align-items: stretch;
}

.invulhulp-header__tab-divider {
  inline-size: 1px;
  background: rgb(255 255 255 / 0.2);
  margin-block: var(--rvo-space-xs) 0;
  margin-inline-end: var(--rvo-space-sm);
  flex-shrink: 0;
}

.invulhulp-header__tab-group-inner {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
  min-inline-size: 0;
}

.invulhulp-header__track-label {
  font-size: var(--rvo-font-size-2xs);
  font-weight: var(--rvo-font-weight-semibold);
  color: rgb(255 255 255 / 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
  padding-inline-start: var(--rvo-space-2xs);
}

.invulhulp-header__tabs {
  list-style: none;
  margin: 0;
  padding: var(--rvo-space-3xs);
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--rvo-space-3xs);
  background: rgb(255 255 255 / 0.08);
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 999px;
}

.invulhulp-header__tab-arrow {
  color: rgb(255 255 255 / 0.4);
  font-size: var(--rvo-font-size-sm);
  padding-inline: var(--rvo-space-3xs);
  user-select: none;
  flex-shrink: 0;
  list-style: none;
  display: inline-flex;
  align-items: center;
}
.invulhulp-header__tab-arrow::before {
  display: none;
}

/* Pill chips on the dark header */
.invulhulp-header__tabs :deep(.rvo-tabs__item) {
  list-style: none;
  display: inline-flex;
}
.invulhulp-header__tabs :deep(.rvo-tabs__item)::before {
  display: none;
}

/* Pill chip buttons — all colour rules use !important to beat both the
   browser UA stylesheet (ButtonText) and the @media ≥600px rvo-tabs rules */
.invulhulp-header__tabs :deep(.rvo-tabs__item-link) {
  display: inline-flex;
  align-items: center;
  border: 0 !important;
  background: transparent !important;
  color: rgb(255 255 255 / 0.82) !important;
  cursor: pointer;
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  white-space: nowrap;
  padding: var(--rvo-space-2xs) var(--rvo-space-md);
  border-radius: 999px;
  margin-block-end: 0 !important;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.invulhulp-header__tabs :deep(.rvo-tabs__item-link:hover) {
  background: rgb(255 255 255 / 0.12) !important;
  color: var(--rvo-color-wit) !important;
}

.invulhulp-header__tabs :deep(.rvo-tabs__item-link:focus-visible) {
  outline: 2px solid var(--rvo-color-wit);
  outline-offset: 2px;
}

.invulhulp-header__tabs :deep(.rvo-tabs__item-link--active) {
  background: var(--rvo-color-wit) !important;
  color: var(--rvo-color-lintblauw) !important;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
}
</style>
