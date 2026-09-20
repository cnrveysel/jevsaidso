/**
 * Node resolver hook: map "./thing.js" to "./thing.ts".
 *
 * "api/" uses ".js" import specifiers because that is what Vercel's Node builder
 * expects and what NodeNext-style ESM resolution requires once TypeScript is
 * compiled. Plain "node" cannot resolve those on its own in a TypeScript-only
 * tree, so this hook teaches it: if a relative ".js" import has no file but a
 * sibling ".ts" does, resolve to the ".ts".
 *
 * Used by "npm test" and "npm run dev". Production is unaffected.
 */

import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const JS_SUFFIX = '.js'
const TS_SUFFIX = '.ts'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith(JS_SUFFIX) && context.parentURL) {
      try {
        const candidate = new URL(
          specifier.slice(0, -JS_SUFFIX.length) + TS_SUFFIX,
          context.parentURL,
        )

        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true }
        }
      } catch {
        // Fall through to Node's own resolution.
      }
    }

    return nextResolve(specifier, context)
  },
})
