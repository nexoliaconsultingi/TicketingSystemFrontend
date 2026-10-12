"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCheck, Download, FileText, Loader2, Megaphone } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { UserAvatar } from "@/components/profile/user-avatar"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"
import {
  ApiError,
  recommendationApi,
  type Recommendation,
  type RecommendationScope,
} from "@/lib/api"

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Périmètre en une ligne.
 *
 * « Operations · Site A, Finance · 2 units » — le nom du département porte
 * l'information, le détail des unités ne servant qu'à dire l'ampleur. Le code
 * (`DEPT-014`) ne veut rien dire à qui lit un message, il ne sert que de repli
 * quand le département n'a pas de nom.
 */
const scopeSummary = (scopes: RecommendationScope[]): string =>
  scopes
    .map((scope) => {
      const name = scope.departmentName || scope.departmentCode
      return scope.units.length === 1
        ? `${name} · ${scope.units[0].name}`
        : `${name} · ${scope.units.length} units`
    })
    .join(", ")

/**
 * « Recommendations » : ce que l'organisation vous a adressé.
 *
 * Toute personne authentifiée ouvre cet écran : un message ne se réceptionne
 * que s'il vous vise — le serveur ne rend que ce qui vous appartient — mais la
 * section existe pour tout le monde, sinon un message ne serait jamais ouvert.
 * Ceux qui diffusent y figurent aussi comme lecteurs : leurs propres messages
 * ont leur écran, « My publications », d'où rien de ce qu'on envoie n'est
 * mêlé à ce qu'on reçoit.
 */
export default function RecommendationsPage() {
  return (
    <AuthGuard>
      <Recommendations />
    </AuthGuard>
  )
}

function Recommendations() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<Recommendation | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await recommendationApi.list(token)
      setItems(data)
      // Un message que son auteur retire ferme la lecture en cours : l'écran
      // ne reste pas ouvert sur quelque chose qui n'existe plus.
      setOpened((current) => (current && !data.some((row) => row._id === current._id) ? null : current))
    } catch (err) {
      // Une mise à jour ratée en arrière-plan laisse l'écran tel quel ; le
      // premier chargement, lui, porte l'erreur jusqu'à l'utilisateur.
      if (silent) return
      setError(err instanceof ApiError ? err.message : "Unable to load your recommendations.")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Temps réel : la publication ou le retrait d'un message qui vous vise
  // arrive par la room personnelle — l'écran se rafraîchit seul, sans reload.
  // Les rafraîchissements se groupent comme sur la file des tickets : une
  // publication et les gestes suivants ne déclenchent qu'un seul appel. Une
  // reconnexion rattrape au passage les événements passés pendant la coupure.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const socket = connectRealtime(token)
    let timer: ReturnType<typeof setTimeout> | undefined
    const onUpdated = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void load({ silent: true })
      }, 400)
    }
    const onReconnect = () => {
      void load({ silent: true })
    }
    socket.on("recommendations:updated", onUpdated)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("recommendations:updated", onUpdated)
      socket.io.off("reconnect", onReconnect)
    }
  }, [load])

  const unread = items.filter((item) => !item.read).length

  /** Ouverture d'un message : il passe pour lu, et le serveur le retient. */
  const openMessage = async (item: Recommendation) => {
    setOpened({ ...item, read: true })
    setDownloadError(null)
    if (item.read) return

    const token = getToken()
    if (!token) return

    setItems((current) => current.map((row) => (row._id === item._id ? { ...row, read: true } : row)))
    try {
      await recommendationApi.markRead(token, item._id)
    } catch {
      // La marque est annulée : un échec doit se voir, pas rester en creux.
      setItems((current) => current.map((row) => (row._id === item._id ? { ...row, read: false } : row)))
      setOpened((current) => (current?._id === item._id ? { ...current, read: false } : current))
    }
  }

  const markAllRead = async () => {
    const token = getToken()
    if (!token) return
    try {
      await recommendationApi.markAllRead(token)
      setItems((current) => current.map((row) => ({ ...row, read: true })))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to mark everything as read.")
    }
  }

  const download = async () => {
    const token = getToken()
    if (!token || !opened) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await recommendationApi.downloadAttachment(token, opened)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = opened.attachment?.name ?? "attachment"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "Unable to download the file.")
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Recommendations" subtitle="Loading your messages…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your recommendations…
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Recommendations"
      subtitle={
        unread > 0
          ? `${unread} message${unread > 1 ? "s" : ""} waiting to be read.`
          : "Messages from management addressed to your units."
      }
      breadcrumb="My work"
      actions={
        unread > 0 ? (
          <Button variant="outline" className="gap-2" onClick={() => void markAllRead()}>
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-[#e5eaf2] bg-white px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-[#edf8f8] text-[#1aa6a6]">
              <Megaphone className="size-5" />
            </div>
            <h2 className="text-[15px] font-semibold text-[#183b56]">No recommendation yet</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-slate-500">
              Messages addressed to your units will appear here, with any attached document.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white">
            {items.map((item) => (
              <div key={item._id} className="border-b border-[#edf0f5] last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
                  onClick={() => void openMessage(item)}
                >
                  {/* Le point dit « à lire » sans reprendre le titre : la couleur
                      suffit, et le titre reste une phrase entière. */}
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-[#1aa6a6]"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[14px] ${item.read ? "font-medium text-slate-600" : "font-semibold text-[#183b56]"}`}
                    >
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-slate-500">
                      <UserAvatar
                        userId={item.createdBy}
                        name={item.createdByName}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="truncate">
                        {item.createdByName || "Management"} · {formatDate(item.createdAt)} ·{" "}
                        {scopeSummary(item.scopes)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {item.attachment && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#dce5ed] bg-[#f7f9fc] px-2 py-0.5 text-[11px] font-medium text-[#183b56]">
                        <FileText className="size-3" />
                        {item.attachment.mimeType === "application/pdf" ? "PDF" : "PNG"}
                      </span>
                    )}
                    {!item.read && (
                      <span className="rounded-full bg-[#1aa6a6]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f7c7c]">
                        New
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened?.title ?? ""}
        description={opened ? `${formatDate(opened.createdAt)}` : undefined}
        size="lg"
        centerOnMobile
        footer={<Button variant="outline" onClick={() => setOpened(null)}>Close</Button>}
      >
        {opened && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                From
              </h3>
              <div className="flex items-center gap-3">
                <UserAvatar userId={opened.createdBy} name={opened.createdByName} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[#183b56]">
                    {opened.createdByName || "Management"}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Addressed to
              </h3>
              <div className="space-y-2.5">
                {opened.scopes.map((scope) => (
                  <div key={scope.departmentCode}>
                    <p className="text-[13px] font-semibold text-[#183b56]">
                      {scope.departmentName || scope.departmentCode}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {scope.units.map((unit) => (
                        <span
                          key={unit.path}
                          className="rounded-full border border-[#dce5ed] bg-[#f7f9fc] px-2 py-0.5 text-[11.5px] text-slate-600"
                        >
                          {unit.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="whitespace-pre-line text-[13.5px] leading-6 text-slate-700">
              {opened.message}
            </p>

            {opened.attachment && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-[#e5eaf2] bg-[#f7f9fc] px-3.5 py-3">
                  <FileText className="size-4 shrink-0 text-[#1aa6a6]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#183b56]">
                      {opened.attachment.name}
                    </span>
                    <span className="block text-[11.5px] text-slate-500">
                      {opened.attachment.mimeType === "application/pdf" ? "PDF" : "PNG"} ·{" "}
                      {formatSize(opened.attachment.size)}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void download()}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download
                  </Button>
                </div>
                {downloadError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                    {downloadError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}
