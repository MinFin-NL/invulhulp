<template>
  <div v-if="hasContent" class="ontology">
    <button
      type="button"
      class="ontology-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="ontology-toggle-icon" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
      Wat zit er in dit document?
    </button>

    <div v-if="open" class="ontology-body">
      <p v-if="ontology.samenvatting" class="ontology-summary">{{ ontology.samenvatting }}</p>

      <div v-if="(ontology.onderwerpen?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Onderwerpen</span>
        <div class="ontology-chips">
          <span v-for="t in ontology.onderwerpen" :key="t" class="ontology-chip">{{ t }}</span>
        </div>
      </div>

      <div v-for="(group, key) in entityGroups" :key="key" class="ontology-row">
        <span class="ontology-label">{{ group.label }}</span>
        <div class="ontology-chips">
          <span v-for="e in group.items" :key="e" class="ontology-chip ontology-chip--ent">{{ e }}</span>
        </div>
      </div>

      <div v-if="(ontology.besluiten?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Besluiten</span>
        <ul class="ontology-list">
          <li v-for="(b, i) in ontology.besluiten" :key="i">
            {{ b.tekst }}
            <span v-if="b.datum" class="ontology-date">({{ b.datum }})</span>
          </li>
        </ul>
      </div>

      <div v-if="(ontology.openstaande_vragen?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Openstaande vragen</span>
        <ul class="ontology-list">
          <li v-for="(q, i) in ontology.openstaande_vragen" :key="i">{{ q }}</li>
        </ul>
      </div>

      <div v-if="(ontology.relaties?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Relaties</span>
        <ul class="ontology-list">
          <li v-for="(r, i) in ontology.relaties" :key="i">
            <strong>{{ r.van }}</strong> — <em>{{ r.type }}</em> → <strong>{{ r.naar }}</strong>
          </li>
        </ul>
      </div>

      <p v-if="ontology._parse_error" class="ontology-note">
        Kon de structuur niet volledig uit dit document afleiden.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentOntology } from '../stores/assessmentStore'

const props = defineProps<{ ontology: DocumentOntology | undefined }>()
const open = ref(false)

const ontology = computed<DocumentOntology>(() => props.ontology ?? {})

const entityGroups = computed(() => {
  const ent = ontology.value.entiteiten ?? {}
  return [
    { label: 'Personen', items: ent.personen ?? [] },
    { label: 'Organisaties', items: ent.organisaties ?? [] },
    { label: 'Systemen', items: ent.systemen ?? [] },
    { label: 'Datasoorten', items: ent.datasoorten ?? [] },
  ].filter((g) => g.items.length > 0)
})

const hasContent = computed(() => {
  const o = ontology.value
  return Boolean(
    o.samenvatting ||
      (o.onderwerpen?.length ?? 0) > 0 ||
      entityGroups.value.length > 0 ||
      (o.besluiten?.length ?? 0) > 0 ||
      (o.openstaande_vragen?.length ?? 0) > 0 ||
      (o.relaties?.length ?? 0) > 0,
  )
})
</script>

<style scoped>
.ontology {
  margin-block-start: var(--primitives-space-4);
  border-block-start: 1px dashed var(--invulhulp-color-border);
  padding-block-start: var(--primitives-space-4);
}

.ontology-toggle {
  background: none;
  border: 0;
  padding: var(--primitives-space-2) 0;
  cursor: pointer;
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-accent-color);
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-4);
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

.ontology-toggle:hover {
  text-decoration: underline;
}

.ontology-toggle-icon {
  font-size: var(--primitives-font-size-80);
}

.ontology-body {
  margin-block-start: var(--primitives-space-8);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  background: var(--semantics-categories-accent-tinted-background-color);
  border: 1px solid var(--semantics-categories-accent-tinted-highlight-border-color);
  border-radius: var(--primitives-corner-radius-sm);
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-color);
}

.ontology-summary {
  margin: 0 0 var(--primitives-space-8);
  font-style: italic;
  line-height: var(--primitives-line-height-snug);
}

.ontology-row {
  margin-block-end: var(--primitives-space-8);
}

.ontology-row:last-child {
  margin-block-end: 0;
}

.ontology-label {
  display: block;
  font-size: var(--primitives-font-size-70);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--invulhulp-color-text-muted);
  margin-block-end: var(--primitives-space-2);
}

.ontology-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-2) var(--primitives-space-4);
}

.ontology-chip {
  background: var(--semantics-categories-accent-tinted-background-color);
  border: 1px solid var(--semantics-categories-accent-tinted-highlight-border-color);
  color: var(--semantics-content-accent-color);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: var(--primitives-font-size-80);
  line-height: 1.4;
}

.ontology-chip--ent {
  background: var(--semantics-categories-success-tinted-background-color);
  border-color: var(--semantics-categories-success-tinted-highlight-border-color);
  color: var(--semantics-categories-success-tinted-content-color);
}

.ontology-list {
  margin: 0;
  padding-inline-start: var(--primitives-space-16);
  line-height: var(--primitives-line-height-snug);
}

.ontology-date {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--primitives-font-size-80);
}

.ontology-note {
  margin: var(--primitives-space-8) 0 0;
  font-size: var(--primitives-font-size-80);
  color: var(--semantics-categories-warning-tinted-content-color);
  font-style: italic;
}
</style>
