/**
 * Render smoke test for the four dossier views (werkplan-kompas §3).
 *
 * Proves that DossierDetail renders the right view for each `dossierView` and
 * that the view switch is a navigation tab bar of hash links — the failure
 * modes of the split that a logic test cannot catch. SSR keeps it
 * dependency-free: no DOM, no @vue/test-utils.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import DossierDetail from './DossierDetail.vue'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import type { DossierView } from '../utils/dossierViews'

// The views load the form registry; in Node a relative fetch would throw.
const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).endsWith('/forms/index.json')
      ? new Response(JSON.stringify({ forms: [] }), { status: 200 })
      : new Response('', { status: 404 })) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

function dossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'd-1',
    name: 'Testdossier',
    createdAt: 0,
    sessionId: 's-1',
    activeFormId: null,
    forms: {},
    documents: [],
    ...overrides,
  }
}

async function render(view: DossierView, d: Dossier = dossier()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAssessmentStore().$patch({
    dossiers: { [d.id]: d },
    dossierOrder: [d.id],
    activeDossierId: d.id,
    screen: 'dossier',
    dossierView: view,
  })
  const app = createSSRApp(DossierDetail)
  app.use(pinia)
  return renderToString(app)
}

const withDocument = dossier({
  documents: [{ id: 'doc-1', name: 'notulen.txt', content: 'Notulen van de kick-off.', uploadedAt: 0, chunkCount: 2 }],
})

describe('dossier views render', () => {
  it('switches views with a navigation tab bar of hash links', async () => {
    const html = await render('overzicht')
    expect(html).toContain('<nldd-tab-bar')
    expect(html).toContain('navigation')
    expect(html).toContain('href="#/dossier/d-1"')
    expect(html).toContain('href="#/dossier/d-1/project"')
    expect(html).toContain('href="#/dossier/d-1/formulieren"')
    expect(html).toContain('href="#/dossier/d-1/bronnen"')
  })

  it('overzicht: an empty dossier starts at the project, not at an upload', async () => {
    const html = await render('overzicht')
    expect(html).toContain('Begin bij je project')
    expect(html).toContain('Naar Project')
    expect(html).not.toContain('Sleep je documenten hierheen')
  })

  it('overzicht: once something is there, what applies — no scan tile, no phase rail', async () => {
    const html = await render('overzicht', withDocument)
    expect(html).toContain('Wat geldt voor dit project')
    expect(html).toContain('Start toepassingsscan')
    expect(html).not.toContain('scan-tile')
    expect(html).not.toContain('phase-rail')
    expect(html).not.toContain('Begin bij je project')
  })

  it('project: the toepassingsscan', async () => {
    const html = await render('project')
    expect(html).toContain('scan-tile')
    expect(html).toContain('Start toepassingsscan')
  })

  it('formulieren: the phase timeline', async () => {
    const html = await render('formulieren')
    expect(html).toContain('track-timeline')
    expect(html).not.toContain('phase-rail')
  })

  it('bronnen: the documents card, with the drop zone while it is empty', async () => {
    const empty = await render('bronnen')
    expect(empty).toContain('Brondocumenten')
    expect(empty).toContain('Sleep je documenten hierheen')

    const filled = await render('bronnen', withDocument)
    expect(filled).toContain('notulen.txt')
    expect(filled).not.toContain('Sleep je documenten hierheen')
  })
})
