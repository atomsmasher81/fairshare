import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { createQuickExpenseFromText, QuickExpenseError, resolveQuickExpenseGroup } from '@/lib/quick-expense'
import { notifyExpenseSplitMembers, sendTelegramUserNotification } from '@/lib/telegram-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function safeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.FAIRSHARE_API_KEY
  const provided = getBearerToken(request)

  if (!expected || !provided) {
    return false
  }

  return safeEquals(provided, expected)
}

export async function POST(request: NextRequest) {
  let resolvedUserId: string | undefined
  let notifyTelegram: boolean | undefined
  let submittedText: string | undefined

  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { text, userId, username, groupId, groupName, category, date, notifyTelegram: requestedNotifyTelegram } = body as {
      text?: string
      userId?: string
      username?: string
      groupId?: string
      groupName?: string
      category?: string
      date?: string
      notifyTelegram?: boolean
    }

    submittedText = text
    notifyTelegram = requestedNotifyTelegram
    resolvedUserId = userId

    if (!resolvedUserId && username) {
      const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
        select: { id: true },
      })
      resolvedUserId = user?.id
    }

    if (!resolvedUserId) {
      return NextResponse.json({ error: 'userId or username is required' }, { status: 400 })
    }

    const resolvedGroupId = await resolveQuickExpenseGroup({
      prisma,
      userId: resolvedUserId,
      groupId,
      groupName,
    })

    const result = await createQuickExpenseFromText({
      prisma,
      userId: resolvedUserId,
      groupId: resolvedGroupId,
      text,
      source: 'shortcut-api',
      category,
      date: date ? new Date(date) : new Date(),
    })

    const telegramNotification = notifyTelegram === false
      ? { sent: false, reason: 'disabled' }
      : await sendTelegramUserNotification({ prisma, userId: resolvedUserId, message: result.message })

    const participantNotifications = notifyTelegram === false
      ? { attempted: 0, sent: 0, skipped: [], results: [] }
      : await notifyExpenseSplitMembers({
        prisma,
        expense: result.expense,
        group: result.group,
        excludeUserIds: [resolvedUserId],
      })

    return NextResponse.json({
      success: true,
      message: result.message,
      telegramNotification,
      participantNotifications,
      expense: {
        id: result.expense.id,
        description: result.description,
        amount: result.amount,
        formattedAmount: `₹${(result.amount / 100).toFixed(2)}`,
        date: result.expense.date,
        paidById: result.expense.paidById,
        groupId: result.expense.groupId,
      },
      group: result.group,
    })
  } catch (error) {
    if (error instanceof QuickExpenseError) {
      const failureMessage =
        `❌ Your message was not processed:
` +
        `"${submittedText || ''}"

` +
        `Reason: ${error.publicMessage}

` +
        `Please try again like: milk 20`

      const telegramNotification = resolvedUserId && notifyTelegram !== false
        ? await sendTelegramUserNotification({ prisma, userId: resolvedUserId, message: failureMessage })
        : { sent: false, reason: resolvedUserId ? 'disabled' : 'user_not_resolved' }

      return NextResponse.json({
        error: error.publicMessage,
        code: error.code,
        message: failureMessage,
        telegramNotification,
      }, { status: error.status })
    }

    console.error('Shortcut expense entry error:', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
