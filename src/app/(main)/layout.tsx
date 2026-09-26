import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Navbar } from '@/components/navbar'
import { Toaster } from '@/components/kit'
import { ServiceWorker } from '@/components/service-worker'
import { PullToRefresh } from '@/components/pull-to-refresh'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/')

  return (
    <div className="min-h-dvh">
      <Navbar />
      <PullToRefresh />
      <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-[max(20px,env(safe-area-inset-top))] sm:px-6 md:pb-16 md:pt-8">
        {children}
      </main>
      <Toaster />
      <ServiceWorker />
    </div>
  )
}
