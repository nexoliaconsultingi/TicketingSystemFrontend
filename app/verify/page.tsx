import type { Metadata } from "next"

import { VerifyCodeForm } from "@/components/auth/verify-code-form"

export const metadata: Metadata = {
  title: "Verification · Nexolia Service Desk",
  description: "Enter the verification code you received by email.",
}

export default function VerifyPage() {
  return <VerifyCodeForm />
}
