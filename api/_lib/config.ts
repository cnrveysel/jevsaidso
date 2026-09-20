/**
 * Server-side configuration for the TypeSafe Jev integration.
 *
 * `TYPESAFE_API_KEY` is read from the server environment only. It is never
 * imported into `src/`, never prefixed with `VITE_`, and never logged.
 */

/** Server-side env var holding the TypeSafe API key. Never exposed to the browser. */
export const TYPESAFE_API_KEY_ENV = 'TYPESAFE_API_KEY'

/** TypeSafe REST endpoint for the SystemOne / Jev decision model. */
export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

/**
 * Base override used by the local test harness to point at a mock TypeSafe
 * server. Unset in production, where `TYPESAFE_ENDPOINT` is used.
 */
export const TYPESAFE_BASE_URL_ENV = 'TYPESAFE_BASE_URL'

/** Jev model identifier. */
export const TYPESAFE_MODEL = 'jev-latest'

/** Question name we ask TypeSafe for. */
export const DECISION_QUESTION_KEY = 'decision'

/** Noul instruction: the reported value is P(answer is YES). */
export const DECISION_INSTRUCTIONS = `
Answer the user's yes-or-no question as a decision, not as a prediction.

Use only the information explicitly provided by the user.
Give strong weight to the user's stated preferences, feelings, goals, and circumstances.
Interpret the question literally and from the user's perspective.

Do not favor NO simply because it preserves the status quo.
Do not favor YES simply because it represents action or change.

If the provided information strongly supports one answer, reflect that clearly.
If the information is weak, incomplete, or genuinely balanced, stay close to 0.5.

Return the probability that YES is the more appropriate answer to the user's question.
`

/**
 * Rate limiting — durable, serverless-safe.
 *
 * Backed by Upstash Redis (REST) so the counter is shared across every
 * serverless instance instead of living in one process's memory.
 */
export const UPSTASH_REDIS_URL_ENV = 'UPSTASH_REDIS_REST_URL'
export const UPSTASH_REDIS_TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN'

/** Requests allowed per window, per client IP. */
export const RATE_LIMIT_MAX = 10

/** Length of the rate-limit window. */
export const RATE_LIMIT_WINDOW = '60 s'

/** Same window in seconds, for the `Retry-After` header. */
export const RATE_LIMIT_WINDOW_SECONDS = 60

/** Redis key namespace, so this app never collides with another one. */
export const RATE_LIMIT_PREFIX = 'jevsaidso:ask'

/**
 * How long to wait on Upstash before letting the request through. Keeps a slow
 * or unreachable Redis from turning into a slow or unreachable product.
 */
export const RATE_LIMIT_TIMEOUT_MS = 2_000

/** Client-facing message when the rate limit is exceeded. */
export const RATE_LIMITED_MESSAGE = 'Too many questions. Try again in a minute.'

/**
 * Header order used to identify a client.
 *
 * Ordered from most to least trustworthy so a client-supplied header can never
 * win over a platform-set one:
 *
 *  1. `x-vercel-forwarded-for` — set by Vercel's network. Vercel documents it as
 *     identical to `x-forwarded-for` but explicitly *not* the header an
 *     upstream proxy would rewrite, so it is the safest identifier here.
 *  2. `x-forwarded-for` — Vercel states it overwrites this header and does not
 *     forward external IPs, specifically to prevent IP spoofing.
 *  3. `x-real-ip` — documented as identical to the above, but Vercel makes no
 *     explicit overwrite guarantee for it, so it is only a last resort.
 *
 * If none are present the caller shares one bucket; that is deliberate, so an
 * unknown caller still cannot mint unlimited requests by omitting headers.
 */
export const CLIENT_IP_HEADERS = [
  'x-vercel-forwarded-for',
  'x-forwarded-for',
  'x-real-ip',
] as const

/** Bucket used when no usable client IP is present. */
export const UNKNOWN_CLIENT_ID = 'unknown'

/** Authoritative question cap; mirrors the client-side limit. */
export const MAX_QUESTION_LENGTH = 250

/** Upstream request timeout. */
export const UPSTREAM_TIMEOUT_MS = 12_000

/** Generic client-facing message; never includes upstream detail or secrets. */
export const UNAVAILABLE_MESSAGE = 'Jev is unavailable right now.'