<template>
  <header style="background: #154273; color: white; padding: 0;">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">
      <!-- Top bar: logo + reset button -->
      <div class="rvo-layout-row rvo-layout-gap--md" style="padding: 12px 0; align-items: center; justify-content: space-between;">
        <a href="#" class="rvo-header__logo-link">
          <div class="rvo-logo" style="--rvo-logo-color: white; --rvo-logo-font-family: inherit; --rvo-logo-font-weight: bold;">
            <img class="rvo-logo__emblem" :src="emblemUrl" alt="" />
            <div class="rvo-logo__wordmark">
              <p class="rvo-logo__title">Ministerie van&#10;Financiën</p>
            </div>
          </div>
        </a>
        <button
          v-if="store.currentView !== 'home'"
          @click="confirmReset"
          class="rvo-button rvo-button--secondary-action"
          style="color: white; border-color: rgba(255,255,255,0.6); font-size: 0.875rem; padding: 6px 14px;"
        >
          Opnieuw beginnen
        </button>
      </div>

      <!-- Assessment type tabs -->
      <div style="display: flex; border-top: 1px solid rgba(255,255,255,0.2); margin: 0 -16px; padding: 0 16px;">
        <button
          @click="switchTo('aiia')"
          :style="tabStyle(store.activeFormId === 'aiia')"
        >
          AI Impact Assessment
        </button>
        <button
          @click="switchTo('dpia')"
          :style="tabStyle(store.activeFormId === 'dpia')"
        >
          DPIA
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import emblemUrl from '@nl-rvo/assets/images/emblem.svg'
import type { FormId } from '../stores/assessmentStore'
import { useAssessmentStore } from '../stores/assessmentStore'

const store = useAssessmentStore()

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
  }
}

function switchTo(id: FormId) {
  store.setActiveForm(id)
}

function confirmReset() {
  const label = store.activeFormId === 'dpia' ? 'DPIA' : 'AI Impact Assessment'
  if (confirm(`Weet u zeker dat u de ${label} opnieuw wilt beginnen? Al uw antwoorden worden gewist.`)) {
    store.resetActive()
  }
}
</script>
