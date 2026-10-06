import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  KENMERK_IDS,
  SCAN_QUESTIONS,
  activeKenmerken,
  decidersFor,
  deriveKenmerken,
  evaluateApplicability,
  nextMultiChoice,
  orientationOf,
  unknownKenmerken,
  type ApplicabilityRule,
  type Kenmerken,
  type ScanAnswers,
} from './toepassingsscan'
import type { BeslishulpRun } from './beslishulp'

// The real registry, not a fixture: these tests are the guard rail on the
// applicability rules in index.json — the one place kenmerk names live as data.
const index: { forms: { id: string; placeholder?: string; owner?: string; applicability?: ApplicabilityRule }[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/forms/index.json', import.meta.url)), 'utf8'),
)

function kenmerken(overrides: Partial<Kenmerken>): Kenmerken {
  const base = Object.fromEntries(KENMERK_IDS.map((k) => [k, 'onbekend'])) as Kenmerken
  return { ...base, ...overrides }
}

function beslishulpRun(conclusionId: string, labels: string[] = []): BeslishulpRun {
  return { treeVersion: 'test', steps: [], labels, conclusionId, completedAt: 0 }
}

describe('index.json applicability rules', () => {
  it('only reference kenmerken the scan can derive', () => {
    const known = new Set<string>(KENMERK_IDS)
    for (const form of index.forms) {
      for (const group of form.applicability?.allOf ?? []) {
        expect(group.length, `${form.id}: empty OR group`).toBeGreaterThan(0)
        for (const k of group) {
          expect(known, `${form.id} references unknown kenmerk "${k}"`).toContain(k)
        }
      }
    }
  })

  it('give every conditional form a reason to show on the card', () => {
    for (const form of index.forms) {
      if (!form.applicability) continue
      expect(form.applicability.reason, `${form.id} has no reason`).toBeTruthy()
    }
  })

  it('give every form an owner, or an explicit TODO — never a silent gap', () => {
    for (const form of index.forms) {
      expect(form.owner, `${form.id} has no owner field`).toBeTruthy()
    }
  })
})

describe('scan definition', () => {
  it('has unique question and option ids', () => {
    expect(new Set(SCAN_QUESTIONS.map((q) => q.id)).size).toBe(SCAN_QUESTIONS.length)
    for (const q of SCAN_QUESTIONS) {
      expect(new Set(q.opties.map((o) => o.id)).size, `${q.id} has duplicate option ids`).toBe(q.opties.length)
    }
  })

  it('only sets kenmerken the question claims to decide', () => {
    for (const q of SCAN_QUESTIONS) {
      for (const o of q.opties) {
        for (const k of o.sets ?? []) {
          expect(q.bepaalt, `${q.id}/${o.id} sets ${k} without declaring it`).toContain(k)
        }
      }
    }
  })

  it('asks nothing that steers no form — every kenmerk is tested by index.json', () => {
    // The reason the scan is six questions and not eight: a kenmerk no rule
    // reads is a question nobody has to answer (docs §7.2).
    const tested = new Set(index.forms.flatMap((f) => f.applicability?.allOf.flat() ?? []))
    expect([...KENMERK_IDS].filter((k) => !tested.has(k))).toEqual([])
  })

  it('leaves every kenmerk except ai_verordening_in_scope derivable from the scan', () => {
    const covered = new Set(SCAN_QUESTIONS.flatMap((q) => q.bepaalt))
    covered.add('ai_verordening_in_scope') // comes from the beslishulp
    expect([...KENMERK_IDS].filter((k) => !covered.has(k))).toEqual([])
  })
})

describe('deriveKenmerken', () => {
  it('leaves everything onbekend when nothing has been answered', () => {
    const result = deriveKenmerken({})
    expect(unknownKenmerken(result)).toEqual([...KENMERK_IDS])
  })

  it('concludes false when a question is answered without a setter', () => {
    expect(deriveKenmerken({ dataset: ['nee'] }).eigen_dataset).toBe(false)
  })

  it('keeps "weet ik niet" out of the false bucket', () => {
    expect(deriveKenmerken({ dataset: ['onbekend'] }).eigen_dataset).toBe('onbekend')
  })

  it('ORs the options of a multi-select', () => {
    expect(deriveKenmerken({ oplevering: ['api', 'webapp'] }).gebruikersinterface).toBe(true)
    expect(deriveKenmerken({ oplevering: ['api', 'infra'] }).gebruikersinterface).toBe(false)
  })

  it('ignores answers to questions that no longer exist', () => {
    // A run stored under SCAN_VERSION 1 still carries `bijzonder` and `schaal`.
    const answers: ScanAnswers = { pg: ['ja'], bijzonder: ['gezondheid'], schaal: ['groot'] }
    expect(deriveKenmerken(answers).persoonsgegevens).toBe(true)
    expect(activeKenmerken(deriveKenmerken(answers))).toEqual(['persoonsgegevens'])
  })

  it('rules out the AI-verordening when there is no algorithm at all', () => {
    expect(deriveKenmerken({ gedrag: ['geen'] }).ai_verordening_in_scope).toBe(false)
  })

  it('takes the verordening verdict from the beslishulp, not from the scan', () => {
    const answers: ScanAnswers = { gedrag: ['leert'] }
    expect(deriveKenmerken(answers).ai_verordening_in_scope).toBe('onbekend')
    expect(deriveKenmerken(answers, beslishulpRun('11.1')).ai_verordening_in_scope).toBe(false)
    expect(deriveKenmerken(answers, beslishulpRun('4.2', ['hoog-risico AI'])).ai_verordening_in_scope).toBe(true)
  })

  it('reports only the kenmerken that hold as tags', () => {
    const result = deriveKenmerken({ pg: ['ja'], gedrag: ['geen'] })
    expect(activeKenmerken(result)).toEqual(['persoonsgegevens'])
  })
})

describe('evaluateApplicability', () => {
  const rule: ApplicabilityRule = {
    allOf: [['algoritme_of_ai'], ['besluit_over_personen', 'raakt_burgers']],
    reason: 'reden',
  }

  it('calls a form without a rule always applicable', () => {
    expect(evaluateApplicability(undefined, kenmerken({})).status).toBe('altijd')
  })

  it('is onbepaald before a scan has been run', () => {
    expect(evaluateApplicability(rule, null).status).toBe('onbepaald')
  })

  it('requires the form when every group holds', () => {
    const v = evaluateApplicability(rule, kenmerken({ algoritme_of_ai: true, raakt_burgers: true }))
    expect(v.status).toBe('verplicht')
    expect(v.reason).toBe('reden')
  })

  it('rules the form out when one group is decidedly false', () => {
    const v = evaluateApplicability(rule, kenmerken({ algoritme_of_ai: false, raakt_burgers: true }))
    expect(v.status).toBe('nvt')
    expect(v.kenmerken).toEqual(['algoritme_of_ai'])
  })

  it('needs every member of an OR group to be false before ruling out', () => {
    const v = evaluateApplicability(
      rule,
      kenmerken({ algoritme_of_ai: true, besluit_over_personen: false, raakt_burgers: 'onbekend' }),
    )
    expect(v.status).toBe('mogelijk')
  })

  it('never turns an unknown kenmerk into "niet van toepassing"', () => {
    const v = evaluateApplicability(rule, kenmerken({ algoritme_of_ai: 'onbekend', raakt_burgers: true }))
    expect(v.status).toBe('mogelijk')
    expect(v.kenmerken).toEqual(['algoritme_of_ai'])
  })

  it('downgrades an advisory rule to "mogelijk relevant"', () => {
    const v = evaluateApplicability(
      { allOf: [['persoonsgegevens']], reason: 'reden', advisory: true },
      kenmerken({ persoonsgegevens: true }),
    )
    expect(v.status).toBe('mogelijk')
  })
})

describe('the matrix in docs §5.4', () => {
  /** Status of every form in the registry for a given set of answers. */
  function statuses(answers: ScanAnswers, beslishulp?: BeslishulpRun): Record<string, string> {
    const k = deriveKenmerken(answers, beslishulp)
    return Object.fromEntries(
      index.forms.map((f) => [f.id, evaluateApplicability(f.applicability, k).status]),
    )
  }

  it('keeps intake and quickscan applicable no matter what', () => {
    const s = statuses({ pg: ['nee'], gedrag: ['geen'], dataset: ['nee'], oplevering: ['api'], doelgroep: ['intern'] })
    expect(s.intake).toBe('altijd')
    expect(s.quickscan).toBe('altijd')
  })

  it('rules out the privacy forms for an infrastructure replacement without persoonsgegevens', () => {
    const s = statuses({ pg: ['nee'], gedrag: ['geen'], dataset: ['nee'], oplevering: ['infra'], doelgroep: ['intern'] })
    expect(s.prescandpia).toBe('nvt')
    expect(s.verwerkingsregister).toBe('nvt')
    expect(s.dpia).toBe('nvt')
    expect(s.toegankelijkheid).toBe('nvt')
    expect(s.modelcard).toBe('nvt')
  })

  it('AI without persoonsgegevens: IAMA and DPIA off, Model Card on', () => {
    const s = statuses({
      pg: ['nee'],
      gedrag: ['leert'],
      besluit: ['nee'],
      dataset: ['ja'],
      oplevering: ['api'],
      doelgroep: ['intern'],
    })
    expect(s.dpia).toBe('nvt')
    expect(s.iama).toBe('nvt')
    expect(s.modelcard).toBe('verplicht')
    expect(s.datakwaliteit).toBe('verplicht')
  })

  it('persoonsgegevens without AI is the mirror image', () => {
    const s = statuses({
      pg: ['ja'],
      gedrag: ['geen'],
      besluit: ['nee'],
      dataset: ['nee'],
      oplevering: ['webapp'],
      doelgroep: ['burgers'],
    })
    expect(s.prescandpia).toBe('verplicht')
    expect(s.verwerkingsregister).toBe('verplicht')
    expect(s.modelcard).toBe('nvt')
    expect(s.iama).toBe('nvt')
    expect(s.algoritmeregister).toBe('nvt')
    expect(s.euaiact).toBe('nvt')
    expect(s.toegankelijkheid).toBe('verplicht')
  })

  it('leaves the EU AI Act checklist to the beslishulp', () => {
    const answers: ScanAnswers = { gedrag: ['leert'], besluit: ['neemt'], doelgroep: ['burgers'] }
    expect(statuses(answers).euaiact).toBe('mogelijk')
    expect(statuses(answers, beslishulpRun('11.1')).euaiact).toBe('nvt')
    expect(statuses(answers, beslishulpRun('4.2', ['hoog-risico AI'])).euaiact).toBe('verplicht')
  })

  it('keeps the project forms off the kenmerken axis entirely', () => {
    const s = statuses({ pg: ['nee'], gedrag: ['geen'], dataset: ['nee'], oplevering: ['infra'], doelgroep: ['intern'] })
    for (const id of ['ppm', 'psa', 'aanbiedingsformulier', 'restrisico']) {
      expect(s[id], `${id} should not be gated by the scan`).toBe('altijd')
    }
  })
})

describe('orientation for the dossier overview', () => {
  it('folds the five statuses into geldt / onbekend / geldt niet', () => {
    expect(orientationOf('altijd')).toBe('geldt')
    expect(orientationOf('verplicht')).toBe('geldt')
    expect(orientationOf('nvt')).toBe('geldt-niet')
    // Unknown is never "geldt niet": not before the scan, not after a "weet ik niet".
    expect(orientationOf('mogelijk')).toBe('onbekend')
    expect(orientationOf('onbepaald')).toBe('onbekend')
  })

  it('says a form without a rule applies to every IV-verzoek', () => {
    expect(evaluateApplicability(undefined, null).reason).toBe('Geldt voor elk IV-verzoek.')
  })
})

describe('decidersFor', () => {
  const rule = (allOf: ApplicabilityRule['allOf'], advisory = false): ApplicabilityRule => ({ allOf, reason: 'r', advisory })

  it('points at the scan question behind every kenmerk before a scan', () => {
    const d = decidersFor(rule([['algoritme_of_ai'], ['raakt_burgers', 'besluit_over_personen']]), null)
    expect(d.map((x) => x.kind === 'scan' && x.questionId)).toEqual(['gedrag', 'doelgroep', 'besluit'])
  })

  it('names only what is still open after a scan', () => {
    const d = decidersFor(
      rule([['algoritme_of_ai'], ['raakt_burgers', 'besluit_over_personen']]),
      kenmerken({ algoritme_of_ai: true, raakt_burgers: 'onbekend', besluit_over_personen: false }),
    )
    expect(d).toEqual([{ kind: 'scan', questionId: 'doelgroep', kenmerk: 'raakt_burgers' }])
  })

  it('has nothing to decide once a group holds, or for an advisory rule that holds', () => {
    expect(decidersFor(rule([['persoonsgegevens']]), kenmerken({ persoonsgegevens: true }))).toEqual([])
    expect(decidersFor(rule([['persoonsgegevens']], true), kenmerken({ persoonsgegevens: true }))).toEqual([])
    expect(decidersFor(undefined, null)).toEqual([])
  })

  it('sends the AI-verordening to the beslishulp, and to the behaviour question while AI is unknown', () => {
    const verordening = rule([['ai_verordening_in_scope']])
    expect(decidersFor(verordening, null)).toEqual([
      { kind: 'scan', questionId: 'gedrag', kenmerk: 'algoritme_of_ai' },
      { kind: 'beslishulp', kenmerk: 'ai_verordening_in_scope' },
    ])
    // AI is known to be there: only the beslishulp can settle it now.
    expect(decidersFor(verordening, kenmerken({ algoritme_of_ai: true }))).toEqual([
      { kind: 'beslishulp', kenmerk: 'ai_verordening_in_scope' },
    ])
  })

  it('can name a decider for every rule in the real index.json', () => {
    for (const form of index.forms) {
      if (!form.applicability) continue
      expect(decidersFor(form.applicability, null).length, `${form.id} has no decider`).toBeGreaterThan(0)
    }
  })
})

describe('nextMultiChoice', () => {
  const gedrag = SCAN_QUESTIONS.find((q) => q.id === 'gedrag')!

  it('survives the double change event a single click produces', () => {
    const once = nextMultiChoice(gedrag, [], 'genereert', true)
    const twice = nextMultiChoice(gedrag, once, 'genereert', true)
    expect(once).toEqual(['genereert'])
    expect(twice).toEqual(['genereert'])
    const off = nextMultiChoice(gedrag, twice, 'genereert', false)
    expect(nextMultiChoice(gedrag, off, 'genereert', false)).toEqual([])
  })

  it('lets "geen van deze" clear the rest, and anything else clear it', () => {
    expect(nextMultiChoice(gedrag, ['genereert', 'leert'], 'geen', true)).toEqual(['geen'])
    expect(nextMultiChoice(gedrag, ['geen'], 'leert', true)).toEqual(['leert'])
  })
})
