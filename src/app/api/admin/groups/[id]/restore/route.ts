import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// POST /api/admin/groups/[id]/restore - Restore soft deleted group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    await prisma.group.update({
      where: { id },
      data: { deletedAt: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Restore group error:', error)
    return NextResponse.json({ error: 'Failed to restore group' }, { status: 500 })
  }
}
