import { Bone, HeaderSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      {[0, 1, 2].map((i) => <div key={i} className="card space-y-3 p-4"><Bone className="h-4 w-32" /><Bone className="h-12" /><Bone className="h-12" /></div>)}
    </div>
  )
}
