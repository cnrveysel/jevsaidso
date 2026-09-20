/**
 * Server-side tests for `POST /api/ask`.
 *
 * Run with: node --test tests/
 *
 * TypeSafe is never called for real: a stub `fetch` (or a local mock server)
 * stands in for it, so no credits are consumed.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer } from 'node:http'

import type { AskResult } from '../api/_lib/ask.ts'
import {
  decideFromYesProbability,
  handleAsk,
  normalizeProbability,
  validateQuestion,
} from '../api/_lib/ask.ts'

import type { Server } from 'node:http'
import type { MinimalRequest, MinimalResponse } from '../api/_lib/ask.ts'

interface RecordedUpstream {
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

interface HandlerState {
  status: number
  body: unknown
  headers: Record<string, string>
}


/** Build a `Response`-like object the module can consume. */
interface StubResponseOptions {
  ok?: boolean
  status?: number
}

function jsonResponse(body: unknown, options: StubResponseOptions = {}): Response {
  const { ok = true, status = 200 } = options
  return {
    ok,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response
}

interface RecordedCall {
  url: string
  init: RequestInit
}

/** A fetch stub that records what was sent upstream. */
function recordingFetch(body: unknown, options?: StubResponseOptions) {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return jsonResponse(body, options)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}
const KEY = 'test-key-do-not-log'

describe('validateQuestion', () => {
  it('rejects non-strings', () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      assert.deepEqual(validateQuestion(value, 250), { error: 'A question is required.' })
    }
  })

  it('rejects empty and whitespace-only questions', () => {
    for (const value of ['', '   ', '\n\t ']) {
      assert.deepEqual(validateQuestion(value, 250), { error: 'A question is required.' })
    }
  })

  it('rejects questions over the limit, measured after trimming', () => {
    assert.deepEqual(validateQuestion('x'.repeat(251), 250), {
      error: 'Questions must be 250 characters or fewer.',
    })
    assert.deepEqual(validateQuestion(`  ${'x'.repeat(251)}  `, 250), {
      error: 'Questions must be 250 characters or fewer.',
    })
    assert.deepEqual(validateQuestion('x'.repeat(250), 250), { question: 'x'.repeat(250) })
  })

  it('trims surrounding whitespace', () => {
    assert.deepEqual(validateQuestion('  Should I text my ex?  ', 250), {
      question: 'Should I text my ex?',
    })
  })
})

describe('normalizeProbability', () => {
  it('accepts floats in [0, 1]', () => {
    assert.equal(normalizeProbability(0), 0)
    assert.equal(normalizeProbability(0.82), 0.82)
    assert.equal(normalizeProbability(1), 1)
  })

  it('accepts numeric strings in range', () => {
    assert.equal(normalizeProbability('0.17'), 0.17)
    assert.equal(normalizeProbability('1'), 1)
  })

  it('rejects malformed or out-of-range values instead of guessing', () => {
    for (const value of [undefined, null, 'abc', NaN, Infinity, -0.2, 1.5, 2, 82, {}, []]) {
      assert.equal(normalizeProbability(value), null)
    }
  })
})

describe('decideFromYesProbability', () => {
  it('maps >= 0.5 to YES with the probability as confidence', () => {
    assert.deepEqual(decideFromYesProbability(0.82), {
      answer: 'YES',
      probability: 0.82,
      mocked: false,
    })
    assert.deepEqual(decideFromYesProbability(0.5), {
      answer: 'YES',
      probability: 0.5,
      mocked: false,
    })
  })

  it('maps < 0.5 to NO with 1 - p as confidence', () => {
    assert.deepEqual(decideFromYesProbability(0.17), {
      answer: 'NO',
      probability: 0.83,
      mocked: false,
    })
    assert.deepEqual(decideFromYesProbability(0.01), {
      answer: 'NO',
      probability: 0.99,
      mocked: false,
    })
  })

  it('never reports a confidence below 50%', () => {
    for (const p of [0, 0.1, 0.49, 0.5, 0.51, 0.9, 1]) {
      assert.ok(decideFromYesProbability(p).probability >= 0.5)
    }
  })
})

/** Narrow an error body without loosening the production types. */
function errorMessage(result: AskResult): string {
  assert.ok('error' in result.body, 'expected an error body')
  return result.body.error
}

describe('handleAsk validation', () => {
  it('returns 400 for an empty question', async () => {
    const result = await handleAsk({ question: '   ' }, { apiKey: KEY })
    assert.equal(result.status, 400)
    assert.equal(errorMessage(result), 'A question is required.')
  })

  it('returns 400 for a question over 250 characters', async () => {
    const result = await handleAsk({ question: 'x'.repeat(251) }, { apiKey: KEY })
    assert.equal(result.status, 400)
    assert.equal(errorMessage(result), 'Questions must be 250 characters or fewer.')
  })

  it('returns 400 for a missing or non-string question', async () => {
    assert.equal((await handleAsk({}, { apiKey: KEY })).status, 400)
    assert.equal((await handleAsk({ question: 42 }, { apiKey: KEY })).status, 400)
    assert.equal((await handleAsk(null, { apiKey: KEY })).status, 400)
  })

  it('never calls TypeSafe when validation fails', async () => {
    const { fetchImpl, calls } = recordingFetch({})
    await handleAsk({ question: '' }, { apiKey: KEY, fetchImpl })
    assert.equal(calls.length, 0)
  })
})

describe('handleAsk upstream call', () => {
  it('returns 503 when TYPESAFE_API_KEY is missing', async () => {
    const { fetchImpl, calls } = recordingFetch({})
    const result = await handleAsk({ question: 'Should I go out tonight?' }, { apiKey: undefined, fetchImpl })

    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'Jev is unavailable right now.' })
    assert.equal(calls.length, 0, 'must not call TypeSafe without a key')
  })

  it('sends the documented TypeSafe request shape and bearer header', async () => {
    const { fetchImpl, calls } = recordingFetch({ answers: { decision: { noul: 0.82 } } })
    const result = await handleAsk(
      { question: '  Should I go out tonight?  ' },
      { apiKey: KEY, fetchImpl },
    )

    assert.equal(result.status, 200)
    assert.equal(calls.length, 1)

    const [{ url, init }] = calls
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
    assert.equal(init.method, 'POST')

    const headers = init.headers as Record<string, string>
    assert.equal(headers.Authorization, `Bearer ${KEY}`)
    assert.equal(headers['Content-Type'], 'application/json')

    assert.deepEqual(JSON.parse(String(init.body)), {
      model: 'jev-latest',
      state: 'Should I go out tonight?',
      questions: {
        decision: {
          type: 'noul',
          instructions: 'Should the answer to this yes-or-no question be YES?',
        },
      },
    })
  })

  it('normalizes a YES answer', async () => {
    const { fetchImpl } = recordingFetch({ answers: { decision: { noul: 0.82 } } })
    const result = await handleAsk({ question: 'Should I go out tonight?' }, { apiKey: KEY, fetchImpl })

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { answer: 'YES', probability: 0.82, mocked: false })
  })

  it('normalizes a NO answer', async () => {
    const { fetchImpl } = recordingFetch({ answers: { decision: { noul: 0.17 } } })
    const result = await handleAsk({ question: 'Should I text my ex?' }, { apiKey: KEY, fetchImpl })

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { answer: 'NO', probability: 0.83, mocked: false })
  })

  it('returns 502 on a non-2xx upstream response and hides the body', async () => {
    const secret = 'upstream-detail-should-not-leak'
    const { fetchImpl } = recordingFetch({ error: secret, key: KEY }, { ok: false, status: 401 })
    const result = await handleAsk({ question: 'Should I order pizza?' }, { apiKey: KEY, fetchImpl })

    assert.equal(result.status, 502)
    assert.deepEqual(result.body, { error: 'Jev is unavailable right now.' })
    assert.ok(!JSON.stringify(result).includes(secret))
  })

  it('returns 502 on malformed upstream JSON', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      },
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch
    const result = await handleAsk({ question: 'Should I order pizza?' }, { apiKey: KEY, fetchImpl })

    assert.equal(result.status, 502)
    assert.ok(!JSON.stringify(result).includes('Unexpected token'))
  })

  it('returns 502 when the noul value is missing or malformed', async () => {
    const bodies = [
      {},
      { answers: {} },
      { answers: { decision: {} } },
      { answers: { decision: { noul: 'nope' } } },
      { answers: { decision: { noul: null } } },
      { answers: { decision: { noul: 4 } } },
    ]

    for (const body of bodies) {
      const { fetchImpl } = recordingFetch(body)
      const result = await handleAsk({ question: 'Should I order pizza?' }, { apiKey: KEY, fetchImpl })
      assert.equal(result.status, 502, `expected 502 for ${JSON.stringify(body)}`)
      assert.deepEqual(result.body, { error: 'Jev is unavailable right now.' })
    }
  })

  it('returns 502 when the upstream call throws or times out', async () => {
    const fetchImpl = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as unknown as typeof fetch
    const result = await handleAsk({ question: 'Should I order pizza?' }, { apiKey: KEY, fetchImpl })

    assert.equal(result.status, 502)
    assert.deepEqual(result.body, { error: 'Jev is unavailable right now.' })
  })

  it('never echoes the API key in any response', async () => {
    const cases: [unknown, StubResponseOptions][] = [
      [{ answers: { decision: { noul: 0.6 } } }, {}],
      [{ error: KEY }, { ok: false, status: 500 }],
      [{}, {}],
    ]

    for (const [body, options] of cases) {
      const { fetchImpl } = recordingFetch(body, options)
      const result = await handleAsk({ question: 'Should I order pizza?' }, { apiKey: KEY, fetchImpl })
      assert.ok(!JSON.stringify(result).includes(KEY), 'response must not contain the API key')
    }
  })
})

describe('HTTP transport', () => {
  let server: Server | undefined
  let baseUrl = ''
  let handler: (request: MinimalRequest, response: MinimalResponse) => Promise<void>
  const received: RecordedUpstream[] = []

  before(async () => {
    // A stand-in for the TypeSafe API. Records requests and answers with the
    // noul value queued by the test via the `x-test-noul` response we return.
    server = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString('utf8')

      received.push({ url: request.url ?? '', headers: request.headers, body })

      let noul = 0.82
      try {
        noul = Number(JSON.parse(body).__noul ?? 0.82)
      } catch {
        // keep default
      }

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ answers: { decision: { noul } } }))
    })

    const listening = server
    await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', () => resolve()))
    const address = listening.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Expected a TCP address for the mock upstream server.')
    }
    baseUrl = `http://127.0.0.1:${address.port}`

    const module = await import('../api/ask.ts')
    handler = module.default as typeof handler
  })

  after(() => {
    server?.close()
  })

  /** Minimal Vercel-like request/response doubles. */
  const callHandler = async ({
    method = 'POST',
    body,
  }: {
    method?: string
    body?: unknown
  }): Promise<HandlerState> => {
    const state: HandlerState = { status: 0, body: undefined, headers: {} }
    const response: MinimalResponse = {
      status(code: number) {
        state.status = code
        return response
      },
      json(value: unknown) {
        state.body = value
        return response
      },
      setHeader(name: string, value: string) {
        state.headers[name.toLowerCase()] = value
      },
      end() {},
    }

    await handler({ method, body }, response)
    return state
  }

  it('answers a valid question with a normalized verdict', async () => {
    process.env.TYPESAFE_API_KEY = KEY
    process.env.TYPESAFE_BASE_URL = baseUrl

    const state = await callHandler({ body: { question: 'Should I go out tonight?' } })

    assert.equal(state.status, 200)
    assert.deepEqual(state.body, { answer: 'YES', probability: 0.82, mocked: false })

    const last = received[received.length - 1]
    assert.equal(last.headers.authorization, `Bearer ${KEY}`)
    assert.equal(last.url, '/v1/systemone')

    delete process.env.TYPESAFE_BASE_URL
    delete process.env.TYPESAFE_API_KEY
  })

  it('rejects non-POST methods with 405', async () => {
    const get = await callHandler({ method: 'GET' })
    assert.equal(get.status, 405)
    assert.equal(get.headers.allow, 'POST')

    const options = await callHandler({ method: 'OPTIONS' })
    assert.equal(options.status, 405)
  })

  it('accepts a JSON string body', async () => {
    process.env.TYPESAFE_API_KEY = KEY
    process.env.TYPESAFE_BASE_URL = baseUrl

    const state = await callHandler({ body: JSON.stringify({ question: 'Should I order pizza?' }) })
    assert.equal(state.status, 200)
    assert.deepEqual(state.body, { answer: 'YES', probability: 0.82, mocked: false })

    delete process.env.TYPESAFE_BASE_URL
    delete process.env.TYPESAFE_API_KEY
  })

  it('returns 400 for an unparseable body', async () => {
    const state = await callHandler({ body: 'not json' })
    assert.equal(state.status, 400)
  })
})