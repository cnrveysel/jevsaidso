/**
 * Local full-stack dev server.
 *
 * `vite` alone cannot serve `/api/ask`, so this script runs Vite in middleware
 * mode and mounts the same handler Vercel uses. One command, no extra
 * dependencies, and the exact code path that runs in production.
 *
 *   npm run dev        -> http://localhost:5173  (app + /api/ask)
 *   npm run dev:vite   -> frontend only, no /api  (shows the retry state)
 *
 * TYPESAFE_API_KEY is read from `.env.local` (or the shell environment) by
 * Vite's own dotenv loading, and is used server-side only. Only VITE_-prefixed
 * values are ever exposed to the browser.
 */

import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { createServer as createViteServer, loadEnv } from 'vite'

import askHandler from '../api/ask.ts'
import { apiHeaders } from '../api/_lib/ask.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.env.NODE_ENV ?? 'development'

const env = loadEnv(mode, projectRoot, '')
if (env.TYPESAFE_API_KEY && !process.env.TYPESAFE_API_KEY) {
  process.env.TYPESAFE_API_KEY = env.TYPESAFE_API_KEY
}

/** Read the raw request body. */
async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const vite = await createViteServer({
  root: projectRoot,
  mode,
  server: { middlewareMode: true },
  appType: 'custom',
})

const server = createHttpServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/ask') {
    const raw = await readBody(request)

    let body
    try {
      body = raw.length === 0 ? undefined : JSON.parse(raw)
    } catch {
      body = raw
    }

    for (const [name, value] of Object.entries(apiHeaders())) {
      response.setHeader(name, value)
    }

    const reply = {
      status(code) {
        response.statusCode = code
        return reply
      },
      json(value) {
        response.end(JSON.stringify(value))
        return reply
      },
      setHeader(name, value) {
        response.setHeader(name, value)
      },
      end() {
        response.end()
      },
    }

    await askHandler({ method: request.method, body }, reply)
    return
  }

  if (url.pathname === '/healthz') {
    response.setHeader('Content-Type', 'text/plain')
    response.setHeader('Cache-Control', 'no-store')
    response.end('ok')
    return
  }

  // `appType: 'custom'` means Vite will not serve index.html for us.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const template = await readFile(resolve(projectRoot, 'index.html'), 'utf8')
      const html = await vite.transformIndexHtml(url.pathname, template)
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(html)
    } catch (error) {
      response.statusCode = 500
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(`Failed to load index.html\n${error && error.message ? error.message : ''}`)
    }
    return
  }

  vite.middlewares(request, response)
})

const port = Number(process.env.PORT ?? 5173)

server.listen(port, () => {
  const hasKey = Boolean(process.env.TYPESAFE_API_KEY)
  console.log(`\n  Jev Said So  ->  http://localhost:${port}`)
  console.log(
    `  /api/ask     ->  ${hasKey ? 'live (TYPESAFE_API_KEY detected)' : 'NOT configured (set TYPESAFE_API_KEY in .env.local)'}\n`,
  )
})

const shutdown = async () => {
  await vite.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)