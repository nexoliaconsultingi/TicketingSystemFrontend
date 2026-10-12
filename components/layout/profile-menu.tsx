"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Settings2 } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogoutButton } from "@/components/auth/logout-button"
import { getInitials } from "@/lib/auth"

/**
 * Menu du compte, ouvert par l'avatar de l'en-tête.
 *
 * L'avatar n'est pas qu'un portrait : c'est le seul endroit d'où l'on quitte
 * sa session ou l'on rejoint ses réglages. Les deux actions sont regroupées
 * ici parce qu'elles concernent la personne connectée, pas le dossier affiché.
 *
 * Le panneau se ferme au clic extérieur, à `Échap` et à tout changement de
 * page — un menu laissé ouvert après navigation flotterait au-dessus du nouvel
 * écran sans plus rien à voir avec lui.
 */
export function ProfileMenu({
  name,
  role,
  photo,
}: {
  name: string
  role: string
  photo?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const initials = getInitials(name)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const goToSettings = () => {
    setOpen(false)
    router.push("/settings")
  }

  return (
    <div className="relative" ref={containerRef}>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => setOpen(false)}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative z-40 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#183b56] focus-visible:ring-offset-2"
      >
        <Avatar className="size-9">
          {photo ? <AvatarImage src={photo} alt="" /> : null}
          <AvatarFallback className="bg-[#183b56] text-xs font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute top-full right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-[#e5eaf2] bg-white shadow-2xl"
        >
          <header className="flex items-center gap-3 border-b border-[#edf0f5] bg-[#f7f9fc] px-4 py-3">
            <Avatar className="size-10">
              {photo ? <AvatarImage src={photo} alt="" /> : null}
              <AvatarFallback className="bg-[#d7eeee] text-xs font-semibold text-[#176b6b]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#183b56]">{name}</p>
              <p className="truncate text-[11px] text-slate-500">{role}</p>
            </div>
          </header>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={goToSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#183b56] hover:bg-slate-50"
            >
              <Settings2 className="size-4 text-slate-400" />
              Settings
            </button>
          </div>

          <div className="border-t border-[#edf0f5] p-1.5">
            <LogoutButton menuItem />
          </div>
        </div>
      )}
    </div>
  )
}
