"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { reconcileSession } from "@/lib/auth"
import { AuthLoadingScreen } from "./auth-loading-screen"

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let active = true

    void reconcileSession().then((ok) => {
      if (!active) return
      if (!ok) {
        router.replace("/login")
        return
      }
      setAuthorized(true)
    })

    return () => {
      active = false
    }
  }, [router])

  if (!authorized) {
    return <AuthLoadingScreen />
  }

  return <>{children}</>
}
