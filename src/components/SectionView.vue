<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm section-view">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <!-- Section header -->
      <header>
        <p class="rvo-text rvo-text--sm section-view__kicker">
          {{ section.part === 'A' ? 'Deel A – Afweging' : 'Deel B – Implementatie' }}
        </p>
        <h1 class="rvo-heading rvo-heading--xl section-view__title">
          {{ section.title }}
        </h1>
      </header>

      <!-- Subsections -->
      <div v-for="subsection in section.subsections" :key="subsection.id" class="rvo-layout-column rvo-layout-gap--lg">
        <div>
          <h2 class="rvo-heading rvo-heading--lg section-view__subsection-title">
            {{ subsection.title }}
          </h2>
          <p v-if="subsection.description" class="rvo-text rvo-text--sm section-view__subsection-desc">
            {{ subsection.description }}
          </p>
        </div>

        <QuestionItem
          v-for="question in subsection.questions"
          :key="question.id"
          :question="question"
          :modelValue="store.getAnswer(question.id)"
          @update:modelValue="store.setAnswer(question.id, $event)"
        />
      </div>

      <!-- Navigation -->
      <div class="rvo-layout-row rvo-layout-gap--md section-view__nav">
        <button
          v-if="hasPrev"
          @click="$emit('prev')"
          class="rvo-button rvo-button--secondary"
        >
          ← Vorige
        </button>
        <div v-else aria-hidden="true"></div>
        <button
          @click="onNext"
          class="rvo-button rvo-button--primary"
        >
          {{ nextLabel }} →
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Section } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import QuestionItem from './QuestionItem.vue'

const props = defineProps<{
  section: Section
  hasPrev: boolean
  nextLabel?: string
}>()

const emit = defineEmits<{
  next: []
  prev: []
}>()

const store = useAssessmentStore()

const nextLabel = computed(() => props.nextLabel ?? 'Volgende')

function onNext() {
  store.markSectionCompleted(props.section.id)
  emit('next')
}
</script>

<style scoped>
.section-view {
  padding-block: var(--rvo-space-2xl) var(--rvo-space-3xl);
}

.section-view__kicker {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--rvo-space-3xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-view__title {
  color: var(--rvo-color-lintblauw);
  margin: 0;
}

.section-view__subsection-title {
  color: var(--rvo-color-grijs-800);
  margin: 0 0 var(--rvo-space-2xs);
}

.section-view__subsection-desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.section-view__nav {
  justify-content: space-between;
  border-block-start: 1px solid var(--invulhulp-color-border);
  padding-block-start: var(--rvo-space-xl);
}
</style>
