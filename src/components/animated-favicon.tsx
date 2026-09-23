'use client'

import { useEffect } from 'react'

const FRAMES = 6
const DELAY_MS = 90

// Only Firefox animates GIF favicons, so cycle PNG frames for Chrome/Edge too.
// Safari ignores favicon swaps and shows the static icon.
export function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const frames = Array.from({ length: FRAMES }, (_, i) => `/favicon-frames/${i}.png`)
    frames.forEach((src) => { new Image().src = src })

    let i = 0
    const timer = window.setInterval(() => {
      i = (i + 1) % FRAMES
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach((link) => {
        link.type = 'image/png'
        link.href = frames[i]
      })
    }, DELAY_MS)

    return () => window.clearInterval(timer)
  }, [])

  return null
}
