// @vitest-environment jsdom
/**
 * End-to-end check of the Intake → Projectaanbiedingsformulier prefill against
 * the *real* form JSON and the real mappings file, using the real store.
 *
 * The reported bug this guards: filling in the intake and then opening the
 * aanbiedingsformulier showed an entirely empty form, even though the two were
 * deliberately aligned on their shared fields.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('../services/dossierService', () => ({
  saveDossier: vi.fn().mockResolvedValue({}),
  fetchDossiers: vi.fn().mockResolvedValue([]),
  deleteDossierOnServer: vi.fn().mockResolvedValue({}),
}))
vi.mock('../services/llmService', () => ({
  indexDocument: vi.fn().mockResolvedValue({ chunkCount: 0, ontology: {} }),
  deleteDocument: vi.fn().mockResolvedValue({}),
  deleteImage: vi.fn().mockResolvedValue({}),
  listDocuments: vi.fn().mockResolvedValue([]),
}))

// Serve public/forms/* from disk so formLoader's fetch works under node.
vi.stubGlobal('fetch', async (url: string) => {
  const path = resolve(__dirname, '../../public', url.replace(/^\//, ''))
  const body = readFileSync(path, 'utf-8')
  return { ok: true, json: async () => JSON.parse(body) }
})

const { prefillCopyAnswers } = await import('./useCrossFormPrefill')
const { loadForm } = await import('../services/formLoader')
const { useAssessmentStore } = await import('../stores/assessmentStore')
const { deriveKenmerken, SCAN_VERSION } = await import('../utils/toepassingsscan')

describe('prefillCopyAnswers: intake → aanbiedingsformulier', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function openPafAfterIntake(intake: Record<string, string | string[]>) {
    const store = useAssessmentStore()
    store.ensureDossier()
    for (const [id, value] of Object.entries(intake)) {
      store.setAnswerForForm('intake', id, value)
    }
    store.setActiveForm('aanbiedingsformulier')
    const summary = await prefillCopyAnswers(await loadForm('aanbiedingsformulier'))
    return { store, summary }
  }

  it('carries the shared fields over verbatim', async () => {
    const { store, summary } = await openPafAfterIntake({
      'intake_a.contactpersoon': '<p>J. Jansen</p>',
      'intake_a.email': '<p>j.jansen@minfin.nl</p>',
      'intake_b.aanleiding': '<p>Verplichting uit de Wet open overheid.</p>',
      'intake_b.doelstelling': '<p>Documenten sneller vindbaar maken.</p>',
      'intake_d.afhankelijkheden': '<p>Afhankelijk van het DMS-project.</p>',
    })

    const answers = store.forms.aanbiedingsformulier.answers
    expect(answers['aa_a.contactpersoon']).toBe('<p>J. Jansen</p>')
    expect(answers['aa_a.email']).toBe('<p>j.jansen@minfin.nl</p>')
    expect(answers['aa_b.aanleiding']).toBe('<p>Verplichting uit de Wet open overheid.</p>')
    expect(answers['aa_b.doelstelling']).toBe('<p>Documenten sneller vindbaar maken.</p>')
    expect(answers['aa_c.afhankelijkheden']).toBe('<p>Afhankelijk van het DMS-project.</p>')
    expect(summary).toEqual({ count: 5, sourceFormIds: ['intake'], fromScan: false })
  })

  it('leaves questions the intake never asked empty', async () => {
    const { store } = await openPafAfterIntake({ 'intake_a.contactpersoon': '<p>J. Jansen</p>' })
    // Baten are asked in the aanbiedingsformulier only.
    expect(store.forms.aanbiedingsformulier.answers['aa_e.kwantitatieve_baten']).toBeUndefined()
  })

  it('never overwrites an answer the user already gave', async () => {
    const store = useAssessmentStore()
    store.ensureDossier()
    store.setAnswerForForm('intake', 'intake_b.aanleiding', '<p>Uit de intake.</p>')
    store.setAnswerForForm('aanbiedingsformulier', 'aa_b.aanleiding', '<p>Zelf herschreven.</p>')
    store.setActiveForm('aanbiedingsformulier')

    const summary = await prefillCopyAnswers(await loadForm('aanbiedingsformulier'))
    expect(store.forms.aanbiedingsformulier.answers['aa_b.aanleiding']).toBe('<p>Zelf herschreven.</p>')
    expect(summary.count).toBe(0)
  })

  it('does nothing when the intake is still empty', async () => {
    const { summary } = await openPafAfterIntake({})
    expect(summary).toEqual({ count: 0, sourceFormIds: [], fromScan: false })
  })

  it('does not write into a dossier the user may only read', async () => {
    const store = useAssessmentStore()
    store.ensureDossier()
    store.setAnswerForForm('intake', 'intake_b.aanleiding', '<p>Uit de intake.</p>')
    store.setActiveForm('aanbiedingsformulier')
    store.dossiers[store.activeDossierId!].myRole = 'viewer'

    const summary = await prefillCopyAnswers(await loadForm('aanbiedingsformulier'))
    expect(summary.count).toBe(0)
    expect(store.forms.aanbiedingsformulier.answers['aa_b.aanleiding']).toBeUndefined()
  })
})

describe('prefillCopyAnswers: facts before mappings', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('answers the same-fact question from the toepassingsscan, and says so', async () => {
    const store = useAssessmentStore()
    store.ensureDossier()
    store.setToepassingsscanRun({
      scanVersion: SCAN_VERSION,
      answers: { pg: ['ja'] },
      kenmerken: deriveKenmerken({ pg: ['ja'] }),
      completedAt: 0,
    })
    store.setActiveForm('quickscan')
    const summary = await prefillCopyAnswers(await loadForm('quickscan'))

    expect(store.forms.quickscan.answers['qs_d.persoonsgegevens']).toBe('Ja')
    // Only the question that asks exactly this fact: not the one about
    // special categories, which the scan does not establish.
    expect(store.forms.quickscan.answers['qs_d.bijzondere_persoonsgegevens'] ?? '').toBe('')
    expect(summary.fromScan).toBe(true)
  })

  it('carries a voorblad field to every form that asks it again', async () => {
    const store = useAssessmentStore()
    store.ensureDossier()
    store.setAnswerForForm('intake', 'intake_a.naam_opdrachtgever', '<p>Mr. A. Opdrachtgever</p>')
    store.setActiveForm('ihhtoets')
    const summary = await prefillCopyAnswers(await loadForm('ihhtoets'))

    expect(store.forms.ihhtoets.answers['ihh_a.opdrachtgever']).toBe('<p>Mr. A. Opdrachtgever</p>')
    expect(summary.sourceFormIds).toContain('intake')
    expect(summary.fromScan).toBe(false)
  })

  it('never overwrites an answer that is already there', async () => {
    const store = useAssessmentStore()
    store.ensureDossier()
    store.setAnswerForForm('intake', 'intake_a.naam_opdrachtgever', '<p>Uit de intake</p>')
    store.setAnswerForForm('ihhtoets', 'ihh_a.opdrachtgever', '<p>Zelf ingevuld</p>')
    store.setActiveForm('ihhtoets')
    await prefillCopyAnswers(await loadForm('ihhtoets'))

    expect(store.forms.ihhtoets.answers['ihh_a.opdrachtgever']).toBe('<p>Zelf ingevuld</p>')
  })
})
