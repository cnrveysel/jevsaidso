/**
 * Server-side implementation of `POST /api/ask`.
 *
 * This module holds all request validation, the TypeSafe call, and response
 * normalization. It is runtime-agnostic (it uses only `fetch`, `AbortSignal`
 * and `JSON`) so it can run on Vercel Functions and be exercised directly from
 * Node during tests. It must never be imported from `src/`.
 */


import {
  DECISION_INSTRUCTIONS,
  DECISION_QUESTION_KEY,
  MAX_QUESTION_LENGTH,
  TYPESAFE_API_KEY_ENV,
  TYPESAFE_BASE_URL_ENV,
  TYPESAFE_ENDPOINT,
  TYPESAFE_MODEL,
  UNAVAILABLE_MESSAGE,
  UPSTREAM_TIMEOUT_MS,
} from './config'

export type Verdict = 'YES' | 'NO'

export interface AskPayload {
  answer: Verdict
  /** Probability of the returned `answer`, between 0 and 1. */
  probability: number
  mocked: false
}

export interface AskDependencies {
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injected for tests. */
  apiKey?: string | undefined
  /** Injected for tests. */
  endpoint?: string
  /** Injected for tests. */
  timeoutMs?: number
}

export interface AskResult {
  status: number
  body: AskPayload | { error: string }
}

/** Minimal shape of the Vercel request object we rely on. */
export interface MinimalRequest {
  method?: string
  body?: unknown
}

/** Minimal shape of the Vercel response object we rely on. */
export interface MinimalResponse {
  status: (code: number) => MinimalResponse
  json: (body: unknown) => unknown
  setHeader: (name: string, value: string) => void
  end: () => void
}

/**
 * TypeSafe `noul` values are probabilities in [0, 1].
 *
 * Anything outside that range is treated as malformed rather than guessed at:
 * silently rescaling an unexpected value (say `4`) could display a confidence
 * that does not mean what the UI claims it means.
 */
export function normalizeProbability(raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number(raw) : raw

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  if (value < 0 || value > 1) {
    return null
  }

  return value
}

/**
 * Turn P(YES) into the verdict we display plus the confidence in that verdict.
 *
 *   p = 0.82 -> { answer: 'YES', probability: 0.82 }
 *   p = 0.17 -> { answer: 'NO',  probability: 0.83 }
 */
export function decideFromYesProbability(yesProbability: number): AskPayload {
  const clamped = Math.min(1, Math.max(0, yesProbability))

  if (clamped >= 0.5) {
    return { answer: 'YES', probability: clamped, mocked: false }
  }

  return { answer: 'NO', probability: 1 - clamped, mocked: false }
}

/** Pull `noul` out of a TypeSafe response body without trusting its shape. */
function readNoul(body: unknown, questionKey: string): unknown {
  if (typeof body !== 'object' || body === null) {
    return undefined
  }

  const { answers } = body as { answers?: unknown }

  if (typeof answers !== 'object' || answers === null) {
    return undefined
  }

  const entry = (answers as Record<string, unknown>)[questionKey]

  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }

  return (entry as { noul?: unknown }).noul
}

function jsonResult(status: number, body: AskPayload | { error: string }): AskResult {
  return { status, body }
}

/**
 * Validate a raw request body and extract the question.
 *
 * Returns a `{ error }` result for anything invalid so the caller can answer
 * with a 400 without duplicating the rules.
 */
export function validateQuestion(rawQuestion: unknown, maxLength: number): { question: string } | { error: string } {
  if (typeof rawQuestion !== 'string') {
    return { error: 'A question is required.' }
  }

  const question = rawQuestion.trim()

  if (question.length === 0) {
    return { error: 'A question is required.' }
  }

  if (question.length > maxLength) {
    return { error: `Questions must be ${maxLength} characters or fewer.` }
  }

  return { question }
}

/**
 * Full server-side flow. Never throws, so the handler can map the result
 * straight onto an HTTP response.
 */
export async function handleAsk(
  rawBody: unknown,
  dependencies: AskDependencies = {},
): Promise<AskResult> {
  const {
    fetchImpl = fetch,
    apiKey = process.env[TYPESAFE_API_KEY_ENV],
    endpoint = process.env[TYPESAFE_BASE_URL_ENV]
      ? `${process.env[TYPESAFE_BASE_URL_ENV]}/v1/systemone`
      : TYPESAFE_ENDPOINT,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
  } = dependencies

  const body = typeof rawBody === 'string' ? safeJsonParse(rawBody) : rawBody

  if (body === undefined) {
    return jsonResult(400, { error: 'Expected a JSON body.' })
  }

  const rawQuestion =
    typeof body === 'object' && body !== null
      ? (body as { question?: unknown }).question
      : undefined

  const validated = validateQuestion(rawQuestion, MAX_QUESTION_LENGTH)

  if ('error' in validated) {
    return jsonResult(400, { error: validated.error })
  }

  if (!apiKey) {
    // Misconfiguration, not a user error — but the client only needs to know
    // that Jev is unavailable. The key value is never read, logged, or echoed.
    return jsonResult(503, { error: UNAVAILABLE_MESSAGE })
  }

  const upstreamBody = {
    model: TYPESAFE_MODEL,
    state: validated.question,
    questions: {
      [DECISION_QUESTION_KEY]: {
        type: 'noul',
        instructions: DECISION_INSTRUCTIONS,
      },
    },
  }

  let upstreamResponse: Response

  try {
    upstreamResponse = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // Network failure or timeout. Upstream detail is intentionally dropped.
    return jsonResult(502, { error: UNAVAILABLE_MESSAGE })
  }

  if (!upstreamResponse.ok) {
    // Drain the body so the connection can be reused, but never surface it:
    // upstream errors may echo request headers or internal identifiers.
    await drain(upstreamResponse)
    return jsonResult(502, { error: UNAVAILABLE_MESSAGE })
  }

  let parsed: unknown

  try {
    parsed = await upstreamResponse.json()
  } catch {
    return jsonResult(502, { error: UNAVAILABLE_MESSAGE })
  }

  const yesProbability = normalizeProbability(readNoul(parsed, DECISION_QUESTION_KEY))

  if (yesProbability === null) {
    return jsonResult(502, { error: UNAVAILABLE_MESSAGE })
  }

  return jsonResult(200, decideFromYesProbability(yesProbability))
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

async function drain(response: Response): Promise<void> {
  try {
    await response.arrayBuffer()
  } catch {
    // Ignore: draining is best-effort only.
  }
}

/** Build the JSON response headers for the endpoint. */
export function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }
}

/** Vercel-compatible handler for `POST /api/ask`. */
export default async function handler(
  request: MinimalRequest,
  response: MinimalResponse,
): Promise<void> {
  for (const [name, value] of Object.entries(apiHeaders())) {
    response.setHeader(name, value)
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const result = await handleAsk(request.body)

  response.status(result.status).json(result.body)
}