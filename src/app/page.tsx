import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Mic, Delete, Home, ListOrdered, Users, CircleUser } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { AuthCard } from '@/components/auth-card'

export const metadata = { title: { absolute: 'FairShare — your money, and who owes whom' } }

export default async function Landing() {
  const session = await getSession()
  if (session.isLoggedIn) redirect('/home')

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <div className="flex items-center gap-2">
          <Image src="/icon-192.png" alt="" width={28} height={28} className="rounded-lg" />
          <span className="text-[17px] font-semibold tracking-[-0.03em]">FairShare</span>
        </div>
        <a href="#signin" className="rounded-full px-3.5 py-1.5 text-[14px] text-muted hover:text-fg">Sign in</a>
      </header>

      <main className="mx-auto max-w-5xl px-5 sm:px-8">
        {/* hero */}
        <section className="grid items-center gap-10 pb-16 pt-8 md:grid-cols-[1fr_380px] md:gap-14 md:pt-16">
          <div>
            <p className="label">Personal spending + splitting with friends</p>
            <h1 className="mt-3 text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[56px]">
              Know where your money goes. And who owes whom.
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted">
              Log an expense in two taps — or just tell Siri “dinner twelve hundred with Rahul”. See your month at a glance, split bills without doing maths, settle up over UPI.
            </p>
            <div className="mt-8 max-w-sm">
              <AuthCard />
            </div>
          </div>
          <PhoneMock />
        </section>

        {/* three things, done well */}
        <section className="grid gap-4 border-t border-line/[0.08] py-14 md:grid-cols-3">
          <Feature
            title="Two-second entry"
            body="A keypad that’s always ready. Tap Essential, Semi or Luxury, pick PhonePe or card, type the amount. It remembers what “milk” usually is."
            demo={<KeypadDemo />}
          />
          <Feature
            title="Or just say it"
            body="“Hey Siri, spent” → “auto 150” or “Amit paid 900 for movie tickets”. Plain words become a proper expense, split and all."
            demo={<VoiceDemo />}
          />
          <Feature
            title="Splitting without the maths"
            body="Friends and groups in one place. Equal, exact or ‘they owe it all’. One number per friend, one tap to pay them on UPI."
            demo={<SplitDemo />}
          />
        </section>

        <section className="border-t border-line/[0.08] py-14 text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.035em]">Free. No ads. No daily limits.</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">
            The moment logging an expense feels like a chore, you stop doing it. So FairShare stays out of your way.
          </p>
          <a href="#signin" className="pressable mt-6 inline-flex h-12 items-center rounded-2xl bg-ink px-6 font-medium text-ink-fg">Get started</a>
          <p className="mt-6 text-[13px] text-faint">On iPhone: open in Safari → Share → Add to Home Screen.</p>
        </section>
      </main>

      <footer className="border-t border-line/[0.08] py-8 text-center text-[13px] text-faint">
        FairShare · made for friends who split things
      </footer>
    </div>
  )
}

function Feature({ title, body, demo }: { title: string; body: string; demo: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex h-40 items-center justify-center bg-sunken/60 px-6">{demo}</div>
      <div className="p-5">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  )
}

function KeypadDemo() {
  return (
    <div className="w-full max-w-[210px]">
      <div className="mb-2 flex justify-center gap-1.5">
        {[['Essential', 'var(--essential)', true], ['Semi', 'var(--semi)', false], ['Luxury', 'var(--luxury)', false]].map(([l, c, on]) => (
          <span key={l as string} className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={on ? { background: `rgb(${c})`, color: 'white' } : { background: 'rgb(var(--card))' }}>{l as string}</span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <span key={k} className="flex h-7 items-center justify-center rounded-lg bg-card text-[13px] font-medium shadow-[var(--shadow-soft)]">{k}</span>
        ))}
        <span className="flex h-7 items-center justify-center rounded-lg bg-card text-[13px]">.</span>
        <span className="flex h-7 items-center justify-center rounded-lg bg-card text-[13px] font-medium">0</span>
        <span className="flex h-7 items-center justify-center rounded-lg bg-card"><Delete size={13} /></span>
      </div>
    </div>
  )
}

function VoiceDemo() {
  return (
    <div className="w-full max-w-[230px] space-y-2">
      <div className="ml-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[12.5px] text-ink-fg">
        <Mic size={12} /> dinner 1200 with Rahul
      </div>
      <div className="w-fit rounded-2xl rounded-bl-md bg-card px-3 py-2 text-[12.5px] shadow-[var(--shadow-soft)]">
        <span className="font-medium">✅ Dinner ₹1,200</span>
        <span className="block text-muted">split with Rahul · your share ₹600</span>
      </div>
    </div>
  )
}

function SplitDemo() {
  return (
    <div className="w-full max-w-[230px] space-y-1.5">
      {[['Rahul', 'owes you', '₹450', 'text-pos'], ['Amit', 'you owe', '₹200', 'text-neg'], ['Priya', 'settled up', '', 'text-muted']].map(([n, l, a, c]) => (
        <div key={n} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-1.5 text-[12.5px] shadow-[var(--shadow-soft)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold">{n[0]}</span>
          <span className="flex-1 font-medium">{n}</span>
          <span className={c}>{l} <b className="num">{a}</b></span>
        </div>
      ))}
    </div>
  )
}

/** The app's home screen, drawn in code so it's crisp in both themes. */
function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(var(--essential)/0.12),transparent)]" />
      <div className="rounded-[44px] border border-line/10 bg-bg p-3 shadow-[var(--shadow-float)]">
        <div className="space-y-3 rounded-[34px] bg-bg px-3 pb-4 pt-5">
          <div className="px-1">
            <p className="text-[12px] text-muted">Good evening,</p>
            <p className="text-[19px] font-semibold tracking-[-0.03em]">Kartik</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-muted">Spent in September</p>
            <p className="num text-[30px] font-semibold tracking-[-0.045em]">₹18,420</p>
            <div className="mt-3 flex h-1.5 gap-[2px] overflow-hidden rounded-full">
              <span className="bg-essential" style={{ width: '58%' }} />
              <span className="bg-semi" style={{ width: '27%' }} />
              <span className="bg-luxury" style={{ width: '15%' }} />
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-muted">
              <span>Essential <b className="text-fg">₹10.7k</b></span>
              <span>Semi <b className="text-fg">₹5k</b></span>
              <span>Luxury <b className="text-fg">₹2.8k</b></span>
            </div>
          </div>
          <div className="card grid grid-cols-2 divide-x divide-line/[0.07]">
            <div className="p-3"><p className="text-[11px] text-muted">You’re owed</p><p className="num text-[17px] font-semibold text-pos">₹1,250</p></div>
            <div className="p-3"><p className="text-[11px] text-muted">You owe</p><p className="num text-[17px] font-semibold text-neg">₹200</p></div>
          </div>
          <div className="card divide-y divide-line/[0.07]">
            {[
              ['🛒', 'Milk', 'Essential · PhonePe', '₹60', null],
              ['🍽️', 'Dinner', 'You paid ₹1,800 · Rahul, Amit', '₹600', 'lent ₹1,200'],
              ['🚕', 'Auto', 'Semi · Cash', '₹150', null],
            ].map(([e, d, m, a, l]) => (
              <div key={d} className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sunken text-[14px]">{e}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{d}</span>
                  <span className="block truncate text-[11px] text-muted">{m}</span>
                </span>
                <span className="text-right">
                  <span className="num block text-[13px] font-medium">{a}</span>
                  {l && <span className="num block text-[10.5px] text-pos">{l}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="mx-auto flex h-12 w-[82%] items-center justify-around rounded-[20px] bg-card shadow-[var(--shadow-float)]">
            <Home size={17} className="text-fg" />
            <ListOrdered size={17} className="text-faint" />
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-[20px] text-ink-fg">+</span>
            <Users size={17} className="text-faint" />
            <CircleUser size={17} className="text-faint" />
          </div>
        </div>
      </div>
    </div>
  )
}
