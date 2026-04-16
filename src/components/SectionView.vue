<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 32px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <!-- Section header -->
      <div>
        <p class="rvo-text rvo-text--sm" style="color: #666; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          {{ section.part === 'A' ? 'Deel A – Afweging' : 'Deel B – Implementatie' }}
        </p>
        <h1 class="rvo-heading rvo-heading--xl" style="color: #154273; margin: 0;">
          {{ section.title }}
        </h1>
      </div>

      <!-- Subsections -->
      <div v-for="subsection in section.subsections" :key="subsection.id" class="rvo-layout-column rvo-layout-gap--lg">
        <div>
          <h2 class="rvo-heading rvo-heading--lg" style="color: #333; margin-bottom: 6px;">
            {{ subsection.title }}
          </h2>
          <p v-if="subsection.description" class="rvo-text rvo-text--sm" style="color: #666; margin: 0;">
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
      <div class="rvo-layout-row rvo-layout-gap--md" style="justify-content: space-between; border-top: 1px solid #e0e0e0; padding-top: 24px;">
        <button
          v-if="hasPrev"
          @click="$emit('prev')"
          class="rvo-button rvo-button--secondary-action"
        >
          &larr; Vorige
        </button>
        <div v-else></div>
        <button
          @click="onNext"
          class="rvo-button rvo-button--primary"
        >
          {{ nextLabel }} &rarr;
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
