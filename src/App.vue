<template>
  <div class="rvo-theme">
    <AssessmentForm />
  </div>
</template>

<script setup lang="ts">
import AssessmentForm from './components/AssessmentForm.vue'
import { useAssessmentStore } from './stores/assessmentStore'

useAssessmentStore().ensureDossier()
</script>
