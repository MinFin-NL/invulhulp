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
        <!-- One element inside the container: rvo-alert lays its children out in a row. -->
        <div class="rvo-alert__container">
          <div><strong>Let op:</strong> {{ content.notice }}</div>
        </div>
      </div>

      <section class="rvo-layout-column rvo-layout-gap--md">
        <h2 class="rvo-heading rvo-heading--xl form-intro__section-title">Over dit instrument</h2>
        <p class="rvo-text">{{ content.description }}</p>
        <p v-if="content.steps.length > 0" class="rvo-text">Dit formulier omvat de volgende onderdelen:</p>
        <ul v-if="content.steps.length > 0" class="rvo-ul">
          <li v-for="step in content.steps" :key="step">{{ step }}</li>
        </ul>

        <!-- Stable identifier of this form definition, in the shape the MinBZK
             task-registry uses. Shown so a filled-in form can be referred to
             unambiguously in registers, audits and correspondence. -->
        <dl v-if="formConfig.urn" class="rvo-data-list form-intro__urn">
          <dt>Identificatie van dit formulier</dt>
          <dd><code class="form-intro__urn-value">{{ formConfig.urn }}</code></dd>
          <template v-if="formConfig.registryUrn">
            <dt>Instrument in het task-registry (MinBZK)</dt>
            <dd><code class="form-intro__urn-value">{{ formConfig.registryUrn }}</code></dd>
          </template>
        </dl>
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

      <div class="form-intro__actions">
        <nldd-button
          variant="primary"
          class="form-intro__cta"
          :text="content.buttonLabel"
          @click="$emit('start')"
        />

        <div class="form-intro__ai-mode">
          <AiModeToggle
            :form-id="formConfig.id"
            :has-documents="readyDocIds.length > 0"
            :is-active="aiModeActive.has(formConfig.id)"
            :is-done="formConfig.id in aiModeDone"
            :done-filled-count="aiModeDone[formConfig.id] ?? 0"
            :done-total-count="aiModeTotal[formConfig.id] ?? 0"
            :progress="aiModeProgress[formConfig.id] ?? null"
            :phase="aiModePhase[formConfig.id] ?? null"
            :can-undo-smoothing="hasSmoothingUndo(formConfig.id)"
            @activate="startAiMode"
            @cancel="cancelAiMode"
            @dismiss="dismissAiModeDone"
            @undo-smoothing="undoSmoothing"
          />
          <p class="rvo-text rvo-text--sm form-intro__ai-hint">
            <template v-if="readyDocIds.length > 0">
              Vul alle vragen automatisch in op basis van je {{ readyDocIds.length }} brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}.
            </template>
            <template v-else>
              Upload brondocumenten om AI Modus te gebruiken.
            </template>
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FormConfig, FormHomeContent } from '../models/Assessment'
import { useAiMode } from '../composables/useAiMode'
import AiModeToggle from './AiModeToggle.vue'

const props = defineProps<{ formConfig: FormConfig }>()
defineEmits<{ start: [] }>()

const FALLBACK: FormHomeContent = {
  notice: 'Dit is een digitale hulptool. Het invullen vervangt niet het advies van relevante experts.',
  description: 'Vul de vragen in om het formulier te voltooien.',
  steps: [],
  buttonLabel: 'Starten',
}

const content = computed(() => props.formConfig.meta.homeContent ?? FALLBACK)

const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, aiModePhase, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, hasSmoothingUndo, undoSmoothing } = useAiMode()
</script>

<style scoped>
.form-intro {
  padding-block: var(--primitives-space-48) var(--primitives-space-48);
}

.form-intro__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-8);
}

.form-intro__subtitle {
  color: var(--invulhulp-color-text-muted);
  margin: 0;
}

.form-intro__section-title {
  color: var(--semantics-content-accent-color);
}

/* rvo-data-list levert de dt/dd-opmaak; alleen de omlijsting en de
   monospace-weergave van de URN zelf zijn van ons. */
.form-intro__urn {
  padding: var(--primitives-space-16) var(--primitives-space-24);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-md);
}

.form-intro__urn-value {
  font-family: monospace;
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-color);
  overflow-wrap: anywhere;
}

.form-intro__legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

.form-intro__legend-item {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
}

.form-intro__legend-swatch {
  inline-size: 16px;
  block-size: 16px;
  border-radius: var(--primitives-corner-radius-sm);
  flex-shrink: 0;
}

.form-intro__legend-swatch--mandatory {
  background: var(--invulhulp-color-mandatory);
}

.form-intro__legend-swatch--optional {
  background: var(--invulhulp-color-optional);
}

.form-intro__actions {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-24);
}

.form-intro__cta {
  font-size: var(--primitives-font-size-200);
  padding-block: var(--primitives-space-12);
  padding-inline: var(--primitives-space-40);
  align-self: flex-start;
}

.form-intro__ai-mode {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
  padding: var(--primitives-space-16) var(--primitives-space-24);
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.04), rgba(91, 33, 182, 0.06));
  border: 1px solid rgba(91, 33, 182, 0.2);
  border-radius: var(--primitives-corner-radius-md);
  align-self: flex-start;
}

.form-intro__ai-hint {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
}
</style>
