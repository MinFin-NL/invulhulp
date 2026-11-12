#!/usr/bin/env node
/**
 * convert-beslishulp.mjs — build the runtime asset for the Beslishulp AI-verordening.
 *
 *   node scripts/convert-beslishulp.mjs
 *
 * Reads (pinned upstream snapshot, see vendor/ai-verordening-beslishulp/PROVENANCE.md):
 *   vendor/ai-verordening-beslishulp/decision-tree.yaml
 *   vendor/ai-verordening-beslishulp/definitions.yaml
 *   vendor/ai-verordening-beslishulp/categories.yaml
 *
 * Writes:
 *   public/beslishulp/ai-verordening.json   (fetched at runtime, like public/forms/*.json)
 *
 * The upstream tree is already close to what we render, so this is mostly a YAML->JSON
 * merge. The one real transformation: every `redirects[].if` guard is a small boolean
 * expression over the labels collected so far, e.g.
 *
 *   '"aanbieder" in labels && !("open-source" in labels)'
 *
 * Those are PARSED HERE into an AST. The shipped app never parses (let alone evals) an
 * expression — src/utils/beslishulp.ts only walks the AST. An unparsable guard fails the
 * build loudly instead of silently misrouting someone's compliance answer.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = path.join(ROOT, 'vendor/ai-verordening-beslishulp')
const OUT = path.join(ROOT, 'public/beslishulp/ai-verordening.json')

// ---------------------------------------------------------------------------
// Guard expression -> AST
//
// Grammar (all of it — the upstream tree uses nothing else):
//   or   := and ( '||' and )*
//   and  := unary ( '&&' unary )*
//   unary:= '!' unary | '(' or ')' | has
//   has  := STRING 'in' 'labels'
// ---------------------------------------------------------------------------

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1)
      if (end === -1) throw new Error(`unterminated string at ${i}`)
      tokens.push({ type: 'string', value: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (src.startsWith('&&', i)) { tokens.push({ type: '&&' }); i += 2; continue }
    if (src.startsWith('||', i)) { tokens.push({ type: '||' }); i += 2; continue }
    if (c === '!') { tokens.push({ type: '!' }); i++; continue }
    if (c === '(') { tokens.push({ type: '(' }); i++; continue }
    if (c === ')') { tokens.push({ type: ')' }); i++; continue }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (word) { tokens.push({ type: 'ident', value: word[0] }); i += word[0].length; continue }
    throw new Error(`unexpected character ${JSON.stringify(c)} at ${i}`)
  }
  return tokens
}

function parseGuard(src) {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const eat = (type) => {
    const t = tokens[pos]
    if (!t || t.type !== type) throw new Error(`expected ${type}, got ${t ? t.type : 'end of input'}`)
    pos++
    return t
  }

  function or() {
    let node = and()
    while (peek()?.type === '||') { pos++; node = { op: 'or', left: node, right: and() } }
    return node
  }
  function and() {
    let node = unary()
    while (peek()?.type === '&&') { pos++; node = { op: 'and', left: node, right: unary() } }
    return node
  }
  function unary() {
    if (peek()?.type === '!') { pos++; return { op: 'not', operand: unary() } }
    if (peek()?.type === '(') { pos++; const node = or(); eat(')'); return node }
    const label = eat('string').value
    const inTok = eat('ident')
    if (inTok.value !== 'in') throw new Error(`expected 'in', got '${inTok.value}'`)
    const labelsTok = eat('ident')
    if (labelsTok.value !== 'labels') throw new Error(`expected 'labels', got '${labelsTok.value}'`)
    return { op: 'has', label }
  }

  const ast = or()
  if (pos !== tokens.length) throw new Error(`trailing input after position ${pos}`)
  return ast
}

/** Every label an AST tests for — used to cross-check against labels the tree can assign. */
function guardLabels(ast, into = new Set()) {
  if (ast.op === 'has') into.add(ast.label)
  else if (ast.op === 'not') guardLabels(ast.operand, into)
  else { guardLabels(ast.left, into); guardLabels(ast.right, into) }
  return into
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const readYaml = (file) => YAML.parse(fs.readFileSync(path.join(VENDOR, file), 'utf8'))

const tree = readYaml('decision-tree.yaml')
const defsDoc = readYaml('definitions.yaml')
const categories = readYaml('categories.yaml')

const errors = []
const warnings = []
let guardedWithoutFallback = 0

// Upstream wraps long HTML strings over multiple YAML lines, which collapses the
// newlines to spaces. Harmless, but it leaves runs of whitespace inside the markup.
const tidy = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s)

const questionIds = new Set(tree.questions.map((q) => q.questionId))
const conclusionIds = new Set(tree.conclusions.map((c) => c.conclusionId))

/** Validate one target reference so a dangling id is a build error, not a dead end mid-flow. */
function checkTarget(where, target) {
  if (target.nextQuestionId && !questionIds.has(target.nextQuestionId)) {
    errors.push(`${where}: unknown nextQuestionId "${target.nextQuestionId}"`)
  }
  if (target.nextConclusionId && !conclusionIds.has(target.nextConclusionId)) {
    errors.push(`${where}: unknown nextConclusionId "${target.nextConclusionId}"`)
  }
  if (!target.nextQuestionId && !target.nextConclusionId) {
    errors.push(`${where}: neither nextQuestionId nor nextConclusionId`)
  }
}

const assignedLabels = new Set()
const testedLabels = new Set()

const questions = tree.questions.map((q) => {
  const answers = q.answers.map((a, ai) => {
    const where = `question ${q.questionId} answer ${ai + 1}`
    for (const l of a.labels ?? []) assignedLabels.add(l)

    const answer = {
      answer: tidy(a.answer),
      labels: a.labels ?? [],
    }
    if (a.subresult) answer.subresult = tidy(a.subresult)

    if (a.redirects) {
      answer.redirects = a.redirects.map((r, ri) => {
        const rWhere = `${where} redirect ${ri + 1}`
        checkTarget(rWhere, r)
        let ast
        try {
          ast = parseGuard(r.if)
        } catch (e) {
          errors.push(`${rWhere}: cannot parse guard ${JSON.stringify(r.if)} — ${e.message}`)
          ast = null
        }
        if (ast) for (const l of guardLabels(ast)) testedLabels.add(l)
        return {
          // The source string is kept for debugging/traceability only; nothing reads it.
          ifSource: r.if,
          if: ast,
          ...(r.nextQuestionId ? { nextQuestionId: r.nextQuestionId } : {}),
          ...(r.nextConclusionId ? { nextConclusionId: r.nextConclusionId } : {}),
        }
      })
      // Upstream never writes an unconditional fallback redirect: it relies on the
      // guards being exhaustive for every path that can actually reach the answer.
      // We can't verify that here (it depends on reachable label sets), so the
      // runtime reports a dead end explicitly instead — see beslishulp.ts.
      if (!a.redirects.some((r) => !r.if)) guardedWithoutFallback++
    } else {
      checkTarget(where, a)
      if (a.nextQuestionId) answer.nextQuestionId = a.nextQuestionId
      if (a.nextConclusionId) answer.nextConclusionId = a.nextConclusionId
    }
    return answer
  })

  const cat = categories.find((c) => c.questionId === q.questionId)
  return {
    questionId: q.questionId,
    question: tidy(q.question),
    explanation: tidy(q.explanation) || '',
    category: q.category,
    subcategory: q.subcategory,
    // categories.yaml keys on question *group* ("1.4" covers "1.4.1"), so this is a
    // best-effort human-readable heading; the per-question subcategory above always wins.
    categoryLabel: cat?.category,
    sources: (q.sources ?? []).map((s) => ({ source: tidy(s.source), url: s.url })),
    answers,
  }
})

const conclusions = tree.conclusions.map((c) => ({
  conclusionId: c.conclusionId,
  conclusion: tidy(c.conclusion),
  obligation: tidy(c.obligation) ?? '',
  sources: (c.sources ?? []).map((s) => ({ source: tidy(s.source), url: s.url })),
}))

// Definitions power the glossary tooltips in the modal. Upstream lists some terms
// twice (singular/plural); first one wins, which matches how the upstream UI reads them.
const definitions = {}
for (const d of defsDoc.definitions) {
  const key = d.term.toLowerCase()
  if (!(key in definitions)) definitions[key] = { term: d.term, definition: tidy(d.definition) }
}

// A guard that tests a label nothing can assign is always false — silent misrouting.
for (const label of testedLabels) {
  if (!assignedLabels.has(label)) errors.push(`guard tests label "${label}" that no answer assigns`)
}

const startId = tree.questions[0].questionId

const asset = {
  name: tree.name,
  version: String(tree.version),
  source: {
    repository: 'https://github.com/MinBZK/ai-verordening-beslishulp',
    commit: 'ab943a0da02441fe532a65acb6eba431a9188c4d',
    licence: 'EUPL-1.2',
    publisher: 'AI Validatieteam, Ministerie van Binnenlandse Zaken en Koninkrijksrelaties',
    algoritmekader: 'https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/ai-verordening/',
  },
  startQuestionId: startId,
  labels: [...assignedLabels].sort(),
  questions,
  conclusions,
  definitions,
}

for (const w of warnings) console.warn(`warn: ${w}`)
if (guardedWithoutFallback > 0) {
  console.log(`note: ${guardedWithoutFallback} answers route purely through guarded redirects (upstream style)`)
}
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`)
  console.error(`\n${errors.length} error(s) — not writing ${path.relative(ROOT, OUT)}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(asset, null, 2) + '\n')
console.log(
  `wrote ${path.relative(ROOT, OUT)} — ${questions.length} questions, ${conclusions.length} conclusions, ` +
    `${Object.keys(definitions).length} definitions, ${assignedLabels.size} labels`,
)
