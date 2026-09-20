/**
 * Header handling shared by the server-side helpers.
 *
 * Vercel's Node runtime lowercases incoming header names and may expose a
 * repeated header as an array, so every reader goes through here.
 */

/** Header bag as supplied by the Vercel Node runtime. */
export type RequestHeaders =
  | Record<string, string | string[] | undefined>
  | undefined
  | null

/**
 * Read a single header value, tolerating repeated headers.
 *
 * Returns `null` when the header is absent, blank, or not a string, so callers
 * never have to distinguish "missing" from "empty".
 */
export function readHeader(headers: RequestHeaders, name: string): string | null {
  if (!headers) {
    return null
  }

  const raw = headers[name]

  // Node can hand back a repeated header as an array; take the first value.
  const value = Array.isArray(raw) ? raw[0] : raw

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
