"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fetchSessionUser } from "@/lib/auth"
import { AuthLoadingScreen } from "./auth-loading-screen"

export function AdminGuard({
  children,
  includeManager = false,
}: {
  children: ReactNode
  includeManager?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading")

  useEffect(() => {
    let active = true

    // Le rôle est relu sur l'API : un rôle modifié dans le stockage local
    // ne peut pas ouvrir la section réservée à l'admin de plateforme.
    void fetchSessionUser().then((user) => {
      if (!active) return

      if (!user) {
        router.replace("/login")
        return
      }

      const allowed =
        user.access.includes("admin") || (includeManager && user.access.includes("manager"))

      setStatus(allowed ? "allowed" : "denied")
    })

    return () => {
      active = false
    }
  }, [router, includeManager])

  if (status === "loading") {
    return <AuthLoadingScreen />
  }

  if (status === "denied") {
    return <AccessDenied includeManager={includeManager} />
  }

  return <>{children}</>
}

function AccessDenied({ includeManager }: { includeManager: boolean }) {
  const router = useRouter()

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f7f9fc] px-5 text-[#172033]">
      <div className="w-full max-w-md rounded-xl border border-[#e5eaf2] bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-lg font-semibold text-[#183b56]">Administrator access required</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {includeManager
            ? "This section is reserved for the platform administrator and the supervisors who prepare the catalogue."
            : "The platform administration section is reserved for the general administrator of the platform. Contact your administrator if you need access."}
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => {
            router.replace("/")
            router.refresh()
          }}
        >
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}
