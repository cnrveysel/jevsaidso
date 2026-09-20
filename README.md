# Jev Said So

A tiny website that makes yes/no decisions for you using Jev.

Live: **https://jevsaidso.com**

Ask a question like *"Should I text my ex?"*, press **ASK JEV**, and get a verdict
with a confidence score.

![Jev Said So](docs/jevsaidso-demo.png)

## How it works

```
Question
   -> Vercel server function  (/api/ask)
   -> TypeSafe Jev            (jev-latest)
   -> YES / NO + confidence
```

The browser never talks to TypeSafe directly. It posts the question to our own
server function, which holds the API key, asks Jev, and normalizes the answer.

## Features

- **Yes/no decisions** — one question in, one verdict out, no signup
- **Confidence percentage** — Jev's probability, always read as confidence in the
  verdict you are shown (never below 50%)
- **Real Jev API** — TypeSafe's `jev-latest` model, not a mocked or random answer
- **Server-side API key** — the TypeSafe credential never reaches the browser
- **Rate limiting** — 10 questions per IP per minute, enforced in Redis so it holds
  across serverless instances
- **Responsive UI** — one screen, works down to small phones
- **Share button** — uses the Web Share API, falls back to copying text

## Stack

- React
- TypeScript
- Vite
- Vercel Functions
- TypeSafe Jev API
- Upstash Redis (rate limiting)

## Architecture

```
Browser  ->  POST /api/ask  ->  Vercel Function
                                   |-> Upstash Redis   (rate limit check first)
                                   |-> TypeSafe Jev    (only if allowed)
                                   ->  { answer, probability }
```

- `api/ask.ts` — Vercel Function entry point
- `api/_lib/ask.ts` — validation, TypeSafe call, verdict normalization
- `api/_lib/rate-limit.ts` — Upstash-backed rate limiter and client IP handling
- `src/lib/decision.ts` — browser API layer (calls `POST /api/ask`)
- `scripts/dev-server.mjs` — local Vite + `/api/ask`, no Vercel CLI needed

Rate limiting runs **before** the TypeSafe call, so a rejected request costs
nothing. If Upstash is unreachable the endpoint fails open rather than taking the
product down.

### `POST /api/ask`

```jsonc
// request
{ "question": "Should I go out tonight?" }

// 200
{ "answer": "YES", "probability": 0.82, "mocked": false }

// 429
{ "error": "Too many questions. Try again in a minute." }
```

`probability` is confidence in `answer`, between 0 and 1.

Status codes: `400` invalid input, `405` non-POST, `429` rate limited,
`502` upstream failure, `503` missing key. Error bodies are always
`{ "error": "..." }` and never include upstream detail or credentials.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173 — app + the real /api/ask endpoint
npm run dev:vite   # frontend only (no /api; shows the retry state)
npm run build      # type-check + production bundle into dist/
npm run preview    # serve the production build (static only, no /api)
npm run lint       # eslint
npm test           # server-side API and rate-limit tests (no network)
```

### Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in the values.

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `TYPESAFE_API_KEY` | yes | Server-side TypeSafe credential for Jev |
| `UPSTASH_REDIS_REST_URL` | production | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | production | Upstash Redis REST token |
| `TYPESAFE_BASE_URL` | no | Test-only override pointing at a mock upstream |

All of these are **server-side only**. None are prefixed with `VITE_`, and none are
imported into `src/` — anything `VITE_`-prefixed is bundled into client JavaScript
and would be public.

Upstash is optional locally: without it, `/api/ask` runs unlimited so development
and tests stay usable. In production it is required, otherwise the rate limit is
inactive.

## Production setup

1. Set `TYPESAFE_API_KEY` in Vercel → Project Settings → Environment Variables.
2. Create a Redis database at [console.upstash.com](https://console.upstash.com)
   and copy its REST URL and token.
3. Add them to Vercel as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Redeploy so the new variables take effect.

## Testing

`npm test` never calls TypeSafe or Upstash — the upstream is stubbed, so no API
credits are used. Coverage includes request validation, the TypeSafe request
shape, YES/NO normalization, generic upstream error handling, and rate limiting
(below limit, over limit, and that a blocked request never reaches TypeSafe).

## Vibe coded

This project was vibe coded with AI coding agents as a fun experiment.

I directed the product, behavior, testing, debugging, deployment, and iterations
while the agents helped write much of the implementation. Every decision about
what this thing should be — and whether it actually works — came from a human
saying "no, try again".

## Disclaimer

For entertainment only. Not medical, legal, financial, or safety advice. Jev is a
language model with opinions, not an oracle.
