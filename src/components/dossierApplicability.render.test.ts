/**
 * Render test for the orientation list on the dossier overview (werkplan-kompas
 * §4, "klaar als"): a new dossier that has only had the toepassingsscan shows
 * every built form once — geldt voor dit project / voor elk IV-verzoek / nog
 * onbekend / geldt niet — with why, for whom where known, and how far along;
 * and the open points once per question that decides them.
 *
 * Runs on the real public/forms files, so a rule without a reason shows up
 * here. SSR keeps it dependency-free.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import DossierApplicability from './DossierApplicability.vue'
import { refreshDossierForms } from '../composables/useDossierForms'
import { useFormProgress } from '../composables/useFormProgress'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import { SCAN_VERSION, deriveKenmerken, type ScanAnswers } from '../utils/toepassingsscan'

const indexJson = readFileSync(
  fileURLToPath(new URL('../../public/forms/index.json', import.meta.url)),
  'utf8',
)
const registry: { forms: { id: string; title: string; placeholder?: string }[] } = JSON.parse(indexJson)
const built = registry.forms.filter((f) => !f.placeholder)

const publicDir = fileURLToPath(new URL('../../public', import.meta.url))
const realFetch = globalThis.fetch
beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    try {
      return new Response(readFileSync(publicDir + String(input), 'utf8'), { status: 200 })
    } catch {
      return new Response('', { status: 404 })
    }
  }) as typeof fetch
  // Progress loads once per module, in the background: wait for it, so the
  // status tags are there from the first test on.
  setActivePinia(createPinia())
  const { progressFor } = useFormProgress()
  const probe = { forms: {} } as Dossier
  for (let i = 0; i < 200 && !progressFor(probe, 'intake'); i++) await new Promise((r) => setTimeout(r, 10))
})
afterAll(() => {
  globalThis.fetch = realFetch
})

async function render(answers: ScanAnswers | null, intakeAnswers: Record<string, string> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const dossier: Dossier = {
    id: 'd-1',
    name: 'Nieuw dossier',
    createdAt: 0,
    sessionId: 's-1',
    activeFormId: null,
    documents: [],
    forms: answers
      ? {
          intake: {
            answers: intakeAnswers,
            answerSources: {},
            attachments: {},
            currentView: 'home',
            completedSections: [],
            riskLevel: null,
            goDecision: null,
            toepassingsscan: {
              scanVersion: SCAN_VERSION,
              answers,
              kenmerken: deriveKenmerken(answers),
              completedAt: 0,
            },
          },
        }
      : {},
  }
  useAssessmentStore().$patch({
    dossiers: { [dossier.id]: dossier },
    dossierOrder: [dossier.id],
    activeDossierId: dossier.id,
    screen: 'dossier',
  })
  await refreshDossierForms()
  const app = createSSRApp(DossierApplicability)
  app.use(pinia)
  return renderToString(app)
}

/** The text between one form's title and the next row. */
function rowOf(html: string, title: string): string {
  const start = html.indexOf(`>${title}<`)
  expect(start, `${title} is missing from the list`).toBeGreaterThan(-1)
  const end = html.indexOf('applicability__row', start)
  return html.slice(start, end === -1 ? undefined : end)
}

describe('orientation list', () => {
  // An infrastructure job: no persoonsgegevens, no AI, no interface, no dataset,
  // internal only — and "weet ik niet" on the decision question.
  const scan: ScanAnswers = {
    pg: ['nee'],
    gedrag: ['geen'],
    besluit: ['onbekend'],
    oplevering: ['infra'],
    dataset: ['nee'],
    doelgroep: ['intern'],
  }

  it('lists every built form exactly once', async () => {
    const html = await render(scan)
    for (const form of built) {
      expect(html.split(`>${form.title}<`).length - 1, `${form.id} not listed exactly once`).toBe(1)
    }
    // Placeholders are announced, not fillable: they stay out of this list.
    for (const form of registry.forms.filter((f) => f.placeholder)) {
      expect(html).not.toContain(`>${form.title}<`)
    }
  })

  it('says "voor elk IV-verzoek" once, in the group, and shows a recorded owner', async () => {
    const html = await render(scan)
    expect(html).toContain('Geldt voor elk IV-verzoek (')
    expect(html).not.toContain('Geldt voor elk IV-verzoek.')
    const intake = rowOf(html, 'Intakeformulier')
    expect(intake).not.toContain('Waarom')
    expect(intake).toContain('Intakeboard')
  })

  it('leaves an unknown owner out instead of guessing', async () => {
    const html = await render(scan)
    expect(html).not.toContain('nog niet vastgelegd')
    expect(rowOf(html, 'DPIA')).not.toContain('Eigenaar')
  })

  it('rules forms out with the reason, folded away, and keeps an unknown out of "geldt niet"', async () => {
    const html = await render(scan)
    expect(html).toContain('Geldt niet (')
    const details = html.indexOf('<details')
    expect(details).toBeGreaterThan(-1)
    expect(html.indexOf('>DPIA<')).toBeGreaterThan(details)
    expect(rowOf(html, 'DPIA')).toContain('Dit dossier heeft geen persoonsgegevens.')
    // AI is ruled out, so the IAMA is n.v.t. even though "besluit" is unknown.
    expect(rowOf(html, 'IAMA')).toContain('Dit dossier heeft geen algoritme of AI.')
  })

  it('gathers open points per deciding question, with one button each', async () => {
    // The behaviour question has no "weet ik niet"; left unanswered, AI stays unknown.
    const { gedrag: _unanswered, ...withoutBehaviour } = scan
    const html = await render(withoutBehaviour)
    expect(html).toContain('id="open-questions-title"')
    // Several forms hang on the behaviour question; it is asked once.
    expect(html.split('>Wat doet het systeem?<').length - 1).toBe(1)
    const open = html.slice(html.indexOf('id="open-questions-title"'), html.indexOf('id="applicability-title"'))
    expect(open).toContain('AI-systeemregistratie (Model Card)')
    expect(open).toContain('Beantwoorden')
  })

  it('shows how far each form is', async () => {
    const html = await render(scan, { 'intake_a.contactpersoon': 'J. Jansen' })
    expect(rowOf(html, 'Intakeformulier')).toMatch(/Bezig \(0\/\d+\)/)
    expect(rowOf(html, 'PSA')).toContain('Niet gestart')
  })

  it('before any scan, offers the scan instead of open questions', async () => {
    const html = await render(null)
    expect(html).toContain('Er is nog geen toepassingsscan gedaan.')
    expect(html).toContain('Start toepassingsscan')
    expect(html).not.toContain('id="open-questions-title"')
    expect(html).not.toContain('Geldt niet (')
    expect(html).toContain('Nog onbekend (')
    // The head says there is no scan; the rows don't repeat it.
    expect(html).not.toContain('Nog geen toepassingsscan gedaan.')
  })
})
