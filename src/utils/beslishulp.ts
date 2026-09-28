/**
 * Beslishulp AI-verordening — the decision-tree engine.
 *
 * Runs the MinBZK "Beslishulp AI-verordening" decision tree (vendored under
 * vendor/ai-verordening-beslishulp, built into public/beslishulp/ai-verordening.json
 * by scripts/convert-beslishulp.mjs).
 *
 * The tree is a label machine, not a score: every answer may add labels
 * ("aanbieder", "hoog-risico AI", ...) to a growing set, and routing is either a
 * direct id or a list of redirects whose guards test that set. Guards arrive
 * pre-parsed as an AST from the build step — this file evaluates the AST and
 * never parses or evals an expression string.
 *
 * The engine is pure and synchronous: state in, next state out. That keeps it
 * testable (beslishulp.test.ts) and lets the component be a thin renderer.
 */
import type { RiskLevelValue } from '../models/Assessment'

// ---------------------------------------------------------------------------
// The runtime asset
// ---------------------------------------------------------------------------

export interface BeslishulpSource {
  source: string
  url: string
}

/** Pre-parsed guard: `"x" in labels`, negation, and && / || over those. */
export type GuardNode =
  | { op: 'has'; label: string }
  | { op: 'not'; operand: GuardNode }
  | { op: 'and'; left: GuardNode; right: GuardNode }
  | { op: 'or'; left: GuardNode; right: GuardNode }

export interface BeslishulpRedirect {
  ifSource: string
  if: GuardNode
  nextQuestionId?: string
  nextConclusionId?: string
}

export interface BeslishulpAnswer {
  answer: string
  labels: string[]
  /** Upstream caveat shown with the chosen answer ("Tenzij ..."). */
  subresult?: string
  nextQuestionId?: string
  nextConclusionId?: string
  redirects?: BeslishulpRedirect[]
}

export interface BeslishulpQuestion {
  questionId: string
  question: string
  /** Upstream HTML (bold/bullets/<br>). Rendered with v-html — vendored content only. */
  explanation: string
  category: string
  subcategory: string
  categoryLabel?: string
  sources: BeslishulpSource[]
  answers: BeslishulpAnswer[]
}

export interface BeslishulpConclusion {
  conclusionId: string
  conclusion: string
  /** Upstream HTML: the obligation list, often long. */
  obligation: string
  sources: BeslishulpSource[]
}

export interface BeslishulpDefinition {
  term: string
  definition: string
}

export interface BeslishulpTree {
  name: string
  version: string
  source: {
    repository: string
    commit: string
    licence: string
    publisher: string
    algoritmekader: string
  }
  startQuestionId: string
  labels: string[]
  questions: BeslishulpQuestion[]
  conclusions: BeslishulpConclusion[]
  definitions: Record<string, BeslishulpDefinition>
}

// ---------------------------------------------------------------------------
// Persisted run state
// ---------------------------------------------------------------------------

/** One answered step. The trail is what makes "vorige vraag" and the dossier
 *  record possible: replaying it reproduces the label set exactly. */
export interface BeslishulpStep {
  questionId: string
  /** Index into the question's `answers` — stable for a pinned tree version. */
  answerIndex: number
  /** Denormalised for display and for the export, so a tree refresh can never
   *  silently rewrite what someone recorded as their answer. */
  answerLabel: string
  labelsAdded: string[]
}

/**
 * The form whose state carries the beslishulp run for a dossier.
 *
 * The run describes the dossier's AI system, not one form — but the CRDT
 * envelope is keyed by form, and giving it its own dossier-level field would
 * mean touching the codec, the backend payload model and the stored dossier
 * shape for one PoC feature. So it lives on the form it belongs to visually
 * (the EU AI Act checklist, whose card hosts the tile) and other forms read it
 * from there. `beslishulpRun` in assessmentStore is the only accessor — nothing
 * else should reach for `forms.euaiact.beslishulp` directly.
 */
export const BESLISHULP_HOST_FORM_ID = 'euaiact'

/** What we persist in the dossier once the beslishulp has been run. */
export interface BeslishulpRun {
  /** Version of the vendored tree this run was made with. */
  treeVersion: string
  steps: BeslishulpStep[]
  labels: string[]
  conclusionId: string | null
  /** Epoch ms — when the conclusion was reached. */
  completedAt: number
  /** Name of the user who ran it, for the shared-dossier case. */
  completedBy?: string
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function evaluateGuard(node: GuardNode, labels: ReadonlySet<string>): boolean {
  switch (node.op) {
    case 'has':
      return labels.has(node.label)
    case 'not':
      return !evaluateGuard(node.operand, labels)
    case 'and':
      return evaluateGuard(node.left, labels) && evaluateGuard(node.right, labels)
    case 'or':
      return evaluateGuard(node.left, labels) || evaluateGuard(node.right, labels)
  }
}

/** Where an answer sends you. `deadEnd` means every redirect guard was false —
 *  upstream never writes a fallback, so this is a real (if rare) possibility and
 *  the UI must say so rather than freeze on the current question. */
export type BeslishulpTarget =
  | { kind: 'question'; questionId: string }
  | { kind: 'conclusion'; conclusionId: string }
  | { kind: 'deadEnd' }

export function resolveTarget(answer: BeslishulpAnswer, labels: ReadonlySet<string>): BeslishulpTarget {
  if (answer.redirects) {
    for (const r of answer.redirects) {
      if (!evaluateGuard(r.if, labels)) continue
      if (r.nextQuestionId) return { kind: 'question', questionId: r.nextQuestionId }
      if (r.nextConclusionId) return { kind: 'conclusion', conclusionId: r.nextConclusionId }
    }
    return { kind: 'deadEnd' }
  }
  if (answer.nextQuestionId) return { kind: 'question', questionId: answer.nextQuestionId }
  if (answer.nextConclusionId) return { kind: 'conclusion', conclusionId: answer.nextConclusionId }
  return { kind: 'deadEnd' }
}

/** Live position in a run: either on a question, at a conclusion, or stuck. */
export type BeslishulpPosition =
  | { kind: 'question'; question: BeslishulpQuestion }
  | { kind: 'conclusion'; conclusion: BeslishulpConclusion }
  | { kind: 'deadEnd' }

export function findQuestion(tree: BeslishulpTree, id: string): BeslishulpQuestion | null {
  return tree.questions.find((q) => q.questionId === id) ?? null
}

function findConclusion(tree: BeslishulpTree, id: string): BeslishulpConclusion | null {
  return tree.conclusions.find((c) => c.conclusionId === id) ?? null
}

/**
 * Replay a trail of answers from the start of the tree.
 *
 * Single source of truth for "where am I": the component keeps only the step
 * list, and every render derives labels + position from here. No incremental
 * state to get out of sync when the user steps back.
 */
export function replay(tree: BeslishulpTree, steps: readonly BeslishulpStep[]): {
  labels: Set<string>
  position: BeslishulpPosition
} {
  const labels = new Set<string>()
  let currentId: string = tree.startQuestionId
  let target: BeslishulpTarget = { kind: 'question', questionId: currentId }

  for (const step of steps) {
    const question = findQuestion(tree, step.questionId)
    const answer = question?.answers[step.answerIndex]
    if (!question || !answer) {
      // The trail no longer fits the tree (refreshed vendor snapshot). Stop where
      // it still made sense rather than pretending the rest happened.
      break
    }
    for (const l of answer.labels) labels.add(l)
    target = resolveTarget(answer, labels)
    if (target.kind !== 'question') break
    currentId = target.questionId
  }

  if (target.kind === 'conclusion') {
    const conclusion = findConclusion(tree, target.conclusionId)
    return { labels, position: conclusion ? { kind: 'conclusion', conclusion } : { kind: 'deadEnd' } }
  }
  if (target.kind === 'deadEnd') return { labels, position: { kind: 'deadEnd' } }

  const question = findQuestion(tree, currentId)
  return { labels, position: question ? { kind: 'question', question } : { kind: 'deadEnd' } }
}

/** Append one answer to a trail. Returns a new trail (the caller replays it). */
export function answerStep(
  question: BeslishulpQuestion,
  answerIndex: number,
  steps: readonly BeslishulpStep[],
): BeslishulpStep[] {
  const answer = question.answers[answerIndex]
  return [
    ...steps,
    {
      questionId: question.questionId,
      answerIndex,
      answerLabel: answer.answer,
      labelsAdded: [...answer.labels],
    },
  ]
}

// ---------------------------------------------------------------------------
// Mapping onto our four risk levels
// ---------------------------------------------------------------------------

/**
 * Our forms (AIIA's decision gate, the summary, the PDF export) speak in the four
 * AI-verordening risk levels. The beslishulp speaks in labels. This is the seam.
 *
 * Order matters: it is a first-match-wins ladder from most to least severe, because
 * a run legitimately carries several of these at once (a high-risk system with
 * transparency obligations has both "hoog-risico AI" and "transparantieverplichting").
 *
 * If a vendor refresh renames a label, beslishulp.test.ts fails: it asserts every
 * label the tree can assign is either mapped here or listed as deliberately
 * risk-neutral.
 */
const RISK_LADDER: { label: string; level: Exclude<RiskLevelValue, null> }[] = [
  { label: 'verboden AI', level: 'onaanvaardbaar' },
  { label: 'hoog-risico AI', level: 'hoog' },
  { label: 'systeemrisico', level: 'hoog' },
  { label: 'transparantieverplichting', level: 'beperkt' },
]

/** Labels that carry no risk level of their own: roles, lifecycle, scope and the
 *  explicit negatives. Listed so the test can prove the ladder is exhaustive. */
export const RISK_NEUTRAL_LABELS = [
  'aanbieder',
  'gebruiksverantwoordelijke',
  'importeur',
  'distributeur',
  'AI-systeem',
  'AI-systeem voor algemene doeleinden',
  'AI-model voor algemene doeleinden',
  'in gebruik',
  'in ontwikkeling',
  'open-source',
  'geen open-source',
  'geen algoritme',
  'geen hoog-risico AI',
  'geen systeemrisico',
  'geen transparantieverplichting',
  'niet van toepassing',
  'uitzondering van toepassing',
  'beoordeling door derde partij',
]

/**
 * Whether the run concluded that the AI-verordening does not apply.
 *
 * This is decided by the CONCLUSION, not by the labels. Upstream groups every
 * "verordening niet van toepassing" outcome under conclusion id 11.x, and one of
 * them (11.1, "geen AI-systeem") carries no label at all — so labels alone would
 * miss it. Worse, the label literally named `niet van toepassing` means something
 * else entirely: at question 2.7.1 it records that a *third-party conformity
 * assessment* is not required. Reading it as "out of scope" would tell a
 * high-risk provider the verordening does not apply to them.
 *
 * The two scope labels below are kept as a fallback for a trail whose conclusion
 * id is missing (a partially replayed run).
 */
const OUT_OF_SCOPE_LABELS = ['geen algoritme', 'uitzondering van toepassing']
const OUT_OF_SCOPE_CONCLUSION_PREFIX = '11.'

export function isOutOfScope(labels: ReadonlySet<string>, conclusionId?: string | null): boolean {
  if (conclusionId) return conclusionId.startsWith(OUT_OF_SCOPE_CONCLUSION_PREFIX)
  return OUT_OF_SCOPE_LABELS.some((l) => labels.has(l))
}

/**
 * The risk level a finished run implies.
 *
 * Out-of-scope runs map to 'minimaal': the AI-verordening imposes nothing, which is
 * exactly what that level means in our forms. The UI says so in words as well, so
 * "minimaal" is never mistaken for "we assessed it and it was low risk".
 */
export function riskLevelFor(labels: ReadonlySet<string>): RiskLevelValue {
  for (const { label, level } of RISK_LADDER) {
    if (labels.has(label)) return level
  }
  return 'minimaal'
}

/** The roles the run assigned, in a stable display order. */
export function rolesFor(labels: ReadonlySet<string>): string[] {
  return ['aanbieder', 'gebruiksverantwoordelijke', 'importeur', 'distributeur'].filter((r) => labels.has(r))
}

const LEVEL_LABELS: Record<string, string> = {
  onaanvaardbaar: 'Verboden AI',
  hoog: 'Hoog risico',
  beperkt: 'Beperkt risico',
  minimaal: 'Minimaal risico',
}

/** Just the outcome, no roles — for tight spots like a tag on a form card.
 *  Pass the conclusion id so an out-of-scope run is named as such instead of
 *  being flattened into "minimaal risico". */
export function verdictLevelLabel(labels: ReadonlySet<string>, conclusionId?: string | null): string {
  if (isOutOfScope(labels, conclusionId)) return 'Verordening niet van toepassing'
  return LEVEL_LABELS[riskLevelFor(labels) ?? 'minimaal'] ?? 'Onbepaald'
}

/** Outcome plus the roles it assigned, e.g. "Hoog risico · aanbieder". */
export function verdictSummary(labels: ReadonlySet<string>, conclusionId?: string | null): string {
  const head = verdictLevelLabel(labels, conclusionId)
  const roles = rolesFor(labels)
  return roles.length > 0 ? `${head} · ${roles.join(' + ')}` : head
}
