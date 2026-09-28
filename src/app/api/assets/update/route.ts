import { NextRequest, NextResponse } from 'next/server'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
import { recordValues } from '@/lib/wealth'

/**
 * POST { date: 'YYYY-MM-DD', rows: [{ assetId?, name?, kind?, invested (paise)?, value (paise)?, note? }] }
 * One call for the monthly update (many rows) or adding a single new account (one row with a name).
 */
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const { date, rows } = await request.json()
    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
    const results = await recordValues(userId, new Date(`${day}T12:00:00+05:30`), rows)
    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return fail(e)
  }
}
