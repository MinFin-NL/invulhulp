<template>
  <!-- Het voorblad: de velden die bijna elk formulier opnieuw vraagt, één keer
       op dossierniveau (werkplan-kompas §5.2). Opgeslagen wordt in het
       formulier waar het veld vandaan komt — het formulier blijft de uitvoer —
       en elk ander formulier dat het vraagt krijgt het als voorstel. Versie,
       datum en status horen per document en staan hier dus niet. -->
  <section class="voorblad" aria-labelledby="voorblad-title">
    <nldd-title size="2"><h2 class="voorblad__title" id="voorblad-title">Voorblad</h2></nldd-title>
    <nldd-text size="sm" color="inherit" class="voorblad__lead">
      Vul deze gegevens één keer in. Elk formulier dat ze vraagt, krijgt ze als voorstel; wat
      daar al staat, blijft staan.
    </nldd-text>

    <div class="voorblad__fields">
      <nldd-form-field v-for="row in rows" :key="row.feit.definitie.id" :label="row.feit.definitie.label">
        <nldd-text-field
          :value="row.tekst"
          :disabled="!store.canEdit"
          @change="save(row.feit, $event.detail.value)"
        />
        <nldd-form-field-help-text>{{ row.help }}</nldd-form-field-help-text>
      </nldd-form-field>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useFeiten } from '../composables/useFeiten'
import { loadFormRegistry } from '../services/formLoader'
import { asAnswerHtml } from '../utils/crossFormCopy'
import { feitTekst, type Feit } from '../facts/resolveFeiten'

const store = useAssessmentStore()
const feiten = useFeiten()

// Titles for the help text; the registry has them without loading every form.
const titles = ref<Map<string, string>>(new Map())
onMounted(async () => {
  titles.value = new Map((await loadFormRegistry()).map((f) => [f.id, f.title]))
})
const title = (formId: string) => titles.value.get(formId) ?? formId

function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}` : names.join('')
}

const rows = computed(() =>
  Object.values(feiten.value)
    .filter((feit) => feit.definitie.soort === 'voorblad')
    .map((feit) => {
      const def = feit.definitie
      const vragen = def.soort === 'voorblad' ? def.vragen : []
      const waar = list([...new Set(vragen.map((v) => title(v.formId)))])
      const bron = feit.herkomst?.soort === 'formulier' ? title(feit.herkomst.formId) : null
      return {
        feit,
        tekst: feitTekst(feit),
        help: bron ? `Uit ${bron}. Komt terug in ${waar}.` : `Nog niet ingevuld. Komt terug in ${waar}.`,
      }
    }),
)

/** Write where the fact comes from now, or else where its chain starts. */
function save(feit: Feit, value: string) {
  const def = feit.definitie
  if (def.soort !== 'voorblad' || !store.canEdit) return
  const text = value.trim()
  if (text === feitTekst(feit)) return
  const target = feit.herkomst?.soort === 'formulier' ? feit.herkomst : def.bronnen[0]
  store.setAnswerForForm(target.formId, target.questionId, text ? asAnswerHtml(text) : '')
}
</script>

<style scoped>
.voorblad {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

.voorblad__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.voorblad__lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--primitives-space-24);
  max-inline-size: 60ch;
}

.voorblad__fields {
  display: grid;
  gap: var(--primitives-space-24);
  max-inline-size: 40rem;
}

@media (max-width: 640px) {
  .voorblad {
    padding: var(--primitives-space-16);
  }
}
</style>
