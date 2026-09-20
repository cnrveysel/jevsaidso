# Jev Said So

Ask a yes-or-no question. Jev makes the call.

A single-purpose web toy: type a YES/NO question, press **ASK JEV**, get a verdict.

## Stack

Vite + React + TypeScript, plain CSS. No UI framework, no backend.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle into dist/
npm run preview  # serve the production build
npm run lint     # eslint
```

## Structure

```
index.html               document shell, SEO + Open Graph tags
public/                  favicon.svg, og.svg, robots.txt
src/
  main.tsx               React entry point
  App.tsx                page composition + question state machine
  components/
    CharCount.tsx        counter, visible only near the limit
    ExampleQuestions.tsx one-tap example prompts
    Deciding.tsx         "Jev is deciding…" state
    ResultCard.tsx       verdict, probability, share
  lib/
    decision.ts          ← the decision seam (see below)
    constants.ts         limits, copy, share text
  styles/
    base.css             design tokens, resets, base element styles
    app.css              layout and component styles
```

## Replacing the mock decision

All decision logic lives behind `askJev(question)` in `src/lib/decision.ts`. The mock
lives in `getMockDecision()` in the same file and is marked `TEMPORARY`.

To connect the real TypeSafe Jev model, replace the body of `askJev` with a call to:

```
POST /api/ask
{ "question": "..." }
-> { "answer": "YES" | "NO", "probability": 73 }
```

Then delete `getMockDecision` and the `Mock decision` badge in `ResultCard.tsx`.

No component or style changes are required.

## Notes

Results are currently generated locally for interface testing and do not come from
Jev. The UI labels them `Mock decision` so this is never implied otherwise.