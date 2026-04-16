<template>
  <header style="background: #154273; color: white; padding: 0;">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">
      <div class="rvo-layout-row rvo-layout-gap--md" style="padding: 12px 0; align-items: center; justify-content: space-between;">
        <div class="rvo-layout-row rvo-layout-gap--md" style="align-items: center;">
          <div>
            <div style="font-size: 0.75rem; opacity: 0.8; letter-spacing: 0.5px; text-transform: uppercase;">Ministerie van</div>
            <div style="font-weight: bold; font-size: 1rem;">Infrastructuur en Waterstaat</div>
          </div>
          <div style="width: 1px; height: 32px; background: rgba(255,255,255,0.4);"></div>
          <div style="font-weight: 600; font-size: 1rem;">AI Impact Assessment</div>
        </div>
        <button
          v-if="store.currentView !== 'home'"
          @click="confirmReset"
          class="rvo-button rvo-button--secondary-action"
          style="color: white; border-color: rgba(255,255,255,0.6); font-size: 0.875rem; padding: 6px 14px;"
        >
          Opnieuw beginnen
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAssessmentStore } from '../stores/assessmentStore'

const store = useAssessmentStore()

function confirmReset() {
  if (confirm('Weet u zeker dat u opnieuw wilt beginnen? Al uw antwoorden worden gewist.')) {
    store.reset()
  }
}
</script>
