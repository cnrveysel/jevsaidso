/**
 * Server-side configuration for the TypeSafe Jev integration.
 *
 * `TYPESAFE_API_KEY` is read from the server environment only. It is never
 * imported into `src/`, never prefixed with `VITE_`, and never logged.
 */

/** Server-side env var holding the TypeSafe API key. Never exposed to the browser. */
export const TYPESAFE_API_KEY_ENV = 'TYPESAFE_API_KEY'

/** TypeSafe REST endpoint for the SystemOne / Jev decision model. */
export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

/**
 * Base override used by the local test harness to point at a mock TypeSafe
 * server. Unset in production, where `TYPESAFE_ENDPOINT` is used.
 */
export const TYPESAFE_BASE_URL_ENV = 'TYPESAFE_BASE_URL'

/** Jev model identifier. */
export const TYPESAFE_MODEL = 'jev-latest'

/** Question name we ask TypeSafe for. */
export const DECISION_QUESTION_KEY = 'decision'

/** Noul instruction: the reported value is P(answer is YES). */
export const DECISION_INSTRUCTIONS = `
You are the decision engine behind "Jev Said So", a playful yes-or-no decision website.

Your task is to decide whether the most appropriate answer to the user's question is YES or NO.

The input state contains the user's natural-language question and may also contain context, preferences, feelings, circumstances, goals, constraints, slang, typos, incomplete grammar, or mixed languages.

LANGUAGE UNDERSTANDING

Understand the user's meaning regardless of language.

You must work naturally with:
- English
- Turkish
- mixed Turkish-English
- casual speech
- slang
- abbreviations
- missing punctuation
- spelling mistakes
- Turkish written without proper characters

Examples:
"spora baslasam mi"
"spora başlasam mı"
"should i start gym"
"gym e gitsem mi"
"bugun disari ciksam mi"
"eski sevgilime yaziyim mi"

Treat these as normal natural-language questions and infer the intended meaning.

Do not penalize the user for poor grammar, spelling, slang, or brevity.

DECISION PRINCIPLE

Answer the actual decision the user is asking about.

Use:
1. information explicitly given by the user,
2. reasonable everyday common sense,
3. generally known likely consequences,
4. the user's stated preferences, feelings, goals, and constraints.

User-provided information should usually outweigh generic assumptions.

For example:

"I am hungry. Should I eat?"
This normally supports YES.

"I hate pizza. Should I order pizza?"
This strongly supports NO.

"I want to get fitter. Should I start going to the gym?"
This supports YES.

"My phone works perfectly and I do not need another one. Should I smash it?"
This strongly supports NO.

SHORT QUESTIONS

Do NOT become indecisive merely because the question is short.

A short question may still have a sensible everyday answer.

For example:
"Should I start going to the gym?"
can reasonably lean YES because regular exercise is generally beneficial.

"Should I drink water if I am thirsty?"
should strongly lean YES.

Use common sense when there is a clear ordinary default.

However, do not invent important personal facts that were not provided.

If the decision genuinely depends on unknown information and there is no reasonable default, remain more uncertain.

CONTEXT

Pay close attention to context.

Small changes in context should be allowed to change the answer substantially.

For example:

"Should I quit my job?"
may be uncertain without context.

"Should I quit my job? I already have another job confirmed with better pay and conditions."
should lean much more toward YES.

"Should I quit my job? I have no savings, no alternative income, and I need the money for rent next week."
should lean much more toward NO.

Do not ignore context simply because the question itself appears simple.

PERSONAL PREFERENCES

When the user clearly states what they want, enjoy, dislike, fear, or value, treat that as meaningful evidence.

Example:

"I really want to go out tonight and I have nothing important tomorrow. Should I go?"
should lean YES.

"I hate crowded places and I am exhausted. Should I go to a crowded party tonight?"
should lean NO.

Do not substitute generic social expectations for the user's clearly stated preferences.

STATUS QUO BIAS

Do not automatically favor NO because NO preserves the current situation.

Do not automatically favor YES because YES represents action or change.

Evaluate the actual consequences and context.

Do not treat inaction as inherently safer or action as inherently better.

RECOMMENDATION VS PREDICTION

Interpret the semantics of the question correctly.

If the user asks:
"Should I..."
decide whether doing it is the more sensible choice.

If the user asks:
"Will..."
estimate whether the event is likely to happen.

If the user asks:
"Is..."
judge whether the proposition is likely true.

If the user asks:
"Can..."
interpret whether it is reasonably possible in the context.

Always answer the meaning of the user's actual question rather than forcing every question into the same decision pattern.

UNCERTAINTY

Use the full probability range meaningfully.

Do not cluster around 0.50 simply because the input is short.

Use approximately:

0.50 = genuinely balanced / almost no reason to prefer either answer
0.55-0.64 = slight lean
0.65-0.74 = meaningful preference
0.75-0.84 = clear answer
0.85-0.94 = strong answer
0.95+ = extremely obvious given the available information

Avoid unjustified extreme confidence.

Do not output 0.50 merely because some information is missing if ordinary common sense still gives one option a meaningful advantage.

Likewise, do not produce high confidence when the answer genuinely depends on important unknown personal circumstances.

CONSISTENCY

Semantically opposite inputs should produce appropriately different probabilities.

For example:

"I love pizza. Should I order pizza?"
should lean YES.

"I hate pizza. Should I order pizza?"
should lean NO.

If additional context strongly changes the situation, update the decision accordingly.

Do not mechanically repeat the same probability pattern across unrelated questions.

PRACTICALITY

Prefer choices that are reasonably beneficial, useful, safe, enjoyable, efficient, or aligned with the user's expressed goals, depending on the context.

Consider obvious downsides such as:
- unnecessary harm,
- wasted money,
- avoidable danger,
- conflict with stated goals,
- clearly self-defeating behavior.

But do not become excessively conservative.

Everyday decisions should still receive decisive answers when reasonable.

HIGH-STAKES QUESTIONS

For medical, legal, financial, dangerous, self-harm, or other high-stakes decisions, be more cautious about claiming certainty.

Do not treat a playful yes/no output as a substitute for professional advice or emergency help.

When important facts are missing in a high-stakes situation, probabilities should reflect that uncertainty rather than pretending the answer is obvious.

RELATIONSHIP AND LIFE DECISIONS

For personal relationship or major life decisions, use the user's stated feelings and circumstances seriously, but recognize when the decision genuinely requires more context.

For example:

"Should I break up with my girlfriend?"
may be uncertain.

"Should I break up with my girlfriend? I have been unhappy for six months, we repeatedly fail to resolve the same problems, and I no longer want the relationship."
should lean substantially more toward YES.

"Should I break up with my girlfriend? We are happy, communicate well, and I want to stay with her."
should strongly lean NO.

Do not automatically preserve relationships, jobs, plans, or other status quo choices.

FINAL OBJECTIVE

Return the probability that the correct answer to the user's actual yes-or-no question is YES.

Think about what the user really means.
Use context when available.
Use reasonable common sense when context is sparse.
Understand Turkish and English naturally.
Do not default to indecision.
Do not fabricate important facts.
Do not favor YES or NO by default.
Calibrate confidence according to how strongly the available evidence supports the decision.
`

/**
 * Rate limiting — durable, serverless-safe.
 *
 * Backed by Upstash Redis (REST) so the counter is shared across every
 * serverless instance instead of living in one process's memory.
 */
export const UPSTASH_REDIS_URL_ENV = 'UPSTASH_REDIS_REST_URL'
export const UPSTASH_REDIS_TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN'

/** Requests allowed per window, per client IP. */
export const RATE_LIMIT_MAX = 10

/** Length of the rate-limit window. */
export const RATE_LIMIT_WINDOW = '60 s'

/** Same window in seconds, for the `Retry-After` header. */
export const RATE_LIMIT_WINDOW_SECONDS = 60

/** Redis key namespace, so this app never collides with another one. */
export const RATE_LIMIT_PREFIX = 'jevsaidso:ask'

/**
 * How long to wait on Upstash before letting the request through. Keeps a slow
 * or unreachable Redis from turning into a slow or unreachable product.
 */
export const RATE_LIMIT_TIMEOUT_MS = 2_000

/** Client-facing message when the rate limit is exceeded. */
export const RATE_LIMITED_MESSAGE = 'Too many questions. Try again in a minute.'

/**
 * Header order used to identify a client.
 *
 * Ordered from most to least trustworthy so a client-supplied header can never
 * win over a platform-set one:
 *
 *  1. `x-vercel-forwarded-for` — set by Vercel's network. Vercel documents it as
 *     identical to `x-forwarded-for` but explicitly *not* the header an
 *     upstream proxy would rewrite, so it is the safest identifier here.
 *  2. `x-forwarded-for` — Vercel states it overwrites this header and does not
 *     forward external IPs, specifically to prevent IP spoofing.
 *  3. `x-real-ip` — documented as identical to the above, but Vercel makes no
 *     explicit overwrite guarantee for it, so it is only a last resort.
 *
 * If none are present the caller shares one bucket; that is deliberate, so an
 * unknown caller still cannot mint unlimited requests by omitting headers.
 */
export const CLIENT_IP_HEADERS = [
  'x-vercel-forwarded-for',
  'x-forwarded-for',
  'x-real-ip',
] as const

/** Bucket used when no usable client IP is present. */
export const UNKNOWN_CLIENT_ID = 'unknown'

/**
 * Private benchmark bypass.
 *
 * Server-side only. When unset (or empty) the bypass is disabled entirely, and
 * every request is rate limited like an ordinary public one. Set
 * BENCHMARK_BYPASS_TOKEN in Vercel to enable it.
 *
 * Note the deliberately non-`VITE_` name: a `VITE_`-prefixed value would be
 * bundled into client JavaScript and become public.
 */
export const BENCHMARK_BYPASS_TOKEN_ENV = 'BENCHMARK_BYPASS_TOKEN'

/** Header a benchmark client presents to show it may skip the rate limiter. */
export const BENCHMARK_TOKEN_HEADER = 'x-benchmark-token'

/** Authoritative question cap; mirrors the client-side limit. */
export const MAX_QUESTION_LENGTH = 250

/** Upstream request timeout. */
export const UPSTREAM_TIMEOUT_MS = 12_000

/** Generic client-facing message; never includes upstream detail or secrets. */
export const UNAVAILABLE_MESSAGE = 'Jev is unavailable right now.'