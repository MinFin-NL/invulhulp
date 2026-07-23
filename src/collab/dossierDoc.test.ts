/**
 * DossierDoc — collaboration & through-the-doc mutation tests.
 *
 * The headline test is `concurrent edits to different answers both survive`:
 * that's the exact last-write-wins clobber (dossiers.put_dossier today) that
 * motivated option 3. If it passes, the core promise holds.
 */
import { describe, it, expect } from 'vitest'
import { DossierDoc, LOCAL_ORIGIN } from './dossierDoc'
import type { DossierPayload } from './ydocCodec'
import type { FormState } from '../stores/assessmentStore'

function form(partial: Partial<FormState> = {}): FormState {
  return {
    answers: {},
    answerSources: {},
    attachments: {},
    currentView: 'home',
    completedSections: [],
    riskLevel: null,
    goDecision: null,
    ...partial,
  }
}

function payload(): DossierPayload {
  return {
    id: 'd1',
    name: 'Test dossier',
    createdAt: 1_000,
    updatedAt: 2_000,
    sessionId: 's1',
    activeFormId: 'aiia',
    forms: {
      aiia: form({
        answers: {
          q_text: '<p>Begin.</p>',
          q_choice: ['a'],
          q_table: JSON.stringify([{ x: 1 }]),
        },
      }),
    },
  }
}

/** Two peers sharing history: B is seeded from A's state, as a client is from
 *  the server. Returns docs plus a helper to exchange pending updates both ways. */
function pair() {
  const a = DossierDoc.fromPayload(payload())
  const b = new DossierDoc()
  b.applyUpdate(a.encodeState())
  const sync = () => {
    // Full-state exchange is enough for tests; production sends deltas.
    b.applyUpdate(a.encodeState())
    a.applyUpdate(b.encodeState())
  }
  return { a, b, sync }
}

describe('DossierDoc mutation dispatch', () => {
  it('routes rich text, checkbox and table to the right buckets', () => {
    const d = DossierDoc.fromPayload(payload())
    d.setAnswer('aiia', 'q_text', '<p>Nieuw <strong>antwoord</strong>.</p>')
    d.setAnswer('aiia', 'q_choice', ['a', 'b'])
    d.setAnswer('aiia', 'q_table', JSON.stringify([{ x: 2 }]))

    const answers = d.toPayload().forms.aiia.answers
    expect(answers.q_text).toBe('<p>Nieuw <strong>antwoord</strong>.</p>')
    expect(answers.q_choice).toEqual(['a', 'b'])
    expect(answers.q_table).toBe(JSON.stringify([{ x: 2 }]))
  })

  it('transact() coalesces several setAnswer calls into one update', () => {
    const d = DossierDoc.fromPayload(payload())
    let fires = 0
    let last: DossierPayload | null = null
    d.onChange((p) => {
      fires++
      last = p
    })
    d.transact(() => {
      d.setAnswer('aiia', 'q_text', '<p>one</p>')
      d.setAnswer('aiia', 'q_choice', ['x', 'y'])
      d.setAnswer('aiia', 'q_table', JSON.stringify([{ z: 3 }]))
    })
    expect(fires).toBe(1) // one atomic batch, not three
    expect(last!.forms.aiia.answers.q_text).toBe('<p>one</p>')
    expect(last!.forms.aiia.answers.q_choice).toEqual(['x', 'y'])
    expect(last!.forms.aiia.answers.q_table).toBe(JSON.stringify([{ z: 3 }]))
  })

  it('clears a stale bucket when an answer changes type', () => {
    const d = DossierDoc.fromPayload(payload())
    d.setAnswer('aiia', 'q_choice', '<p>Now text.</p>') // array -> text
    const answers = d.toPayload().forms.aiia.answers
    expect(answers.q_choice).toBe('<p>Now text.</p>')
    // Exactly one representation survives — not both.
    expect(Object.keys(answers).filter((k) => k === 'q_choice')).toHaveLength(1)
  })

  it('writes meta and activeFormId through the doc', () => {
    const d = DossierDoc.fromPayload(payload())
    d.setRiskLevel('aiia', 'hoog')
    d.setGoDecision('aiia', true)
    d.markSectionCompleted('aiia', 'sec-1')
    d.markSectionCompleted('aiia', 'sec-1') // idempotent
    d.setActiveFormId('dpia')

    const p = d.toPayload()
    expect(p.forms.aiia.riskLevel).toBe('hoog')
    expect(p.forms.aiia.goDecision).toBe(true)
    expect(p.forms.aiia.completedSections).toEqual(['sec-1'])
    expect(p.activeFormId).toBe('dpia')
  })
})

describe('DossierDoc onChange', () => {
  it('reports local vs remote origin', () => {
    const { a } = pair()
    const seen: unknown[] = []
    a.onChange((_p, origin) => seen.push(origin))

    a.setAnswer('aiia', 'q_text', '<p>Local edit.</p>') // local
    expect(seen[0]).toBe(LOCAL_ORIGIN)
  })

  it('fires with a decoded snapshot on remote merge', () => {
    const { a, b } = pair()
    let last: DossierPayload | null = null
    b.onChange((p) => {
      last = p
    })
    a.setAnswer('aiia', 'q_text', '<p>From A.</p>')
    b.applyUpdate(a.encodeState())
    expect(last!.forms.aiia.answers.q_text).toBe('<p>From A.</p>')
  })
})

describe('DossierDoc convergence', () => {
  it('concurrent edits to DIFFERENT answers both survive (the clobber bug)', () => {
    const { a, b, sync } = pair()
    // Simultaneous, before either has seen the other — the exact race that
    // silently lost data under whole-dossier last-write-wins.
    a.setAnswer('aiia', 'q_text', '<p>Edited by A.</p>')
    b.setAnswer('aiia', 'q_choice', ['a', 'x'])
    sync()

    for (const d of [a, b]) {
      const answers = d.toPayload().forms.aiia.answers
      expect(answers.q_text).toBe('<p>Edited by A.</p>')
      expect(answers.q_choice).toEqual(['a', 'x'])
    }
  })

  it('converges to an identical snapshot on both peers', () => {
    const { a, b, sync } = pair()
    a.setRiskLevel('aiia', 'beperkt')
    b.setAnswer('aiia', 'q_table', JSON.stringify([{ x: 9 }]))
    sync()
    expect(a.toPayload()).toEqual(b.toPayload())
  })

  it('concurrent edits to the SAME text answer both survive (char-level merge)', () => {
    // Simulates what the editor binding does in Phase 3: both peers insert into
    // the same fragment. y-prosemirror merges rather than dropping one side.
    const { a, b, sync } = pair()
    a.setAnswer('aiia', 'q_text', '<p>Begin. A-zin.</p>')
    b.setAnswer('aiia', 'q_text', '<p>Begin. B-zin.</p>')
    sync()
    const merged = a.toPayload().forms.aiia.answers.q_text as string
    expect(a.toPayload()).toEqual(b.toPayload()) // no split brain
    expect(merged).toContain('A-zin')
    expect(merged).toContain('B-zin')
  })
})

describe('LOCAL_ORIGIN', () => {
  it('is the origin stamped on through-the-doc writes', () => {
    const d = DossierDoc.fromPayload(payload())
    let origin: unknown = undefined
    d.doc.on('afterTransaction', (txn: { origin: unknown }) => {
      origin = txn.origin
    })
    d.setAnswer('aiia', 'q_text', '<p>x.</p>')
    expect(origin).toBe(LOCAL_ORIGIN)
  })
})
