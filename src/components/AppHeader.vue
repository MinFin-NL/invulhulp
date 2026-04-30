<template>
  <header style="background: #154273; color: white; padding: 0;">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">
      <!-- Top bar: logo + reset button -->
      <div class="rvo-layout-row rvo-layout-gap--md" style="padding: 12px 0; align-items: center; justify-content: space-between;">
        <button @click="store.goToPortal()" class="logo-btn">
          <div class="rvo-logo" style="--rvo-logo-color: white; --rvo-logo-font-family: inherit; --rvo-logo-font-weight: bold;">
            <img class="rvo-logo__emblem" :src="emblemUrl" alt="" />
            <div class="rvo-logo__wordmark">
              <p class="rvo-logo__title">Ministerie van&#10;Financiën</p>
            </div>
          </div>
        </button>
        <button
          v-if="store.activeFormId !== null && store.currentView !== 'home'"
          @click="confirmReset"
          class="rvo-button rvo-button--secondary-action"
          style="color: white; border-color: rgba(255,255,255,0.6); font-size: 0.875rem; padding: 6px 14px;"
        >
          Opnieuw beginnen
        </button>
      </div>

      <!-- Grouped form tabs with track labels and sequence arrows -->
      <div class="tab-bar">
        <div v-for="(group, gIdx) in trackGroups" :key="group.track" class="tab-group">
          <div v-if="gIdx > 0" class="tab-group-divider" />
          <div class="tab-group-inner">
            <div class="track-label">{{ group.label }}</div>
            <div class="tab-row">
              <template v-for="(form, idx) in group.forms" :key="form.id">
                <span v-if="idx > 0" class="tab-arrow">{{ group.track === 'assessment' ? '↔' : '→' }}</span>
                <button :style="tabStyle(store.activeFormId === form.id)" @click="switchTo(form.id)">
                  {{ form.title }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import emblemUrl from '@nl-rvo/assets/images/emblem.svg'
import type { FormId } from '../stores/assessmentStore'
import { useAssessmentStore } from '../stores/assessmentStore'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'

const store = useAssessmentStore()
const availableForms = ref<FormIndexEntry[]>([])

onMounted(async () => {
  availableForms.value = await loadAvailableForms()
})

const TRACK_META: Record<string, { label: string; order: number }> = {
  project:    { label: 'Projectspoor',  order: 1 },
  privacy:    { label: 'Privacyspoor',  order: 2 },
  assessment: { label: 'Assessments',   order: 3 },
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

function tabStyle(active: boolean) {
  return {
    background: 'transparent',
    border: 'none',
    color: active ? 'white' : 'rgba(255,255,255,0.65)',
    fontWeight: active ? '600' : '400',
    fontSize: '0.9rem',
    padding: '10px 16px',
    cursor: 'pointer',
    borderBottom: active ? '3px solid white' : '3px solid transparent',
    marginBottom: '-1px',
    transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap',
  }
}

function switchTo(id: FormId) {
  store.setActiveForm(id)
}

function confirmReset() {
  const label = availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? store.activeFormId
  if (confirm(`Weet u zeker dat u "${label}" opnieuw wilt beginnen? Al uw antwoorden worden gewist.`)) {
    store.resetActive()
  }
}
</script>

<style scoped>
.logo-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

.tab-bar {
  display: flex;
  align-items: stretch;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 0 -16px;
  padding: 0 16px;
  overflow-x: auto;
}

.tab-group {
  display: flex;
  align-items: stretch;
}

.tab-group-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.25);
  margin: 8px 8px 0;
  flex-shrink: 0;
}

.tab-group-inner {
  display: flex;
  flex-direction: column;
}

.track-label {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 6px 16px 0;
}

.tab-row {
  display: flex;
  align-items: center;
}

.tab-arrow {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.75rem;
  padding: 0 2px;
  user-select: none;
  flex-shrink: 0;
}
</style>
