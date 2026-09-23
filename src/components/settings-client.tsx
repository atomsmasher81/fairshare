'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LedgerOption } from './quick-add'

interface Props {
  displayName: string
  upiId: string | null
  defaultId: string | null
  ledgers: LedgerOption[]
  telegramLinked: boolean
  hasToken: boolean
}

const API = 'https://split.kartikgautam.com/api/capture'

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-[var(--muted-foreground)]">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Copy({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200) }}
      className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs">
      {ok ? 'Copied' : label}
    </button>
  )
}

export function SettingsClient(p: Props) {
  const router = useRouter()
  const [name, setName] = useState(p.displayName)
  const [upi, setUpi] = useState(p.upiId || '')
  const [msg, setMsg] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (data: Record<string, unknown>) => {
    setMsg(null)
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const j = await res.json()
    setMsg(res.ok ? 'Saved ✓' : j.error)
    if (res.ok) router.refresh()
  }

  const connectTelegram = async () => {
    const res = await fetch('/api/me/telegram-code', { method: 'POST' })
    const j = await res.json()
    if (j.url) window.location.href = j.url
  }

  const rotate = async () => {
    if (p.hasToken && !confirm('This replaces your current token — any Shortcut using the old one will stop working. Continue?')) return
    setBusy(true)
    const res = await fetch('/api/me/token', { method: 'POST' })
    const j = await res.json()
    setBusy(false)
    setToken(j.token)
    router.refresh()
  }

  const t = token || '<your token>'
  const tokenField = (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--surface)] p-2">
      <code className="min-w-0 flex-1 truncate text-xs">{token || (p.hasToken ? 'Token set — generate a new one to see it again' : 'No token yet')}</code>
      {token && <Copy value={token} />}
    </div>
  )

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm">{msg}</p>}

      <Section title="Profile">
        <label className="text-sm text-[var(--muted-foreground)]">Display name</label>
        <div className="mt-1 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-white/70 px-3" />
          <button onClick={() => save({ displayName: name })} className="rounded-xl border border-[var(--border)] px-3 text-sm">Save</button>
        </div>
        <label className="mt-3 block text-sm text-[var(--muted-foreground)]">Your UPI ID — friends get a one-tap “Pay via UPI” button</label>
        <div className="mt-1 flex gap-2">
          <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="9876543210@ybl" autoCapitalize="none" className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-white/70 px-3" />
          <button onClick={() => save({ upiId: upi })} className="rounded-xl border border-[var(--border)] px-3 text-sm">Save</button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">PhonePe → Profile → your UPI ID (usually number@ybl)</p>
      </Section>

      <Section title="Default for quick entries" hint="Where “milk 20” goes when you don’t add @group or #me.">
        <div className="flex flex-wrap gap-2">
          {p.ledgers.map((l) => (
            <button key={l.id ?? 'p'} onClick={() => save({ defaultGroupId: l.id })}
              className={`rounded-full border px-3 py-1 text-sm ${p.defaultId === l.id ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]' : 'border-[var(--border)]'}`}>
              {l.id ? `👥 ${l.name}` : '🙋 Personal'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Telegram" hint={p.telegramLinked ? 'Connected ✓ — type “chai 20” to the bot, forward bank SMS, get review prompts.' : 'Add expenses by texting the bot, get “where does this go?” prompts for UPI payments.'}>
        <button onClick={connectTelegram} className="rounded-xl bg-[#229ED9] px-4 py-2 text-sm font-medium text-white">
          {p.telegramLinked ? 'Re-link Telegram' : 'Connect Telegram'}
        </button>
      </Section>

      <Section title="iPhone: Siri, Back Tap & auto-capture" hint="One personal token powers all the iPhone shortcuts below. Keep it private.">
        <button onClick={rotate} disabled={busy} className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)]">
          {p.hasToken ? 'Generate new token' : 'Generate token'}
        </button>
        {tokenField}

        <div className="mt-5 space-y-5 text-sm">
          <div>
            <h3 className="font-semibold">⚡ 1. Auto-capture every UPI payment (the big one)</h3>
            <p className="mt-1 text-[var(--muted-foreground)]">Your bank texts you on every PhonePe payment. iOS can forward that SMS to FairShare silently.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Shortcuts app → <b>Automation</b> → <b>+</b> → <b>Message</b></li>
              <li><b>Message Contains</b>: <code>debited</code> &nbsp;(make a 2nd automation for <code>Sent Rs</code> if your bank is HDFC)</li>
              <li>Choose <b>Run Immediately</b>, turn <b>off</b> Notify When Run → Next → <b>New Blank Automation</b></li>
              <li>Add action <b>Get Contents of URL</b>:
                <div className="mt-1 space-y-1 rounded-xl bg-[var(--surface)] p-2 text-xs">
                  <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-[var(--muted-foreground)]">URL</span><code className="flex-1 truncate">{API}</code><Copy value={API} /></div>
                  <div className="flex gap-2"><span className="w-16 shrink-0 text-[var(--muted-foreground)]">Method</span><code>POST</code></div>
                  <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-[var(--muted-foreground)]">Header</span><code className="flex-1 truncate">Authorization: Bearer {t}</code>{token && <Copy value={`Bearer ${token}`} />}</div>
                  <div className="flex gap-2"><span className="w-16 shrink-0 text-[var(--muted-foreground)]">Body</span><code>JSON → <b>sms</b> = Shortcut Input › Content</code></div>
                </div>
              </li>
            </ol>
            <p className="mt-2 text-[var(--muted-foreground)]">Result: every payment lands in <b>📥 To sort</b> on Home + a Telegram ping with buttons (Personal / Flat / Not an expense). Pick once — next time the same payee is filed automatically. Duplicates (same UPI ref) are ignored; OTPs, credits and failed txns are skipped.</p>
          </div>

          <div>
            <h3 className="font-semibold">🗣 2. “Hey Siri, spent” (you already have this)</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>New Shortcut → <b>Dictate Text</b> (or <b>Ask for Input</b>)</li>
              <li><b>Get Contents of URL</b> → same URL/header as above, Body JSON → <b>text</b> = Dictated Text</li>
              <li><b>Get Dictionary Value</b> “message” → <b>Show Notification</b></li>
              <li>Name it “Spent”. Say: <i>“Hey Siri, spent” → “auto 150”</i>. Or <i>“dinner 1200 at flat”</i> → use @flat.</li>
            </ol>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Your old shortcut still works unchanged. Switching it to your personal token just means no shared master key on your phone.</p>
          </div>

          <div>
            <h3 className="font-semibold">👆 3. Back Tap = instant add</h3>
            <p className="mt-1">Settings → Accessibility → Touch → <b>Back Tap</b> → Double Tap → pick the “Spent” shortcut. Double-tap the back of the phone, type <code>chai 20</code>, done. Same shortcut works on the <b>Action Button</b> (iPhone 15 Pro+), Lock Screen widget and Control Center.</p>
          </div>

          <div>
            <h3 className="font-semibold">📱 4. Add FairShare to Home Screen</h3>
            <p className="mt-1">Open this site in Safari → Share → <b>Add to Home Screen</b>. It opens full-screen like an app with a big + button.</p>
          </div>
        </div>
      </Section>
    </div>
  )
}
