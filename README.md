# Jev Said So

Ask a yes-or-no question. Jev makes the call.

A single-purpose web toy: type a YES/NO question, press **ASK JEV**, get a verdict
from the TypeSafe Jev model.

## Stack

Vite + React + TypeScript, plain CSS. One server-side function on Vercel. No UI framework.

## Architecture

```
Browser  ->  POST /api/ask  ->  Vercel Function (api/ask.ts)
                                     ->  POST https://api.typesafe.ai/v1/systemone
                                     ->  normalized { answer, probability }
```

The TypeSafe API key is read from `process.env.TYPESAFE_API_KEY` on the server only.
It is never prefixed with `VITE_`, never imported into `src/`, and never sent to the
browser.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173 — app + the real /api/ask endpoint
npm run dev:vite   # frontend only (no /api/ask; shows the retry state)
npm run build      # type-check + production bundle into dist/
npm run preview    # serve the production build (static only, no /api)
npm run lint       # eslint
npm run test       # server-side API tests (node --test, no network)
```

### Setting `TYPESAFE_API_KEY` locally

Create `.env.local` in the project root (already git-ignored):

```
TYPESAFE_API_KEY=your-typesafe-api-key
```

`npm run dev` loads it server-side via Vite's env loader and reports whether the key
was detected. Without the key the app still runs; `/api/ask` answers
`503 {"error":"Jev is unavailable right now."}` and the UI shows its retry state.

On Vercel, set the same variable in **Project Settings → Environment Variables**.
`TYPESAFE_BASE_URL` is an optional test-only override that points the server at a mock
upstream; leave it unset in production.

## Structure

```
index.html               document shell, SEO + Open Graph tags
public/                  favicon.svg, og.svg, robots.txt
api/
  ask.ts                 Vercel Function entry — POST /api/ask
  _lib/
    ask.ts               validation, TypeSafe call, normalization
    config.ts            endpoint, model, limits, messages
scripts/
  dev-server.mjs         Vite middleware + /api/ask for local development
src/
  main.tsx               React entry point
  App.tsx                page composition + question state machine
  components/
    CharCount.tsx        counter, visible only near the limit
    ExampleQuestions.tsx one-tap example prompts
    Deciding.tsx         "Jev is deciding…" state
    ResultCard.tsx       verdict, probability, share
  lib/
    decision.ts          client API layer — calls POST /api/ask
    constants.ts         limits, copy, share text
  styles/
    base.css             design tokens, resets, base element styles
    app.css              layout and component styles
tests/
  ask.test.ts            server endpoint tests (mocked upstream)
```

## `POST /api/ask`

Request:

```json
{ "question": "Should I go out tonight?" }
```

Response:

```json
{ "answer": "YES", "probability": 0.82, "mocked": false }
```

`probability` is the confidence in `answer`, between 0 and 1. The UI renders it as a
percentage.

Errors: `400` invalid input, `405` non-POST, `502` upstream failure, `503` missing key.
All error bodies are `{ "error": "..." }` and never include upstream detail or the key.

### How the verdict is normalized

TypeSafe's `answers.decision.noul` is P(YES):

| noul | answer | displayed confidence |
| ---- | ------ | -------------------- |
| 0.82 | YES    | 82%                  |
| 0.50 | YES    | 50%                  |
| 0.17 | NO     | 83% (`1 - 0.17`)     |
| 0.01 | NO     | 99%                  |

So the number always reads as confidence in the verdict being shown, and is never
below 50%. A `noul` outside `[0, 1]` is treated as a malformed response (`502`) rather
than rescaled, so the UI never displays a confidence it cannot stand behind.

## Testing against TypeSafe

`npm run test` mocks the upstream: a stub `fetch` covers validation and normalization,
and a throwaway local HTTP server exercises the real handler. No TypeSafe credits are
consumed. To smoke-test the live API once, set a real key in `.env.local` and ask one
question through `npm run dev`.