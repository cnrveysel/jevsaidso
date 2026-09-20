/**
 * Durable rate limiting for `POST /api/ask`.
 *
 * Vercel runs each request in a throwaway serverless instance, so an in-memory
 * Map would let a caller reset their own counter just by getting a cold start.
 * Counters therefore live in Upstash Redis, reached over HTTP.
 *
 * Design notes:
 *  - Fail open. If Upstash is not configured, or is slow/unreachable, requests
 *    are allowed through. The rate limit is abuse protection, not a security
 *    boundary, and the product staying up matters more than a strict cap.
 *  - The limiter is created once per instance (module scope) so warm invocations
 *    reuse it, including Upstash's ephemeral block cache.
 *  - Credentials are read from the server environment only and never logged.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import {
  CLIENT_IP_HEADERS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_PREFIX,
  RATE_LIMIT_TIMEOUT_MS,
  RATE_LIMIT_WINDOW,
  UNKNOWN_CLIENT_ID,
  UPSTASH_REDIS_TOKEN_ENV,
  UPSTASH_REDIS_URL_ENV,
} from './config.js'
import { readHeader, type RequestHeaders } from './headers.js'

// Re-exported so existing server-side imports keep working unchanged.
export type { RequestHeaders }

export type RateLimitOutcome = 'allowed' | 'limited' | 'unavailable'

/** Anything that can decide whether an identifier may proceed. */
export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitOutcome>
}

/**
 * Identify the caller.
 *
 * Vercel's proxy computes these headers, so they cannot be spoofed by the
 * application. The order of `CLIENT_IP_HEADERS` is what keeps that true: a
 * client-supplied value is never trusted over a Vercel-provided one.
 */
export function getClientId(headers: RequestHeaders): string {
  for (const name of CLIENT_IP_HEADERS) {
    const value = readHeader(headers, name)

    if (value === null) {
      continue
    }

    // `x-forwarded-for` may be a list; the leftmost entry is the client.
    const candidate = value.split(',')[0]?.trim()

    if (candidate) {
      return candidate
    }
  }

  return UNKNOWN_CLIENT_ID
}

/**
 * Build the Upstash-backed limiter, or `null` when it is not configured.
 *
 * Never throws: a malformed configuration degrades to "no rate limiting"
 * rather than breaking every request.
 */
export function createRateLimiter(): RateLimiter | null {
  const url = process.env[UPSTASH_REDIS_URL_ENV]
  const token = process.env[UPSTASH_REDIS_TOKEN_ENV]

  if (!url || !token) {
    return null
  }

  try {
    const redis = new Redis({ url, token, retry: { retries: 1 } })

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW),
      prefix: RATE_LIMIT_PREFIX,
      timeout: RATE_LIMIT_TIMEOUT_MS,
    })

    return {
      async limit(identifier: string): Promise<RateLimitOutcome> {
        try {
          const { success } = await ratelimit.limit(identifier)
          return success ? 'allowed' : 'limited'
        } catch {
          // Network error, bad credentials, quota exhausted, etc.
          return 'unavailable'
        }
      },
    }
  } catch {
    return null
  }
}

let cachedLimiter: RateLimiter | null | undefined

/**
 * The process-wide limiter.
 *
 * Cached so warm serverless invocations share one instance, and so the
 * "not configured" answer is only computed once.
 */
export function getRateLimiter(): RateLimiter | null {
  if (cachedLimiter === undefined) {
    cachedLimiter = createRateLimiter()
  }

  return cachedLimiter
}