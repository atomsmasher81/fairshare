import { SessionOptions } from 'iron-session'

export interface SessionData {
  userId?: string
  username?: string
  isAdmin?: boolean
  isLoggedIn: boolean
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'fairshare-session',
  cookieOptions: {
    // Secure cookies need HTTPS. Self-hosters on plain http://192.168.x.x would otherwise never stay signed in.
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.APP_URL ? process.env.APP_URL.startsWith('https://') : process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year — an installed PWA shouldn't keep logging you out
  },
}
