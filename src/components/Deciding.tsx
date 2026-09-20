interface DecidingProps {
  question: string
}

export function Deciding({ question }: DecidingProps) {
  return (
    <section className="deciding" role="status" aria-live="polite">
      <p className="deciding__query">&ldquo;{question}&rdquo;</p>
      <p className="deciding__status">Jev is deciding</p>
      <div className="deciding__track" aria-hidden="true" />
    </section>
  )
}