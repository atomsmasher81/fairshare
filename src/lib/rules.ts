/**
 * Deterministic parser for the common ways people describe money, used when no AI provider
 * is configured or the provider is down. Handles:
 *   "dinner 1800 with rahul and amit"      split equally
 *   "rahul owes me 500 for cab"            they owe it all
 *   "i owe amit 300 for tickets"           I owe it all
 *   "rahul paid 900 for movie"             friend paid, split equally
 *   "paid rahul back 500" / "rahul paid me 500"   settlement
 *   "... on card / cash / gpay", "yesterday", "essential|semi|luxury", "1.2k"
 * Returns null when it can't be confident — the caller then saves a plain entry for review.
 */
import type { ParseContext, ParsedEntry } from '@/lib/ai'

const FILLER = new Set(['for', 'on', 'via', 'using', 'by', 'with', 'paid', 'pay', 'spent', 'spend', 'rs', 'rs.', 'rupees', 'inr', 'the', 'a', 'an', 'split', 'equally', 'evenly', 'me', 'i', 'and', 'my', 'of', 'at', 'to', 'in', 'today', 'yesterday', 'kal', 'essential', 'semi', 'luxury', 'owes', 'owe', 'back', 'bucks'])

function amountOf(t: string): { value: number; raw: string } | null {
  const re = /(?:₹|rs\.?\s?|inr\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|hundred|lakh)?\b/gi
  const found: { value: number; raw: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    let v = parseFloat(m[1].replace(/,/g, ''))
    const unit = (m[2] || '').toLowerCase()
    if (unit === 'k' || unit === 'thousand') v *= 1000
    if (unit === 'hundred') v *= 100
    if (unit === 'lakh') v *= 100000
    if (v > 0) found.push({ value: Math.round(v * 100) / 100, raw: m[0] })
  }
  return found.length === 1 ? found[0] : null
}

function shiftDay(today: string, days: number) {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function parseRules(text: string, ctx: ParseContext & { methodKinds: Record<string, string> }): ParsedEntry | null {
  let t = ` ${text.toLowerCase().replace(/[.,!?]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim()} `
  // group names can contain numbers ("Flat 402") — take them out before looking for the amount
  const group = ctx.groups.find((g) => t.includes(` ${g.toLowerCase()} `) || t.includes(`@${g.toLowerCase().replace(/\s+/g, '')}`)) || null
  if (group) t = t.replace(` ${group.toLowerCase()} `, ' ').replace(`@${group.toLowerCase().replace(/\s+/g, '')}`, ' ')
  const amt = amountOf(t)
  if (!amt) return null
  t = t.replace(amt.raw.toLowerCase(), ' ')

  // friends by first name or full name
  const friendKeys = ctx.friends.map((name) => ({ name, keys: Array.from(new Set([name.toLowerCase(), name.toLowerCase().split(' ')[0]])) }))
  const findFriend = (word: string) => friendKeys.find((f) => f.keys.includes(word.toLowerCase()))?.name || null
  const mentioned: string[] = []
  for (const f of friendKeys) {
    for (const k of f.keys) {
      if (t.includes(` ${k} `)) { if (!mentioned.includes(f.name)) mentioned.push(f.name); t = t.replace(` ${k} `, ' ') }
    }
  }
  // put names back as tokens for pattern checks
  const raw = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `

  // date
  let date: string | null = null
  if (/\b(yesterday|kal)\b/.test(raw)) date = shiftDay(ctx.today, -1)

  // need level
  const need: ParsedEntry['need'] = /\bluxury\b/.test(raw) ? 'luxury' : /\bsemi\b/.test(raw) ? 'semi' : /\bessential\b/.test(raw) ? 'essential' : null

  // payment method
  let method: string | null = null
  for (const m of ctx.methods) if (raw.includes(` ${m.toLowerCase()} `) || raw.includes(` ${m.toLowerCase().split(' ')[0]} `)) { method = m; break }
  if (!method) {
    const byKind = (k: string) => ctx.methods.find((m) => ctx.methodKinds[m] === k) || null
    if (/\b(gpay|google pay)\b/.test(raw)) method = ctx.methods.find((m) => /google|gpay/i.test(m)) || byKind('upi')
    else if (/\b(phonepe|phone pe)\b/.test(raw)) method = ctx.methods.find((m) => /phone ?pe/i.test(m)) || byKind('upi')
    else if (/\bpaytm\b/.test(raw)) method = ctx.methods.find((m) => /paytm/i.test(m)) || byKind('upi')
    else if (/\b(credit card|card)\b/.test(raw)) method = byKind('card')
    else if (/\bcash\b/.test(raw)) method = byKind('cash')
    else if (/\bupi\b/.test(raw)) method = byKind('upi')
  }
  for (const m of ctx.methods) t = t.replace(` ${m.toLowerCase()} `, ' ')
  t = t.replace(/\b(gpay|google pay|phonepe|phone pe|paytm|credit card|card|cash|upi)\b/g, ' ')


  const description = t.split(' ').filter((w) => w && !FILLER.has(w) && !/^[@#]/.test(w)).join(' ')
  const pretty = description ? description.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : ''
  const base = { amount: amt.value, need, category: null, method, date, group, shares: [] as ParsedEntry['shares'] }

  const first = (re: RegExp) => { const m = raw.match(re); return m ? findFriend(m[1]) : null }

  // settlements
  const iPaidBack = first(/\bpaid (\w+) back\b/) || first(/\bpaid back (\w+)\b/) || first(/\breturned (?:\S+ )?to (\w+)\b/) || first(/\bsent (\w+)\b/)
  if (iPaidBack && (/\bback\b|\breturned\b|\bsettled?\b/.test(raw) || /\bsent\b/.test(raw))) {
    return { ...base, intent: 'settlement', description: 'Payment', paid_by: 'me', people: [iPaidBack], split: null }
  }
  const theyPaidMe = first(/\b(\w+) paid me\b/) || first(/\b(\w+) (?:returned|sent me|gave me)\b/)
  if (theyPaidMe) {
    return { ...base, intent: 'settlement', description: 'Payment', paid_by: theyPaidMe, people: [], split: null, method: null }
  }

  // debts
  const owesMe = first(/\b(\w+) owes me\b/)
  if (owesMe) return { ...base, intent: 'expense', description: pretty || 'Expense', paid_by: 'me', people: [owesMe], split: 'full' }
  const iOwe = first(/\bi owe (\w+)\b/)
  if (iOwe) return { ...base, intent: 'expense', description: pretty || 'Expense', paid_by: iOwe, people: [iOwe], split: 'full', method: null }

  // someone else paid
  const theyPaid = first(/\b(\w+) paid\b/)
  if (theyPaid) {
    const people = Array.from(new Set([theyPaid, ...mentioned]))
    return { ...base, intent: 'expense', description: pretty || 'Expense', paid_by: theyPaid, people, split: 'equal', method: null }
  }

  // "with rahul and amit"
  if (/\bwith\b/.test(raw) && !mentioned.length && !group) return null // "with <someone we don't know>"
  if (mentioned.length || group) {
    return { ...base, intent: 'expense', description: pretty || 'Expense', paid_by: 'me', people: group ? [] : mentioned, split: 'equal' }
  }
  return { ...base, intent: 'expense', description: pretty || 'Expense', paid_by: 'me', people: [], split: null }
}
