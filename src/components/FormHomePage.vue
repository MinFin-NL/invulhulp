<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 48px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <h1 class="rvo-heading rvo-heading--2xl" style="color: #154273; margin-bottom: 8px;">
          {{ formConfig.title }}
        </h1>
        <p class="rvo-text rvo-text--lg" style="color: #555; margin: 0;">
          Versie {{ formConfig.version }} — Ministerie van Financiën
        </p>
      </div>

      <div class="rvo-alert rvo-alert--info" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Let op:</strong> {{ content.notice }}
        </div>
      </div>

      <div class="rvo-layout-column rvo-layout-gap--md">
        <h2 class="rvo-heading rvo-heading--xl" style="color: #154273;">Over dit instrument</h2>
        <p class="rvo-text">{{ content.description }}</p>
        <p class="rvo-text">Dit formulier omvat de volgende onderdelen:</p>
        <ul class="rvo-ul">
          <li v-for="step in content.steps" :key="step">{{ step }}</li>
        </ul>
      </div>

      <div class="rvo-layout-column rvo-layout-gap--sm">
        <h2 class="rvo-heading rvo-heading--xl" style="color: #154273;">Kleurcodering vragen</h2>
        <div class="rvo-layout-row rvo-layout-gap--md" style="flex-wrap: wrap;">
          <div class="rvo-layout-row rvo-layout-gap--sm" style="align-items: center;">
            <div style="width: 16px; height: 16px; background: #0070bb; border-radius: 2px; flex-shrink: 0;"></div>
            <span class="rvo-text"><strong>Blauw – verplicht:</strong> moet altijd worden ingevuld</span>
          </div>
          <div class="rvo-layout-row rvo-layout-gap--sm" style="align-items: center;">
            <div style="width: 16px; height: 16px; background: #39870c; border-radius: 2px; flex-shrink: 0;"></div>
            <span class="rvo-text"><strong>Groen – aanvullend:</strong> invullen indien van toepassing</span>
          </div>
        </div>
      </div>

      <div>
        <button @click="$emit('start')" class="rvo-button rvo-button--primary" style="font-size: 1.1rem; padding: 12px 32px;">
          {{ content.buttonLabel }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FormConfig, FormHomeContent } from '../models/Assessment'

const props = defineProps<{ formConfig: FormConfig }>()
defineEmits<{ start: [] }>()

const FALLBACK: FormHomeContent = {
  notice: 'Dit is een digitale hulptool. Het invullen vervangt niet het advies van relevante experts.',
  description: 'Vul de vragen in om het formulier te voltooien.',
  steps: [],
  buttonLabel: 'Starten',
}

const content = computed(() => props.formConfig.meta.homeContent ?? FALLBACK)
</script>
