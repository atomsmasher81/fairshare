import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  
  if (!session.isLoggedIn) {
    redirect('/login')
  }
  
  if (!session.isAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin Header */}
      <header className="bg-gray-900 text-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="text-xl font-bold">
                FairShare Admin
              </Link>
              <nav className="flex gap-4">
                <Link href="/admin" className="text-gray-300 hover:text-white text-sm">
                  Dashboard
                </Link>
                <Link href="/admin/users" className="text-gray-300 hover:text-white text-sm">
                  Users
                </Link>
                <Link href="/admin/groups" className="text-gray-300 hover:text-white text-sm">
                  Groups
                </Link>
              </nav>
            </div>
            <Link href="/dashboard" className="text-gray-300 hover:text-white text-sm">
              ← Back to App
            </Link>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </main>
    </div>
  )
}
