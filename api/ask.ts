/**
 * Vercel Node.js Function — `POST /api/ask`.
 *
 * Vercel's filesystem routing turns this file into the `/api/ask` endpoint.
 * All logic lives in `_lib/ask.ts` so it can be unit tested without a server.
 * The TypeSafe API key is read from `process.env.TYPESAFE_API_KEY` on the
 * server only and never reaches the browser.
 */

export { default } from './_lib/ask'

export const config = {
  runtime: "nodejs",
};