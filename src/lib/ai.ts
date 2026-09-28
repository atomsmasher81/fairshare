/**
 * Natural language → structured expense, via any OpenAI-compatible chat API.
 *
 * Providers are tried in order until one answers; configure with env vars:
 *   GEMINI_API_KEY  → gemini-3.1-flash-lite, minimal thinking (~1s, free tier). 2.5 is closed to new keys;
 *                     3.5-flash-lite can't turn thinking off and takes 12s+.
 *   GROQ_API_KEY    → openai/gpt-oss-20b on Groq (free tier, strict JSON schema, ~1s)
 *   OPENAI_API_KEY  → gpt-6-luna (≈ $0.15 per 1,000 parses)
 * Override a model with GROQ_MODEL / OPENAI_MODEL / GEMINI_MODEL / GEMINI_FALLBACK_MODEL.
 *
 * Google's free tier regularly answers 503 "high demand"; those fail fast, so each provider gets one
 * quick retry and the next provider is tried within an overall deadline that suits a Siri request.
 */

export const NEEDS = ['essential', 'semi', 'luxury'] as const
export const CATEGORIES = ['food', 'groceries', 'travel', 'utilities', 'rent', 'shopping', 'entertainment', 'health', 'other'] as const

export interface ParseContext {
  today: string // YYYY-MM-DD in the user's timezone
  methods: string[]
  friends: string[]
  groups: string[]
  defaultMethod?: string | null // assumed when no payment method is said
  frequentItems?: string[] // the user's common descriptions, to correct dictation slips ("photo" → Auto)
  instructions?: string | null // the user's own extra rules
}

export interface ParsedEntry {
  intent: 'expense' | 'settlement' | 'none'
  amount: number | null // rupees
  description: string
  need: (typeof NEEDS)[number] | null
  category: (typeof CATEGORIES)[number] | null
  method: string | null
  date: string | null
  group: string | null
  people: string[] // others involved, never "me"
  paid_by: string // "me" or a friend's name
  split: 'equal' | 'exact' | 'full' | null
  shares: { name: string; amount: number }[]
}

interface Provider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  reasoningEffort?: string
}

function providers(): Provider[] {
  const list: Provider[] = []
  const env = process.env
  if (env.GEMINI_API_KEY) {
    const base = 'https://generativelanguage.googleapis.com/v1beta/openai'
    list.push({ name: 'gemini', baseUrl: base, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite', reasoningEffort: 'minimal' })
    // A second Gemini model is often served from a different capacity pool when the first is overloaded
    const fallback = env.GEMINI_FALLBACK_MODEL ?? 'gemini-flash-lite-latest'
    if (fallback) list.push({ name: 'gemini', baseUrl: base, apiKey: env.GEMINI_API_KEY, model: fallback, reasoningEffort: 'minimal' })
  }
  if (env.GROQ_API_KEY) {
    list.push({ name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || 'openai/gpt-oss-20b', reasoningEffort: 'low' })
  }
  if (env.OPENAI_API_KEY) {
    list.push({ name: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-6-luna', reasoningEffort: 'none' })
  }
  return list
}

export function aiEnabled() {
  return providers().length > 0
}

const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] })

function schema(ctx: ParseContext) {
  const people = ctx.friends.length ? ctx.friends : ['(nobody)']
  const payers = ['me', ...ctx.friends]
  return {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'amount', 'description', 'need', 'category', 'method', 'date', 'group', 'people', 'paid_by', 'split', 'shares'],
    properties: {
      intent: { type: 'string', enum: ['expense', 'settlement', 'none'] },
      amount: { type: ['number', 'null'] },
      description: { type: 'string' },
      need: nullableEnum(NEEDS),
      category: nullableEnum(CATEGORIES),
      method: ctx.methods.length ? nullableEnum(ctx.methods) : { type: 'null' },
      date: { type: ['string', 'null'] },
      group: ctx.groups.length ? nullableEnum(ctx.groups) : { type: 'null' },
      people: { type: 'array', items: { type: 'string', enum: people } },
      paid_by: { type: 'string', enum: payers },
      split: nullableEnum(['equal', 'exact', 'full']),
      shares: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'amount'],
          properties: { name: { type: 'string', enum: payers }, amount: { type: 'number' } },
        },
      },
    },
  }
}

/** The exact instructions sent to the model (shown in Settings so users can see what the AI is told). */
export function systemPrompt(ctx: ParseContext) {
  const lines = [
    `Turn one spoken/typed Indian English or Hinglish money note into JSON. Today is ${ctx.today}. Currency INR.`,
    'Most notes come from Siri dictation, so expect transcription slips.',
    'Fields:',
    '- intent: "expense" for spending; "settlement" when someone pays back a debt ("paid Rahul 500 back", "Amit returned 200"); "none" if not about money.',
    '- amount: total rupees as a number ("1.2k"→1200, "dedh sau"→150, "5 hundred"→500). null if missing.',
    '  Dictation splits spoken numbers: "one ₹45" or "1 ₹45" means 145; "two ₹50" means 250; "twelve ₹99" means 1299. Always rejoin them.',
    '- description: 1-4 words, Title Case, what it was for ("Milk", "Dinner", "Cab to airport"). Never include the amount, people, payment method, need level or words like "personal"/"expense"/"add".',
    ctx.frequentItems?.length
      ? `  Things this user often logs: ${ctx.frequentItems.join(', ')}. If a word sounds like one of these (e.g. "photo" for "Auto"), use that item.`
      : '',
    '  If nothing says what it was for, use "Expense".',
    '- need: essential (groceries, rent, bills, medicine, commute), semi (eating out, cabs by choice, household upgrades), luxury (shopping, movies, parties, gadgets, travel for fun). If the user says a level, use it ("semi essential" → semi). Otherwise best guess.',
    '- category: best fit.',
    `- method: the payment method mentioned; map "gpay"→Google Pay, "card"/"credit card"/a card brand to the card method, "upi" to the first UPI app listed.${ctx.defaultMethod ? ` If none is mentioned and I paid, use "${ctx.defaultMethod}".` : ' null if none is mentioned.'}`,
    '- date: YYYY-MM-DD only if a day is mentioned ("yesterday", "on Monday"), else null.',
    '- group: only if a listed group is named.',
    '- people: friends involved besides me. Default is a personal expense: people=[] and group=null unless a friend or group is named. "personal", "just me", "myself", "for me" always mean personal.',
    '- paid_by: "me" unless a friend paid ("Rahul paid for lunch" → Rahul). "paid by me" means me.',
    '- split: "equal" when shared evenly among me + people ("between me and Ayush" = equal with Ayush); "full" when the other side owes the entire amount ("Rahul owes me 500 for cab", "I paid Amit\'s 300 ticket"); "exact" when specific amounts per person are said (fill shares, including "me"). null for personal.',
    '- For settlements: paid_by = who paid, people = [who received] (use "me" via paid_by when a friend paid me, and people=[that friend] when I paid).',
    `Methods: ${ctx.methods.join(', ') || 'none'}. Friends: ${ctx.friends.join(', ') || 'none'}. Groups: ${ctx.groups.join(', ') || 'none'}.`,
    ctx.instructions?.trim() ? `The user's own rules (follow them):\n${ctx.instructions.trim()}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

async function callProvider(p: Provider, ctx: ParseContext, text: string, timeoutMs: number, jsonMode = false) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const body: Record<string, unknown> = {
      model: p.model,
      temperature: 0,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: jsonMode
            ? `${systemPrompt(ctx)}\nReply with only a JSON object matching this schema:\n${JSON.stringify(schema(ctx))}`
            : systemPrompt(ctx),
        },
        { role: 'user', content: text },
      ],
      response_format: jsonMode
        ? { type: 'json_object' }
        : { type: 'json_schema', json_schema: { name: 'entry', strict: true, schema: schema(ctx) } },
    }
    if (p.reasoningEffort) body.reasoning_effort = p.reasoningEffort
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (res.status === 400 && !jsonMode) {
      // Some OpenAI-compatible endpoints reject parts of the strict schema — fall back to JSON mode.
      clearTimeout(timer)
      return callProvider(p, ctx, text, timeoutMs, true)
    }
    if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error(`${p.name}: empty response`)
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) as ParsedEntry
  } finally {
    clearTimeout(timer)
  }
}

export interface Attempt { model: string; ms: number; error?: string }

const transient = (msg: string) => /\b(503|429|500|502|504)\b|abort|timeout|fetch failed|ECONNRESET/i.test(msg)

/**
 * Returns the parsed entry plus which model answered, and every attempt made (for the AI log).
 * Throws with the attempts attached if every provider failed.
 */
export async function parseWithAI(text: string, ctx: ParseContext): Promise<{ entry: ParsedEntry; model: string; attempts: Attempt[] }> {
  const list = providers()
  if (!list.length) throw new Error('AI parsing is not configured')
  // Each model gets up to 10s (Gemini's free tier can be slow under load); the whole chain stops at 25s
  // so a Siri shortcut still gets an answer — and the rule parser still saves the entry if everything fails.
  const deadline = Date.now() + 25000
  const attempts: Attempt[] = []
  for (const p of list) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const left = deadline - Date.now()
      if (left < 800) break
      const started = Date.now()
      try {
        const entry = await callProvider(p, ctx, text.slice(0, 4000), Math.min(10000, left))
        attempts.push({ model: `${p.name}/${p.model}`, ms: Date.now() - started })
        return { entry: sanitize(entry, ctx), model: `${p.name}/${p.model}`, attempts }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push({ model: `${p.name}/${p.model}`, ms: Date.now() - started, error: msg.slice(0, 300) })
        console.error('AI provider failed', p.model, msg.slice(0, 120))
        if (!transient(msg)) break // a real error won't fix itself on retry
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }
  const err = new Error(attempts.map((a) => `${a.model}: ${a.error}`).join(' | ') || 'AI parsing failed') as Error & { attempts?: Attempt[] }
  err.attempts = attempts
  throw err
}

// Belt and braces: providers without strict decoding can still drift from the schema.
function sanitize(e: ParsedEntry, ctx: ParseContext): ParsedEntry {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
    typeof v === 'string' && allowed.includes(v as T) ? (v as T) : null
  const payers = ['me', ...ctx.friends]
  const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount > 0 ? e.amount : null
  return {
    intent: pick(e.intent, ['expense', 'settlement', 'none'] as const) || 'none',
    amount,
    description: typeof e.description === 'string' ? e.description.trim().slice(0, 80) : '',
    need: pick(e.need, NEEDS),
    category: pick(e.category, CATEGORIES),
    method: pick(e.method, ctx.methods),
    date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
    group: pick(e.group, ctx.groups),
    people: Array.isArray(e.people) ? Array.from(new Set(e.people.filter((n) => ctx.friends.includes(n)))) : [],
    paid_by: pick(e.paid_by, payers) || 'me',
    split: pick(e.split, ['equal', 'exact', 'full'] as const),
    shares: Array.isArray(e.shares)
      ? e.shares.filter((s) => s && payers.includes(s.name) && typeof s.amount === 'number' && s.amount > 0)
      : [],
  }
}
