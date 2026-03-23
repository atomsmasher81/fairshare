'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface GroupPreview {
  id: string
  name: string
  description: string | null
  _count: { members: number }
}

export default function JoinGroupPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [group, setGroup] = useState<GroupPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/groups/join/${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setGroup(data.group)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load group info')
        setLoading(false)
      })
  }, [code])

  const handleJoin = async () => {
    setJoining(true)
    setError('')

    try {
      const res = await fetch(`/api/groups/join/${code}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.groupId) {
          // Already a member, redirect to group
          router.push(`/groups/${data.groupId}`)
          return
        }
        setError(data.error || 'Failed to join group')
        return
      }

      router.push(`/groups/${data.groupId}`)
    } catch {
      setError('Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error && !group) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="bg-white rounded-xl p-8 shadow-sm border">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Invalid Invite</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-white rounded-xl p-8 shadow-sm border text-center">
        <div className="text-6xl mb-4">👋</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Join {group?.name}
        </h1>
        {group?.description && (
          <p className="text-gray-500 mb-2">{group.description}</p>
        )}
        <p className="text-sm text-gray-400 mb-6">
          {group?._count.members} member{group?._count.members !== 1 ? 's' : ''}
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? 'Joining...' : 'Join Group'}
        </button>

        <p className="text-sm text-gray-400 mt-4">
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Cancel
          </Link>
        </p>
      </div>
    </div>
  )
}
