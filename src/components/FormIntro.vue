<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm form-intro">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <header>
        <h1 class="rvo-heading rvo-heading--2xl form-intro__title">{{ formConfig.title }}</h1>
        <p class="rvo-text rvo-text--lg form-intro__subtitle">
          Versie {{ formConfig.version }} — Ministerie van Financiën
        </p>
      </header>

      <div class="rvo-alert rvo-alert--info rvo-alert--padding-md">
        <div class="rvo-alert__container">
          <strong>Let op:</strong> {{ content.notice }}
        </div>
      </div>

      <section class="rvo-layout-column rvo-layout-gap--md">
        <h2 class="rvo-heading rvo-heading--xl form-intro__section-title">Over dit instrument</h2>
        <p class="rvo-text">{{ content.description }}</p>
        <p v-if="content.steps.length > 0" class="rvo-text">Dit formulier omvat de volgende onderdelen:</p>
        <ul v-if="content.steps.length > 0" class="rvo-ul">
          <li v-for="step in content.steps" :key="step">{{ step }}</li>
        </ul>
      </section>

      <section class="rvo-layout-column rvo-layout-gap--sm">
        <h2 class="rvo-heading rvo-heading--xl form-intro__section-title">Kleurcodering vragen</h2>
        <ul class="form-intro__legend">
          <li class="form-intro__legend-item">
            <span class="form-intro__legend-swatch form-intro__legend-swatch--mandatory" aria-hidden="true"></span>
            <span class="rvo-text"><strong>Blauw – verplicht:</strong> moet altijd worden ingevuld</span>
          </li>
          <li class="form-intro__legend-item">
            <span class="form-intro__legend-swatch form-intro__legend-swatch--optional" aria-hidden="true"></span>
            <span class="rvo-text"><strong>Groen – aanvullend:</strong> invullen indien van toepassing</span>
          </li>
        </ul>
      </section>

      <div>
        <button @click="$emit('start')" class="rvo-button rvo-button--primary form-intro__cta">
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

<style scoped>
.form-intro {
  padding-block: var(--rvo-space-3xl) var(--rvo-space-3xl);
}

.form-intro__title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-xs);
}

.form-intro__subtitle {
  color: var(--invulhulp-color-text-muted);
  margin: 0;
}

.form-intro__section-title {
  color: var(--rvo-color-lintblauw);
}

.form-intro__legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: var(--rvo-space-md);
  flex-wrap: wrap;
}

.form-intro__legend-item {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
}

.form-intro__legend-swatch {
  inline-size: 16px;
  block-size: 16px;
  border-radius: var(--rvo-border-radius-sm);
  flex-shrink: 0;
}

.form-intro__legend-swatch--mandatory {
  background: var(--invulhulp-color-mandatory);
}

.form-intro__legend-swatch--optional {
  background: var(--invulhulp-color-optional);
}

.form-intro__cta {
  font-size: var(--rvo-font-size-lg);
  padding-block: var(--rvo-space-sm);
  padding-inline: var(--rvo-space-2xl);
}
</style>
