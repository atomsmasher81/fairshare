import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

/** Session user id, or null. */
export async function sessionUserId() {
  const s = await getSession()
  return s.isLoggedIn && s.userId ? s.userId : null
}

export function unauthorized() {
  return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
}

/** Turn LedgerErrors into clean JSON; log anything unexpected. */
export function fail(e: unknown) {
  const err = e as { publicMessage?: string; status?: number }
  if (err?.publicMessage) return NextResponse.json({ error: err.publicMessage }, { status: err.status || 400 })
  console.error(e)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
