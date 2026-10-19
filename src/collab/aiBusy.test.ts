import { describe, it, expect, afterEach } from 'vitest'
import { clearLocalAiBusy, onAiBusy, setLocalAiBusy, setLocalUser, type AiBusyPeer } from './dossierTransport'

// Node test path: no WebSocket provider is ever created, so these exercise the
// offline branch — the one that keeps the bar working for a solo user.
describe('AI-busy awareness channel', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn())
    clearLocalAiBusy('d1')
  })

  function collect(dossierId: string) {
    const seen: AiBusyPeer[][] = []
    cleanups.push(onAiBusy(dossierId, (p) => seen.push(p)))
    return seen
  }

  // Not Array.prototype.at: tsconfig targets ES2020, where it doesn't exist yet.
  const last = (seen: AiBusyPeer[][]) => seen[seen.length - 1]

  it('fires immediately with the current (empty) roster', () => {
    expect(collect('d1')).toEqual([[]])
  })

  it('publishes the busy question to subscribers and clears it again', () => {
    const seen = collect('d1')
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, true)
    expect(last(seen)).toEqual([
      { clientId: -1, name: expect.any(String), isSelf: true, formId: 'f1', questionId: 'q1' },
    ])
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, false)
    expect(last(seen)).toEqual([])
  })

  it('tracks several questions at once, across forms', () => {
    const seen = collect('d1')
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, true)
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q2' }, true)
    setLocalAiBusy('d1', { formId: 'f2', questionId: 'q1' }, true)
    expect(last(seen).map((p) => `${p.formId}/${p.questionId}`)).toEqual(['f1/q1', 'f1/q2', 'f2/q1'])
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, false)
    expect(last(seen).map((p) => `${p.formId}/${p.questionId}`)).toEqual(['f1/q2', 'f2/q1'])
    clearLocalAiBusy('d1', 'f1')
    expect(last(seen).map((p) => `${p.formId}/${p.questionId}`)).toEqual(['f2/q1'])
  })

  it('labels the entry with the local user', () => {
    setLocalUser({ sub: 'u-1', name: 'Laurens' })
    const seen = collect('d1')
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, true)
    expect(last(seen)[0].name).toBe('Laurens')
  })

  it('keeps dossiers apart', () => {
    const other = collect('d2')
    setLocalAiBusy('d1', { formId: 'f1', questionId: 'q1' }, true)
    expect(last(other)).toEqual([])
  })
})
