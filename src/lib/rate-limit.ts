// Tiny in-memory sliding window. Fine for a single Node process (PM2 fork mode).
const hits = new Map<string, number[]>()

export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 5000) hits.clear()
  return list.length > max
}
