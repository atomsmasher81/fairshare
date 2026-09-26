import { redirect } from 'next/navigation'

export default function Spending() {
  redirect('/activity?view=summary')
}
