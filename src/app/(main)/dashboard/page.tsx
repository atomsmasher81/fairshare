import { redirect } from 'next/navigation'

// Old URL (installed PWAs and bookmarks) → new home
export default function Dashboard() {
  redirect('/home')
}
