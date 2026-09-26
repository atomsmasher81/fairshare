import { prisma } from '@/lib/prisma'
/* eslint-disable @typescript-eslint/no-require-imports */
const { hashToken } = require('@/lib/ledger')

/** Resolve a personal key (fs_…) to its owner, recording when it was last used. */
export async function userIdFromKey(token: string | null | undefined): Promise<string | null> {
  if (!token || !token.startsWith('fs_')) return null
  const key = await prisma.apiKey.findUnique({ where: { hash: hashToken(token) }, select: { id: true, userId: true, lastUsedAt: true } })
  if (!key) return null
  // Don't write on every request — once every few minutes is plenty for "last used"
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 5 * 60e3) {
    prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  }
  return key.userId
}
