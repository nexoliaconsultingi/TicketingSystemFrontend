import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Sign in · Nexolia Service Desk",
  description: "Access your Nexolia Consulting service workspace.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>
}) {
  const params = await searchParams
  const rawEmail = params.email
  const initialEmail = Array.isArray(rawEmail) ? (rawEmail[0] ?? "") : (rawEmail ?? "")

  return <LoginForm initialEmail={initialEmail} />
}
