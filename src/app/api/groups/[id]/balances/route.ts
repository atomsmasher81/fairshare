import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

interface Balance {
  owerId: string
  owerName: string
  owedId: string
  owedName: string
  amount: number
}

// GET /api/groups/[id]/balances - Get balances for the group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: session.userId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Get all members
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    })

    // Calculate net balance for each user
    // Positive = is owed money, Negative = owes money
    const netBalances: Map<string, number> = new Map()
    const userNames: Map<string, string> = new Map()

    members.forEach(m => {
      netBalances.set(m.userId, 0)
      userNames.set(m.userId, m.user.displayName)
    })

    // Get all expenses
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        splits: true,
      },
    })

    // For each expense: payer is owed, split users owe
    expenses.forEach(expense => {
      // Payer paid the full amount, so they're owed
      const currentPayerBalance = netBalances.get(expense.paidById) || 0
      netBalances.set(expense.paidById, currentPayerBalance + expense.amount)

      // Each person in split owes their share
      expense.splits.forEach(split => {
        const currentBalance = netBalances.get(split.userId) || 0
        netBalances.set(split.userId, currentBalance - split.amount)
      })
    })

    // Get all settlements
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
    })

    // Settlements: fromUser paid toUser
    settlements.forEach(settlement => {
      // fromUser paid, so their balance increases (less in debt / more owed)
      const fromBalance = netBalances.get(settlement.fromUserId) || 0
      netBalances.set(settlement.fromUserId, fromBalance + settlement.amount)

      // toUser received, so their balance decreases (less owed / more in debt)
      const toBalance = netBalances.get(settlement.toUserId) || 0
      netBalances.set(settlement.toUserId, toBalance - settlement.amount)
    })

    // Simplify debts using greedy algorithm
    const simplifiedDebts: Balance[] = []
    
    // Separate into creditors (positive balance) and debtors (negative balance)
    const creditors: { oderId: string; amount: number }[] = []
    const debtors: { oderId: string; amount: number }[] = []

    netBalances.forEach((balance, oderId) => {
      if (balance > 0) {
        creditors.push({ oderId, amount: balance })
      } else if (balance < 0) {
        debtors.push({ oderId, amount: -balance }) // Store as positive for easier math
      }
    })

    // Sort by amount descending
    creditors.sort((a, b) => b.amount - a.amount)
    debtors.sort((a, b) => b.amount - a.amount)

    // Match creditors with debtors
    let i = 0, j = 0
    while (i < creditors.length && j < debtors.length) {
      const creditor = creditors[i]
      const debtor = debtors[j]
      
      const settleAmount = Math.min(creditor.amount, debtor.amount)
      
      if (settleAmount > 0) {
        simplifiedDebts.push({
          owerId: debtor.oderId,
          owerName: userNames.get(debtor.oderId) || 'Unknown',
          owedId: creditor.oderId,
          owedName: userNames.get(creditor.oderId) || 'Unknown',
          amount: settleAmount,
        })
      }

      creditor.amount -= settleAmount
      debtor.amount -= settleAmount

      if (creditor.amount === 0) i++
      if (debtor.amount === 0) j++
    }

    // User's personal summary
    const userBalance = netBalances.get(session.userId) || 0
    const userOwes = simplifiedDebts
      .filter(d => d.owerId === session.userId)
      .reduce((sum, d) => sum + d.amount, 0)
    const userIsOwed = simplifiedDebts
      .filter(d => d.owedId === session.userId)
      .reduce((sum, d) => sum + d.amount, 0)

    return NextResponse.json({
      balances: simplifiedDebts,
      userSummary: {
        netBalance: userBalance,
        youOwe: userOwes,
        youAreOwed: userIsOwed,
      },
      memberBalances: Array.from(netBalances.entries()).map(([userId, balance]) => ({
        userId,
        displayName: userNames.get(userId),
        netBalance: balance,
      })),
    })
  } catch (error) {
    console.error('Error calculating balances:', error)
    return NextResponse.json({ error: 'Failed to calculate balances' }, { status: 500 })
  }
}
