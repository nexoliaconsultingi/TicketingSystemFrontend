"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Eye, Loader2, Megaphone, Plus, Trash2 } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { UserAvatar } from "@/components/profile/user-avatar"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"
import { useSessionUser } from "@/lib/use-session"
import {
  ApiError,
  recommendationApi,
  type RecommendationAudienceMember,
  type RecommendationScope,
  type SentRecommendation,
} from "@/lib/api"

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

/**
 * Périmètre en une ligne — même libellé que la réception, pour que le même
 * message se reconnaisse des deux côtés de l'organisation.
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
 * « My publications » : ce que vous avez diffusé vous-même.
 *
 * L'écran n'appartient qu'à ceux qui diffusent — un employé qui pousserait
 * l'URL est renvoyé vers sa réception, l'API de ce relevé lui répondant 403.
 * Il se lit à l'envers de l'autre écran : rien à ouvrir, seulement l'effectif
 * touché, ce qui en a été lu, et le retrait possible d'un message. Les deux
 * activités ne se mêlent plus : la réception ne montre que ce qu'on reçoit.
 */
export default function PublishedRecommendationsPage() {
  return (
    <AuthGuard>
      <PublishedRecommendations />
    </AuthGuard>
  )
}

function PublishedRecommendations() {
  const router = useRouter()
  const user = useSessionUser()
  const isPublisher = Boolean(
    user && (user.access.includes("admin") || user.access.includes("manager")),
  )

  const [sent, setSent] = useState<SentRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SentRecommendation | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  /** Publication ouverte : son détail et l'effectif de ses lecteurs. */
  const [detail, setDetail] = useState<SentRecommendation | null>(null)
  const [audience, setAudience] = useState<RecommendationAudienceMember[] | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)
  /** La publication ouverte, pour la lire depuis le gestionnaire d'événements. */
  const detailIdRef = useRef<string | null>(null)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      setSent(await recommendationApi.sent(token))
    } catch (err) {
      if (silent) return
      setError(err instanceof ApiError ? err.message : "Unable to load your publications.")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadAudience = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setAudienceLoading(true)
      setAudienceError(null)
    }
    try {
      const data = await recommendationApi.audience(token, id)
      setAudience(data.recipients)
    } catch (err) {
      if (silent) return
      setAudienceError(err instanceof ApiError ? err.message : "Unable to load the readers.")
    } finally {
      if (!silent) setAudienceLoading(false)
    }
  }, [])

  const openDetail = (item: SentRecommendation) => {
    detailIdRef.current = item._id
    setDetail(item)
    setAudience(null)
    setAudienceError(null)
    void loadAudience(item._id)
  }

  const closeDetail = () => {
    detailIdRef.current = null
    setDetail(null)
    setAudience(null)
    setAudienceError(null)
  }

  useEffect(() => {
    void load()
  }, [load])

  // Le relevé se périme entre deux visites : les lectures bougent dès qu'un
  // destinataire ouvre un message. Un retour d'onglet suffit pour rattraper,
  // et la room personnelle porte déjà chaque lecture — le temps réel ci-dessous
  // fait le reste. Le détail ouvert se rafraîchit avec le relevé.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      void load({ silent: true })
      const id = detailIdRef.current
      if (id) void loadAudience(id, { silent: true })
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [load, loadAudience])

  // Temps réel : une lecture arrive à l'auteur à la seconde où elle se produit.
  // Les rafraîchissements se groupent comme sur la file des tickets — plusieurs
  // lectures en même temps ne déclenchent qu'un appel. Une reconnexion rattrape
  // les lectures passées pendant la coupure.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const socket = connectRealtime(token)
    let timer: ReturnType<typeof setTimeout> | undefined
    const onRead = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void load({ silent: true })
        const id = detailIdRef.current
        if (id) void loadAudience(id, { silent: true })
      }, 400)
    }
    const onReconnect = () => {
      void load({ silent: true })
      const id = detailIdRef.current
      if (id) void loadAudience(id, { silent: true })
    }
    socket.on("recommendations:read", onRead)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("recommendations:read", onRead)
      socket.io.off("reconnect", onReconnect)
    }
  }, [load, loadAudience])

  // Un employé n'a rien à voir ici : la publication est refusée à son rôle,
  // la page l'est aussi. L'effet redirige, le rendu tient la porte.
  useEffect(() => {
    if (user && !isPublisher) router.replace("/recommendations")
  }, [user, isPublisher, router])

  /** Retirer une publication demande confirmation : le geste part à tous. */
  const confirmDelete = (item: SentRecommendation) => {
    setDeleteTarget(item)
    setDeleteError(null)
  }

  const removeSent = async () => {
    const token = getToken()
    if (!token || !deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await recommendationApi.remove(token, deleteTarget._id)
      setSent((current) => current.filter((row) => row._id !== deleteTarget._id))
      // Le message n'existe plus : un détail qui le montrerait encore mentirait.
      if (detailIdRef.current === deleteTarget._id) {
        detailIdRef.current = null
        setDetail(null)
        setAudience(null)
        setAudienceError(null)
      }
      setDeleteTarget(null)
    } catch (err) {
      // La boîte reste ouverte : l'échec se lit à côté du bouton, pas dans le vide.
      setDeleteError(err instanceof ApiError ? err.message : "Unable to delete this recommendation.")
    } finally {
      setDeleting(false)
    }
  }

  if (!user || !isPublisher) {
    return (
      <DashboardShell title="My publications" subtitle="Checking your access…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Checking your access…
        </p>
      </DashboardShell>
    )
  }

  if (loading) {
    return (
      <DashboardShell title="My publications" subtitle="Loading your publications…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your publications…
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="My publications"
      subtitle={
        sent.length > 0
          ? `${sent.length} message${sent.length > 1 ? "s" : ""} sent to the organisation.`
          : "Messages you published to the selected units."
      }
      breadcrumb="My work"
      actions={
        <Button className="gap-2" onClick={() => router.push("/recommendations/new")}>
          <Plus className="size-4" />
          New recommendation
        </Button>
      }
    >
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {sent.length === 0 ? (
          <div className="rounded-xl border border-[#e5eaf2] bg-white px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-[#edf8f8] text-[#1aa6a6]">
              <Megaphone className="size-5" />
            </div>
            <h2 className="text-[15px] font-semibold text-[#183b56]">No publication yet</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-slate-500">
              Messages you send to your units appear here, with how many people have read them.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white">
            {sent.map((item) => (
              <div
                key={item._id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#edf0f5] px-4 py-3 text-[13px] last:border-b-0 sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[#183b56]">{item.title}</span>
                  <span className="block truncate text-[12.5px] text-slate-500">
                    {formatDate(item.createdAt)} · {scopeSummary(item.scopes)}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-slate-500">
                  {item.recipientCount} recipient{item.recipientCount === 1 ? "" : "s"}
                </span>
                <span className="shrink-0 text-[12.5px] text-slate-500">
                  {item.readCount} read
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openDetail(item)}
                >
                  <Eye className="size-3.5" />
                  View
                </Button>
                <button
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  title="Delete this recommendation"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#e5eaf2] text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  onClick={() => confirmDelete(item)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suppression : une confirmation, car le message quitte la réception de
          tous et chacun reçoit l'annonce du retrait. */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => {
          if (deleting) return
          setDeleteTarget(null)
          setDeleteError(null)
        }}
        title="Delete this recommendation?"
        description={
          deleteTarget
            ? `${deleteTarget.title} · ${deleteTarget.recipientCount} recipient${deleteTarget.recipientCount === 1 ? "" : "s"} will be notified.`
            : undefined
        }
        centerOnMobile
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => void removeSent()} disabled={deleting}>
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13.5px] leading-6 text-slate-700">
          <p>
            The message disappears from every recipient&apos;s list right away, and each of them
            receives a notification naming you as the one who removed it. This cannot be undone.
          </p>
          {deleteError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {deleteError}
            </p>
          )}
        </div>
      </Modal>

      {/* Suivi des lectures : le message, et qui l'a ouvert — visages à l'appui.
          Les lectures arrivent en direct dès qu'un destinataire ouvre le
          message, la liste se met à jour sans qu'on fasse quoi que ce soit. */}
      <Modal
        open={detail !== null}
        onClose={closeDetail}
        title={detail?.title ?? ""}
        description={
          detail ? `${formatDate(detail.createdAt)} · ${scopeSummary(detail.scopes)}` : undefined
        }
        size="lg"
        centerOnMobile
        footer={<Button variant="outline" onClick={closeDetail}>Close</Button>}
      >
        {detail && (
          <div className="space-y-5">
            <p className="whitespace-pre-line text-[13.5px] leading-6 text-slate-700">
              {detail.message}
            </p>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Recipients
                </h3>
                {audience && !audienceLoading && !audienceError && (
                  <span className="text-[12px] text-slate-500">
                    {audience.filter((member) => member.read).length} of {audience.length} read
                  </span>
                )}
              </div>

              {audienceLoading && (
                <p className="flex items-center gap-2 text-[13px] text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading the readers…
                </p>
              )}

              {audienceError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  {audienceError}
                </p>
              )}

              {!audienceLoading && !audienceError && audience !== null && (
                audience.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#dce5ed] bg-[#f7f9fc] px-4 py-3 text-[12.5px] text-slate-500">
                    No account matched this scope.
                  </p>
                ) : (
                  <div className="max-h-72 divide-y divide-[#f2f5f9] overflow-y-auto rounded-lg border border-[#edf0f5]">
                    {audience.map((member) => (
                      <div key={member._id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <UserAvatar userId={member._id} name={member.name} photo={member.photo} size="sm" className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-[#183b56]">{member.name}</span>
                          <span className="block truncate text-[11.5px] text-slate-400">{member.email}</span>
                        </span>
                        <span className="hidden shrink-0 rounded bg-[#eef4fa] px-2 py-0.5 text-[11px] text-[#183b56] sm:inline">
                          {member.unitName ?? member.unitPath}
                        </span>
                        {member.read ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="size-3" />
                            Read
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[#f1f3f7] px-2 py-0.5 text-[11px] font-medium text-slate-400">
                            Not read yet
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}
