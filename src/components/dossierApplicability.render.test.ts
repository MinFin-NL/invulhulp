/**
 * Render test for the orientation list on the dossier overview (werkplan-kompas
 * §4, "klaar als"): a new dossier that has only had the toepassingsscan shows
 * every built form as geldt / nog onbekend / geldt niet, with why and for whom.
 *
 * Runs on the real public/forms/index.json, so a form added without an owner
 * or a rule without a reason shows up here. SSR keeps it dependency-free.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import DossierApplicability from './DossierApplicability.vue'
import { refreshDossierForms } from '../composables/useDossierForms'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import { SCAN_VERSION, deriveKenmerken, type ScanAnswers } from '../utils/toepassingsscan'

const indexJson = readFileSync(
  fileURLToPath(new URL('../../public/forms/index.json', import.meta.url)),
  'utf8',
)
const registry: { forms: { id: string; title: string; placeholder?: string }[] } = JSON.parse(indexJson)
const built = registry.forms.filter((f) => !f.placeholder)

const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).endsWith('/forms/index.json')
      ? new Response(indexJson, { status: 200 })
      : new Response('', { status: 404 })) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

async function render(answers: ScanAnswers | null) {
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
            answers: {},
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

  it('lists every built form once, with a reason and an owner', async () => {
    const html = await render(scan)
    for (const form of built) {
      const row = rowOf(html, form.title)
      expect(row, `${form.id}: no reason`).toContain('Waarom')
      expect(row, `${form.id}: no owner`).toContain('Eigenaar')
    }
    // Placeholders are announced, not fillable: they stay out of this list.
    for (const form of registry.forms.filter((f) => f.placeholder)) {
      expect(html).not.toContain(`>${form.title}<`)
    }
  })

  it('makes "geldt voor elk IV-verzoek" explicit and shows a recorded owner', async () => {
    const html = await render(scan)
    const intake = rowOf(html, 'Intakeformulier')
    expect(intake).toContain('Geldt voor elk IV-verzoek.')
    expect(intake).toContain('Intakeboard')
  })

  it('says so when no owner is recorded, instead of guessing', async () => {
    const html = await render(scan)
    expect(rowOf(html, 'DPIA')).toContain('nog niet vastgelegd')
  })

  it('rules forms out with the reason, and keeps an unknown out of "geldt niet"', async () => {
    const html = await render(scan)
    expect(html).toContain('Geldt niet (')
    expect(rowOf(html, 'DPIA')).toContain('Dit dossier heeft geen persoonsgegevens.')
    // AI is ruled out, so the IAMA is n.v.t. even though "besluit" is unknown.
    expect(rowOf(html, 'IAMA')).toContain('Dit dossier heeft geen algoritme of AI.')
  })

  it('names the scan question that decides an open point', async () => {
    // The behaviour question has no "weet ik niet"; left unanswered, AI stays unknown.
    const { gedrag: _unanswered, ...withoutBehaviour } = scan
    const html = await render(withoutBehaviour)
    expect(html).toContain('Nog onbekend (')
    // Unknown behaviour leaves the Model Card open; the behaviour question decides it.
    const modelcard = rowOf(html, 'AI-systeemregistratie (Model Card)')
    expect(modelcard).toContain('Beslist door')
    expect(modelcard).toContain('de scanvraag over algoritme of AI')
  })

  it('before any scan, points every conditional form at its deciding question', async () => {
    const html = await render(null)
    expect(html).toContain('Er is nog geen toepassingsscan gedaan.')
    expect(html).not.toContain('Geldt niet (')
    expect(rowOf(html, 'Verwerkingsregister (AVG art. 30)')).toContain('de scanvraag over persoonsgegevens')
    expect(rowOf(html, 'EU AI Act Compliance Checklist')).toContain('de Beslishulp AI-verordening')
  })
})
