/**
 * Private benchmark bypass for the rate limiter.
 *
 * The public limit (10 requests / 60 s / IP) must never be weakened, so this
 * module only ever answers one question: "should this request skip the limiter?"
 *
 * Guarantees:
 *  - Server-side only. `BENCHMARK_BYPASS_TOKEN` is never imported into `src/`,
 *    never prefixed with `VITE_`, never logged, and never echoed in a response.
 *  - Disabled unless the environment variable is set to a non-empty value, so a
 *    missing `BENCHMARK_BYPASS_TOKEN` cannot be satisfied by any request.
 *  - A wrong or absent token behaves exactly like an ordinary public request:
 *    it is rate limited like everybody else.
 *  - Comparison is constant-time and hashes both sides first, so neither the
 *    token's contents nor its length leak through response timing.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import { BENCHMARK_TOKEN_HEADER, BENCHMARK_BYPASS_TOKEN_ENV } from './config.js'
import { readHeader, type RequestHeaders } from './headers.js'

/**
 * Compare two secrets without leaking length or content through timing.
 *
 * Both values are hashed to a fixed width first, so `timingSafeEqual` always
 * receives equal-length buffers regardless of the inputs.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()

  return timingSafeEqual(providedDigest, expectedDigest)
}

/**
 * Should this request skip the rate limiter?
 *
 * Returns `false` unless the configured token is non-empty *and* the request
 * presents a matching `x-benchmark-token` header. It never throws and never
 * reports why it declined — callers must treat every `false` identically.
 */
export function isBenchmarkRequest(
  headers: RequestHeaders,
  expectedToken: string | undefined = process.env[BENCHMARK_BYPASS_TOKEN_ENV],
): boolean {
  // An unset *or empty* token disables the bypass. Without this guard an empty
  // environment variable would be matched by an empty header.
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    return false
  }

  const provided = readHeader(headers, BENCHMARK_TOKEN_HEADER)

  if (provided === null) {
    return false
  }

  return secretsMatch(provided, expectedToken)
}
