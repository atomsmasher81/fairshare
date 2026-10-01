import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { userIdFromKey } from '@/lib/api-keys'
import { createFairShareMcp } from '@/lib/mcp'
import { rateLimited } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Remote MCP endpoint (Streamable HTTP, stateless).
 * Auth: the same personal key as the Siri shortcut — `Authorization: Bearer fs_…`
 * (or `?token=fs_…` for clients that can't set headers).
 */
async function userFromRequest(request: NextRequest) {
  const bearer = (request.headers.get('authorization') || '').match(/^Bearer\s+(fs_\S+)$/i)?.[1]
    || request.nextUrl.searchParams.get('token')
  if (!bearer || !bearer.startsWith('fs_')) return null
  return userIdFromKey(bearer)
}

async function handle(request: NextRequest) {
  const userId = await userFromRequest(request)
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized — use your personal key from FairShare → You → Add by voice with Siri' }, id: null },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="fairshare"' } },
    )
  }
  if (rateLimited(`mcp:${userId}`, 1000, 60 * 60e3)) {
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32029, message: 'Too many requests — try again in a bit' }, id: null }, { status: 429 })
  }
  const server = createFairShareMcp(userId)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    // Stateless: one server per request
    setTimeout(() => { transport.close().catch(() => {}); server.close().catch(() => {}) }, 0)
  }
}

/**
 * Stateless server: there is no standalone SSE stream to open and no session to end. Per the MCP spec
 * we answer 405, which tells clients to stop trying. (Serving GET used to hand back a stream that closed
 * at once, so clients reconnected in a tight loop and burned through the rate limit.)
 */
function notAllowed() {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed — this server is stateless; use POST' }, id: null },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export const POST = handle
export const GET = notAllowed
export const DELETE = notAllowed
