import { Bone } from '@/components/skeletons'

// Same shape as the expense editor, so the keypad appears in place instantly
export default function Loading() {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg px-4 pt-[max(12px,env(safe-area-inset-top))] md:static md:mx-auto md:max-w-md">
      <div className="flex items-center justify-between"><Bone className="h-10 w-10 rounded-full" /><Bone className="h-4 w-28" /><Bone className="h-9 w-20 rounded-full" /></div>
      <div className="flex flex-col items-center gap-2 py-4"><Bone className="h-12 w-32" /></div>
      <Bone className="h-12 rounded-2xl" />
      <div className="mt-5 grid grid-cols-3 gap-2"><Bone className="h-11 rounded-2xl" /><Bone className="h-11 rounded-2xl" /><Bone className="h-11 rounded-2xl" /></div>
      <div className="mt-5 flex gap-2"><Bone className="h-9 w-24 rounded-full" /><Bone className="h-9 w-24 rounded-full" /><Bone className="h-9 w-24 rounded-full" /></div>
      <div className="mt-auto grid grid-cols-4 gap-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        {Array.from({ length: 16 }).map((_, i) => <Bone key={i} className="h-[48px] rounded-2xl" />)}
      </div>
    </div>
  )
}
