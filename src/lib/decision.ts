/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DECISION LAYER
 * ─────────────────────────────────────────────────────────────────────────────
 *  The UI only ever talks to `askJev()`. Everything about *how* a decision is
 *  produced lives behind this single function, so swapping the temporary mock
 *  for the real TypeSafe Jev model is a one-file change:
 *
 *      POST /api/ask
 *      { "question": "Should I text my ex?" }
 *      -> { "answer": "YES" | "NO", "probability": number }
 *
 *  When the backend is ready, delete `getMockDecision` and replace the body of
 *  `askJev` with a `fetch('/api/ask', ...)` call. No component needs to change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Verdict = 'YES' | 'NO'

export interface Decision {
  answer: Verdict
  /** 0–100, the probability Jev attaches to `answer`. */
  probability: number
  /** Trimmed question the verdict belongs to. */
  question: string
  /** True while results come from the local mock rather than the real model. */
  mocked: boolean
}

/** Smallest / largest probability the mock will report. */
const MOCK_MIN_PROBABILITY = 51
const MOCK_MAX_PROBABILITY = 99

/**
 * Tiny deterministic hash of the question, so a given question feels a little
 * consistent with itself instead of pure noise. Mock flavour only.
 */
function hashQuestion(question: string): number {
  let hash = 0
  for (let index = 0; index < question.length; index += 1) {
    hash = (hash * 31 + question.charCodeAt(index)) % 100000
  }
  return hash
}

/**
 * TEMPORARY — random placeholder standing in for the TypeSafe Jev model.
 *
 * This is the exact seam the real API call will replace.
 */
export function getMockDecision(question: string): Omit<Decision, 'question' | 'mocked'> {
  const hash = hashQuestion(question)
  const span = MOCK_MAX_PROBABILITY - MOCK_MIN_PROBABILITY

  const probability = MOCK_MIN_PROBABILITY + Math.round(Math.random() * span)

  return {
    answer: (hash + Math.round(Math.random() * 100)) % 2 === 0 ? 'YES' : 'NO',
    probability,
  }
}

/**
 * How long the mock "thinks" before answering. The real model responds on its
 * own schedule; this only exists so the deciding state is visible.
 */
export const MOCK_DECISION_DELAY_MS = 780

/** Ask Jev. Currently a local mock — see `getMockDecision` above. */
export async function askJev(question: string): Promise<Decision> {
  const trimmed = question.trim()

  await new Promise((resolve) => setTimeout(resolve, MOCK_DECISION_DELAY_MS))
  const mock = getMockDecision(trimmed)

  return { ...mock, question: trimmed, mocked: true }
}