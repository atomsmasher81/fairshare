'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Copy, Plus, Eye, EyeOff, Smartphone, Mic, Zap, MessageSquare } from 'lucide-react'
import { Chip, PrimaryButton, SecondaryButton, Segmented, toast } from '@/components/kit'
import { cn } from '@/lib/utils'

function Block({ id, title, hint, children }: { id?: string; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-2">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line/10 px-2 text-[12px]', className)}
      onClick={async () => { try { await navigator.clipboard.writeText(value) } catch {} setOk(true); setTimeout(() => setOk(false), 1200) }}>
      {ok ? <Check size={13} className="text-pos" /> : <Copy size={13} />}{ok ? 'Copied' : 'Copy'}
    </button>
  )
}

async function patchMe(data: Record<string, unknown>) {
  const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { toast(j.error || 'Couldn’t save', { tone: 'error' }); return false }
  toast('Saved')
  return true
}

/* ---------- profile ---------- */

export function ProfileSection({ displayName, upiId }: { displayName: string; upiId: string | null }) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [upi, setUpi] = useState(upiId || '')
  const dirty = name.trim() !== displayName || upi.trim() !== (upiId || '')
  return (
    <Block title="Profile">
      <div className="card space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field" maxLength={40} />
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-muted">UPI ID — friends get a one-tap “Pay” button</span>
          <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="9876543210@ybl" autoCapitalize="none" autoCorrect="off" className="field" />
        </label>
        {dirty && (
          <PrimaryButton className="h-11 w-full" onClick={async () => { if (await patchMe({ displayName: name, upiId: upi })) router.refresh() }}>
            Save
          </PrimaryButton>
        )}
      </div>
    </Block>
  )
}

/* ---------- payment methods ---------- */

const KINDS = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
]

export function MethodsSection({ methods }: { methods: { id: string; name: string; kind: string; archived: boolean }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('upi')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const active = methods.filter((m) => !m.archived)
  const hidden = methods.filter((m) => m.archived)

  const patch = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/methods/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) toast('Couldn’t save', { tone: 'error' })
    router.refresh()
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const res = await fetch('/api/methods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'Couldn’t add', { tone: 'error' }); return }
    setName('')
    router.refresh()
  }

  return (
    <Block id="methods" title="Payment methods" hint="What you pick under “Paid with”. First one shows first.">
      <div className="card divide-y divide-line/[0.07] overflow-hidden">
        {active.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
            {editing === m.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); patch(m.id, { name: editName }); setEditing(null) }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus className="h-9 flex-1 rounded-xl border border-line/15 bg-bg px-3 outline-none" />
                <button className="text-[14px] font-medium">Save</button>
              </form>
            ) : (
              <>
                <button className="flex-1 text-left text-[15px]" onClick={() => { setEditing(m.id); setEditName(m.name) }}>{m.name}</button>
                <span className="text-[12px] uppercase tracking-wide text-faint">{m.kind}</span>
                <button disabled={i === 0} onClick={() => patch(m.id, { move: -1 })} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken disabled:opacity-25" aria-label="Move up"><ArrowUp size={15} /></button>
                <button disabled={i === active.length - 1} onClick={() => patch(m.id, { move: 1 })} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken disabled:opacity-25" aria-label="Move down"><ArrowDown size={15} /></button>
                <button onClick={() => patch(m.id, { archived: true })} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken" aria-label="Hide"><EyeOff size={15} /></button>
              </>
            )}
          </div>
        ))}
        <form onSubmit={add} className="space-y-2 px-4 py-3">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add one — e.g. HDFC Millennia" className="h-10 flex-1 rounded-xl border border-line/10 bg-bg px-3 outline-none focus:border-line/25" />
            <button disabled={!name.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-ink-fg disabled:opacity-30" aria-label="Add method"><Plus size={18} /></button>
          </div>
          {name.trim() && (
            <div className="flex gap-1.5">
              {KINDS.map((k) => <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)} className="h-8 text-[13px]">{k.label}</Chip>)}
            </div>
          )}
        </form>
      </div>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-[13px] text-muted">
          Hidden:
          {hidden.map((m) => (
            <button key={m.id} onClick={() => patch(m.id, { archived: false })} className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1 hover:text-fg">
              <Eye size={12} /> {m.name}
            </button>
          ))}
        </div>
      )}
    </Block>
  )
}

/* ---------- iPhone shortcut ---------- */

export function ShortcutSection({ apiUrl, hasToken, aiEnabled }: { apiUrl: string; hasToken: boolean; aiEnabled: boolean }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSms, setShowSms] = useState(false)

  const generate = async () => {
    if (hasToken && !confirm('Make a new key? Shortcuts using the old one will stop working until you paste the new one.')) return
    setBusy(true)
    const res = await fetch('/api/me/token', { method: 'POST' })
    const j = await res.json()
    setBusy(false)
    setToken(j.token)
    router.refresh()
  }

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  )

  return (
    <Block id="shortcut" title="Add by voice with Siri" hint="Say “Hey Siri, spent” and then just talk. Works from the Action Button, Back Tap and Lock Screen too.">
      <div className="card space-y-5 p-4 text-[14.5px]">
        <div className="rounded-2xl bg-sunken p-3.5 text-[13.5px]">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium"><Mic size={14} /> Things you can say</p>
          <ul className="space-y-1 text-muted">
            <li>“milk 60” · “auto 150 cash”</li>
            {aiEnabled ? (
              <>
                <li>“dinner 1800 with Rahul and Amit on card”</li>
                <li>“Rahul paid 500 for the cab” · “paid Amit back 300”</li>
                <li>“groceries 640 yesterday, essential”</li>
              </>
            ) : <li className="text-[12.5px]">Longer sentences (friends, splits, dates) need an AI key on the server — see README.</li>}
          </ul>
        </div>

        <ol className="space-y-4">
          <Step n={1}>
            <p className="font-medium">Get your personal key</p>
            <p className="text-[13px] text-muted">It lets the shortcut add expenses as you. Keep it private.</p>
            {token ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-sunken p-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{token}</code>
                <CopyButton value={token} />
              </div>
            ) : (
              <SecondaryButton className="mt-2 h-10 text-[14px]" onClick={generate} disabled={busy}>
                {hasToken ? 'Make a new key' : 'Create key'}
              </SecondaryButton>
            )}
            {token && <p className="mt-1 text-[12px] text-neg">Copy it now — it won’t be shown again.</p>}
          </Step>
          <Step n={2}>
            <p className="font-medium">Build the shortcut</p>
            <p className="text-[13px] text-muted">Shortcuts app → <b>+</b> → add these four actions:</p>
            <div className="mt-2 space-y-2 text-[13.5px]">
              <div className="rounded-xl border border-line/10 p-3"><b>Dictate Text</b> <span className="text-muted">— Language: English (India), Stop Listening: After Pause</span></div>
              <div className="space-y-1.5 rounded-xl border border-line/10 p-3">
                <p><b>Get Contents of URL</b></p>
                <div className="flex items-center gap-2"><span className="w-14 shrink-0 text-muted">URL</span><code className="min-w-0 flex-1 truncate font-mono text-[12px]">{apiUrl}</code><CopyButton value={apiUrl} /></div>
                <div className="flex gap-2"><span className="w-14 shrink-0 text-muted">Method</span><span>POST</span></div>
                <div className="flex items-center gap-2"><span className="w-14 shrink-0 text-muted">Header</span><code className="min-w-0 flex-1 truncate font-mono text-[12px]">Authorization: Bearer {token ? token.slice(0, 8) + '…' : '<key>'}</code>{token && <CopyButton value={`Bearer ${token}`} />}</div>
                <div className="flex gap-2"><span className="w-14 shrink-0 text-muted">Body</span><span>JSON → <code className="font-mono text-[12px]">text</code> = <i>Dictated Text</i></span></div>
              </div>
              <div className="rounded-xl border border-line/10 p-3"><b>Get Dictionary Value</b> <span className="text-muted">— key</span> <code className="font-mono text-[12px]">message</code></div>
              <div className="rounded-xl border border-line/10 p-3"><b>Show Notification</b> <span className="text-muted">(or <b>Speak Text</b>) — Dictionary Value</span></div>
            </div>
          </Step>
          <Step n={3}>
            <p className="font-medium">Name it “Spent”</p>
            <p className="text-[13px] text-muted">That’s the Siri phrase. Then put it where your thumb is:</p>
            <ul className="mt-2 space-y-1.5 text-[13.5px]">
              <li className="flex gap-2"><Zap size={15} className="mt-0.5 shrink-0 text-muted" /> <span><b>Action Button</b> — Settings → Action Button → Shortcut → Spent</span></li>
              <li className="flex gap-2"><Smartphone size={15} className="mt-0.5 shrink-0 text-muted" /> <span><b>Back Tap</b> — Settings → Accessibility → Touch → Back Tap → Double Tap</span></li>
              <li className="flex gap-2"><Plus size={15} className="mt-0.5 shrink-0 text-muted" /> <span><b>Lock Screen / Control Center</b> — add a Shortcut control</span></li>
            </ul>
          </Step>
        </ol>
        <p className="text-[12.5px] text-muted">Everything added this way shows up instantly in Activity. Wrong? Tap it to fix, or say “undo” in Telegram.</p>

        <button onClick={() => setShowSms((s) => !s)} className="flex w-full items-center gap-2 border-t border-line/[0.07] pt-4 text-left text-[14px] font-medium">
          <MessageSquare size={15} className="text-muted" /> Auto-capture every UPI payment <span className="ml-auto text-[12px] font-normal text-muted">{showSms ? 'Hide' : 'Advanced'}</span>
        </button>
        {showSms && (
          <div className="space-y-2 text-[13.5px] text-muted">
            <p>Your bank texts you on every payment. An iOS automation can forward that SMS here silently; it lands in <b className="text-fg">To sort</b> on Home.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Shortcuts → Automation → <b>+</b> → <b>Message</b> → Message Contains <code>debited</code></li>
              <li>Run Immediately, Notify off → New Blank Automation</li>
              <li><b>Get Contents of URL</b> — same URL and header as above, Body JSON → <code>sms</code> = Shortcut Input › Content</li>
            </ol>
            <p>Pick a type once for a payee and next time it’s filed automatically. OTPs, credits and duplicates are ignored.</p>
          </div>
        )}
      </div>
    </Block>
  )
}

/* ---------- telegram ---------- */

export function TelegramSection({ linked }: { linked: boolean }) {
  const connect = async () => {
    const res = await fetch('/api/me/telegram-code', { method: 'POST' })
    const j = await res.json()
    if (j.url) window.location.href = j.url
  }
  return (
    <Block title="Telegram" hint={linked ? 'Connected — text the bot “chai 20”, forward bank SMS, get split notifications.' : 'Add expenses by texting a bot and get notified when friends add splits.'}>
      <SecondaryButton className="h-11" onClick={connect}>{linked ? 'Re-link Telegram' : 'Connect Telegram'}</SecondaryButton>
    </Block>
  )
}

/* ---------- appearance ---------- */

export function AppearanceSection() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  useEffect(() => {
    try { const t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') setTheme(t) } catch {}
  }, [])
  const apply = (t: 'system' | 'light' | 'dark') => {
    setTheme(t)
    try { if (t === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', t) } catch {}
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }
  return (
    <Block title="Appearance">
      <Segmented value={theme} onChange={apply} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
    </Block>
  )
}

export function SignOut() {
  const router = useRouter()
  return (
    <button className="text-[14px] text-danger" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh() }}>
      Sign out
    </button>
  )
}
