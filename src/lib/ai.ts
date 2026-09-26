/**
 * Natural language → structured expense, via any OpenAI-compatible chat API.
 *
 * Providers are tried in order until one answers; configure with env vars:
 *   GROQ_API_KEY    → openai/gpt-oss-20b on Groq (free tier, strict JSON schema, ~1s)
 *   OPENAI_API_KEY  → gpt-6-luna (≈ $0.15 per 1,000 parses)
 *   GEMINI_API_KEY  → gemini-2.5-flash-lite via Google's OpenAI-compatible endpoint
 * Override a model with GROQ_MODEL / OPENAI_MODEL / GEMINI_MODEL.
 */

export const NEEDS = ['essential', 'semi', 'luxury'] as const
export const CATEGORIES = ['food', 'groceries', 'travel', 'utilities', 'rent', 'shopping', 'entertainment', 'health', 'other'] as const

export interface ParseContext {
  today: string // YYYY-MM-DD in the user's timezone
  methods: string[]
  friends: string[]
  groups: string[]
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
  if (env.GROQ_API_KEY) {
    list.push({ name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || 'openai/gpt-oss-20b', reasoningEffort: 'low' })
  }
  if (env.OPENAI_API_KEY) {
    list.push({ name: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-6-luna', reasoningEffort: 'none' })
  }
  if (env.GEMINI_API_KEY) {
    list.push({ name: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-2.5-flash-lite', reasoningEffort: 'none' })
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

function systemPrompt(ctx: ParseContext) {
  return `Turn one spoken/typed Indian English or Hinglish money note into JSON. Today is ${ctx.today}. Currency INR.
Fields:
- intent: "expense" for spending; "settlement" when someone pays back a debt ("paid Rahul 500 back", "Amit returned 200"); "none" if not about money.
- amount: total rupees as a number ("1.2k"→1200, "dedh sau"→150, "5 hundred"→500). null if missing.
- description: 1-4 words, Title Case, what it was for ("Milk", "Dinner", "Cab to airport"). Never include amount, people or payment method.
- need: essential (groceries, rent, bills, medicine, commute), semi (eating out, cabs by choice, household upgrades), luxury (shopping, movies, parties, gadgets, travel for fun). Best guess.
- category: best fit.
- method: only if a payment method is mentioned; map "gpay"→Google Pay, "card"/"credit card" to the matching method, "upi" to the first UPI app listed.
- date: YYYY-MM-DD only if a day is mentioned ("yesterday", "on Monday"), else null.
- group: only if a listed group is named.
- people: friends involved besides me. Empty for personal spending.
- paid_by: "me" unless a friend paid ("Rahul paid for lunch" → Rahul).
- split: "equal" when shared evenly among me + people; "full" when the other side owes the entire amount ("Rahul owes me 500 for cab", "I paid Amit's 300 ticket"); "exact" when specific amounts per person are said (fill shares, including "me"). null for personal.
- For settlements: paid_by = who paid, people = [who received] (use "me" via paid_by when a friend paid me, and people=[that friend] when I paid).
Methods: ${ctx.methods.join(', ') || 'none'}. Friends: ${ctx.friends.join(', ') || 'none'}. Groups: ${ctx.groups.join(', ') || 'none'}.`
}

async function callProvider(p: Provider, ctx: ParseContext, text: string, timeoutMs: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const body: Record<string, unknown> = {
      model: p.model,
      temperature: 0,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt(ctx) },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'entry', strict: true, schema: schema(ctx) } },
    }
    if (p.reasoningEffort) body.reasoning_effort = p.reasoningEffort
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error(`${p.name}: empty response`)
    return JSON.parse(content) as ParsedEntry
  } finally {
    clearTimeout(timer)
  }
}

/** Returns the parsed entry plus which model answered; throws if every provider failed. */
export async function parseWithAI(text: string, ctx: ParseContext): Promise<{ entry: ParsedEntry; model: string }> {
  const list = providers()
  if (!list.length) throw new Error('AI parsing is not configured')
  let lastError: unknown
  for (const p of list) {
    try {
      const entry = await callProvider(p, ctx, text.slice(0, 500), 6000)
      return { entry: sanitize(entry, ctx), model: `${p.name}/${p.model}` }
    } catch (e) {
      lastError = e
      console.error('AI provider failed', p.name, e instanceof Error ? e.message : e)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI parsing failed')
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
