// Shown the instant you tap — the real page streams in when the server answers.
import { cn } from '@/lib/utils'

export function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-fg/[0.07]', className)} />
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line/[0.07] overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Bone className="h-10 w-10 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3.5 w-2/5" />
            <Bone className="h-3 w-3/5" />
          </div>
          <Bone className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  )
}

export function HeaderSkeleton({ back }: { back?: boolean }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {back && <Bone className="h-9 w-9 rounded-full" />}
      <Bone className="h-7 w-40" />
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 px-1"><Bone className="h-3.5 w-28" /><Bone className="h-7 w-32" /></div>
      <div className="card space-y-4 p-5">
        <Bone className="h-3.5 w-32" />
        <Bone className="h-10 w-44" />
        <Bone className="h-2 w-full rounded-full" />
        <Bone className="h-3 w-3/4" />
      </div>
      <div className="card grid grid-cols-2 gap-4 p-5"><Bone className="h-12" /><Bone className="h-12" /></div>
      <Bone className="h-14 rounded-3xl" />
      <RowsSkeleton rows={4} />
    </div>
  )
}

export function ListPageSkeleton({ back, top }: { back?: boolean; top?: 'card' | 'tabs' | 'profile' }) {
  return (
    <div className="space-y-5">
      <HeaderSkeleton back={back} />
      {top === 'profile' && <div className="flex flex-col items-center gap-3"><Bone className="h-[72px] w-[72px] rounded-full" /><Bone className="h-6 w-36" /><Bone className="h-4 w-44" /></div>}
      {top === 'card' && <div className="card space-y-3 p-5"><Bone className="h-3.5 w-24" /><Bone className="h-8 w-40" /></div>}
      {top === 'tabs' && <Bone className="h-11 rounded-2xl" />}
      <RowsSkeleton rows={6} />
    </div>
  )
}
