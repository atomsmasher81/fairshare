import { prisma } from '@/lib/prisma'
import { draftFromText, loadContext, saveDraft } from '@/lib/entry'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { notifyExpenseSplitMembers, notifyPayment, sendTelegramUserNotification, sendReviewPrompt } = require('@/lib/telegram-notifications')
const { parseBankMessage } = require('@/lib/parse')
const { pushToUser } = require('@/lib/push')

export interface CaptureInput {
  userId: string
  text?: string
  sms?: string
  groupId?: string
  groupName?: string
  category?: string
  date?: string
  source?: string
  notifyTelegram?: boolean
}

export interface CaptureResult {
  ok: boolean
  status: number
  message: string
  skipped?: boolean
  reason?: string
  expense?: unknown
}

/**
 * One entry point for every capture channel.
 * - `sms` (or text that looks like a bank SMS) -> bank parser, dedupe, payee memory, review prompt
 * - `text` -> quick parser ("milk 20 @flat")
 */
const SOURCE_LABEL: Record<string, string> = { shortcut: 'Siri', sms: 'bank SMS', telegram: 'Telegram', api: 'Shortcuts' }

/**
 * Capture + tell the user's own devices what happened. The Shortcut shows its own banner too,
 * but a push lands in the app's history and makes a misheard entry impossible to miss.
 */
export async function capture(input: CaptureInput): Promise<CaptureResult> {
  const result = await captureInner(input)
  const source = input.source || 'shortcut'
  if (source !== 'web' && !result.skipped) {
    const via = SOURCE_LABEL[source] || 'Shortcuts'
    const e = result.expense as { id?: string; needsReview?: boolean } | undefined
    const payload = result.ok
      ? {
          title: e?.needsReview ? `Saved from ${via} — needs a look` : `Added from ${via}`,
          body: result.message.replace(/^[✅📥]\s*/u, ''),
          url: e?.id ? `/expense/${e.id}?back=/home` : '/home',
          tag: `capture-${e?.id || Date.now()}`,
        }
      : {
          title: `Couldn’t add from ${via}`,
          body: `“${(input.text || input.sms || '').slice(0, 80)}” — ${result.message}`,
          url: '/add',
          tag: `capture-fail-${Date.now()}`,
        }
    pushToUser(prisma, input.userId, payload).catch(() => {})
  }
  return result
}

async function captureInner(input: CaptureInput): Promise<CaptureResult> {
  const { userId, groupId, groupName, category, source } = input
  const notify = input.notifyTelegram !== false
  const date = input.date ? new Date(input.date) : new Date()
  if (Number.isNaN(date.getTime())) return { ok: false, status: 400, message: 'Invalid date' }

  const raw = (input.sms || input.text || '').toString()
  const looksLikeBank = !!input.sms || (raw.length > 40 && !!parseBankMessage(raw))

  try {
    if (looksLikeBank) {
      const r = await ledger.addFromBankMessage(prisma, { userId, message: raw, source: source || 'sms', date })
      if (r.skipped) {
        return { ok: true, status: 200, skipped: true, reason: r.reason, message: r.reason === 'duplicate' ? 'Already recorded' : 'Not a payment — ignored' }
      }
      if (notify) {
        if (r.known) await sendTelegramUserNotification({ prisma, userId, message: r.message })
        else await sendReviewPrompt({ prisma, userId, expense: r.expense })
        if (!r.expense.group.isPersonal) {
          await notifyExpenseSplitMembers({ prisma, expense: r.expense, group: r.expense.group, excludeUserIds: [userId] })
        }
      }
      return { ok: true, status: 200, message: r.known ? r.message : `📥 ${ledger.formatINR(r.expense.amount)} to ${r.expense.description} — saved, tap to sort`, expense: slim(r.expense) }
    }

    const ctx = await loadContext(userId)
    const { draft, error } = await draftFromText(raw, ctx)
    if (!draft) return { ok: false, status: 422, message: error || 'Couldn’t understand that' }
    // Old shortcuts send a fixed group with every request. That's only a default:
    // if the sentence itself says where it goes ("personal", "with Rahul"), the sentence wins.
    const explicit = groupId
      ? ctx.groups.find((g) => g.id === groupId)
      : groupName ? ctx.groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase()) : null
    if (draft.targetSaid || draft.kind !== 'expense') {
      // keep what was said
    } else if (groupName && ledger.PERSONAL_TAGS.has(groupName.toLowerCase())) {
      draft.groupId = null; draft.friendIds = []; draft.splitMode = 'equal'; draft.splits = null; draft.paidById = userId
    } else if (explicit) {
      draft.groupId = explicit.id; draft.groupName = explicit.name; draft.friendIds = []
    } else if ((groupId || groupName) && !explicit) {
      return { ok: false, status: 404, message: 'Group not found' }
    }
    if (category) draft.category = category
    if (input.date) draft.date = date.toISOString()
    const saved = await saveDraft(userId, draft, source || 'shortcut')
    if (draft.kind === 'settlement' && draft.toUserId) {
      await notifyPayment({ prisma, actorId: userId, fromUserId: draft.paidById, toUserId: draft.toUserId, amount: draft.amount }).catch(() => {})
    }
    if (notify && saved.expense && !saved.expense.group.isPersonal) {
      await notifyExpenseSplitMembers({ prisma, expense: saved.expense, group: saved.expense.group, excludeUserIds: [userId] })
    }
    return { ok: true, status: 200, message: saved.message, expense: saved.expense ? slim(saved.expense) : undefined }
  } catch (e: unknown) {
    const err = e as { publicMessage?: string; status?: number }
    if (err.publicMessage) return { ok: false, status: err.status || 400, message: err.publicMessage }
    console.error('capture error', e)
    return { ok: false, status: 500, message: 'Failed to save expense' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slim(e: any) {
  return {
    id: e.id, description: e.description, amount: e.amount, category: e.category, date: e.date,
    group: e.group?.isPersonal ? 'Personal' : e.group?.name, needsReview: e.needsReview,
    needLevel: e.needLevel, method: e.paymentMethod?.name ?? null,
  }
}
