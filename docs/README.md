# docs/

This folder holds demo media for the README.

## Required: `docs/jevsaidso-demo.png`

The README embeds `docs/jevsaidso-demo.png`, which **does not exist yet** — the
image link will be broken until you add it. Nothing was auto-generated here on
purpose: a fabricated screenshot would misrepresent the product.

Please add one of the following.

### Option A — a screenshot (simplest, recommended)

Capture the result card, not just the empty form. The verdict is the shareable
part.

1. Run `npm run dev` and open http://localhost:5173 (a real `TYPESAFE_API_KEY`
   in `.env.local` gives a genuine verdict).
2. Ask a question, e.g. *"Should I text my ex?"*
3. Screenshot the result card, roughly 1200x900 for desktop.
4. Save it as `docs/jevsaidso-demo.png`.

On Windows: `Win + Shift + S`, or use the browser's device toolbar to capture a
mobile-sized shot — those tend to perform better on social.

### Option B — a short GIF (best for sharing)

A 3-5 second loop of: typing a question → "Jev is deciding..." → the verdict
landing.

Record with [ScreenToGif](https://www.screentogif.com/) (Windows), LICEcap, or
`peek` on Linux, then save as `docs/jevsaidso-demo.gif` and update the image
reference at the top of `README.md` to point at the `.gif`.

Keep it under ~5 MB — GitHub renders large GIFs slowly.

## Do not use

Stock photos, AI-generated mockups of the UI, or screenshots that show a verdict
the product can no longer produce. It should be a real capture of the running app.
