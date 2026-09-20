/**
 * Tests for the private benchmark bypass of the rate limiter.
 *
 * Run with: npm test
 *
 * Upstash is never contacted: the limiter is injected, so these tests are
 * deterministic and consume no Redis quota.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { handleAsk } from '../api/_lib/ask.ts'
import { isBenchmarkRequest } from '../api/_lib/benchmark.ts'
import { BENCHMARK_BYPASS_TOKEN_ENV, RATE_LIMITED_MESSAGE } from '../api/_lib/config.ts'
import type { RateLimitOutcome, RateLimiter } from '../api/_lib/rate-limit.ts'

const KEY = 'test-key-do-not-log'
const BENCHMARK_TOKEN = 'benchmark-secret-do-not-log'

/** A limiter that records every identifier it was asked about. */
function countingLimiter(outcome: RateLimitOutcome | ((call: number) => RateLimitOutcome)) {
  const seen: string[] = []
  // A live object rather than a number/getter: tests destructure this result, and
  // destructuring a getter would snapshot the value at zero.
  const calls = { count: 0 }

  const limiter: RateLimiter = {
    async limit(identifier: string) {
      calls.count += 1
      seen.push(identifier)
      return typeof outcome === 'function' ? outcome(calls.count) : outcome
    },
  }

  return { limiter, seen, calls }
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
  return {
    fetchImpl,
    get calls() {
      return calls
    },
  }
}

const question = { question: 'Should I go out tonight?' }

describe('isBenchmarkRequest', () => {
  it('is false when the server token is not configured', () => {
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': BENCHMARK_TOKEN }, undefined), false)
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': BENCHMARK_TOKEN }, ''), false)
  })

  it('is false when no header is present', () => {
    assert.equal(isBenchmarkRequest(undefined, BENCHMARK_TOKEN), false)
    assert.equal(isBenchmarkRequest({}, BENCHMARK_TOKEN), false)
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': '' }, BENCHMARK_TOKEN), false)
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': '   ' }, BENCHMARK_TOKEN), false)
  })

  it('is true only on an exact match', () => {
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': BENCHMARK_TOKEN }, BENCHMARK_TOKEN), true)
  })

  it('rejects near misses', () => {
    const nearMisses = [
      BENCHMARK_TOKEN + 'x',
      BENCHMARK_TOKEN.slice(0, -1),
      BENCHMARK_TOKEN.toUpperCase(),
      BENCHMARK_TOKEN.replace('benchmark', 'BENCHMARK'),
      BENCHMARK_TOKEN.replace('-', '_'),
      'x-benchmark-token', // the header name itself
    ]

    for (const value of nearMisses) {
      assert.equal(
        isBenchmarkRequest({ 'x-benchmark-token': value }, BENCHMARK_TOKEN),
        false,
        `${JSON.stringify(value)} must not match`,
      )
    }
  })

  it('tolerates incidental surrounding whitespace, as HTTP header values do', () => {
    // Header values routinely arrive with padding from shells and proxies, so
    // trimming is intentional. It does not weaken the check: an attacker who
    // cannot guess the token gains nothing from adding spaces.
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': `  ${BENCHMARK_TOKEN}  ` }, BENCHMARK_TOKEN), true)
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': `${BENCHMARK_TOKEN} ` }, BENCHMARK_TOKEN), true)
  })

  it('does not match a token embedded in a longer value', () => {
    assert.equal(
      isBenchmarkRequest({ 'x-benchmark-token': `prefix-${BENCHMARK_TOKEN}` }, BENCHMARK_TOKEN),
      false,
    )
  })

  it('never lets an empty expected token match an empty-ish header', () => {
    // The dangerous case: env var set to "" and no header sent.
    assert.equal(isBenchmarkRequest({}, ''), false)
    assert.equal(isBenchmarkRequest({ 'x-benchmark-token': '' }, ''), false)
  })

  it('reads the token from the configured environment variable', () => {
    const previous = process.env[BENCHMARK_BYPASS_TOKEN_ENV]
    process.env[BENCHMARK_BYPASS_TOKEN_ENV] = BENCHMARK_TOKEN

    try {
      // Default parameter reads the environment.
      assert.equal(isBenchmarkRequest({ 'x-benchmark-token': BENCHMARK_TOKEN }), true)
      assert.equal(isBenchmarkRequest({ 'x-benchmark-token': 'nope' }), false)
    } finally {
      if (previous === undefined) {
        delete process.env[BENCHMARK_BYPASS_TOKEN_ENV]
      } else {
        process.env[BENCHMARK_BYPASS_TOKEN_ENV] = previous
      }
    }
  })
})

describe('benchmark bypass in handleAsk', () => {
  it('rate limits normal requests', async () => {
    const counted = countingLimiter((call) => (call <= 10 ? 'allowed' : 'limited'))
    const upstream = countingFetch()

    let last
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      last = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-normal',
        benchmark: false,
      })
    }

    assert.ok(last)
    assert.equal(last.status, 429)
    assert.deepEqual(last.body, { error: RATE_LIMITED_MESSAGE })
    assert.equal(counted.calls.count, 11)
  })

  it('lets a correct benchmark token bypass the rate limiter entirely', async () => {
    const counted = countingLimiter('limited')
    const upstream = countingFetch()

    const headers = { 'x-benchmark-token': BENCHMARK_TOKEN }
    const results = []

    for (let attempt = 1; attempt <= 25; attempt += 1) {
      results.push(
        await handleAsk(question, {
          apiKey: KEY,
          fetchImpl: upstream.fetchImpl,
          rateLimiter: counted.limiter,
          clientId: 'ip-benchmark',
          benchmark: isBenchmarkRequest(headers, BENCHMARK_TOKEN),
        }),
      )
    }

    // Every request succeeds even though the limiter would block all of them.
    assert.ok(results.every((r) => r.status === 200))
    assert.equal(upstream.calls, 25, 'TypeSafe must still be called for each request')

    for (const result of results) {
      assert.deepEqual(result.body, { answer: 'YES', probability: 0.82, mocked: false })
    }
  })

  it('does not consult the limiter when bypassing', async () => {
    const counted = countingLimiter('limited')
    const upstream = countingFetch()

    const result = await handleAsk(question, {
      apiKey: KEY,
      fetchImpl: upstream.fetchImpl,
      rateLimiter: counted.limiter,
      clientId: 'ip-benchmark',
      benchmark: true,
    })

    assert.equal(result.status, 200)
    assert.equal(counted.calls.count, 0, 'a bypassed request must not consume rate-limit quota')
  })

  it('still validates a bypassed request', async () => {
    const counted = countingLimiter('allowed')
    const upstream = countingFetch()

    const empty = await handleAsk(
      { question: '   ' },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: counted.limiter, benchmark: true },
    )
    const tooLong = await handleAsk(
      { question: 'x'.repeat(251) },
      { apiKey: KEY, fetchImpl: upstream.fetchImpl, rateLimiter: counted.limiter, benchmark: true },
    )

    assert.equal(empty.status, 400)
    assert.equal(tooLong.status, 400)
    assert.equal(upstream.calls, 0)
    assert.equal(counted.calls.count, 0)
  })

  it('still reports a missing TypeSafe key on a bypassed request', async () => {
    const counted = countingLimiter('allowed')
    const upstream = countingFetch()

    const result = await handleAsk(question, {
      apiKey: undefined,
      fetchImpl: upstream.fetchImpl,
      rateLimiter: counted.limiter,
      benchmark: true,
    })

    assert.equal(result.status, 503)
    assert.equal(upstream.calls, 0)
  })
})

describe('benchmark bypass through the real handleAsk default path', () => {
  /** Run a body of assertions with BENCHMARK_BYPASS_TOKEN set, then restore it. */
  async function withServerToken<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
    const previous = process.env[BENCHMARK_BYPASS_TOKEN_ENV]

    if (value === undefined) {
      delete process.env[BENCHMARK_BYPASS_TOKEN_ENV]
    } else {
      process.env[BENCHMARK_BYPASS_TOKEN_ENV] = value
    }

    try {
      return await run()
    } finally {
      if (previous === undefined) {
        delete process.env[BENCHMARK_BYPASS_TOKEN_ENV]
      } else {
        process.env[BENCHMARK_BYPASS_TOKEN_ENV] = previous
      }
    }
  }

  it('a correct token bypasses the limiter without any test-injected flag', async () => {
    await withServerToken(BENCHMARK_TOKEN, async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch()

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-benchmark',
        headers: { 'x-benchmark-token': BENCHMARK_TOKEN },
      })

      assert.equal(result.status, 200)
      assert.equal(counted.calls.count, 0, 'the limiter must not be consulted')
      assert.equal(upstream.calls, 1, 'TypeSafe must still be called')
    })
  })

  it('a wrong token does NOT bypass and is rate limited', async () => {
    await withServerToken(BENCHMARK_TOKEN, async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch()

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-wrong-token',
        headers: { 'x-benchmark-token': 'wrong-token' },
      })

      assert.equal(result.status, 429)
      assert.deepEqual(result.body, { error: RATE_LIMITED_MESSAGE })
      assert.equal(counted.calls.count, 1, 'the limiter must be consulted')
      assert.equal(upstream.calls, 0, 'a blocked request must not reach TypeSafe')
    })
  })

  it('an absent header does NOT bypass and is rate limited', async () => {
    await withServerToken(BENCHMARK_TOKEN, async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch()

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-no-header',
        headers: { 'user-agent': 'curl/8' },
      })

      assert.equal(result.status, 429)
      assert.equal(counted.calls.count, 1)
      assert.equal(upstream.calls, 0)
    })
  })

  it('a missing server token disables the bypass even with a plausible header', async () => {
    await withServerToken(undefined, async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch()

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-disabled',
        headers: { 'x-benchmark-token': BENCHMARK_TOKEN },
      })

      assert.equal(result.status, 429)
      assert.equal(counted.calls.count, 1, 'without a configured token nothing may bypass')
      assert.equal(upstream.calls, 0)
    })
  })

  it('an empty server token disables the bypass even with an empty header', async () => {
    await withServerToken('', async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch()

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-empty',
        headers: { 'x-benchmark-token': '' },
      })

      assert.equal(result.status, 429)
      assert.equal(counted.calls.count, 1)
      assert.equal(upstream.calls, 0)
    })
  })

  it('a bypassed request still gets a normal TypeSafe verdict', async () => {
    await withServerToken(BENCHMARK_TOKEN, async () => {
      const counted = countingLimiter('limited')
      const upstream = countingFetch({ answers: { decision: { noul: 0.17 } } })

      const result = await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        clientId: 'ip-benchmark',
        headers: { 'x-benchmark-token': BENCHMARK_TOKEN },
      })

      assert.equal(result.status, 200)
      assert.deepEqual(result.body, { answer: 'NO', probability: 0.83, mocked: false })
    })
  })
})

describe('benchmark token confidentiality', () => {
  it('never includes the token or header name in any response', async () => {
    const counted = countingLimiter('limited')
    const upstream = countingFetch()

    const responses = [
      // bypassed success
      await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        benchmark: true,
      }),
      // ordinary 429
      await handleAsk(question, {
        apiKey: KEY,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        benchmark: false,
      }),
      // 400 from validation
      await handleAsk({ question: '' }, { apiKey: KEY, rateLimiter: counted.limiter, benchmark: true }),
      // 503 missing key
      await handleAsk(question, {
        apiKey: undefined,
        fetchImpl: upstream.fetchImpl,
        rateLimiter: counted.limiter,
        benchmark: true,
      }),
    ]

    for (const response of responses) {
      const serialized = JSON.stringify(response)
      assert.ok(!serialized.includes(BENCHMARK_TOKEN), 'response must not echo the token')
      assert.ok(!serialized.includes('x-benchmark-token'), 'response must not echo the header name')
    }
  })

  it('does not put the token in response headers', async () => {
    const counted = countingLimiter('limited')
    const upstream = countingFetch()

    const result = await handleAsk(question, {
      apiKey: KEY,
      fetchImpl: upstream.fetchImpl,
      rateLimiter: counted.limiter,
      benchmark: true,
    })

    const headerValues = Object.entries(result.headers ?? {}).flat().join(' ')
    assert.ok(!headerValues.includes(BENCHMARK_TOKEN))
  })
})
