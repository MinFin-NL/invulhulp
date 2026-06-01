<template>
  <div class="entity-graph">
    <div class="entity-graph-header">
      <div>
        <h3 class="rvo-heading rvo-heading--md entity-graph-title">Entiteitengrafiek</h3>
        <p class="rvo-text entity-graph-desc">
          Verbindingen tussen entiteiten en brondocumenten. Entiteiten die in meerdere documenten voorkomen zijn extra groot weergegeven.
        </p>
      </div>
      <button type="button" class="entity-graph-close" @click="$emit('close')">Sluiten</button>
    </div>

    <div class="entity-graph-controls">
      <label v-for="cat in categories" :key="cat.key" class="entity-graph-filter">
        <input type="checkbox" :checked="visible[cat.key]" @change="toggle(cat.key)" />
        <span class="entity-graph-swatch" :style="{ background: cat.color }"></span>
        {{ cat.label }}
      </label>
    </div>

    <p v-if="!hasAnyEntities" class="entity-graph-empty">
      Nog geen entiteiten beschikbaar — wacht tot indexering klaar is.
    </p>
    <div v-show="hasAnyEntities" ref="graphContainer" class="entity-graph-canvas"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue'
import { Network } from 'vis-network/standalone'
import { DataSet } from 'vis-data/standalone'
import type { SourceDocument } from '../stores/assessmentStore'

const props = defineProps<{ documents: SourceDocument[] }>()
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

  // Union-find clustering per category
  const parent = raws.map((_, i) => i)
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }

  function shouldMerge(a: RawEntity, b: RawEntity): boolean {
    if (a.cat !== b.cat) return false
    if (a.base === b.base) return true
    const at = a.tokens, bt = b.tokens
    // subset: one name's tokens fully contained in the other (e.g. "anouk" ⊂ "anouk de wit")
    const smaller = at.size <= bt.size ? at : bt
    const larger = at.size <= bt.size ? bt : at
    let contained = 0
    for (const t of smaller) if (larger.has(t)) contained++
    if (contained === smaller.size && smaller.size >= 1) return true
    // shared ≥2 distinctive tokens
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
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #d6d6d6;
  border-radius: 8px;
  background: #fafafa;
}
.entity-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.entity-graph-title { margin: 0 0 0.25rem 0; }
.entity-graph-desc { margin: 0; color: #555; font-size: 0.9rem; }
.entity-graph-close {
  border: 1px solid #888;
  background: white;
  border-radius: 4px;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.entity-graph-close:hover { background: #efefef; }
.entity-graph-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-bottom: 0.75rem;
}
.entity-graph-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}
.entity-graph-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.2);
}
.entity-graph-canvas {
  width: 100%;
  height: 560px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}
.entity-graph-empty {
  margin: 1rem 0 0 0;
  color: #666;
  font-style: italic;
}
</style>
