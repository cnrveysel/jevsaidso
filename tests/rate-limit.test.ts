/**
 * Rate-limiting tests for `POST /api/ask`.
 *
 * Run with: npm test
 *
 * Upstash is never contacted: the limiter is injected, so these tests are
 * deterministic and consume no Redis quota.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AskResult } from '../api/_lib/ask.ts'
import { handleAsk } from '../api/_lib/ask.ts'
import { RATE_LIMITED_MESSAGE, RATE_LIMIT_MAX } from '../api/_lib/config.ts'
import { getClientId, type RateLimitOutcome, type RateLimiter } from '../api/_lib/rate-limit.ts'

const KEY = 'test-key-do-not-log'

/** Records every identifier the limiter was asked about. */
function countingLimiter(outcome: RateLimitOutcome | ((call: number) => RateLimitOutcome)) {
  const seen: string[] = []
  let calls = 0

  const limiter: RateLimiter = {
    async limit(identifier: string) {
      calls += 1
      seen.push(identifier)
      return typeof outcome === 'function' ? outcome(calls) : outcome
    },
  }

  return {
    limiter,
    seen,
    get calls() {
      return calls
    },
  }
}

/** A TypeSafe stub that counts how many times it was called. */
function countingFetch(body: unknown = { answers: { decision: { noul: 0.82 } } }) {
  let calls = 0
  const fetchImpl = (async () => {
    calls += 1
    return {
      ok: true,
      status: 200,
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchImpl, get calls() { return calls } }
}

function errorMessage(result: AskResult): string {
  assert.ok('error' in result.body, 'expected an error body')
  return result.body.error
}

describe('getClientId', () => {
  it('prefers the Vercel-provided headers over a client-supplied one', () => {
    // x-vercel-forwarded-for is Vercel-set, so it must beat a spoofed x-real-ip.
    assert.equal(
      getClientId({
        'x-real-ip': '9.9.9.9',
        'x-forwarded-for': '1.2.3.4',
        'x-vercel-forwarded-for': '5.6.7.8',
      }),
      '5.6.7.8',
    )

    // A client-set x-real-ip must not override Vercel's x-forwarded-for.
    assert.equal(
      getClientId({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }),
      '1.2.3.4',
    )

    // x-real-ip is only used when nothing better exists.
    assert.equal(getClientId({ 'x-real-ip': '9.9.9.9' }), '9.9.9.9')
  })

  it('falls back to x-forwarded-for and takes the leftmost entry', () => {
    assert.equal(getClientId({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.9.9.9' }), '1.2.3.4')
    assert.equal(getClientId({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' }), '1.2.3.4')
  })

  it('accepts array-valued headers', () => {
    assert.equal(getClientId({ 'x-real-ip': ['7.7.7.7'] }), '7.7.7.7')
  })

  it('uses a shared bucket when no IP header is present', () => {
    assert.equal(getClientId(undefined), 'unknown')
    assert.equal(getClientId({}), 'unknown')
    assert.equal(getClientId({ 'x-real-ip': '' }), 'unknown')
    assert.equal(getClientId({ 'x-forwarded-for': '   ' }), 'unknown')
  })
})

describe('rate limiting', () => {
  it('allows requests below the limit', async () => {
    const { limiter, seen } = countingLimiter('allowed')
    const upstream = countingFetch()

    for (let attempt = 1; attempt <= RATE_LIMIT_MAX; attempt += 1) {
      const result = await handleAsk(
        { question: 'Should I go out tonight?' },
        { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-1' },
      )

      assert.equal(result.status, 200, `attempt ${attempt} should be allowed`)
      assert.deepEqual(result.body, { answer: 'YES', probability: 0.82, mocked: false })
    }

    assert.equal(seen.length, RATE_LIMIT_MAX)
    assert.deepEqual(seen, Array.from({ length: RATE_LIMIT_MAX }, () => 'ip-1'))
    assert.equal(upstream.calls, RATE_LIMIT_MAX)
  })

  it('returns 429 with the documented body once the limit is exceeded', async () => {
    const { limiter } = countingLimiter((call) => (call <= RATE_LIMIT_MAX ? 'allowed' : 'limited'))
    const upstream = countingFetch()

    let last: AskResult | undefined

    for (let attempt = 1; attempt <= RATE_LIMIT_MAX + 1; attempt += 1) {
      last = await handleAsk(
        { question: 'Should I order pizza?' },
        { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-2' },
      )
    }

    assert.ok(last)
    assert.equal(last.status, 429)
    assert.deepEqual(last.body, { error: RATE_LIMITED_MESSAGE })
    assert.equal(errorMessage(last), 'Too many questions. Try again in a minute.')
    assert.equal(last.headers?.['Retry-After'], '60')
  })

  it('does NOT call TypeSafe when the request is blocked', async () => {
    const { limiter } = countingLimiter('limited')
    const upstream = countingFetch()

    const result = await handleAsk(
      { question: 'Should I skip the gym?' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-3' },
    )

    assert.equal(result.status, 429)
    assert.equal(upstream.calls, 0, 'a blocked request must cost nothing upstream')
  })

  it('checks the limit before validating nothing else is skipped for allowed requests', async () => {
    // Invalid input is rejected as 400 and, like a 429, never reaches TypeSafe.
    const { limiter } = countingLimiter('allowed')
    const upstream = countingFetch()

    const result = await handleAsk(
      { question: '   ' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-4' },
    )

    assert.equal(result.status, 400)
    assert.equal(upstream.calls, 0)
  })

  it('fails open when the limiter backend is unreachable', async () => {
    const { limiter } = countingLimiter('unavailable')
    const upstream = countingFetch()

    const result = await handleAsk(
      { question: 'Should I go out tonight?' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-5' },
    )

    assert.equal(result.status, 200, 'a broken limiter must not take the product down')
    assert.equal(upstream.calls, 1)
  })

  it('limits per client, not globally', async () => {
    const { limiter } = countingLimiter((call) => (call % 2 === 1 ? 'allowed' : 'limited'))
    const upstream = countingFetch()

    const first = await handleAsk(
      { question: 'Should I go out tonight?' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-6' },
    )
    const second = await handleAsk(
      { question: 'Should I go out tonight?' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: limiter, clientId: 'ip-7' },
    )

    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
  })

  it('does no limiting when Upstash is not configured, so local dev stays usable', async () => {
    const upstream = countingFetch()

    const result = await handleAsk(
      { question: 'Should I go out tonight?' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: null, clientId: 'ip-8' },
    )

    assert.equal(result.status, 200)
    assert.equal(upstream.calls, 1)
  })
})