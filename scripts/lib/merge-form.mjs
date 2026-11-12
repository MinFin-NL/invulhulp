/**
 * merge-form.mjs — build a runtime form from a MinBZK instrument-registry
 * definition plus our overlay.
 *
 * Used for every form the registry carries with `references.invulhulp`
 * back-links (all MinFin instruments). The two halves own different things:
 *
 *   registry YAML  — content: question text, guidance, options, required,
 *                    question type, show-if conditions, table columns, and the
 *                    titles/descriptions of sections and subsections.
 *   overlay JSON   — our structure and presentation: which question sits in
 *                    which section/subsection and in what order, question ids,
 *                    part/kicker, navigation, meta/homeContent, features, AI
 *                    hints (aiContext, aiFill, followUp), formats like
 *                    email/phone, optionsFrom, attachments, table sizes, …
 *
 * The question id IS the registry's `references.invulhulp`, so stored answers
 * (keyed on question id) survive every registry release. The build fails on
 * drift in either direction: a question the overlay places but the registry no
 * longer has, or a registry question the overlay doesn't place. Both are
 * decisions for a human (migrate answers? where does the new question go?), not
 * for the build.
 */
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
const typeOf = (t) => asArray(t.type)[0]
const optionLabels = (t) =>
  Array.isArray(t.options) && t.options.length ? t.options.map((o) => String(o.label ?? o.value)) : undefined

// Keys the registry owns. Anything else in a YAML task is a feature this builder
// doesn't understand yet, so it fails loudly instead of dropping it silently.
const KNOWN_TASK_KEYS = new Set([
  'task', 'description', 'id', 'type', 'repeatable', 'required_status', 'references',
  'options', 'tasks', 'valueType', 'dependencies',
])

/** Registry question type -> our question type. */
function questionType(t, ref) {
  const ut = typeOf(t)
  if (ut === 'task_group' && t.repeatable) return 'table'
  switch (ut) {
    case 'radio_option':
    case 'select_option':
      return 'radio'
    case 'checkbox_option':
    case 'multiselect_scrollable':
      return 'checkbox'
    case 'text_input':
    case 'open_text':
    case 'date':
      return 'text'
    default:
      throw new Error(`${ref}: registry type "${ut}" has no invulhulp question type`)
  }
}

/** The format the registry type implies; the overlay may refine it (email/phone). */
function defaultFormat(t) {
  const ut = typeOf(t)
  if (ut === 'date') return 'date'
  if (ut === 'text_input') return 'shorttext'
  return undefined
}

/** Registry column type -> our column type (undefined = plain text cell). */
function defaultColumnType(t) {
  const ut = typeOf(t)
  if (ut === 'select_option' || ut === 'radio_option') return 'select'
  if (ut === 'checkbox_option' || ut === 'multiselect_scrollable') return 'suggest'
  return undefined
}

/**
 * Combine registry `values` with overlay `rest` into one object with a stable
 * key order: keys listed in `order` first, then the overlay's own keys in the
 * overlay's order, then any value left. A value always wins over the overlay;
 * an undefined value drops the key.
 */
function ordered(order, values, rest) {
  const out = {}
  const pick = (k) => (k in values ? values[k] : rest[k])
  for (const k of [...order, ...Object.keys(rest), ...Object.keys(values)]) {
    if (k in out) continue
    const v = pick(k)
    if (v !== undefined) out[k] = v
  }
  return out
}

const QUESTION_ORDER = [
  'id', 'officialId', 'text', 'guidance', 'type', 'importance', 'options', 'followUp', 'format',
  'allowAttachments', 'optionsFrom', 'visibleIf', 'columns', 'notesLabel', 'minRows', 'maxRows',
  'optionalTable', 'aiFill',
]
const COLUMN_ORDER = ['id', 'label', 'hint', 'type', 'options', 'optionsFrom']
const SUBSECTION_ORDER = ['id', 'title', 'description', 'questions']
const SECTION_ORDER = ['id', 'title', 'description', 'part', 'kicker', 'aiFill', 'subsections']
const FORM_ORDER = ['_generated', 'id', 'version', 'urn', 'registryUrn', 'title']

export function indexRegistry(doc) {
  const byRef = new Map()
  const byId = new Map()
  const parent = new Map()
  ;(function walk(tasks, p) {
    for (const t of tasks || []) {
      parent.set(t, p)
      if (t.id != null) byId.set(String(t.id), t)
      const ref = t.references?.invulhulp
      if (ref != null) {
        if (byRef.has(ref)) throw new Error(`references.invulhulp "${ref}" appears twice in the registry`)
        byRef.set(String(ref), t)
      }
      walk(t.tasks, t)
    }
  })(doc.tasks, null)
  return { byRef, byId, parent }
}

/**
 * Merge one form.
 * @param {object} doc      parsed registry YAML
 * @param {object} skeleton overlay `form` object (structure without content)
 * @param {object} info     { yamlPath, overlayPath } for the _generated note
 */
export function mergeForm(doc, skeleton, info) {
  if (doc.assessments) throw new Error('registry `assessments` (rules engine) is not supported by the merge builder')
  const { byRef, byId, parent } = indexRegistry(doc)
  const used = new Set()

  const take = (ref) => {
    const t = byRef.get(ref)
    if (!t) {
      throw new Error(
        `"${ref}" is placed by the overlay but missing from the registry. ` +
          'Removed or renamed upstream? Decide what happens to stored answers, then update the overlay.',
      )
    }
    const unknown = Object.keys(t).filter((k) => !KNOWN_TASK_KEYS.has(k))
    if (unknown.length) throw new Error(`${ref}: registry fields not supported yet: ${unknown.join(', ')}`)
    used.add(ref)
    return t
  }

  function visibleIfOf(t, ref) {
    const deps = asArray(t.dependencies)
    if (!deps.length) return undefined
    if (deps.length > 1) throw new Error(`${ref}: more than one dependency is not supported`)
    const [d] = deps
    if (d.type !== 'conditional' || d.action !== 'show' || d.condition?.operator !== 'equals') {
      throw new Error(`${ref}: only "show if <question> equals <value>" dependencies are supported`)
    }
    const source = byId.get(String(d.condition.id))
    const sourceRef = source?.references?.invulhulp
    if (!sourceRef) throw new Error(`${ref}: dependency on ${d.condition.id}, which has no invulhulp reference`)
    return { questionId: String(sourceRef), equals: String(d.condition.value) }
  }

  function mergeColumn(qid, col) {
    const ref = `${qid}.${col.id}`
    const t = take(ref)
    return ordered(
      COLUMN_ORDER,
      {
        label: t.task,
        hint: t.description,
        type: col.type ?? defaultColumnType(t),
        options: optionLabels(t),
      },
      col,
    )
  }

  function mergeQuestion(q) {
    const t = take(q.id)
    const type = questionType(t, q.id)
    const merged = ordered(
      QUESTION_ORDER,
      {
        text: t.task,
        guidance: t.description,
        type,
        importance: t.required_status === true ? 'mandatory' : 'optional',
        options: type === 'table' ? undefined : optionLabels(t),
        format: q.format ?? defaultFormat(t),
        visibleIf: visibleIfOf(t, q.id),
        columns: type === 'table' ? (q.columns || []).map((c) => mergeColumn(q.id, c)) : undefined,
      },
      q,
    )
    if (type === 'table') {
      // A registry column the overlay doesn't place would silently vanish.
      for (const child of t.tasks || []) {
        const cref = child.references?.invulhulp
        if (cref && !used.has(cref)) throw new Error(`registry column "${cref}" is not placed in the overlay`)
      }
    }
    return { question: merged, task: t }
  }

  const sections = skeleton.sections.map((s) => {
    let sectionTask
    const subsections = s.subsections.map((ss) => {
      let subTask
      const questions = ss.questions.map((q) => {
        const { question, task } = mergeQuestion(q)
        const p = parent.get(task)
        if (subTask === undefined) subTask = p
        else if (p !== subTask) {
          throw new Error(`subsection ${ss.id}: "${q.id}" sits under a different registry group than its siblings`)
        }
        return question
      })
      if (!subTask) throw new Error(`subsection ${ss.id} has no questions or no registry group`)
      const secTask = parent.get(subTask)
      if (sectionTask === undefined) sectionTask = secTask
      else if (secTask !== sectionTask) throw new Error(`section ${s.id}: subsection ${ss.id} sits under a different registry group`)
      return ordered(SUBSECTION_ORDER, { title: subTask.task, description: subTask.description, questions }, ss)
    })
    if (!sectionTask) throw new Error(`section ${s.id} has no registry group`)
    return ordered(
      SECTION_ORDER,
      { title: sectionTask.task, description: sectionTask.description, subsections },
      s,
    )
  })

  const unplaced = [...byRef.keys()].filter((r) => !used.has(r))
  if (unplaced.length) {
    throw new Error(
      `registry questions not placed in the overlay: ${unplaced.join(', ')}. ` +
        'Add them to a subsection in the overlay.',
    )
  }

  return ordered(
    FORM_ORDER,
    {
      _generated: `Gegenereerd door \`npm run forms:build\` uit ${info.yamlPath} + ${info.overlayPath}; niet handmatig bewerken.`,
      version: String(doc.version),
      urn: doc.urn,
      sections,
    },
    skeleton,
  )
}

/** Read the vendored YAML + overlay for a form id and merge them. */
export function buildMergedForm(root, id, file) {
  const yamlPath = `vendor/instrument-registry/assessments/${file}`
  const overlayPath = `scripts/form-overlays/${id}.overlay.json`
  const doc = YAML.parse(fs.readFileSync(path.join(root, yamlPath), 'utf8'))
  const overlay = JSON.parse(fs.readFileSync(path.join(root, overlayPath), 'utf8'))
  return mergeForm(doc, overlay.form, { yamlPath, overlayPath })
}
