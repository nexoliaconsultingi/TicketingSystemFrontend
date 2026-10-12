"use client"

import { useEffect } from "react"
import { Bell, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { useNotifications } from "@/components/realtime/notifications-provider"
import { relativeAge } from "@/components/tickets/shared"
import { Button } from "@/components/ui/button"
import type { NotificationItem } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Le point de couleur : lisible en douze pixels, sur fond blanc. */
const DOT_CLASS: Record<NotificationItem["type"], string> = {
  info: "bg-[#1aa6a6]",
  success: "bg-[#22a06b]",
  warning: "bg-[#e8a33d]",
  error: "bg-[#e45858]",
}

/**
 * La cloche du compte : compteur, panneau, notifications en temps réel.
 *
 * Ouvrir le panneau suffit à effacer le chiffre — c'est le fournisseur qui en
 * décide, ici on se contente de l'ouvrir. Un compteur qui exigerait un clic par
 * notification serait un compteur que l'on laisse traîner.
 */
export function NotificationBell() {
  const { items, unread, open, openPanel, closePanel, clear } = useNotifications()
  const router = useRouter()

  /**
   * Les lignes encore signalées comme neuves.
   *
   * L'ouverture a déjà remis le compteur à zéro : ce chiffre, lui, tient jusqu'à
   * la fermeture. C'est lui qui répond au soupçon — le nombre affiché sur la
   * cloche et le nombre de lignes marquées sont le même, et se comptent.
   */
  const newCount = items.filter((item) => !item.read).length

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, closePanel])

  const openItem = (item: NotificationItem) => {
    closePanel()
    if (item.link) router.push(item.link)
  }

  return (
    <div className="relative">
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-30 cursor-default"
          onClick={closePanel}
        />
      )}

      <Button
        variant="ghost"
        size="icon"
        className="relative z-40"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e45858] px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-40 mt-2 flex w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-[#e5eaf2] bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#edf0f5] bg-[#f7f9fc] px-4 py-3">
            <p className="text-sm font-semibold text-[#183b56]">Notifications</p>
            <div className="flex items-center gap-2">
              {newCount > 0 && (
                <span className="rounded-full bg-[#e45858]/10 px-2 py-0.5 text-[11px] font-semibold text-[#e45858]">
                  {newCount} new
                </span>
              )}
              {items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={clear}
                  className="gap-1.5 text-slate-500"
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </header>

          <div className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="size-6 text-slate-300" />
                <p className="text-sm text-slate-500">You are all caught up</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#f1f4f9]">
                {items.map((item) => {
                  // Les lignes non lues portent la marque : c'est à elles que
                  // renvoie le chiffre de la cloche, avant comme après l'ouverture.
                  const isNew = !item.read

                  return (
                    <li key={item._id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50",
                          isNew && "bg-[#f2f7fb]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            isNew
                              ? (DOT_CLASS[item.type] ?? DOT_CLASS.info)
                              : "bg-slate-200",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-[13px]",
                                isNew
                                  ? "font-semibold text-[#183b56]"
                                  : "font-normal text-slate-400",
                              )}
                            >
                              {item.title}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[11px]",
                                isNew ? "text-slate-500" : "text-slate-300",
                              )}
                            >
                              {relativeAge(item.createdAt)}
                            </span>
                          </span>
                          {item.message && (
                            <span
                              className={cn(
                                "mt-0.5 block text-[12.5px] leading-snug",
                                isNew ? "text-slate-500" : "text-slate-400",
                              )}
                            >
                              {item.message}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
