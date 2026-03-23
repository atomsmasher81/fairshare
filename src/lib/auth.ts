import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions, defaultSession } from './session'
import bcrypt from 'bcryptjs'

export async function getSession() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  
  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn
  }
  
  return session
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
