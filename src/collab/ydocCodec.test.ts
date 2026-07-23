/**
 * Round-trip spec for the Y.Doc <-> DossierPayload codec (Phase 1).
 *
 * This is the load-bearing test of option 3: if a real dossier survives
 * JSON -> Y.Doc -> JSON deep-equal, then exports, RAG, and the LLM pipeline
 * keep reading the shape they read today, no matter what the CRDT layer does
 * internally. Written before the codec so it's red until Phase 1 implements it.
 *
 * Run: `npm test` (see the vitest devDependency + "test" script in package.json).
 */
import { describe, it, expect } from 'vitest'
import { dossierToYDoc, yDocToDossier, type DossierPayload } from './ydocCodec'
import type { FormState } from '../stores/assessmentStore'

/** One fixture that hits every answer kind and edge the codec must preserve. */
function fixture(): DossierPayload {
  const aiia: FormState = {
    answers: {
      // Rich text with formatting — must round-trip byte-equal.
      q_purpose: '<p>Het systeem beoordeelt <strong>aanvragen</strong> met <em>AI</em>.</p>',
      // The empty-answer rule: '' stays '', never becomes '<p></p>'.
      q_empty: '',
      // Multi-paragraph + list, to exercise block structure. This is CANONICAL
      // Tiptap output (StarterKit wraps <li> content in <p>) — real stored
      // answers come from editor.getHTML() and are already in this form, which
      // is what the byte-equal round-trip guarantee covers.
      q_details: '<p>Eerste alinea.</p><ul><li><p>punt een</p></li><li><p>punt twee</p></li></ul>',
      // Checkbox answer — a string[], not HTML.
      q_datacategories: ['persoonsgegevens', 'locatiegegevens'],
      // Table answer — a JSON string per the table-questions contract.
      q_processors: JSON.stringify([
        { naam: 'Verwerker A', rol: 'hosting', land: 'NL' },
        { naam: 'Verwerker B', rol: 'analyse', land: 'DE' },
      ]),
    },
    answerSources: {
      q_purpose: {
        grounded: true,
        createdAt: 1_752_000_000_000,
        sources: [
          {
            docId: 'doc-1',
            docName: 'Projectplan.pdf',
            chunkIndex: 3,
            text: 'Het systeem beoordeelt binnenkomende aanvragen automatisch.',
            score: 0.87,
          },
        ],
      },
      // A flagged-as-hallucinated answer: grounded=false must survive so the
      // warning UI keeps working after a sync.
      q_details: { grounded: false, createdAt: 1_752_000_100_000, sources: [] },
    },
    attachments: {
      q_purpose: [
        {
          id: 'img-42',
          filename: 'architectuur.png',
          caption: 'Systeemarchitectuur',
          mimeType: 'image/png',
          width: 1200,
          height: 800,
          uploadedAt: 1_752_000_200_000,
        },
      ],
    },
    currentView: 'sectie-2',
    completedSections: ['sectie-1'],
    riskLevel: 'hoog',
    goDecision: null,
  }

  // A second, near-pristine form: proves multi-form dossiers and that an empty
  // form doesn't get mangled into stray content.
  const dpia: FormState = {
    answers: {},
    answerSources: {},
    attachments: {},
    currentView: 'home',
    completedSections: [],
    riskLevel: null,
    goDecision: true,
  }

  return {
    id: 'dossier-abc',
    name: 'Fraudedetectie uitkeringen',
    createdAt: 1_751_900_000_000,
    updatedAt: 1_752_000_300_000,
    sessionId: 'sess-xyz',
    activeFormId: 'aiia',
    forms: { aiia, dpia },
  }
}

describe('ydocCodec round-trip', () => {
  it('preserves a full dossier through JSON -> Y.Doc -> JSON', () => {
    const original = fixture()
    const restored = yDocToDossier(dossierToYDoc(original))
    expect(restored).toEqual(original)
  })

  // Targeted assertions below make a failure diagnosable rather than a giant
  // deep-equal diff. Each pins one line of the codec contract.

  it('keeps an empty rich-text answer as "" (never "<p></p>")', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.aiia.answers.q_empty).toBe('')
  })

  it('round-trips bold/italic HTML byte-for-byte', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.aiia.answers.q_purpose).toBe(
      '<p>Het systeem beoordeelt <strong>aanvragen</strong> met <em>AI</em>.</p>',
    )
  })

  it('preserves checkbox answers as string arrays', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.aiia.answers.q_datacategories).toEqual([
      'persoonsgegevens',
      'locatiegegevens',
    ])
  })

  it('preserves table answers (JSON string) verbatim', () => {
    const original = fixture()
    const restored = yDocToDossier(dossierToYDoc(original))
    expect(restored.forms.aiia.answers.q_processors).toBe(
      original.forms.aiia.answers.q_processors,
    )
  })

  it('preserves answerSources incl. the grounded=false hallucination flag', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.aiia.answerSources?.q_purpose.grounded).toBe(true)
    expect(restored.forms.aiia.answerSources?.q_details.grounded).toBe(false)
  })

  it('preserves attachment metadata', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.aiia.attachments?.q_purpose[0]).toMatchObject({
      id: 'img-42',
      mimeType: 'image/png',
      width: 1200,
      height: 800,
    })
  })

  it('preserves non-answer FormState fields and the dossier envelope', () => {
    const original = fixture()
    const restored = yDocToDossier(dossierToYDoc(original))
    expect(restored.activeFormId).toBe('aiia')
    expect(restored.forms.aiia.riskLevel).toBe('hoog')
    expect(restored.forms.aiia.completedSections).toEqual(['sectie-1'])
    expect(restored.forms.dpia.goDecision).toBe(true)
  })

  it('handles a second, empty form without inventing content', () => {
    const restored = yDocToDossier(dossierToYDoc(fixture()))
    expect(restored.forms.dpia.answers).toEqual({})
  })
})
