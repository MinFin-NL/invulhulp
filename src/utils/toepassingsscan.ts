/**
 * Toepassingsscan — which forms apply to this dossier, and why.
 *
 * See docs/toepasselijkheid-van-formulieren.md §5. Three moving parts:
 *
 *   scan answers  →  kenmerken  →  per-form applicability
 *
 * The middle layer is the point. Forms never reference a scan question id:
 * they declare conditions over named *kenmerken* (`persoonsgegevens`,
 * `algoritme_of_ai`, …) in public/forms/index.json. That way question wording
 * can change without breaking nineteen forms, and a kenmerk can get a better
 * source later (a form outcome instead of a self-declaration) without touching
 * the forms at all.
 *
 * Everything here is pure and synchronous — state in, verdict out — so the
 * components stay thin renderers and toepassingsscan.test.ts can prove the
 * matrix in docs §5.4 against the real index.json.
 *
 * Three-valued on purpose: a kenmerk is true, false, or `onbekend`, and
 * `onbekend` is NOT false. "We don't know yet" must surface as *mogelijk
 * relevant*, never as "niet van toepassing" — see the liability note in §5.7.
 *
 * Every kenmerk here earns its place by steering at least one form. Two
 * earlier ones (`bijzondere_persoonsgegevens`, `grootschalig`) did not: they
 * cost two of the eight questions — the only two gated ones — and produced
 * nothing but a tag. They were dropped in SCAN_VERSION 2 (docs §7.2); the
 * prescan and the DPIA ask for that detail where it actually does work.
 */
import type { BeslishulpRun } from './beslishulp'
import { isOutOfScope } from './beslishulp'

// ---------------------------------------------------------------------------
// Kenmerken
// ---------------------------------------------------------------------------

/** The properties a dossier can have. The vocabulary shared by the scan (which
 *  derives them) and index.json (which tests them). */
export type KenmerkId =
  | 'persoonsgegevens'
  | 'besluit_over_personen'
  | 'algoritme_of_ai'
  | 'ai_verordening_in_scope'
  | 'gebruikersinterface'
  | 'eigen_dataset'
  | 'raakt_burgers'

/** `'onbekend'` is a third value, not a synonym for false. */
export type KenmerkValue = boolean | 'onbekend'

export type Kenmerken = Record<KenmerkId, KenmerkValue>

/** How a kenmerk reads as a tag on the dossier page. */
export const KENMERK_LABEL: Record<KenmerkId, string> = {
  persoonsgegevens: 'persoonsgegevens',
  besluit_over_personen: 'besluit over personen',
  algoritme_of_ai: 'algoritme of AI',
  ai_verordening_in_scope: 'AI-verordening van toepassing',
  gebruikersinterface: 'gebruikersinterface',
  eigen_dataset: 'eigen dataset',
  raakt_burgers: 'externe werking',
}

export const KENMERK_IDS = Object.keys(KENMERK_LABEL) as KenmerkId[]

/** Where a kenmerk got its value — the distinction in docs §5.3: a scan answer
 *  is a cheap self-declaration, a form outcome is derived evidence. Shown in
 *  the scan summary so nobody mistakes the first for the second. */
export const KENMERK_SOURCE: Record<KenmerkId, 'scan' | 'beslishulp'> = {
  persoonsgegevens: 'scan',
  besluit_over_personen: 'scan',
  algoritme_of_ai: 'scan',
  ai_verordening_in_scope: 'beslishulp',
  gebruikersinterface: 'scan',
  eigen_dataset: 'scan',
  raakt_burgers: 'scan',
}

function allUnknown(): Kenmerken {
  return Object.fromEntries(KENMERK_IDS.map((k) => [k, 'onbekend'])) as Kenmerken
}

// ---------------------------------------------------------------------------
// The scan itself
// ---------------------------------------------------------------------------

export interface ScanOption {
  id: string
  label: string
  hint?: string
  /** Kenmerken this option asserts as true. Options OR together. */
  sets?: KenmerkId[]
  /** "Weet ik niet": leaves this question's kenmerken at `onbekend` instead of
   *  concluding false. */
  onbekend?: boolean
  /**
   * Multi-select only: this option cannot be combined with any other ("nee,
   * geen van deze"). Not the same as having no `sets` — a project really can
   * deliver both an API and infrastructure, and both of those set nothing.
   */
  exclusief?: boolean
}

export interface ScanQuestion {
  id: string
  vraag: string
  toelichting?: string
  /** 'single' = radio, 'multi' = checkbox. Both persist as a list of option ids. */
  type: 'single' | 'multi'
  /** The kenmerken this question decides. Answering it without picking a
   *  setter concludes `false` for all of them. */
  bepaalt: KenmerkId[]
  opties: ScanOption[]
}

/** Bumped when the questions change meaning, so a stored run can say which
 *  wording it was answered against. 2 = the six-question scan; version 1 had
 *  two extra questions whose answers no longer mean anything. */
export const SCAN_VERSION = '2'

/**
 * The questions.
 *
 * Deliberately behavioural rather than label-based (docs §5.5): nobody
 * recognises their Excel scoring rule or a vendor's "smart suggestions" as AI,
 * and the incentive here runs the wrong way — a "nee" saves you six forms. So
 * we ask what the system *does*, and let the engine draw the conclusion.
 *
 * Six questions, none conditional on another, which is why they fit on one
 * page instead of in a wizard. Keep it that way: a question that has to be
 * gated is usually a question the receiving form should be asking itself.
 *
 * In code rather than in public/ on purpose: every `sets` entry has to be a
 * real KenmerkId, and a typo in a JSON asset would silently disable a rule.
 * The per-form conditions in index.json stay data — those are validated
 * against KENMERK_IDS by toepassingsscan.test.ts.
 */
export const SCAN_QUESTIONS: ScanQuestion[] = [
  {
    id: 'pg',
    vraag: 'Komen er in dit project gegevens voor die — ook indirect — naar een persoon te herleiden zijn?',
    toelichting:
      'Denk breed: ook personeelsnummers, IP-adressen, logging en pseudoniemen tellen mee, net als gegevens over eigen medewerkers.',
    type: 'single',
    bepaalt: ['persoonsgegevens'],
    opties: [
      { id: 'ja', label: 'Ja', sets: ['persoonsgegevens'] },
      { id: 'nee', label: 'Nee, uitsluitend gegevens die niet naar personen herleidbaar zijn' },
      { id: 'onbekend', label: 'Weet ik niet', onbekend: true },
    ],
  },
  {
    id: 'gedrag',
    vraag: 'Wat doet het systeem? Kruis alles aan wat van toepassing is.',
    toelichting:
      'Niet: heet het "AI"? Een scoringsregel in een spreadsheet telt hier net zo goed mee als een taalmodel.',
    type: 'multi',
    bepaalt: ['algoritme_of_ai'],
    opties: [
      { id: 'rangschikt', label: 'Rangschikt, scoort of prioriteert mensen of zaken', sets: ['algoritme_of_ai'] },
      { id: 'genereert', label: 'Genereert tekst, beeld, geluid of code', sets: ['algoritme_of_ai'] },
      { id: 'leert', label: 'Leert van data of past zijn gedrag in de tijd aan', sets: ['algoritme_of_ai'] },
      { id: 'herkent', label: 'Herkent patronen, beelden, spraak of tekst', sets: ['algoritme_of_ai'] },
      {
        id: 'ingekocht',
        label: 'Bevat een ingekochte component die als "slim" of "AI" wordt aangeprezen',
        hint: 'Ook als de leverancier het bouwt en beheert: het ministerie biedt het aan.',
        sets: ['algoritme_of_ai'],
      },
      { id: 'geen', label: 'Nee, geen van deze — het systeem volgt alleen vaste, door mensen opgeschreven regels', exclusief: true },
    ],
  },
  {
    id: 'besluit',
    vraag: 'Ondersteunt of vervangt het systeem een besluit of beoordeling over een persoon?',
    toelichting:
      'Bijvoorbeeld een aanvraag toekennen of afwijzen, selecteren voor controle, een risico-inschatting of het beoordelen van medewerkers.',
    type: 'single',
    bepaalt: ['besluit_over_personen'],
    opties: [
      { id: 'neemt', label: 'Ja, het neemt zo’n besluit of bereidt het voor', sets: ['besluit_over_personen'] },
      { id: 'hulpmiddel', label: 'Ja, maar alleen als hulpmiddel bij een menselijk oordeel', sets: ['besluit_over_personen'] },
      { id: 'nee', label: 'Nee' },
      { id: 'onbekend', label: 'Weet ik niet', onbekend: true },
    ],
  },
  {
    id: 'oplevering',
    vraag: 'Wat levert dit project op, of wat gaat het ministerie hiermee aanbieden?',
    toelichting:
      'Het gaat om wat er wordt aangeboden, niet om wie het bouwt: ook bij ingekochte software ligt de verplichting bij de organisatie die het aanbiedt.',
    type: 'multi',
    bepaalt: ['gebruikersinterface'],
    opties: [
      { id: 'website', label: 'Publieke website of webformulier', sets: ['gebruikersinterface'] },
      { id: 'webapp', label: 'Besloten webapplicatie achter een login', sets: ['gebruikersinterface'] },
      { id: 'app', label: 'Mobiele app', sets: ['gebruikersinterface'] },
      { id: 'intranet', label: 'Intranet of extranet', sets: ['gebruikersinterface'] },
      { id: 'backoffice', label: 'Backoffice- of desktopsoftware zonder webinterface' },
      { id: 'api', label: 'API of koppelvlak' },
      { id: 'data', label: 'Dataproduct, dataset of model zonder eigen interface' },
      { id: 'infra', label: 'Infrastructuur of hardware' },
    ],
  },
  {
    id: 'dataset',
    vraag: 'Beheert dit project een eigen dataset, of levert het zelf gegevens aan anderen?',
    toelichting:
      'Alleen gegevens van een ander systeem tonen telt niet mee; een eigen bestand, datawarehouse of trainingsset wel.',
    type: 'single',
    bepaalt: ['eigen_dataset'],
    opties: [
      { id: 'ja', label: 'Ja', sets: ['eigen_dataset'] },
      { id: 'nee', label: 'Nee, er wordt geen eigen dataset beheerd of geleverd' },
      { id: 'onbekend', label: 'Weet ik niet', onbekend: true },
    ],
  },
  {
    id: 'doelgroep',
    vraag: 'Wie merkt straks iets van de werking van dit systeem?',
    toelichting:
      'Werking buiten de eigen organisatie bepaalt onder meer of publicatie in het Algoritmeregister speelt.',
    type: 'multi',
    bepaalt: ['raakt_burgers'],
    opties: [
      { id: 'burgers', label: 'Burgers', sets: ['raakt_burgers'] },
      { id: 'bedrijven', label: 'Bedrijven of instellingen buiten de rijksoverheid', sets: ['raakt_burgers'] },
      { id: 'medewerkers', label: 'Medewerkers van het ministerie of andere overheidsorganisaties' },
      { id: 'intern', label: 'Niemand buiten het projectteam — alleen interne techniek', exclusief: true },
    ],
  },
]

/**
 * The form whose state carries the toepassingsscan for a dossier.
 *
 * The scan describes the dossier, not a form — but the CRDT envelope is keyed
 * by form, and a genuine dossier-level field would mean touching the codec, the
 * server payload model and the stored dossier shape. So it rides on the intake,
 * the one form that is always applicable and always comes first, exactly as the
 * beslishulp rides on `euaiact` (see BESLISHULP_HOST_FORM_ID and docs
 * §5.2, "Opslagkeuze"). `toepassingsscanRun` in assessmentStore is the only
 * accessor — nothing else should reach for `forms.intake.toepassingsscan`.
 */
export const TOEPASSINGSSCAN_HOST_FORM_ID = 'intake'

/** Answers as persisted: question id → chosen option ids (one for 'single'). */
export type ScanAnswers = Record<string, string[]>

/**
 * The chosen options of a multi-select question after one checkbox reports its
 * new state. Idempotent on purpose: nldd-checkbox-field fires `change` twice
 * per click (its own event plus the inner nldd-checkbox's, bubbling up), so a
 * toggle would undo itself. "Nee, geen van deze" (exclusief) contradicts every
 * other option: ticking it clears the rest, and ticking anything else clears it.
 */
export function nextMultiChoice(
  question: ScanQuestion,
  current: string[],
  optionId: string,
  checked: boolean,
): string[] {
  if (!checked) return current.filter((id) => id !== optionId)
  if (current.includes(optionId)) return current
  const isExclusive = (id: string) => question.opties.find((o) => o.id === id)?.exclusief === true
  return isExclusive(optionId) ? [optionId] : [...current.filter((id) => !isExclusive(id)), optionId]
}

/** What we persist on the dossier once the scan has been run. */
export interface ToepassingsscanRun {
  /** SCAN_VERSION at the time of answering. */
  scanVersion: string
  answers: ScanAnswers
  /**
   * The kenmerken as they were when the scan was saved. Denormalised for the
   * record and the export, exactly like BeslishulpRun.labels: a later change to
   * the questions must never silently rewrite what somebody signed off on. The
   * live UI recomputes from `answers` instead — see deriveKenmerken.
   */
  kenmerken: Kenmerken
  completedAt: number
  completedBy?: string
}

// ---------------------------------------------------------------------------
// Derivation: answers → kenmerken
// ---------------------------------------------------------------------------

/**
 * Derive the dossier's kenmerken from the scan answers plus the beslishulp run.
 *
 * Two sources, per docs §5.3: the scan self-declares most kenmerken, but
 * `ai_verordening_in_scope` comes from the beslishulp — the instrument that
 * actually decides it. Recomputed live rather than read from the stored
 * snapshot so that running the beslishulp after the scan updates the picture.
 */
export function deriveKenmerken(answers: ScanAnswers, beslishulp?: BeslishulpRun | null): Kenmerken {
  const kenmerken = allUnknown()

  for (const question of SCAN_QUESTIONS) {
    // Unanswered stays `onbekend`: a question nobody got to is not a "nee".
    const chosen = answers[question.id] ?? []
    if (chosen.length === 0) continue

    const opties = chosen
      .map((id) => question.opties.find((o) => o.id === id))
      .filter((o): o is ScanOption => o !== undefined)
    if (opties.some((o) => o.onbekend)) continue

    for (const k of question.bepaalt) {
      kenmerken[k] = opties.some((o) => o.sets?.includes(k)) === true
    }
  }

  // No AI at all ⇒ the verordening cannot apply; otherwise only a finished
  // beslishulp run may decide it.
  if (kenmerken.algoritme_of_ai === false) {
    kenmerken.ai_verordening_in_scope = false
  } else if (beslishulp?.conclusionId) {
    kenmerken.ai_verordening_in_scope = !isOutOfScope(new Set(beslishulp.labels), beslishulp.conclusionId)
  }

  return kenmerken
}

/** Kenmerken that hold, for the tag row on the dossier page. Only `true` ones:
 *  a tag says what this dossier *has*. */
export function activeKenmerken(kenmerken: Kenmerken): KenmerkId[] {
  return KENMERK_IDS.filter((k) => kenmerken[k] === true)
}

/** Kenmerken the scan could not settle — the honest counterpart of the tags,
 *  and the reason a form can be "mogelijk relevant" rather than n.v.t. */
export function unknownKenmerken(kenmerken: Kenmerken): KenmerkId[] {
  return KENMERK_IDS.filter((k) => kenmerken[k] === 'onbekend')
}

// ---------------------------------------------------------------------------
// Applicability: kenmerken → per-form verdict
// ---------------------------------------------------------------------------

/**
 * A form's applicability condition, as declared in public/forms/index.json.
 *
 * `allOf` is an AND of ORs: every group must hold, and within a group any one
 * kenmerk suffices. That is exactly the shape the matrix in docs §5.4 needs
 * ("algoritme_of_ai EN (besluit_over_personen OF raakt_burgers)") and nothing
 * more — no negation, no nesting, no expression parser.
 */
export interface ApplicabilityRule {
  allOf: KenmerkId[][]
  /** Why the form applies when the condition holds. Shown on the card. */
  reason: string
  /**
   * The condition makes the form *possibly* relevant rather than required —
   * the real decision comes from another instrument. The DPIA is the case that
   * forces this: persoonsgegevens alone does not make a DPIA mandatory, the
   * prescan does (docs §5.3).
   */
  advisory?: boolean
}

/**
 * - `altijd`      — no condition declared: the form always belongs in a dossier
 * - `verplicht`   — the condition holds
 * - `mogelijk`    — the condition holds but only advises, or a kenmerk is unknown
 * - `nvt`         — a required group is decidedly false
 * - `onbepaald`   — no scan has been run yet
 */
export type ApplicabilityStatus = 'altijd' | 'verplicht' | 'mogelijk' | 'nvt' | 'onbepaald'

export interface ApplicabilityVerdict {
  status: ApplicabilityStatus
  /** One line for the card, the collapsed n.v.t. group and the export. */
  reason: string
  /** For `nvt`: the group that failed. For `mogelijk`: what is still unknown. */
  kenmerken: KenmerkId[]
}

function listLabels(ids: KenmerkId[]): string {
  const labels = ids.map((k) => KENMERK_LABEL[k])
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} of ${labels[labels.length - 1]}`
}

/**
 * Evaluate one form's rule against the dossier's kenmerken.
 *
 * `kenmerken` is null when no scan has been run — everything is `onbepaald`
 * then, which the UI renders neutrally. Never guess: a missing scan is not the
 * same as a scan that answered "nee".
 */
export function evaluateApplicability(
  rule: ApplicabilityRule | undefined,
  kenmerken: Kenmerken | null,
): ApplicabilityVerdict {
  if (!rule) {
    // Explicit rather than silent: without a rule the form applies everywhere,
    // and the overview has to say so (werkplan-kompas §4.3).
    return { status: 'altijd', reason: 'Geldt voor elk IV-verzoek.', kenmerken: [] }
  }
  if (!kenmerken) {
    return { status: 'onbepaald', reason: 'Nog geen toepassingsscan gedaan.', kenmerken: [] }
  }

  // One decidedly-false group is enough: the AND can never hold.
  const failed = rule.allOf.find((group) => group.every((k) => kenmerken[k] === false))
  if (failed) {
    return {
      status: 'nvt',
      reason: `Dit dossier heeft geen ${listLabels(failed)}.`,
      kenmerken: failed,
    }
  }

  const unknown = rule.allOf
    .filter((group) => !group.some((k) => kenmerken[k] === true))
    .flatMap((group) => group.filter((k) => kenmerken[k] === 'onbekend'))

  if (unknown.length > 0) {
    return {
      status: 'mogelijk',
      reason: `Nog niet vast te stellen: ${listLabels([...new Set(unknown)])} is onbekend.`,
      kenmerken: [...new Set(unknown)],
    }
  }

  return {
    status: rule.advisory ? 'mogelijk' : 'verplicht',
    reason: rule.reason,
    kenmerken: rule.allOf.flat(),
  }
}

const STATUS_LABEL: Record<ApplicabilityStatus, string> = {
  altijd: '',
  verplicht: 'Van toepassing',
  mogelijk: 'Mogelijk relevant',
  nvt: 'Niet van toepassing',
  onbepaald: '',
}

export function applicabilityLabel(status: ApplicabilityStatus): string {
  return STATUS_LABEL[status]
}

// ---------------------------------------------------------------------------
// Orientation: the three states the dossier overview speaks in
// ---------------------------------------------------------------------------

/**
 * What the dossier overview says per form (werkplan-kompas §4): it applies,
 * it does not, or it cannot be said yet. `mogelijk` and `onbepaald` both land
 * on `onbekend` — never on "geldt niet", because a question nobody answered
 * is not a "nee".
 */
export type Orientation = 'geldt' | 'onbekend' | 'geldt-niet'

export function orientationOf(status: ApplicabilityStatus): Orientation {
  if (status === 'altijd' || status === 'verplicht') return 'geldt'
  if (status === 'nvt') return 'geldt-niet'
  return 'onbekend'
}

/** What settles an open point about a form: one of the scan questions, or the
 *  beslishulp for the kenmerk that comes from there (KENMERK_SOURCE). */
export type Decider =
  | { kind: 'scan'; questionId: string; kenmerk: KenmerkId }
  | { kind: 'beslishulp'; kenmerk: KenmerkId }

/**
 * What still decides whether a form applies, in rule order and without
 * duplicates. Empty when nothing is open — including the advisory case, where
 * the condition holds and another instrument decides (its reason says which).
 */
export function decidersFor(rule: ApplicabilityRule | undefined, kenmerken: Kenmerken | null): Decider[] {
  if (!rule) return []
  const open = kenmerken
    ? rule.allOf
        .filter((group) => !group.some((k) => kenmerken[k] === true))
        .flat()
        .filter((k) => kenmerken[k] === 'onbekend')
    : rule.allOf.flat()

  const deciders: Decider[] = []
  const seen = new Set<string>()
  const addQuestionFor = (k: KenmerkId) => {
    const question = SCAN_QUESTIONS.find((q) => q.bepaalt.includes(k))
    if (question && !seen.has(question.id)) {
      seen.add(question.id)
      deciders.push({ kind: 'scan', questionId: question.id, kenmerk: k })
    }
  }

  for (const k of open) {
    if (KENMERK_SOURCE[k] !== 'beslishulp') {
      addQuestionFor(k)
      continue
    }
    // No AI at all already rules the verordening out (deriveKenmerken), so
    // while that is unknown the scan question about the system's behaviour
    // decides too — and it is the quicker of the two.
    if (!kenmerken || kenmerken.algoritme_of_ai === 'onbekend') addQuestionFor('algoritme_of_ai')
    if (!seen.has('beslishulp')) {
      seen.add('beslishulp')
      deciders.push({ kind: 'beslishulp', kenmerk: k })
    }
  }
  return deciders
}
