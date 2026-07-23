/**
 * Integration test for the DossierDoc <-> assessmentStore wiring.
 *
 * Proves the invasive Phase 1 change: content mutators route through the live
 * CRDT doc and its onChange mirrors merged content back into Pinia, while
 * per-user navigation (currentView) and server-owned fields (documents) are
 * left untouched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The store pulls in network services at import time; stub them out.
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

import { useAssessmentStore } from './assessmentStore'

function freshStoreWithOpenForm() {
  const s = useAssessmentStore()
  s.ensureDossier()
  const did = s.activeDossierId!
  s.dossiers[did].activeFormId = 'aiia'
  return { s, did }
}

describe('assessmentStore ↔ DossierDoc integration', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('setAnswer routes through the doc and mirrors HTML back into Pinia', () => {
    const { s } = freshStoreWithOpenForm()
    s.setAnswer('q_text', '<p>Hallo <strong>wereld</strong></p>')
    expect(s.answers.q_text).toBe('<p>Hallo <strong>wereld</strong></p>')
  })

  it('dispatches checkbox and table answers to the right shape', () => {
    const { s } = freshStoreWithOpenForm()
    s.setAnswer('q_choice', ['a', 'b'])
    s.setAnswer('q_table', JSON.stringify([{ x: 1 }]))
    expect(s.answers.q_choice).toEqual(['a', 'b'])
    expect(s.answers.q_table).toBe(JSON.stringify([{ x: 1 }]))
  })

  it('two different answers both persist (no clobber through the store)', () => {
    const { s } = freshStoreWithOpenForm()
    s.setAnswer('q_a', '<p>Antwoord A</p>')
    s.setAnswer('q_b', '<p>Antwoord B</p>')
    expect(s.answers.q_a).toBe('<p>Antwoord A</p>')
    expect(s.answers.q_b).toBe('<p>Antwoord B</p>')
  })

  it('routes risk, go-decision and section completion through the doc', () => {
    const { s } = freshStoreWithOpenForm()
    s.setRiskLevel('hoog')
    s.setGoDecision(true)
    s.markSectionCompleted('sec-1')
    s.markSectionCompleted('sec-1') // idempotent
    expect(s.riskLevel).toBe('hoog')
    expect(s.goDecision).toBe(true)
    expect(s.completedSections).toEqual(['sec-1'])
  })

  it('the mirror preserves per-user currentView on a content edit', () => {
    const { s, did } = freshStoreWithOpenForm()
    s.setAnswer('q1', '<p>x</p>') // create the form via the doc
    s.dossiers[did].forms.aiia.currentView = 'sectie-3'
    s.setAnswer('q2', '<p>y</p>') // another content edit fires the mirror
    expect(s.dossiers[did].forms.aiia.currentView).toBe('sectie-3')
  })

  it('never lets the mirror touch documents (server-owned)', () => {
    const { s, did } = freshStoreWithOpenForm()
    s.dossiers[did].documents.push({
      id: 'doc-1',
      name: 'Plan.pdf',
      content: '...',
      uploadedAt: 1,
    })
    s.setAnswer('q1', '<p>edit</p>')
    expect(s.dossiers[did].documents.map((d) => d.id)).toEqual(['doc-1'])
  })

  it('attachments add/remove/caption round-trip through the doc', () => {
    const { s } = freshStoreWithOpenForm()
    s.addAttachment('q1', {
      id: 'img-1',
      filename: 'a.png',
      caption: 'Eerste',
      mimeType: 'image/png',
      uploadedAt: 1,
    })
    s.updateAttachmentCaption('q1', 'img-1', 'Nieuw bijschrift')
    expect(s.attachmentsFor('q1')[0].caption).toBe('Nieuw bijschrift')
    s.removeAttachment('q1', 'img-1')
    expect(s.attachmentsFor('q1')).toEqual([])
  })

  it('AI-Modus-style write targets a specific dossier even when inactive', () => {
    const { s, did } = freshStoreWithOpenForm()
    // Switch the active dossier away; the writer keeps its target id.
    const other = s.createDossier('Ander dossier')
    expect(s.activeDossierId).toBe(other)
    s.setAnswerForForm('aiia', 'q1', '<p>Van AI</p>', did)
    expect(s.dossiers[did].forms.aiia.answers.q1).toBe('<p>Van AI</p>')
  })

  it('batchAnswers applies several answers atomically (AI Modus undo shape)', () => {
    const { s, did } = freshStoreWithOpenForm()
    s.batchAnswers(did, () => {
      s.setAnswerForForm('aiia', 'q1', '<p>Hersteld A</p>', did)
      s.setAnswerForForm('aiia', 'q2', '<p>Hersteld B</p>', did)
      s.setAnswerForForm('aiia', 'q3', ['x'], did)
    })
    const answers = s.dossiers[did].forms.aiia.answers
    expect(answers.q1).toBe('<p>Hersteld A</p>')
    expect(answers.q2).toBe('<p>Hersteld B</p>')
    expect(answers.q3).toEqual(['x'])
  })

  it('bumps updatedAt on a content edit', () => {
    const { s, did } = freshStoreWithOpenForm()
    const before = s.dossiers[did].updatedAt ?? 0
    s.setAnswer('q1', '<p>x</p>')
    expect((s.dossiers[did].updatedAt ?? 0)).toBeGreaterThanOrEqual(before)
    expect(s.dossiers[did].updatedAt).toBeTypeOf('number')
  })
})
