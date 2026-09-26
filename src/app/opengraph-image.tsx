import { ImageResponse } from 'next/og'

// The card shown when the link is shared (WhatsApp, X, Slack, search results)
export const alt = 'FairShare — open-source Splitwise alternative with expense tracking'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TEXT = 'Open source · self-hostable The free Splitwise alternative. Split bills, track your own spending, add expenses by voice. FairShare Riya Kabir Meera owes you ₹450 you owe ₹200 settled up RKM'

// Inter (with ₹), subset to just these characters. If the network is down, fall back to the default font.
async function font(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(TEXT)}`)).text()
    const url = css.match(/src: url\((.+?)\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const [regular, bold] = await Promise.all([font(400), font(700)])
  const fonts = [
    ...(regular ? [{ name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const }] : []),
    ...(bold ? [{ name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const }] : []),
  ]
  const row = (name: string, text: string, amount: string, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: '#fffffd', borderRadius: 22, padding: '18px 24px', boxShadow: '0 8px 24px rgba(28,27,23,0.06)' }}>
      <div style={{ display: 'flex', width: 44, height: 44, borderRadius: 22, background: '#ecebe6', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#706d64' }}>{name[0]}</div>
      <div style={{ display: 'flex', flex: 1, fontSize: 26, fontWeight: 600, color: '#1c1b17' }}>{name}</div>
      <div style={{ display: 'flex', fontSize: 24, color, gap: 8 }}><span>{text}</span>{amount && <span style={{ fontWeight: 700 }}>{amount}</span>}</div>
    </div>
  )
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#f6f5f1', padding: 72, gap: 56, fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: 24, color: '#706d64', letterSpacing: 2, textTransform: 'uppercase' }}>Open source · self-hostable</div>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: '#1c1b17', lineHeight: 1.02, marginTop: 18, letterSpacing: -3 }}>The free Splitwise alternative.</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#706d64', marginTop: 24, lineHeight: 1.35 }}>Split bills, track your own spending, add expenses by voice.</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#1c1b17', marginTop: 40 }}>FairShare</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 440, justifyContent: 'center', gap: 16 }}>
          {row('Riya', 'owes you', '₹450', '#16805a')}
          {row('Kabir', 'you owe', '₹200', '#d26914')}
          {row('Meera', 'settled up', '', '#706d64')}
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
