<template>
  <!-- Oriëntatie (werkplan-kompas §4): per formulier of het geldt, waarom, voor
       wie, en wat het ongeveer vraagt. Drie groepen, en "nog onbekend" is er
       een eigen: een vraag die niemand beantwoordde is geen "nee". -->
  <section class="applicability" aria-labelledby="applicability-title">
    <nldd-title size="2"><h2 class="applicability__title" id="applicability-title">
      Wat geldt voor dit project
    </h2></nldd-title>
    <nldd-text size="sm" color="inherit" class="applicability__lead">
      <template v-if="store.kenmerken">
        Volgens de toepassingsscan. Advies, geen juridisch oordeel: leg een "geldt niet" voor
        aan de eigenaar van het formulier.
      </template>
      <template v-else>
        Er is nog geen toepassingsscan gedaan. Formulieren zonder toepassingsregel gelden
        altijd; bij de rest staat welke vraag het beslist.
      </template>
    </nldd-text>

    <div v-for="group in groups" :key="group.id" class="applicability__group">
      <nldd-title size="4"><h3 class="applicability__group-title">
        {{ group.label }} ({{ group.rows.length }})
      </h3></nldd-title>
      <ul class="invulhulp-item-list applicability__list">
        <li
          v-for="row in group.rows"
          :key="row.form.id"
          class="invulhulp-item-list__item applicability__row"
          :class="{ 'applicability__row--nvt': group.id === 'geldt-niet' }"
        >
          <div class="applicability__text">
            <span class="applicability__form">{{ row.form.title }}</span>
            <span v-if="row.form.shortDescription" class="invulhulp-text--sm applicability__desc">
              {{ row.form.shortDescription }}
            </span>
            <dl class="invulhulp-text--sm applicability__facts">
              <div class="applicability__fact">
                <dt>Waarom</dt>
                <dd>{{ row.reason }}</dd>
              </div>
              <div class="applicability__fact">
                <dt>Eigenaar</dt>
                <dd :class="{ 'invulhulp-text--subtle': !row.ownerKnown }">{{ row.owner }}</dd>
              </div>
              <div v-if="row.deciders.length > 0" class="applicability__fact">
                <dt>Beslist door</dt>
                <dd>
                  <template v-for="(decider, i) in row.deciders" :key="deciderKey(decider)">
                    <template v-if="i > 0">, </template>
                    <button
                      type="button"
                      class="invulhulp-linkbutton applicability__decider"
                      @click="openDecider(decider)"
                    >
                      {{ deciderLabel(decider) }}
                    </button>
                  </template>
                </dd>
              </div>
            </dl>
          </div>
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            :text="group.id === 'geldt-niet' ? 'Toch openen' : 'Openen'"
            :accessible-label="`${row.form.title} openen`"
            @click="emit('open', row.form.id)"
          />
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import { OWNER_UNKNOWN, type FormIndexEntry } from '../services/formLoader'
import {
  KENMERK_LABEL,
  decidersFor,
  orientationOf,
  type Decider,
  type Orientation,
} from '../utils/toepassingsscan'

const emit = defineEmits<{ open: [id: string]; scan: [questionId: string]; beslishulp: [] }>()

const store = useAssessmentStore()
const { forms, verdictFor } = useDossierForms()

interface Row {
  form: FormIndexEntry
  reason: string
  owner: string
  ownerKnown: boolean
  deciders: Decider[]
}

const GROUPS: { id: Orientation; label: string }[] = [
  { id: 'geldt', label: 'Geldt' },
  { id: 'onbekend', label: 'Nog onbekend' },
  { id: 'geldt-niet', label: 'Geldt niet' },
]

// Built forms only: an announced placeholder has nothing to fill in yet. In
// registry order, which is the order of the phases.
const groups = computed(() => {
  const rows = new Map<Orientation, Row[]>(GROUPS.map((g) => [g.id, []]))
  for (const form of forms.value) {
    if (form.placeholder) continue
    const verdict = verdictFor(form.id)
    const orientation = orientationOf(verdict.status)
    const ownerKnown = !!form.owner && form.owner !== OWNER_UNKNOWN
    rows.get(orientation)!.push({
      form,
      reason: verdict.reason,
      owner: ownerKnown ? form.owner! : 'nog niet vastgelegd',
      ownerKnown,
      deciders: orientation === 'onbekend' ? decidersFor(form.applicability, store.kenmerken) : [],
    })
  }
  return GROUPS.map((g) => ({ ...g, rows: rows.get(g.id)! })).filter((g) => g.rows.length > 0)
})

function deciderKey(decider: Decider): string {
  return decider.kind === 'scan' ? decider.questionId : decider.kind
}

function deciderLabel(decider: Decider): string {
  return decider.kind === 'scan'
    ? `de scanvraag over ${KENMERK_LABEL[decider.kenmerk]}`
    : 'de Beslishulp AI-verordening'
}

function openDecider(decider: Decider) {
  if (decider.kind === 'scan') emit('scan', decider.questionId)
  else emit('beslishulp')
}
</script>

<style scoped>
.applicability {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

.applicability__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.applicability__lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 60ch;
}

.applicability__group {
  margin-block-start: var(--primitives-space-24);
}

.applicability__group-title {
  margin: 0 0 var(--primitives-space-8);
}

.applicability__list {
  margin: 0;
}

.applicability__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
}

.applicability__text {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
  min-inline-size: 0;
}

.applicability__form {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

/* Same treatment as the n.v.t. group in Formulieren: struck through, but still
   there and still readable — the reason is the point. */
.applicability__row--nvt .applicability__form {
  text-decoration: line-through;
  text-decoration-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
}

.applicability__desc {
  color: var(--invulhulp-color-text-subtle);
}

.applicability__facts {
  margin: var(--primitives-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
}

/* Term and text run on as one sentence ("Waarom: …"), so a long reason wraps
   under its own start instead of dropping below the term. */
.applicability__fact dt,
.applicability__fact dd {
  display: inline;
}

.applicability__fact dt {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

.applicability__fact dt::after {
  content: ': ';
}

.applicability__fact dd {
  margin: 0;
}

.applicability__decider {
  padding: 0;
  font: inherit;
}

/* NLDD's sm breakpoint: the text needs the full width, the button goes under it. */
@media (max-width: 640px) {
  .applicability {
    padding: var(--primitives-space-16);
  }

  .applicability__row {
    flex-direction: column;
    gap: var(--primitives-space-8);
  }
}
</style>
