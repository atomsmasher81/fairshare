import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function POST() {
  try {
    const session = await getSession()
    session.destroy()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}
