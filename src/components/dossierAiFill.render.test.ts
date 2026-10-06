/**
 * Render test for "Vul alle formulieren in met AI" on the Overzicht view.
 *
 * The band only shows with empty forms to fill, so this serves the real
 * registry and form files. The views load them in onMounted, which SSR skips,
 * so they are loaded before rendering. Own file on purpose: useFormProgress
 * loads once per module, and another test's empty registry would stick.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import DossierDetail from './DossierDetail.vue'
import { refreshDossierForms } from '../composables/useDossierForms'
import { useFormProgress } from '../composables/useFormProgress'
import { useAssessmentStore, type Dossier, type FormState } from '../stores/assessmentStore'

const publicDir = fileURLToPath(new URL('../../public', import.meta.url))
const realFetch = globalThis.fetch

/** One answer in the intake: enough to skip the first-run screen, while every
 *  other form stays empty and so lands in the band's queue. */
const intake: FormState = {
  answers: { 'intake_a.contactpersoon': 'J. Jansen' },
  answerSources: {},
  attachments: {},
  currentView: 'home',
  completedSections: [],
  riskLevel: null,
  goDecision: null,
}

function dossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'd-1',
    name: 'Testdossier',
    createdAt: 0,
    sessionId: 's-1',
    activeFormId: null,
    forms: { intake },
    documents: [],
    ...overrides,
  }
}

async function renderOverzicht(d: Dossier) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAssessmentStore().$patch({
    dossiers: { [d.id]: d },
    dossierOrder: [d.id],
    activeDossierId: d.id,
    screen: 'dossier',
    dossierView: 'overzicht',
  })
  const app = createSSRApp(DossierDetail)
  app.use(pinia)
  return renderToString(app)
}

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    try {
      return new Response(readFileSync(publicDir + String(input), 'utf8'), { status: 200 })
    } catch {
      return new Response('', { status: 404 })
    }
  }) as typeof fetch
  setActivePinia(createPinia())
  await refreshDossierForms()
  const { progressFor } = useFormProgress()
  for (let i = 0; i < 200 && !progressFor(dossier(), 'aanbiedingsformulier'); i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe('Vul alle formulieren in met AI, on Overzicht', () => {
  it('points to Bronnen while there is no document', async () => {
    const html = await renderOverzicht(dossier())
    expect(html).toContain('Vul alle formulieren in met AI')
    expect(html).toContain('bij Bronnen')
    expect(html).toContain('Naar Bronnen')
  })

  it('offers the start button once a document is there', async () => {
    const html = await renderOverzicht(
      dossier({
        documents: [{ id: 'doc-1', name: 'notulen.txt', content: 'Notulen.', uploadedAt: 0, chunkCount: 2 }],
      }),
    )
    expect(html).toContain('Vul alle formulieren in met AI')
    expect(html).not.toContain('Naar Bronnen')
    expect(html).toMatch(/Vul \d+ formulieren in/)
  })
})
