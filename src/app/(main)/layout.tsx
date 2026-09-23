import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Navbar } from '@/components/navbar'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  
  if (!session.isLoggedIn) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar 
        username={session.username!} 
        isAdmin={session.isAdmin || false} 
      />
      <main className="app-shell pb-28 pt-6 sm:pt-8 md:pb-12">
        {children}
      </main>
    </div>
  )
}
