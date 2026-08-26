<template>
  <!-- Eén kaart, of — met iets in de `lead`-slot — het tegel-plus-kaart-paar
       waarmee de beslishulp aan zijn gastformulier vastzit. -->
  <div class="form-slot" :class="{ 'form-slot--paired': paired }">
    <slot name="lead" />

    <!-- Aangekondigd, maar nog niet gebouwd: de tegel staat er wel, de kaart is
         zichtbaar uitgeschakeld. Een gat in de rij zou de fase onvolledig laten
         lijken. -->
    <article
      v-if="form.placeholder"
      class="invulhulp-card form-card form-card--placeholder"
    >
      <div class="form-card__body">
        <nldd-title size="3"><h3 class="form-card__title">{{ form.title }}</h3></nldd-title>
        <ul v-if="form.domains?.length" class="form-card__domains">
          <li v-for="domain in form.domains" :key="domain" class="form-card__domain">
            {{ domainLabel(domain) }}
          </li>
        </ul>
        <nldd-text line-height="snug" color="inherit" size="sm" class="form-card__desc">{{ form.shortDescription }}</nldd-text>
      </div>
      <div class="form-card__actions">
        <nldd-tag
          class="form-card__status"
          size="sm"
          :color="form.placeholder === 'onzeker' ? 'warning' : 'neutral'"
          :text="PLACEHOLDER_LABELS[form.placeholder]"
        />
        <nldd-button
          variant="secondary"
          size="sm"
          class="form-card__btn"
          text="Nog niet beschikbaar"
          disabled
        />
      </div>
    </article>

    <article
      v-else
      class="invulhulp-card form-card"
      :class="{
        'form-card--ai-mode': aiActive,
        'form-card--paired': paired,
      }"
    >
      <div class="form-card__body">
        <nldd-title size="3"><h3 class="form-card__title">{{ form.title }}</h3></nldd-title>
        <ul v-if="form.domains?.length" class="form-card__domains">
          <li v-for="domain in form.domains" :key="domain" class="form-card__domain">
            {{ domainLabel(domain) }}
          </li>
        </ul>
        <nldd-text line-height="snug" color="inherit" size="sm" class="form-card__desc">{{ form.shortDescription }}</nldd-text>
      </div>
      <div class="form-card__actions">
        <!-- The beslishulp verdict, echoed on the card it belongs to. -->
        <nldd-tag
          v-if="beslishulpVerdict"
          class="form-card__status form-card__verdict"
          size="sm"
          :color="verdictColor(beslishulpVerdict.tone)"
          :text="beslishulpVerdict.label"
        />
        <!-- Why this form is here at all, per the toepassingsscan. The reason is
             hidden text rather than only a `title`, which a keyboard or screen
             reader never reaches. -->
        <nldd-tag
          v-if="verdict.status === 'verplicht' || verdict.status === 'mogelijk'"
          class="form-card__status"
          size="sm"
          :color="verdict.status === 'mogelijk' ? 'warning' : 'neutral'"
        >
          {{ applicabilityLabel(verdict.status) }}
          <span class="invulhulp-visually-hidden">: {{ verdict.reason }}</span>
        </nldd-tag>
        <nldd-tag
          v-if="status"
          class="form-card__status"
          size="sm"
          :color="statusColor(status.status)"
          :text="statusLabel(status)"
        />
        <!-- Secundair, bewust. Een fasetijdlijn met twaalf primaire knoppen
             wijst nergens heen; de ene primaire actie van de dossierpagina
             staat bovenaan in de "volgende stap"-band. -->
        <nldd-button
          variant="secondary"
          size="sm"
          class="form-card__btn"
          :text="openLabel"
          @click="emit('open', form.id)"
        />
        <AiModeToggle
          v-if="canEdit"
          :form-id="form.id"
          :has-documents="hasDocuments"
          :is-active="aiActive"
          :is-done="aiDone"
          :done-filled-count="aiDoneFilled"
          :done-total-count="aiDoneTotal"
          :progress="aiProgress"
          :phase="aiPhase"
          :can-undo-smoothing="canUndoSmoothing"
          @activate="emit('activate', $event)"
          @cancel="emit('cancel', $event)"
          @dismiss="emit('dismiss', $event)"
          @undo-smoothing="emit('undoSmoothing', $event)"
        />
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AiModeToggle from './AiModeToggle.vue'
import type { FormIndexEntry, FormPlaceholder } from '../services/formLoader'
import type { FormProgress } from '../utils/formProgress'
import { applicabilityLabel, type ApplicabilityVerdict } from '../utils/toepassingsscan'

/**
 * Eén formulierkaart op de dossierpagina. De kaart is dom: alle oordelen
 * (toepassingsscan, voortgang, AI Modus) worden door DossierDetail berekend en
 * hier alleen getoond, zodat dezelfde kaart in de fasetijdlijn én in de
 * "Vooraf"-band precies dezelfde affordances heeft.
 */
const props = withDefaults(defineProps<{
  form: FormIndexEntry
  /** Voortgang, of null wanneer het formulier (nog) niet geladen is. */
  status?: FormProgress | null
  verdict: ApplicabilityVerdict
  /** Aan de beslishulptegel vastgeplakt: geen ronding op de gedeelde rand. */
  paired?: boolean
  /** Het beslishulpoordeel, alleen op het gastformulier van de beslishulp. */
  beslishulpVerdict?: { label: string; tone: string } | null
  canEdit?: boolean
  hasDocuments?: boolean
  aiActive?: boolean
  aiDone?: boolean
  aiDoneFilled?: number
  aiDoneTotal?: number
  aiProgress?: { filled: number; total: number } | null
  aiPhase?: { current: number; total: number } | null
  canUndoSmoothing?: boolean
}>(), {
  status: null,
  paired: false,
  beslishulpVerdict: null,
  canEdit: false,
  hasDocuments: false,
  aiActive: false,
  aiDone: false,
  aiDoneFilled: 0,
  aiDoneTotal: 0,
  aiProgress: null,
  aiPhase: null,
  canUndoSmoothing: false,
})

const emit = defineEmits<{
  open: [formId: string]
  activate: [formId: string]
  cancel: [formId: string]
  dismiss: [formId: string]
  undoSmoothing: [formId: string]
}>()

const PLACEHOLDER_LABELS: Record<FormPlaceholder, string> = {
  gepland: 'In ontwikkeling',
  onzeker: 'Nog niet besloten',
}

const DOMAIN_LABELS: Record<string, string> = {
  privacy: 'Privacy',
  beveiliging: 'Beveiliging',
  ai: 'AI',
  data: 'Data',
  project: 'Project',
}

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain
}

/** Beslishulp tone / voortgangsstatus -> nldd-tag kleurnaam. Deze kaart
 *  introduceert geen eigen kleuren: alles komt uit de semantische set. */
function verdictColor(tone: string): string {
  switch (tone) {
    case 'success': return 'success'
    case 'warning': return 'warning'
    case 'error': return 'critical'
    default: return 'accent'
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'bezig': return 'accent'
    case 'onvolledig': return 'warning'
    case 'afgerond': return 'success'
    default: return 'neutral'
  }
}

function statusLabel(p: FormProgress): string {
  if (p.status === 'afgerond') return 'Afgerond'
  // Doorgeklikt maar niet ingevuld: zeg hoeveel verplichte vragen nog open
  // staan, zodat "afgerond" alleen op de kaart staat als het waar is.
  if (p.status === 'onvolledig') {
    return p.missingMandatory === 1 ? 'Nog 1 verplichte vraag' : `Nog ${p.missingMandatory} verplichte vragen`
  }
  if (p.status === 'bezig') return `Bezig (${p.completed}/${p.total})`
  return 'Niet gestart'
}

const openLabel = computed(() => {
  if (props.status?.status === 'onvolledig') return 'Afmaken'
  if (props.status?.status === 'bezig') return 'Verder'
  return 'Openen'
})
</script>

<style scoped>
/* One card, or — for the beslishulp host form — the tile-plus-card pair. */
.form-slot {
  display: flex;
  align-items: stretch;
}

.form-card {
  inline-size: 210px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: box-shadow var(--invulhulp-duration-fast), border-color var(--invulhulp-duration-slow);
}

.form-card:hover {
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

/* Fused to the beslishulp tile: no rounding or hairline on the joined edge, so
   the pair reads as a single framed object. */
.form-card--paired {
  border-start-start-radius: 0;
  border-end-start-radius: 0;
  border-inline-start-color: var(--semantics-content-accent-color);
}

.form-slot--paired:hover .form-card--paired {
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

/* Aangekondigd maar nog niet gebouwd: gedempt en met een streepjesrand, zodat
   de kaart op afstand al leest als "hier kan je nog niets". De knop is echt
   `disabled` — de status staat als tekst op de kaart, niet alleen in de kleur. */
.form-card--placeholder {
  border-style: dashed;
  border-color: var(--semantics-content-secondary-color);
  background: var(--semantics-surfaces-tinted-background-color);
  box-shadow: none;
}

.form-card--placeholder:hover {
  box-shadow: none;
}

.form-card--placeholder .form-card__title {
  color: var(--semantics-content-secondary-color);
}

.form-card--placeholder .form-card__btn[disabled] {
  cursor: not-allowed;
}


/* AI Mode active: animated gradient border + pulsing glow */
.form-card--ai-mode {
  border: 2px solid transparent;
  background-image:
    linear-gradient(var(--semantics-surfaces-base-background-color), var(--semantics-surfaces-base-background-color)),
    linear-gradient(135deg, #0f2d5c, #5b21b6, #0ea5e9, #5b21b6, #0f2d5c);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  background-size: 100%, 300% 100%;
  animation: ai-border-shift var(--invulhulp-loop-sheen) var(--invulhulp-ease-linear) infinite,
    ai-card-glow var(--invulhulp-loop-glow) var(--invulhulp-ease-in-out) infinite;
}

@keyframes ai-border-shift {
  0%   { background-position: 0 0, 0% 50%; }
  100% { background-position: 0 0, 200% 50%; }
}

@keyframes ai-card-glow {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(91, 33, 182, 0.2); }
  50%       { box-shadow: 0 0 22px 7px rgba(14, 165, 233, 0.35); }
}

/* Rand en gloed zijn decoratief: de AI-Modus-status blijkt ook uit de
   badge-tekst in de kaartkop. WCAG 2.2.2 — beweging langer dan 5s moet te
   stoppen zijn. De gradiëntrand blijft staan, alleen het schuiven stopt. */
@media (prefers-reduced-motion: reduce) {
  .form-card--ai-mode {
    animation: none;
  }
}

.form-card__body {
  margin-block-end: var(--primitives-space-16);
}

/* Dutch compound nouns ("Toegankelijkheidsverklaring") are wider than the
   210px card, so hyphenate and hard-break rather than overflow the border. */
.form-card__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-8);
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Subject-domain facet: which domains this form touches, independent of the
   lifecycle track it is filed under. */
.form-card__domains {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  list-style: none;
  padding: 0;
  margin: 0 0 var(--primitives-space-8);
}

.form-card__domain {
  font-size: var(--primitives-font-size-70, 0.75rem);
  line-height: 1.4;
  color: var(--invulhulp-color-text-subtle);
  background: var(--semantics-surfaces-tinted-background-color);
  border-radius: var(--primitives-corner-radius-md, 4px);
  padding: 0 var(--primitives-space-4);
  white-space: nowrap;
}

.form-card__desc {
  color: var(--invulhulp-color-text-subtle);
  overflow-wrap: break-word;
  hyphens: auto;
}

.form-card__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--primitives-space-8);
}

.form-card__btn {
  align-self: flex-start;
}
</style>
