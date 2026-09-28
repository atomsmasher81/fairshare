# Changelog

All notable changes to FairShare. Versions follow [semantic versioning](https://semver.org).

## [Unreleased]

### Added
- **Net worth tracker** (`/wealth`): accounts (bank, mutual fund, stocks, FD, PPF, EPF, NPS, gold, crypto, property, loans) with money put in vs current value, returns, change this month, a one-screen monthly update with last values prefilled, and per-account history.
- **Investment** as a fourth expense type, kept out of spending; it can go into a net-worth account and moves that account automatically.
- MCP tools `net_worth`, `update_accounts`, `account_history`, `manage_account` — update everything from a screenshot.
- Full MCP control (search, edit, restore, timeline, friends, groups, payment methods, settings); friends and groups in one list.
- Groq first for parsing (~0.5 s), Gemini as backup; 10 s per attempt.

## [1.0.0] — 2026-09-26

First public release.

### Splitting
- Friends, groups and one-off shared expenses with any set of friends
- Split equally, by exact amounts, or "they owe the full amount"; any member can be the payer
- Group debts simplified to the fewest payments
- Settle up with UPI deep links, partial payments, reminders via the share sheet
- Placeholder friends who can claim their history with a link; group invite links

### Personal spending
- Expense editor with a calculator keypad, suggestions from history, "save & add another"
- Need levels (Essential / Semi / Luxury), user-defined payment methods, auto-categories
- Monthly summary by need level, category and payment method, compared with last month

### Capture
- Natural-language entry (Gemini / Groq / OpenAI) with a rule-based fallback
- Siri / iOS Shortcuts endpoint (`POST /api/capture`) and bank-SMS auto-capture with a "To sort" inbox
- Telegram bot
- MCP server at `/api/mcp`

### Trust & history
- Soft delete everywhere; restore deleted expenses and payments
- Timeline of adds, edits (before → after), deletes and restores
- Push notifications to installed apps; named, revocable personal API keys

### App & hosting
- Installable PWA with push, pull-to-refresh, light and dark mode, instant loading skeletons
- Docker image and `docker compose` setup with secrets generated on first run
- Demo data script (`scripts/seed-demo.js`)

[1.0.0]: https://github.com/atomsmasher81/fairshare/releases/tag/v1.0.0
