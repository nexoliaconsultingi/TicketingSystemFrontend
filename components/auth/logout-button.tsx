"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearUserAvatarCache } from "@/components/profile/user-avatar"
import { authApi } from "@/lib/api"
import { clearSession, getToken } from "@/lib/auth"
import { disconnectRealtime } from "@/lib/realtime"

const CONFIRM_TIMEOUT_MS = 3500

export function LogoutButton({ collapsed, menuItem }: { collapsed?: boolean; menuItem?: boolean }) {
  const router = useRouter()

  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleLogout = async () => {
    if (pending) return

    if (!confirming) {
      setConfirming(true)
      timerRef.current = window.setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS)
      return
    }

    setPending(true)
    const token = getToken()

    if (token) {
      try {
        await authApi.logout(token)
      } catch {
        // The local session is revoked either way.
      }
    }

    clearSession()
    // La connexion temps réel est coupée avec la session : la laisser ouverte
    // garderait le jeton de la personne qui vient de partir, et sa
    // reconnexion automatique rouvrirait la room de ce compte sur le poste de la
    // suivante.
    disconnectRealtime()
    // Les photos de profil restent en mémoire pour la durée de la session : sans
    // cette purge, la personne qui se connecte après ce départ verrait les
    // visages des acteurs des dossiers précédents.
    clearUserAvatarCache()
    router.replace("/login")
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleLogout}
      disabled={pending}
      title="Sign out"
      aria-label="Sign out"
      className={
        menuItem
          ? confirming
            ? "w-full justify-start gap-2.5 rounded-lg bg-[#fdf2f2] px-3 py-2 text-[13px] font-semibold text-[#b04a4a] hover:bg-[#fbe9e9]"
            : "w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-[#fdeeee] hover:text-[#d05555]"
          : confirming
            ? "gap-2 rounded-lg border border-[#f0c9c9] bg-[#fdf2f2] px-2.5 text-[11px] font-semibold text-[#b04a4a] hover:bg-[#fbe9e9]"
            : "rounded-lg text-slate-500 hover:bg-[#fdeeee] hover:text-[#d05555]"
      }
    >
      <LogOut className="size-4 shrink-0" />
      {(!collapsed || menuItem) && (
        <span className="truncate">
          {pending ? "Signing out…" : confirming ? "Confirm" : "Sign out"}
        </span>
      )}
    </Button>
  )
}
