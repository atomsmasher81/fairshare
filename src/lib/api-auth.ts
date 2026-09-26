import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { userIdFromKey } from '@/lib/api-keys'

/**
 * Resolve the acting user from:
 *  1. A personal key: `Authorization: Bearer fs_…` (or ?token=fs_… for header-less clients)
 *  2. The browser session cookie
 * The old shared master key (FAIRSHARE_API_KEY + username in the body) is gone — it let anyone
 * holding it act as any user.
 */
export async function resolveApiUser(request: NextRequest): Promise<string | null> {
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || request.nextUrl.searchParams.get('token') || undefined
  if (bearer) return userIdFromKey(bearer)
  const session = await getSession()
  return session.isLoggedIn && session.userId ? session.userId : null
}
