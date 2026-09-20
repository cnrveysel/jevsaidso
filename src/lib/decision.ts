/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DECISION LAYER (client)
 * ─────────────────────────────────────────────────────────────────────────────
 *  The UI only ever talks to `askJev()`. That function calls our own server
 *  endpoint, which owns the TypeSafe Jev credentials and normalizes the
 *  verdict:
 *
 *      POST /api/ask
 *      { "question": "Should I text my ex?" }
 *      -> { "answer": "YES" | "NO", "probability": 0.82, "mocked": false }
 *
 *  The TypeSafe API key lives in the server environment only. Nothing in this
 *  file (or anywhere under `src/`) can access it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Verdict = 'YES' | 'NO'

/** Result shape returned by `POST /api/ask`. */
export interface AskResponse {
  answer: Verdict
  /** Probability of the returned `answer`, 0–1. */
  probability: number
}

/** What the UI consumes: the verdict plus the question it belongs to. */
export interface Decision extends AskResponse {
  question: string
}

/** Endpoint that proxies to the TypeSafe Jev model. */
export const ASK_ENDPOINT = '/api/ask'

/** Copy shown when the decision service cannot be reached. */
export const ASK_ERROR_MESSAGE = 'Jev is unavailable right now. Try again in a moment.'

function isVerdict(value: unknown): value is Verdict {
  return value === 'YES' || value === 'NO'
}

/** Narrow an unknown server payload to a safe `Decision` (client-side guard). */
function parseAskResponse(payload: unknown): AskResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const { answer, probability } = payload as { answer?: unknown; probability?: unknown }

  if (!isVerdict(answer)) {
    return null
  }

  if (typeof probability !== 'number' || !Number.isFinite(probability)) {
    return null
  }

  // The server returns 0–1; be tolerant of a 0–100 value from any future host.
  const normalized = probability > 1 ? probability / 100 : probability

  return {
    answer,
    probability: Math.min(1, Math.max(0, normalized)),
  }
}

/**
 * Ask Jev.
 *
 * Throws on network failure or an unusable response; `App.tsx` already renders
 * `ASK_ERROR_MESSAGE` for that case.
 */
export async function askJev(question: string): Promise<Decision> {
  const trimmed = question.trim()

  const response = await fetch(ASK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: trimmed }),
  })

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(ASK_ERROR_MESSAGE)
  }

  const parsed = parseAskResponse(payload)

  if (parsed === null) {
    throw new Error(ASK_ERROR_MESSAGE)
  }

  return { ...parsed, question: trimmed }
}