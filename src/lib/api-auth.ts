import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { hashToken } = require('@/lib/ledger')

function safeEquals(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/**
 * Resolve the acting user from (in order):
 *  1. Personal token:  Authorization: Bearer fs_xxx   (per-user, rotatable in Settings)
 *  2. Legacy master key + username/userId in body       (old Siri shortcut keeps working)
 *  3. Browser session cookie
 */
export async function resolveApiUser(request: NextRequest, body?: Record<string, unknown> | null): Promise<string | null> {
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    || request.nextUrl.searchParams.get('token') || undefined

  if (bearer) {
    if (bearer.startsWith('fs_')) {
      const user = await prisma.user.findUnique({ where: { apiTokenHash: hashToken(bearer) }, select: { id: true } })
      return user?.id || null
    }
    const master = process.env.FAIRSHARE_API_KEY
    if (master && safeEquals(bearer, master)) {
      if (typeof body?.userId === 'string') return body.userId
      if (typeof body?.username === 'string') {
        const u = await prisma.user.findUnique({ where: { username: body.username.toLowerCase() }, select: { id: true } })
        return u?.id || null
      }
      return null
    }
    return null
  }

  const session = await getSession()
  return session.isLoggedIn && session.userId ? session.userId : null
}
