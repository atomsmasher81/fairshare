import { NextRequest, NextResponse } from 'next/server'
import { resolveApiUser } from '@/lib/api-auth'
import { capture } from '@/lib/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Legacy endpoint used by the original Siri shortcut. Same behaviour as /api/capture.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const userId = await resolveApiUser(request, body)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await capture({
    userId,
    text: body.text,
    sms: body.sms,
    groupId: body.groupId,
    groupName: body.groupName,
    category: body.category,
    date: body.date,
    source: 'shortcut',
    notifyTelegram: body.notifyTelegram,
  })
  if (!result.ok) return NextResponse.json({ error: result.message, message: `❌ ${result.message}` }, { status: result.status })
  return NextResponse.json({ success: true, ...result })
}
