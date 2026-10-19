/**
 * AI Modus runs its questions in parallel on one shared queue. These pin the
 * two properties that make that safe: the queue never exceeds the server's
 * limit, and a question with a `visibleIf` waits for its controlling question.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bulkExtractFromDocument, createLimit } from './llmService'
import type { Question } from '../models/Assessment'

const realFetch = globalThis.fetch
const LIMIT = 2

let inFlight = 0
let maxInFlight = 0
const started: string[] = []
const finished: string[] = []

function sse(suggestion: string): Response {
  const body = `event: done\ndata: ${JSON.stringify({ suggestion, rationale: '' })}\n\n`
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

beforeEach(() => {
  inFlight = 0
  maxInFlight = 0
  started.length = 0
  finished.length = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/ai/limits') {
      return new Response(JSON.stringify({ max_concurrency: LIMIT }), { status: 200 })
    }
    const body = JSON.parse(String(init?.body)) as { target_question: string }
    const q = body.target_question
    started.push(q)
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 5))
    inFlight--
    finished.push(q)
    return sse(q === 'Stuurvraag' ? 'Ja' : `Antwoord op ${q}`)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function text(id: string): Question {
  return { id, text: id, type: 'text' } as Question
}

describe('createLimit', () => {
  it('never runs more than max tasks at once', async () => {
    const limit = createLimit(3)
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        limit(async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 1))
          active--
        }),
      ),
    )
    expect(peak).toBe(3)
  })
})

describe('bulkExtractFromDocument', () => {
  it('asks questions in parallel, up to the server limit', async () => {
    const questions = ['a', 'b', 'c', 'd', 'e'].map(text)
    const answers: Record<string, unknown> = {}
    const progress: Array<[number, number]> = []
    const filled = await bulkExtractFromDocument({
      sessionId: 's',
      docIds: ['d'],
      questions,
      onAnswer: (id, v) => (answers[id] = v),
      onProgress: (done, total) => progress.push([done, total]),
      isCancelled: () => false,
    })
    expect(filled).toBe(5)
    expect(maxInFlight).toBe(LIMIT)
    expect(Object.keys(answers).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(progress[progress.length - 1]).toEqual([5, 5])
  })

  it('holds a visibleIf question until its controller is answered', async () => {
    const controller = { id: 'c', text: 'Stuurvraag', type: 'radio', options: ['Ja', 'Nee'] } as Question
    const shown = { ...text('Toon bij ja'), visibleIf: { questionId: 'c', equals: 'Ja' } } as Question
    const hidden = { ...text('Toon bij nee'), visibleIf: { questionId: 'c', equals: 'Nee' } } as Question
    const answers: Record<string, string | string[]> = {}
    await bulkExtractFromDocument({
      sessionId: 's',
      docIds: ['d'],
      questions: [controller, shown, hidden, text('los')],
      onAnswer: (id, v) => (answers[id] = v),
      onProgress: () => {},
      isCancelled: () => false,
      shouldAnswer: (q) => !q.visibleIf || answers[q.visibleIf.questionId] === q.visibleIf.equals,
    })
    expect(started.indexOf('Toon bij ja')).toBeGreaterThan(finished.indexOf('Stuurvraag'))
    expect(started).not.toContain('Toon bij nee')
    expect(answers['Toon bij ja']).toBeDefined()
  })

  it('stops asking once cancelled', async () => {
    let cancelled = false
    await bulkExtractFromDocument({
      sessionId: 's',
      docIds: ['d'],
      questions: ['a', 'b', 'c', 'd', 'e', 'f'].map(text),
      onAnswer: () => {
        cancelled = true
      },
      onProgress: () => {},
      isCancelled: () => cancelled,
    })
    // The first pair was already in flight; nothing queued behind them starts.
    expect(started.length).toBe(LIMIT)
  })
})

describe('help panel (verdiepingsgesprek prototype)', () => {
  it('passes the panel on only for a question left empty', async () => {
    const panel = { aandachtspunten: ['bewaartermijn'], bijna: [] }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/ai/limits') {
        return new Response(JSON.stringify({ max_concurrency: LIMIT }), { status: 200 })
      }
      const body = JSON.parse(String(init?.body)) as { target_question: string; with_panel: boolean }
      expect(body.with_panel).toBe(true)
      const suggestion = body.target_question === 'leeg' ? '' : 'Een antwoord'
      const payload = `event: done\ndata: ${JSON.stringify({ suggestion, rationale: '', panel })}\n\n`
      return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch
    const panels: Record<string, unknown> = {}
    await bulkExtractFromDocument({
      sessionId: 's',
      docIds: ['d'],
      questions: [text('leeg'), text('gevuld')],
      withPanel: true,
      onPanel: (id, p) => (panels[id] = p),
      onAnswer: () => {},
      onProgress: () => {},
      isCancelled: () => false,
    })
    expect(panels).toEqual({ leeg: panel })
  })
})
