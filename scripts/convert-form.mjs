#!/usr/bin/env node
/**
 * convert-form.mjs — harmonize an external assessment definition into our runtime form schema.
 *
 *   node scripts/convert-form.mjs dpia
 *
 * Reads:
 *   vendor/instrument-registry/assessments/<file>.yaml (upstream source of truth, pinned;
 *                                           form id -> file in scripts/registry-map.json)
 *   scripts/form-overlays/<name>.overlay.json (our presentation + section grouping)
 *   scripts/schemas/findocs-form.schema.json  (our runtime shape, for validation)
 *
 * Writes:
 *   public/forms/<name>.json                               (generated runtime form)
 *   scripts/form-overlays/<name>.dropped-dependencies.json (report of what stayed lossy)
 *
 * The upstream model (recursive `tasks` tree, relational `dependencies`) is richer than our
 * fixed section -> subsection -> question model. We restore as much reactive behaviour as our
 * model can express:
 *   - upstream `conditional`   -> question-level `visibleIf` (when both sides are standalone
 *                                 questions; column-to-column conditions stay as hints)
 *   - upstream `source_options`-> `optionsFrom` (dynamic dropdowns, on questions or columns)
 *   - select/radio/checkbox options -> real select/suggest inputs (incl. table columns)
 * What we still cannot express is recorded in the dropped-dependencies report:
 *   - `instance_mapping` (relational per-instance repetition -> collapsed to one flat table)
 *   - column-to-column `conditional` visibility (kept as a column hint)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'yaml'
import Ajv from 'ajv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = process.argv[2] || 'dpia'

const warnings = []
const dropped = []
const warn = (m) => { warnings.push(m); console.warn('[converter] ' + m) }

// ---------- load inputs ----------
const registryMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/registry-map.json'), 'utf8'))
if (!registryMap.forms[name]) { console.error(`[converter] ${name} is not in scripts/registry-map.json`); process.exit(1) }
const yamlPath = path.join(ROOT, 'vendor/instrument-registry/assessments', registryMap.forms[name])
const overlayPath = path.join(ROOT, 'scripts/form-overlays', `${name}.overlay.json`)
const doc = YAML.parse(fs.readFileSync(yamlPath, 'utf8'))
const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))

const byId = {}
;(function idx(ts) { for (const t of ts || []) { if (t.id != null) byId[String(t.id)] = t; idx(t.tasks) } })(doc.tasks)
const taskName = (id) => (byId[id] ? String(byId[id].task || '').replace(/\s+/g, ' ').trim() : id)

// ---------- helpers ----------
// Upstream descriptions carry HTML (<a>, <br>, entities) and bullet prose. Our
// guidance/labels render as plain text, so normalise: turn links into
// "text (url)", drop tags, decode entities, collapse whitespace. (Option values
// are handled separately and never passed through here — grounding needs them
// byte-exact.)
function clean(s) {
  if (s == null) return undefined
  let t = String(s)
  t = t.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, url, txt) => {
    const label = txt.replace(/<[^>]+>/g, '').trim()
    return label ? `${label} (${url})` : url
  })
  t = t.replace(/<\/(p|div|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<li\b[^>]*>/gi, '• ')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return t || undefined
}
const isLeaf = (t) => !Array.isArray(t.tasks) || t.tasks.length === 0
const typeOf = (t) => (Array.isArray(t.type) ? t.type[0] : t.type)
const lastSeg = (id) => String(id).split('.').pop()
const genId = (id) => 'd' + id
const optionStrings = (t) => (t.options || []).map((o) => String(o.label != null ? o.label : o.value))
const isSelectType = (ut) => ut === 'select_option' || ut === 'radio_option'
const isMultiType = (ut) => ut === 'checkbox_option' || ut === 'multiselect_scrollable'

// Column headers come from upstream task names, some of which are whole
// sentences. Shorten them for the grid; the full text is kept in the header
// tooltip (and stays byte-exact in the answer/export layer, which uses `label`
// nowhere). Curated overrides for the worst offenders, then generic word
// abbreviations, then a length-capped fallback.
const LABEL_OVERRIDES = {
  'Specificatie van het wetsartikel voor "Toelaatbaar op grond van Unie- of lidstaatrechtelijk recht"': 'Specificatie wetsartikel',
  'In welk land vindt de monitoring en evaluatie van de maatregelen plaats?': 'Land monitoring/evaluatie',
  'Belang van betrokken partij en uitkomst consultatie van betrokkenen': 'Belang & consultatie',
  'Voeg een verwijzing of beschrijving van het advies AP toe': 'Advies AP',
  'Wat is de beoordeling van de verdere verwerking?': 'Beoordeling verdere verwerking',
  'Resterend risico en de risicoinschatting': 'Resterend risico',
  'Samenhang tussen de gegevensverwerkingen': 'Samenhang verwerkingen',
}
function shortLabel(full) {
  if (LABEL_OVERRIDES[full]) return LABEL_OVERRIDES[full]
  let s = full
  s = s.replace(/\bGegevensverwerkingen\b/g, 'Verwerkingen').replace(/\bGegevensverwerking\b/g, 'Verwerking')
  s = s.replace(/\bpersoonsgegevens\b/gi, 'persoonsgeg.').replace(/\bpersoonsgegeven\b/gi, 'persoonsgeg.')
  s = s.replace(/\bCategorie[ëe]?n?\b/gi, 'Cat.')
  s = s.replace(/\bOorspronkelijke?\b/gi, 'Oorspr.')
  s = s.replace(/\bverwerkingsdoeleinden?\b/gi, 'doeleinde')
  s = s.replace(/\b([Mm]otivatie|[Bb]eoordeling|[Bb]eschrijving) van (?:de|het) /g, '$1 ')
  s = s.replace(/\b[Tt]oelichting op (?:de|het) /g, 'Toelichting ')
  s = s.replace(/\barchiveringsperiode\b/gi, 'archiefperiode')
  s = s.replace(/\bidentificatienummers?\b/gi, 'ID-nummer')
  s = s.replace(/\s{2,}/g, ' ').trim()
  if (s.length > 34) s = s.slice(0, 31).replace(/\s+\S*$/, '') + '…'
  return s
}

// upstream id -> where it landed in our form, so later passes can resolve refs.
//   { questionId, column?, optionMap? }   optionMap: { valueString: displayLabel }
const loc = {}
const register = (upstreamId, entry) => { loc[String(upstreamId)] = entry }
function optionMapOf(t) {
  if (!Array.isArray(t.options) || !t.options.length) return undefined
  const m = {}
  for (const o of t.options) {
    const label = String(o.label != null ? o.label : o.value)
    m[String(o.value)] = label
    m[label] = label
  }
  return m
}

// Deferred dependency resolutions, applied after the whole tree is built.
const pendingVisible = [] // { target, targetIsColumn, sourceId, rawValue, note }
const pendingOptions = [] // { target, sourceId, multi }
const sourceDep = (t) => (t.dependencies || []).find((d) => d.type === 'source_options')
const conditionalDep = (t) => (t.dependencies || []).find((d) => d.type === 'conditional')

// ---------- leaf -> question ----------
function convertLeaf(t) {
  const ut = typeOf(t)
  // Some upstream inputs carry an empty `task` because the human-readable question
  // sits on their parent group (e.g. a lone radio under "Wat voor type algoritme?").
  // When we flatten that group its name is lost, so fall back to the parent's task
  // rather than showing the raw id as a label.
  const parentId = String(t.id).includes('.') ? String(t.id).replace(/\.[^.]+$/, '') : null
  const labelFallback = (parentId && byId[parentId] && clean(byId[parentId].task)) || t.id
  const q = { id: genId(t.id), officialId: String(t.id), text: clean(t.task) || labelFallback }
  const guidanceParts = []
  if (clean(t.description)) guidanceParts.push(clean(t.description))

  const so = sourceDep(t)
  switch (ut) {
    case 'select_option':
    case 'radio_option':
      q.type = 'radio'
      q.options = optionStrings(t)
      break
    case 'checkbox_option':
    case 'multiselect_scrollable':
      q.type = 'checkbox'
      if (so) pendingOptions.push({ target: q, sourceId: so.condition.id, multi: true })
      else q.options = optionStrings(t)
      break
    case 'date':
      q.type = 'text'; q.format = 'date'; break
    case 'image':
      q.type = 'text'; q.allowAttachments = true; break
    case 'text_input':
      q.type = 'text'; q.format = 'shorttext'; break
    case 'open_text':
    case 'informational':
    default:
      q.type = 'text'
      if (!['open_text', 'informational', 'text_input'].includes(ut)) warn(`Unknown type "${ut}" on ${t.id} -> text`)
      break
  }
  q.importance = 'optional'

  const cond = conditionalDep(t)
  if (cond) pendingVisible.push({ target: q, targetIsColumn: false, sourceId: String(cond.condition.id), rawValue: cond.condition.value })

  if (guidanceParts.length) q.guidance = guidanceParts.join(' ')
  register(t.id, { questionId: q.id, optionMap: optionMapOf(t) })
  return q
}

// ---------- repeatable group -> table ----------
function rowTemplate(group) {
  let g = group
  while (g.tasks && g.tasks.length === 1 && !isLeaf(g.tasks[0])) {
    dropped.push({ questionId: genId(group.id), officialId: group.id, kind: 'instance_mapping', note: 'Per-instantie herhaling (relationeel); samengevouwen tot één tabel.' })
    g = g.tasks[0]
  }
  return g
}

function makeColumn(c) {
  const ut = typeOf(c)
  const fullLabel = clean(c.task) || lastSeg(c.id)
  const col = { id: lastSeg(c.id), label: shortLabel(fullLabel) }
  const hintParts = []
  // When we abbreviated, surface the full name first in the header tooltip.
  if (col.label !== fullLabel) hintParts.push(fullLabel)
  if (clean(c.description)) hintParts.push(clean(c.description))

  const so = sourceDep(c)
  if (so) {
    col.type = isMultiType(ut) ? 'suggest' : 'select'
    pendingOptions.push({ target: col, sourceId: String(so.condition.id), multi: isMultiType(ut) })
  } else if (isSelectType(ut) && (c.options || []).length) {
    col.type = 'select'; col.options = optionStrings(c)
  } else if (isMultiType(ut) && (c.options || []).length) {
    col.type = 'suggest'; col.options = optionStrings(c)
  }

  // column-to-column conditionals can't be expressed per-cell -> keep as a hint
  const cond = conditionalDep(c)
  if (cond) {
    hintParts.push(`Alleen relevant indien "${taskName(String(cond.condition.id))}" (${cond.condition.id}) = ${JSON.stringify(cond.condition.value)}.`)
    dropped.push({ questionId: genId(c.id), officialId: c.id, kind: 'conditional_column', note: 'Voorwaardelijke kolom binnen een tabel; blijft zichtbaar met toelichting.' })
  }
  if (hintParts.length) col.hint = hintParts.join(' ')
  register(c.id, { questionId: genId(rowGroupId), column: col.id, optionMap: optionMapOf(c) })
  return col
}

let rowGroupId = '' // id of the table question a column belongs to (for loc registration)
function convertGroup(group) {
  const tmpl = rowTemplate(group)
  const children = tmpl.tasks || []

  if (children.length && children.every((c) => typeOf(c) === 'image')) {
    const q = { id: genId(group.id), officialId: String(group.id), text: clean(group.task) || clean(children[0].task) || group.id, type: 'text', importance: 'optional', allowAttachments: true }
    if (clean(group.description)) q.guidance = clean(group.description)
    register(group.id, { questionId: q.id })
    return [q]
  }

  const leafCols = children.filter(isLeaf)
  const groupCols = children.filter((c) => !isLeaf(c))
  if (!leafCols.length) return children.flatMap(convertNode)

  rowGroupId = group.id
  const columns = leafCols.map(makeColumn)

  const q = { id: genId(group.id), officialId: String(group.id), text: clean(group.task) || group.id, type: 'table', importance: 'optional', columns }
  if (clean(group.description)) q.guidance = clean(group.description)
  register(group.id, { questionId: q.id })

  const cond = conditionalDep(group)
  if (cond) pendingVisible.push({ target: q, targetIsColumn: false, sourceId: String(cond.condition.id), rawValue: cond.condition.value })

  return [q, ...groupCols.flatMap(convertNode)]
}

function convertNode(t) {
  if (isLeaf(t)) {
    // An empty task_group leaf is an informational / heading node with no answer.
    // Our model has no informational question type, so emit nothing rather than a
    // bogus empty text field — record it (with its show-if condition if any).
    if (typeOf(t) === 'task_group') {
      const c = conditionalDep(t)
      dropped.push({ questionId: genId(t.id), officialId: String(t.id), kind: 'informational', note: `Informatieve tekst zonder invoerveld${c ? ` (voorwaarde: ${c.condition.id} = ${JSON.stringify(c.condition.value)})` : ''}; niet weergegeven.` })
      return []
    }
    return [convertLeaf(t)]
  }
  if (t.repeatable) return convertGroup(t)
  // A non-repeatable group is flattened, so a show-if on the *group* can't be
  // re-expressed (our visibleIf/optionsFrom only target questions/tables). Its
  // children stay visible; record it instead of dropping it silently.
  const cond = conditionalDep(t)
  if (cond) dropped.push({ questionId: genId(t.id), officialId: String(t.id), kind: 'group_conditional', note: `Voorwaardelijke groep "${clean(t.task) || t.id}" samengevouwen; kinderen blijven altijd zichtbaar (voorwaarde: ${cond.condition.id} = ${JSON.stringify(cond.condition.value)}).` })
  return (t.tasks || []).flatMap(convertNode)
}

// ---------- assemble ----------
// A "paragraph" (= subsection) is any task id the overlay lists, resolved at any
// depth via byId. DPIA/prescan list their top-level tasks; forms whose top level
// is coarse (IAMA "Deel 1-5") list their second-level themes so each becomes a
// subsection instead of one giant flat card per part.
const sections = overlay.sections.map((s) => ({ id: s.id, title: s.title, part: s.part, subsections: [] }))

for (const s of overlay.sections) {
  const sec = sections.find((x) => x.id === s.id)
  for (const pid of s.paragraphs.map(String)) {
    const node = byId[pid]
    if (!node) { warn(`Overlay section ${s.id} lists id ${pid}, not found in source — skipped`); continue }
    const nodeIsLeaf = isLeaf(node)
    // A show-if on a whole subsection can't be re-expressed (visibleIf targets a
    // single question/table), so the subsection stays visible — record it.
    const subCond = !nodeIsLeaf && conditionalDep(node)
    if (subCond) dropped.push({ questionId: genId(pid), officialId: String(pid), kind: 'group_conditional', note: `Voorwaardelijke subsectie "${clean(node.task) || pid}" wordt altijd getoond (voorwaarde: ${subCond.condition.id} = ${JSON.stringify(subCond.condition.value)}).` })
    const questions = nodeIsLeaf ? [convertLeaf(node)] : (node.tasks || []).flatMap(convertNode)
    const sub = { id: genId(pid), title: `${pid}. ${clean(node.task) || ''}`.trim().replace(/\.$/, '').replace(/^0\.\s*/, ''), questions }
    if (clean(node.description)) sub.description = clean(node.description)
    // A leaf paragraph = one question whose guidance is the paragraph description,
    // which we've just shown as the section intro — drop it from the card so the
    // same text doesn't appear twice.
    if (nodeIsLeaf) delete questions[0].guidance
    sec.subsections.push(sub)
  }
}

// ---------- pass 2: resolve deferred dependencies ----------
let visibleResolved = 0, optionsResolved = 0
for (const p of pendingVisible) {
  const src = loc[p.sourceId]
  // question-level visibility only works when both sides are standalone questions
  if (src && !src.column && !p.targetIsColumn) {
    const equals = (src.optionMap && src.optionMap[String(p.rawValue)]) || String(p.rawValue)
    p.target.visibleIf = { questionId: src.questionId, equals }
    visibleResolved++
  } else {
    const label = src ? taskName(p.sourceId) : p.sourceId
    p.target.guidance = [p.target.guidance, `Alleen relevant indien "${label}" (${p.sourceId}) = ${JSON.stringify(p.rawValue)}.`].filter(Boolean).join(' ')
    dropped.push({ questionId: p.target.id, kind: 'conditional', note: 'Voorwaarde verwijst naar een tabelkolom; blijft zichtbaar met toelichting.' })
  }
}
for (const p of pendingOptions) {
  const src = loc[p.sourceId]
  if (src) {
    p.target.optionsFrom = src.column ? { questionId: src.questionId, column: src.column } : { questionId: src.questionId }
    optionsResolved++
  } else {
    // no resolvable source: fall back to a plain input
    if (p.target.type) { delete p.target.type } // column -> text
    else { p.target.type = 'text'; delete p.target.options } // question -> text
    dropped.push({ questionId: p.target.id || '(column)', kind: 'source_options', note: 'Bron voor dynamische opties niet gevonden; teruggevallen op vrij tekstveld.' })
  }
}

// ---------- build form + navigation ----------
const nonEmpty = sections.filter((s) => s.subsections.length)
const navigation = [
  ...nonEmpty.map((s) => ({ type: 'subsections', sectionId: s.id })),
  { type: 'specialView', viewId: 'summary', label: 'Naar samenvatting' },
]
// Identity comes from the registry: its URN and version name the exact
// instrument these questions were generated from.
const { id: formId, ...presentation } = overlay.form
const form = { id: formId, version: String(doc.version), urn: doc.urn, ...presentation, navigation, sections: nonEmpty }

// ---------- validate ----------
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/schemas/findocs-form.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)
if (!validate(form)) {
  console.error('[converter] OUTPUT FAILED SCHEMA VALIDATION:')
  for (const e of validate.errors) console.error(`  ${e.instancePath} ${e.message}`)
  process.exit(1)
}

// ---------- write ----------
const outPath = path.join(ROOT, 'public/forms', `${name}.json`)
fs.writeFileSync(outPath, JSON.stringify(form, null, 2) + '\n')
const reportPath = path.join(ROOT, 'scripts/form-overlays', `${name}.dropped-dependencies.json`)
fs.writeFileSync(reportPath, JSON.stringify({ generatedFrom: yamlPath.replace(ROOT + '/', ''), warnings, dropped }, null, 2) + '\n')

const qCount = nonEmpty.reduce((a, s) => a + s.subsections.reduce((b, ss) => b + ss.questions.length, 0), 0)
console.log(`[converter] OK -> ${outPath.replace(ROOT + '/', '')}`)
console.log(`[converter] sections=${nonEmpty.length} subsections=${nonEmpty.reduce((a, s) => a + s.subsections.length, 0)} questions=${qCount}`)
console.log(`[converter] restored: visibleIf=${visibleResolved}, optionsFrom=${optionsResolved}`)
console.log(`[converter] warnings=${warnings.length} still-lossy=${dropped.length} -> ${reportPath.replace(ROOT + '/', '')}`)
