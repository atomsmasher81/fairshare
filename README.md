# FairShare

Track your own spending and split bills with friends, in one installable web app.

- Add an expense in two taps: pick a type (Essential / Semi / Luxury), how you paid, then the amount.
- Or just say it: “Hey Siri, spent” → “dinner 1800 with Rahul and Amit on card”.
- See your monthly summary, what friends owe you and what you owe them, and settle up over UPI.

Product and design notes: [docs/PRODUCT.md](docs/PRODUCT.md).

## Run locally

```bash
cp .env.example .env        # set SESSION_SECRET; AI keys are optional
npm install
npx prisma migrate deploy
npm run dev
```

The first account you create becomes the admin.

## Natural-language entry (optional)

Set **one** of these keys in `.env`. If you set more than one, they're tried in this order:

| Key | Model | Cost |
|---|---|---|
| `GROQ_API_KEY` | `openai/gpt-oss-20b` | Free tier (~180 parses/day), then ~$0.12 per 1,000 |
| `OPENAI_API_KEY` | `gpt-6-luna` | ~$0.15 per 1,000 |
| `GEMINI_API_KEY` | `gemini-2.5-flash-lite` | Free tier (Google may use the data) |

With no key, simple entries (“milk 20”) and the common sentence shapes still work through the built-in rule parser (`src/lib/rules.ts`).

## Siri / Shortcuts API

```
POST /api/capture
Authorization: Bearer <personal key from You → Add by voice with Siri>
{ "text": "auto 150 cash" }            → { ok, message: "✅ Auto ₹150 · Semi-essential · Cash" }
{ "sms": "<bank debit SMS>" }          → lands in “To sort”
```

The older `/api/expenses/make-entry` endpoint, and the shared `FAIRSHARE_API_KEY`, still work.

## Deploy (existing VPS)

```bash
git pull && npm ci
npx prisma migrate deploy     # adds payment methods, need levels, friend ledgers
npm run build && pm2 restart fairshare
```

The migration only adds things. Existing expenses, groups and balances are untouched.
