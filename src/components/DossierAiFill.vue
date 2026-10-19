<template>
  <!-- Dossier-brede AI-vulling. Het hele punt van de tool is één knop, niet
       twaalf losse toggles op twaalf kaarten. Alleen nog lege formulieren
       komen in de rij: AI Modus overschrijft velden, dus werk dat er al
       staat blijft hier buiten schot — daarvoor is de toggle op de kaart.
       Staat in Overzicht en in Bronnen; nooit twee tegelijk in beeld. -->
  <section
    v-if="store.canEdit && (dossierAiRun || bulkFillForms.length > 0)"
    class="bulk-ai"
    aria-labelledby="bulk-ai-title"
  >
    <div class="bulk-ai__body">
      <nldd-title size="5"><h2 class="bulk-ai__title" id="bulk-ai-title">
        Vul alle formulieren in met AI
      </h2></nldd-title>
      <nldd-text color="inherit" size="sm" class="bulk-ai__desc" role="status" aria-live="polite">
        <template v-if="dossierAiRun">
          {{ dossierAiRun.formIds.length === 1 ? '1 formulier' : `${dossierAiRun.formIds.length} formulieren tegelijk` }}<template
            v-if="runProgress.total > 0"
          > · {{ runProgress.done }}/{{ runProgress.total }} vragen</template>
        </template>
        <template v-else-if="readyDocIds.length > 0">
          {{ bulkFillForms.length }}
          {{ bulkFillForms.length === 1 ? 'formulier is' : 'formulieren zijn' }} nog leeg.
          AI Modus vult ze tegelijk in op basis van je {{ readyDocIds.length }}
          brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}. Je controleert daarna elk antwoord —
          met bronverwijzing per vraag.
        </template>
        <template v-else>
          Upload eerst een brondocument {{ uploadHere ? 'hierboven' : 'bij Bronnen' }}; daarna kan AI Modus
          {{ bulkFillForms.length === 1 ? 'dit lege formulier' : `deze ${bulkFillForms.length} lege formulieren` }}
          in één keer invullen.
        </template>
      </nldd-text>
      <div v-if="dossierAiRun" class="bulk-ai__bar" aria-hidden="true">
        <div class="bulk-ai__bar-fill" :style="{ inlineSize: `${bulkAiPct}%` }" />
      </div>
    </div>
    <nldd-button
      variant="secondary"
      class="bulk-ai__btn"
      text="Stop"
      v-if="dossierAiRun"
      @click="cancelDossierAiMode()"
    />
    <!-- Buiten Bronnen is uploaden een stap verderop: een knop erheen, geen
         uitgeschakelde startknop zonder uitweg. -->
    <nldd-button
      class="bulk-ai__btn"
      v-else-if="readyDocIds.length === 0 && !uploadHere"
      text="Naar Bronnen"
      :variant="primaryAction === 'upload' ? 'primary' : 'secondary'"
      @click="store.setDossierView('bronnen')"
    />
    <nldd-button
      class="bulk-ai__btn"
      v-else
      :variant="primaryAction === 'bulk-ai' ? 'primary' : 'secondary'"
      :disabled="readyDocIds.length === 0"
      @click="startDossierAiMode(bulkFillForms.map((f) => f.id))"
    >
      <span slot="text">
<span class="bulk-ai__spark" aria-hidden="true">✦</span>
      {{ bulkFillForms.length === 1 ? 'Vul 1 formulier in' : `Vul ${bulkFillForms.length} formulieren in` }}
      </span>
    </nldd-button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import { useDossierForms } from '../composables/useDossierForms'

/** `uploadHere`: the upload card is on the same page (Bronnen). */
defineProps<{ uploadHere?: boolean }>()

const store = useAssessmentStore()
const { aiModeProgress, readyDocIds, dossierAiRun, startDossierAiMode, cancelDossierAiMode } = useAiMode()
const { bulkFillForms, primaryAction } = useDossierForms()

// De formulieren lopen naast elkaar, dus de voortgang is die van alle vragen
// samen. Een formulier dat zijn vragen nog niet kent telt nog niet mee.
const runProgress = computed(() => {
  let done = 0
  let total = 0
  for (const formId of dossierAiRun.value?.formIds ?? []) {
    const p = aiModeProgress.value[formId]
    if (!p) continue
    done += p.done
    total += p.total
  }
  return { done, total }
})

const bulkAiPct = computed(() => {
  const { done, total } = runProgress.value
  return total === 0 ? 0 : Math.round((done / total) * 100)
})
</script>

<style scoped>
/* Draagt bewust de AI-Modus-huisstijl (blauw/paars, buiten het NLDD-palet) die
   AiModeToggle en de bannier ook gebruiken — het is dezelfde functie, dus
   dezelfde taal. Spacing en radii blijven tokens. Bewust bescheiden van maat:
   een aanbod naast de volgende stap, geen tweede hoofdzaak. */
.bulk-ai {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-32);
  padding: var(--primitives-space-16) var(--primitives-space-24);
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.04), rgba(91, 33, 182, 0.06));
  border: 1px solid rgba(91, 33, 182, 0.2);
  border-radius: var(--primitives-corner-radius-md);
}

.bulk-ai__body {
  flex: 1;
  min-inline-size: 16rem;
}

.bulk-ai__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.bulk-ai__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 44rem;
}

.bulk-ai__bar {
  margin-block-start: var(--primitives-space-12);
  block-size: var(--primitives-space-4);
  border-radius: var(--primitives-corner-radius-sm);
  background: rgba(15, 45, 92, 0.12);
  overflow: hidden;
}

.bulk-ai__bar-fill {
  block-size: 100%;
  border-radius: var(--primitives-corner-radius-sm);
  background: linear-gradient(90deg, #0f2d5c, #5b21b6, #0ea5e9);
  transition: inline-size var(--invulhulp-duration-slow) var(--invulhulp-ease);
}

.bulk-ai__btn {
  flex-shrink: 0;
}

.bulk-ai__spark {
  margin-inline-end: var(--primitives-space-4);
}
</style>
