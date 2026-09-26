# FairShare — product & design

FairShare does two jobs in one place:

1. **Personal spending**: what did my month cost me, and how much of it was essential?
2. **Splitting with friends**: who owes whom, and settling up.

The two jobs share one ledger, so a dinner split with friends counts only your share toward your spending, and the rest shows up as money you're owed.

## Principles

- **Entering an expense must take seconds.** If logging feels like a chore, people stop, and then every number in the app is wrong. So every design decision starts with the add flow.
- **Essentials only, done well.** No charts or budgets for now. Just a monthly total, a need-level split, category and payment-method breakdowns, and balances you can trust.
- **Never lose an entry.** If the app can't understand what you said, it saves the expense as personal and puts it in *To sort*. It never throws the entry away.
- **Your point of view, always.** Every row shows what it cost *you* and how it moved your balance ("lent ₹600", "borrowed ₹200").
- **Free, no limits.** Splitwise's daily limits are the reason people go looking for alternatives.

## What's in it

| Area | What it does |
|---|---|
| **Landing + sign-in** (`/`) | A single page that explains the app, with sign-in / create-account built in. The phone mockup is drawn in code, so it looks sharp in both light and dark mode. |
| **Home** | Spent this month, with an Essential / Semi / Luxury bar and a daily average. Shows what you're owed and what you owe. Has a **Say it** box, a *To sort* inbox and recent entries. |
| **Add** (`/add`) | Big amount display over a calculator keypad (120+45 works), a "what for" field with suggestions from your history, **Type** (Essential / Semi / Luxury), **Paid with** (your methods), **Split with** (just me / friends / a group), and *Paid by · split equally / exact / they owe all*. Buttons: *Save* and *Next* (save and add another). |
| **Activity** | Month by month. **Transactions** are grouped by day with daily totals and can be filtered to All / Personal / Shared. **Summary** shows the total vs last month, by type, by category, *paid out via* each method, and your biggest expenses. Tap any row in Summary to filter the list. |
| **Friends** | Totals at the top, then friends sorted by open balance, plus groups. A friend's page shows the net balance (broken down per ledger), *Settle up* (with a UPI deep link when they've set a UPI ID), *Remind* (opens the share sheet), and the history you share. |
| **Groups** | Your balance in the group. Payments are simplified to the fewest possible, with *Settle* on the ones that involve you. Full history (including expenses you weren't part of), members, and an invite link. |
| **You** | Profile and UPI ID, payment methods (add / rename / reorder / hide), a step-by-step Siri Shortcut setup, bank-SMS auto-capture, Telegram, and appearance. |

### Friends who aren't on FairShare

Add anyone **by name**. They become a placeholder you can split with straight away. Their page has a claim link. When they open it and sign up, everything already logged becomes theirs. If they already have an account, it gets merged into it. Someone joining a group through its invite link can also pick "I'm Rahul" to take over a placeholder spot.

### Capture: in the app, by voice, by SMS

```
"milk 60"                 → regex fast path, saved instantly (Undo in the toast)
"dinner 1800 with Rahul"  → AI (or the rule parser) → preview card → Save / Edit
Siri Shortcut             → POST /api/capture {text} → saved, one-line reply for Siri to show or speak
Bank SMS automation       → POST /api/capture {sms}  → To sort; payee remembered
```

- **Memory.** Before guessing, each entry looks at the last time you logged the same item. "milk" reuses the type, payment method and ledger you picked for it last time. If there's no history, the type is guessed from the category (groceries → Essential, food → Semi, shopping → Luxury).
- **AI provider** (`src/lib/ai.ts`). It uses any OpenAI-compatible API with a strict JSON schema. Your friend, group and payment-method names are built into the schema's enums, so the model can't make up names. Providers are tried in order:
  1. Groq `openai/gpt-oss-20b`. Its free tier covers a group of friends, and it replies in about a second.
  2. OpenAI `gpt-6-luna`. About $0.15 per 1,000 entries.
  3. Gemini `gemini-2.5-flash-lite`. Also free, but Google may train on free-tier data.
  - Every call is logged in `AiCall`, and it's rate-limited to 120 per hour per user.
- **Rule parser** (`src/lib/rules.ts`). Used when there's no key or the provider is down. It understands *with X and Y*, *X owes me*, *I owe X*, *X paid*, *paid X back*, *X paid me*, *card / cash / gpay / phonepe*, *yesterday*, *1.2k*, and group names.

## Data model (additions)

- `Group.isDirect`: a hidden ledger for a specific set of people outside any group. One per exact member set, so "me + Rahul" and "me + Rahul + Amit" are separate ledgers. Personal expenses stay in the hidden `isPersonal` ledger.
- `User.isPlaceholder`, `claimCode`, `addedById`: friends who haven't signed up yet.
- `Expense.needLevel` (essential | semi | luxury), `paymentMethodId`, `splitType`, `notes`.
- `PaymentMethod`: per user, ordered, can be hidden.
- `AiCall`: a log of parses, used for rate limiting and debugging.

**Balances.**
- Per friend, the balance is pairwise across every ledger you share, and it's never simplified, so "Rahul owes you" means Rahul.
- Inside a group, the page suggests the fewest payments (greedy matching on each member's net), labelled as simplified.
- Leaving a group, or removing a member, is blocked while that person has an open balance.

## Design

- **Palette.** Warm paper (`#f6f5f1`) in light mode and warm charcoal in dark mode. It follows the system by default and can be overridden under *You → Appearance*. Colours are defined once as RGB tokens in `globals.css` and mapped into Tailwind (`bg-card`, `text-muted`, `text-pos`…).
- **Money colours.** Green = owed to you. Orange = you owe; it should read as a nudge, not an alarm. Zero is shown faint.
- **Need levels** each get a quiet hue: blue = Essential, amber = Semi, violet = Luxury. They appear as small dots, bars and the selected chip.
- **Type.** Geist, with tabular figures and tight tracking on amounts. Big numbers only where they answer "how much?".
- **Components.** Rounded-3xl cards with a soft shadow, pill chips, a segmented control, bottom sheets and toasts with Undo. All shared pieces are in `src/components/kit.tsx`.
- **Mobile first.**
  - A floating tab bar: Home · Activity · **+** · Friends · You. On a friend or group page, **+** pre-fills that friend or group.
  - Safe-area aware, with 16px inputs so iOS doesn't zoom.
  - On desktop the same column is used, with a slim top bar, and the keypad accepts keyboard input.
- **PWA.**
  - Manifest with Add / Summary / Friends shortcuts, and a service worker that caches static assets and serves an offline page. Money pages are always fetched fresh.
  - Sessions last a year, so the installed app doesn't keep signing you out.

## Not built (on purpose, for now)

Budgets, charts, recurring expenses, multi-currency, receipts, comments, and push notifications. The ledger supports all of them, but none of them are essential yet.
