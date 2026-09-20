/** Question length limits, shared by the composer and the decision layer. */
export const MAX_QUESTION_LENGTH = 250

/** Show the character counter only once the writer is getting close. */
export const CHARACTER_COUNT_THRESHOLD = 200

/** Product copy that appears in more than one place. */
export const SITE_NAME = 'Jev Said So'
export const SITE_DOMAIN = 'jevsaidso.com'

export const EXAMPLE_QUESTIONS = [
  'Should I go out tonight?',
  'Should I text my ex?',
  'Should I order pizza?',
  'Should I skip the gym?',
] as const

/**
 * Text used by the Web Share API, and by the clipboard fallback.
 * `probability` is the 0–1 confidence in `answer`.
 */
export function buildShareText(question: string, answer: string, probability: number): string {
  const percent = Math.round(probability * 100)
  return [question, '', `Jev says ${answer} — ${percent}%.`, '', SITE_DOMAIN].join('\n')
}