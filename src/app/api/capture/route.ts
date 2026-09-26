import { NextRequest, NextResponse } from 'next/server'
import { resolveApiUser } from '@/lib/api-auth'
import { capture } from '@/lib/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/capture
 * Auth: Bearer <personal token from Settings>  (or browser session)
 * Body (JSON or form or plain text):
 *   { "text": "milk 20 @flat" }              quick entry
 *   { "sms": "<full bank SMS text>" }        auto-capture from iOS Messages automation
 * Response: { ok, message }  -> `message` is short and made for a Shortcuts notification
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null = null
  const ct = request.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) body = await request.json()
    else if (ct.includes('form')) body = Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>
    else {
      const t = await request.text()
      try { body = JSON.parse(t) } catch { body = { text: t } }
    }
  } catch {
    body = null
  }
  if (!body) return NextResponse.json({ ok: false, message: 'Empty body' }, { status: 400 })

  const userId = await resolveApiUser(request)
  if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized — check your token in FairShare Settings' }, { status: 401 })

  const str = (k: string) => (typeof body![k] === 'string' ? (body![k] as string) : undefined)
  const bearer = (request.headers.get('authorization') || '').length > 0
  const result = await capture({
    userId,
    text: str('text'),
    sms: str('sms') || str('message'),
    groupId: str('groupId'),
    groupName: str('groupName') || str('group'),
    category: str('category'),
    date: str('date'),
    source: str('source') || (str('sms') || str('message') ? 'sms' : bearer ? 'shortcut' : 'web'),
    notifyTelegram: body.notifyTelegram === false || body.notifyTelegram === 'false' ? false : true,
  })
  return NextResponse.json(result, { status: result.status })
}
