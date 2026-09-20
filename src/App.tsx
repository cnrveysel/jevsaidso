import { useCallback, useRef, useState, type FormEvent } from 'react'
import { ASK_ERROR_MESSAGE, askJev, type Decision } from './lib/decision'
import { MAX_QUESTION_LENGTH } from './lib/constants'
import { CharCount } from './components/CharCount'
import { ExampleQuestions } from './components/ExampleQuestions'
import { Deciding } from './components/Deciding'
import { ResultCard } from './components/ResultCard'

type Status = 'idle' | 'deciding' | 'done'

export default function App() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const requestId = useRef(0)

  const trimmed = question.trim()
  const isDeciding = status === 'deciding'
  const canSubmit = trimmed.length > 0 && !isDeciding

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault()

      const asked = question.trim()
      if (asked.length === 0 || status === 'deciding') {
        return
      }

      const id = ++requestId.current
      setError(null)
      setDecision(null)
      setStatus('deciding')

      try {
        const result = await askJev(asked)
        if (id !== requestId.current) return
        setDecision(result)
        setStatus('done')
      } catch {
        if (id !== requestId.current) return
        setError(ASK_ERROR_MESSAGE)
        setStatus('idle')
      }
    },
    [question, status],
  )

  const handleReset = useCallback(() => {
    requestId.current += 1
    setQuestion('')
    setStatus('idle')
    setDecision(null)
    setError(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])


  return (
    <div className="page">
      <header className="masthead">
        <a className="wordmark" href="/">
          Jev Said So
        </a>
      </header>

      <main className="stage">
        {status === 'idle' ? (
          <>
            <section className="hero">
              <h1 className="hero__title">
                <em>Can&apos;t decide?</em>
                <em className="hero__muted">Ask Jev.</em>
              </h1>
              <p className="hero__subtitle">One question. One decision.</p>
            </section>

            <form className="composer" onSubmit={handleSubmit} noValidate>
              <div className="composer__field">
                <label className="composer__label" htmlFor="question">
                  Your question
                </label>
                <textarea
                  ref={inputRef}
                  id="question"
                  className="composer__input"
                  name="question"
                  rows={3}
                  placeholder="Should I text my ex?"
                  maxLength={MAX_QUESTION_LENGTH}
                  value={question}
                  autoComplete="off"
                  autoFocus
                  disabled={isDeciding}
                  enterKeyHint="send"
                  aria-describedby={error ? 'question-error' : undefined}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSubmit()
                    }
                  }}
                />
                <div className="composer__meta">
                  <CharCount length={question.length} threshold={200} />
                </div>
              </div>

              <ExampleQuestions
                disabled={isDeciding}
                onSelect={(example) => {
                  setQuestion(example)
                  inputRef.current?.focus()
                }}
              />

              <button type="submit" className="button button--primary" disabled={!canSubmit}>
                Ask Jev
              </button>

              {error ? (
                <p id="question-error" role="alert" className="composer__count composer__count--low">
                  {error}
                </p>
              ) : null}
            </form>
          </>
        ) : null}

        {status === 'deciding' && decision === null ? (
          <Deciding question={trimmed} />
        ) : null}

        {status === 'done' && decision ? (
          <ResultCard decision={decision} onReset={handleReset} />
        ) : null}
      </main>

      <footer className="footer">
        <p className="footer__tagline">Jev makes decisions. You make choices.</p>
        <p>
          For entertainment only — not medical, legal, financial, or safety advice.
        </p>
      </footer>
    </div>
  )
}