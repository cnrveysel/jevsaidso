import { EXAMPLE_QUESTIONS } from '../lib/constants'

interface ExampleQuestionsProps {
  disabled: boolean
  onSelect: (question: string) => void
}

export function ExampleQuestions({ disabled, onSelect }: ExampleQuestionsProps) {
  return (
    <div className="composer__examples">
      {EXAMPLE_QUESTIONS.map((question) => (
        <button
          key={question}
          type="button"
          className="chip"
          disabled={disabled}
          onClick={() => onSelect(question)}
        >
          {question}
        </button>
      ))}
    </div>
  )
}