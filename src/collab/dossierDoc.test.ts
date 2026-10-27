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

  it('round-trips an object-shaped table answer verbatim (not through rich text)', () => {
    // Regression: table answers serialize as {"rows":[...],"notes":"..."} — a JSON
    // object, not an array. If not recognised as opaque it is routed through the
    // rich-text bucket, HTML-wrapped, and re-nested into `notes` on every edit.
    const d = DossierDoc.fromPayload(payload())
    const tableValue = JSON.stringify({ rows: [['', '', 'd', '', '', '', '']], notes: '' })
    d.setAnswer('aiia', 'q_table', tableValue)
    expect(d.toPayload().forms.aiia.answers.q_table).toBe(tableValue)
  })

  it('keeps a radio answer verbatim when marked opaque', () => {
    // Regression: a radio answer is neither JSON nor HTML, so the shape check
    // sent it through the rich-text bucket — "Ja" came back "<p>Ja</p>" (no
    // visibleIf ever matched) and "Ja\n---\ntoelichting" lost its separator.
    const d = DossierDoc.fromPayload(payload())
    d.setAnswer('aiia', 'q_radio', 'Ja', true)
    d.setAnswer('aiia', 'q_radio_follow', 'Ja\n---\n<p>toelichting</p>', true)

    const answers = d.toPayload().forms.aiia.answers
    expect(answers.q_radio).toBe('Ja')
    expect(answers.q_radio_follow).toBe('Ja\n---\n<p>toelichting</p>')
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

describe('DossierDoc answer history', () => {
  const human = (text: string, email: string, at: number) => ({ text, at, by: 'human' as const, email })

  it('collapses one person\'s consecutive edits and appends the next person\'s', () => {
    const d = DossierDoc.fromPayload(payload())
    d.recordRevision('aiia', 'q_text', { text: 'Begin', at: 1, by: 'ai', model: 'ollama/mistral' })
    d.recordRevision('aiia', 'q_text', human('Begin.', 'a@x.nl', 2))
    d.recordRevision('aiia', 'q_text', human('Begin. Meer.', 'a@x.nl', 3))
    d.recordRevision('aiia', 'q_text', human('Begin. Meer.', 'b@x.nl', 4)) // nothing changed
    d.recordRevision('aiia', 'q_text', human('Begin. Meer. Van B.', 'b@x.nl', 5))
    const log = d.toPayload().forms.aiia.answerHistory!.q_text
    expect(log.map((r) => [r.by, r.email, r.text])).toEqual([
      ['ai', undefined, 'Begin'],
      ['human', 'a@x.nl', 'Begin. Meer.'],
      ['human', 'b@x.nl', 'Begin. Meer. Van B.'],
    ])
  })

  it('keeps both histories when two peers edit different answers at once', () => {
    const { a, b, sync } = pair()
    a.recordRevision('aiia', 'q_text', human('Van A.', 'a@x.nl', 1))
    b.recordRevision('aiia', 'q_table', human('Van B.', 'b@x.nl', 1))
    sync()
    for (const d of [a, b]) {
      const history = d.toPayload().forms.aiia.answerHistory!
      expect(history.q_text[0].email).toBe('a@x.nl')
      expect(history.q_table[0].email).toBe('b@x.nl')
    }
  })

  it('round-trips through a stored dossier, and is absent when nothing was recorded', () => {
    expect(DossierDoc.fromPayload(payload()).toPayload().forms.aiia.answerHistory).toBeUndefined()
    const d = DossierDoc.fromPayload(payload())
    d.recordRevision('aiia', 'q_text', human('Begin.', 'a@x.nl', 1))
    const reopened = DossierDoc.fromPayload(d.toPayload())
    expect(reopened.toPayload().forms.aiia.answerHistory).toEqual(d.toPayload().forms.aiia.answerHistory)
  })
})

describe('reopening a stored dossier', () => {
  // What a previous session left behind in IndexedDB and the room.
  function storedState(): Uint8Array {
    const before = new DossierDoc()
    before.doc.clientID = 1_000
    before.seedFrom(payload())
    before.setAnswer('aiia', 'q_radio', 'Ja', true)
    return before.encodeState()
  }

  // Yjs keeps one of two concurrent values per map key, picked by client id,
  // so the old race lost the stored answers only for a higher id than the
  // previous session's. Both orders have to hold.
  for (const clientID of [1, 2 ** 31]) {
    it(`keeps stored answers when the editor mounts before the state arrives (client id ${clientID})`, () => {
      const d = new DossierDoc(undefined, { awaitSync: true })
      d.doc.clientID = clientID
      // On open: a bound editor asks for its fragment, the user clicks, and
      // only then do IndexedDB and the room deliver the stored state.
      d.textFragment('aiia', 'q_new')
      d.setAnswer('aiia', 'q_choice', ['b'])
      d.applyUpdate(storedState())
      d.seedFrom(payload())

      const answers = d.toPayload().forms.aiia.answers
      expect(answers.q_radio).toBe('Ja')
      expect(answers.q_text).toBe('<p>Begin.</p>')
      expect(answers.q_choice).toEqual(['b'])
      expect(answers).toHaveProperty('q_new')
    })
  }

  it('holds writes until the seed and replays them after it', () => {
    const d = new DossierDoc(undefined, { awaitSync: true })
    d.setAnswer('aiia', 'q_radio', 'Nee', true)
    expect(d.seeded).toBe(false)
    expect(d.doc.getMap('dossier').size).toBe(0)
    d.seedFrom(payload())
    expect(d.toPayload().forms.aiia.answers.q_radio).toBe('Nee')
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
