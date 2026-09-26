import { redirect } from 'next/navigation'

// Sign-in lives on the landing page now
export default function Login() {
  redirect('/#signin')
}
