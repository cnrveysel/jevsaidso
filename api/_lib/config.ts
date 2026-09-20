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
export const DECISION_INSTRUCTIONS = 'Should the answer to this yes-or-no question be YES?'

/** Authoritative question cap; mirrors the client-side limit. */
export const MAX_QUESTION_LENGTH = 250

/** Upstream request timeout. */
export const UPSTREAM_TIMEOUT_MS = 12_000

/** Generic client-facing message; never includes upstream detail or secrets. */
export const UNAVAILABLE_MESSAGE = 'Jev is unavailable right now.'