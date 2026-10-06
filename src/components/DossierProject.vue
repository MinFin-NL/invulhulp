<template>
  <!-- Project: wat weten we over het project? De toepassingsscan en het
       voorblad; hier komen later het systeemprofiel en het gesprek bij. -->
  <div class="dossier-view">
    <ToepassingsscanTile
      :run="store.toepassingsscanRun"
      :kenmerken="store.kenmerken"
      :counts="scanCounts"
      @open="$emit('scan')"
    />
    <DossierVoorblad />
  </div>
</template>

<script setup lang="ts">
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import ToepassingsscanTile from './ToepassingsscanTile.vue'
import DossierVoorblad from './DossierVoorblad.vue'

defineEmits<{ scan: [] }>()

const store = useAssessmentStore()
const { scanCounts } = useDossierForms()
</script>
