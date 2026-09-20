import { MAX_QUESTION_LENGTH } from '../lib/constants'

interface CharCountProps {
  length: number
  threshold: number
}

/** Renders only near the limit, so the composer stays visually quiet. */
export function CharCount({ length, threshold }: CharCountProps) {
  if (length < threshold) {
    return null
  }

  const remaining = MAX_QUESTION_LENGTH - length

  return (
    <span
      className={remaining <= 20 ? 'composer__count composer__count--low' : 'composer__count'}
      aria-live="polite"
    >
      {remaining} left
    </span>
  )
}