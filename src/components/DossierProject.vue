<template>
  <!-- Project: wat weten we over het project? Nu de toepassingsscan; hier komen
       later het systeemprofiel (feiten met herkomst) en het gesprek bij. -->
  <div class="dossier-view">
    <ToepassingsscanTile
      :run="store.toepassingsscanRun"
      :kenmerken="store.kenmerken"
      :counts="scanCounts"
      @open="$emit('scan')"
    />
  </div>
</template>

<script setup lang="ts">
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import ToepassingsscanTile from './ToepassingsscanTile.vue'

defineEmits<{ scan: [] }>()

const store = useAssessmentStore()
const { scanCounts } = useDossierForms()
</script>
