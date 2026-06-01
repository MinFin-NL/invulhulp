<template>
  <section :id="id" class="entity-graph" aria-labelledby="entity-graph-heading">
    <div class="entity-graph__header">
      <div>
        <h3 id="entity-graph-heading" class="rvo-heading rvo-heading--md entity-graph__title">
          Entiteitengrafiek
        </h3>
        <p class="rvo-text rvo-text--sm entity-graph__desc">
          Verbindingen tussen entiteiten en brondocumenten. Entiteiten die in meerdere documenten voorkomen zijn extra groot weergegeven.
        </p>
      </div>
      <button
        type="button"
        class="rvo-button rvo-button--secondary rvo-button--size-sm"
        @click="$emit('close')"
      >
        Sluiten
      </button>
    </div>

    <fieldset class="entity-graph__controls">
      <legend class="invulhulp-visually-hidden">Categorieën filteren</legend>
      <label v-for="cat in categories" :key="cat.key" class="entity-graph__filter">
        <input
          type="checkbox"
          class="rvo-checkbox__input"
          :checked="visible[cat.key]"
          @change="toggle(cat.key)"
        />
        <span
          class="entity-graph__swatch"
          :style="{ background: cat.color }"
          aria-hidden="true"
        />
        {{ cat.label }}
      </label>
    </fieldset>

    <p v-if="!hasAnyEntities" class="entity-graph__empty rvo-text rvo-text--sm">
      Nog geen entiteiten beschikbaar — wacht tot indexering klaar is.
    </p>

    <div
      v-show="hasAnyEntities"
      ref="graphContainer"
      class="entity-graph__canvas"
      role="img"
      :aria-label="graphSummary"
    />

    <!-- Text alternative for screen readers -->
    <ul v-if="hasAnyEntities" class="invulhulp-visually-hidden">
      <li v-for="node in built.nodes" :key="node.id">{{ node.label }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue'
import { Network } from 'vis-network/standalone'
import { DataSet } from 'vis-data/standalone'
import type { SourceDocument } from '../stores/assessmentStore'

const props = defineProps<{ documents: SourceDocument[]; id?: string }>()
defineEmits<{ close: [] }>()

type CategoryKey = 'personen' | 'organisaties' | 'systemen' | 'datasoorten'

const categories: { key: CategoryKey; label: string; color: string }[] = [
  { key: 'personen', label: 'Personen', color: '#2b7de9' },
  { key: 'organisaties', label: 'Organisaties', color: '#e9802b' },
  { key: 'systemen', label: 'Systemen', color: '#3aa76d' },
  { key: 'datasoorten', label: 'Datasoorten', color: '#a04bd1' },
]

const visible = reactive<Record<CategoryKey, boolean>>({
  personen: true,
  organisaties: true,
  systemen: true,
  datasoorten: true,
})

function toggle(key: CategoryKey) {
  visible[key] = !visible[key]
}

const graphContainer = ref<HTMLDivElement | null>(null)
let network: Network | null = null

interface GraphData {
  nodes: Array<{ id: string; label: string; group: string; size: number; borderWidth: number; color: any; font?: any }>
  edges: Array<{ from: string; to: string }>
  hasAny: boolean
}

function build(): GraphData {
  const nodes: GraphData['nodes'] = []
  const edges: GraphData['edges'] = []
  let hasAny = false

  const docs = props.documents.filter(d => !d.indexing && d.ontology && !d.ontology._parse_error)

  for (const doc of docs) {
    nodes.push({
      id: `doc::${doc.id}`,
      label: doc.name,
      group: 'document',
      size: 26,
      borderWidth: 2,
      color: { background: '#1d3a5f', border: '#0b1e35', highlight: { background: '#2a4f7c', border: '#0b1e35' } },
      font: { color: '#ffffff', size: 14, face: 'sans-serif' },
    })
  }

  interface RawEntity { original: string; base: string; tokens: Set<string>; cat: CategoryKey; docId: string }
  const STOP = new Set(['de','het','een','van','der','den','la','le','el','und','and','&','-'])
  function parse(raw: string): { original: string; base: string; tokens: Set<string> } | null {
    const original = raw.trim()
    if (!original) return null
    const baseRaw = original.replace(/\(.*?\)/g, '').replace(/[,;:].*$/, '').trim().toLowerCase()
    const tokens = new Set(
      baseRaw.split(/[\s\-_/.]+/).map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 3 && !STOP.has(t))
    )
    if (tokens.size === 0) return null
    return { original, base: baseRaw, tokens }
  }

  const raws: RawEntity[] = []
  for (const doc of docs) {
    const ent = doc.ontology?.entiteiten
    if (!ent) continue
    for (const cat of categories) {
      if (!visible[cat.key]) continue
      for (const r of ent[cat.key] || []) {
        if (typeof r !== 'string') continue
        const p = parse(r)
        if (!p) continue
        raws.push({ ...p, cat: cat.key, docId: doc.id })
        hasAny = true
      }
    }
  }

  const parent = raws.map((_, i) => i)
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }

  function shouldMerge(a: RawEntity, b: RawEntity): boolean {
    if (a.cat !== b.cat) return false
    if (a.base === b.base) return true
    const at = a.tokens, bt = b.tokens
    const smaller = at.size <= bt.size ? at : bt
    const larger = at.size <= bt.size ? bt : at
    let contained = 0
    for (const t of smaller) if (larger.has(t)) contained++
    if (contained === smaller.size && smaller.size >= 1) return true
    if (contained >= 2) return true
    return false
  }

  for (let i = 0; i < raws.length; i++) {
    for (let j = i + 1; j < raws.length; j++) {
      if (shouldMerge(raws[i], raws[j])) union(i, j)
    }
  }

  interface Cluster { cat: CategoryKey; docIds: Set<string>; label: string; longestLen: number }
  const clusters = new Map<number, Cluster>()
  for (let i = 0; i < raws.length; i++) {
    const root = find(i)
    const r = raws[i]
    let c = clusters.get(root)
    if (!c) {
      c = { cat: r.cat, docIds: new Set(), label: r.original, longestLen: r.original.length }
      clusters.set(root, c)
    }
    c.docIds.add(r.docId)
    if (r.original.length > c.longestLen) {
      c.label = r.original
      c.longestLen = r.original.length
    }
  }

  for (const [root, c] of clusters) {
    const color = categories.find(cat => cat.key === c.cat)!.color
    const shared = c.docIds.size > 1
    const id = `ent::${c.cat}::${root}`
    nodes.push({
      id,
      label: c.label,
      group: c.cat,
      size: shared ? 22 + Math.min(c.docIds.size * 3, 14) : 14,
      borderWidth: shared ? 3 : 1,
      color: { background: color, border: shared ? '#111' : color, highlight: { background: color, border: '#111' } },
      font: { color: '#111', size: shared ? 14 : 12, face: 'sans-serif' },
    })
    for (const docId of c.docIds) {
      edges.push({ from: `doc::${docId}`, to: id })
    }
  }

  return { nodes, edges, hasAny }
}

const built = ref<GraphData>(build())
const hasAnyEntities = computed(() => built.value.hasAny)

const graphSummary = computed(() => {
  const nodeCount = built.value.nodes.length
  const edgeCount = built.value.edges.length
  return `Grafiek met ${nodeCount} entiteit${nodeCount === 1 ? '' : 'en'} en ${edgeCount} verbinding${edgeCount === 1 ? '' : 'en'}.`
})

function render() {
  built.value = build()
  if (!graphContainer.value) return
  if (!built.value.hasAny) {
    network?.destroy()
    network = null
    return
  }
  const data = {
    nodes: new DataSet(built.value.nodes as any),
    edges: new DataSet(built.value.edges as any),
  }
  const options = {
    autoResize: true,
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -60, springLength: 120, springConstant: 0.08, avoidOverlap: 0.5 },
      stabilization: { iterations: 200 },
    },
    interaction: { hover: true, tooltipDelay: 150 },
    nodes: { shape: 'dot' },
    edges: { color: { color: '#bbb', highlight: '#444' }, smooth: false, width: 1 },
  }
  if (network) {
    network.setData(data as any)
    network.setOptions(options as any)
  } else {
    network = new Network(graphContainer.value, data as any, options as any)
  }
}

onMounted(render)
onBeforeUnmount(() => {
  network?.destroy()
  network = null
})

watch(() => props.documents, render, { deep: true })
watch(visible, render, { deep: true })
</script>

<style scoped>
.entity-graph {
  margin-block-start: var(--rvo-space-lg);
  padding: var(--rvo-space-md);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-md);
  background: var(--rvo-color-grijs-050, #fafafa);
}

.entity-graph__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--rvo-space-md);
  margin-block-end: var(--rvo-space-sm);
}

.entity-graph__title { margin: 0 0 var(--rvo-space-3xs); }

.entity-graph__desc {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
}

.entity-graph__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-sm) var(--rvo-space-md);
  margin: 0 0 var(--rvo-space-sm);
  padding: 0;
  border: 0;
}

.entity-graph__filter {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  font-size: var(--rvo-font-size-sm);
  cursor: pointer;
  user-select: none;
}

.entity-graph__swatch {
  display: inline-block;
  inline-size: 12px;
  block-size: 12px;
  border-radius: 50%;
  border: 1px solid rgb(0 0 0 / 0.2);
}

.entity-graph__canvas {
  inline-size: 100%;
  block-size: 560px;
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-md);
}

.entity-graph__empty {
  margin: var(--rvo-space-md) 0 0 0;
  color: var(--invulhulp-color-text-subtle);
  font-style: italic;
}
</style>
