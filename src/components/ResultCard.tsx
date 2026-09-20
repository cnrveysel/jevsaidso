import { useCallback, useState } from 'react'
import type { Decision } from '../lib/decision'
import { buildShareText } from '../lib/constants'

interface ResultCardProps {
  decision: Decision
  onReset: () => void
}

type ShareState = 'idle' | 'shared' | 'copied' | 'failed'

export function ResultCard({ decision, onReset }: ResultCardProps) {
  const [shareState, setShareState] = useState<ShareState>('idle')
  const { answer, probability, question, mocked } = decision

  const handleShare = useCallback(async () => {
    const text = buildShareText(question, answer, probability)

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Jev Said So', text })
        setShareState('shared')
        return
      }

      await navigator.clipboard.writeText(text)
      setShareState('copied')
    } catch (error) {
      // A cancelled share dialog is not a failure worth surfacing.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setShareState('failed')
    }
  }, [answer, probability, question])

  const shareLabel =
    shareState === 'copied'
      ? 'Copied'
      : shareState === 'shared'
        ? 'Shared'
        : shareState === 'failed'
          ? 'Copy failed'
          : 'Share'

  return (
    <section
      className={`result result--${answer === 'YES' ? 'yes' : 'no'}`}
      aria-label="Jev's decision"
    >
      <div className="result__question">
        <p className="result__eyebrow">Question</p>
        <p className="result__query">&ldquo;{question}&rdquo;</p>
      </div>

      <div className="result__verdict">
        <p className="result__answer" aria-live="polite">
          {answer}
        </p>
        <p className="result__probability">
          <span>{probability}%</span>
          <span>confidence</span>
        </p>
      </div>

      <p className="result__signature">
        <em>Jev said so.</em>
      </p>

      <div className="result__actions">
        <button type="button" className="button button--ghost" onClick={onReset}>
          Ask another
        </button>
        <button type="button" className="button button--ghost" onClick={handleShare}>
          {shareLabel}
        </button>
      </div>

      <div className="result__note">
        {shareState === 'failed'
          ? 'Sharing is unavailable in this browser.'
          : shareState === 'copied'
            ? 'Copied to your clipboard.'
            : ''}
      </div>

      {mocked ? (
        <div className="mock-badge__row">
          <span className="mock-badge">Mock decision</span>
        </div>
      ) : null}
    </section>
  )
}