"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { UserAvatar } from "@/components/profile/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"
import { useSessionUser } from "@/lib/use-session"
import {
  ApiError,
  KNOWLEDGE_ATTACHMENT_LABELS,
  knowledgeApi,
  type KnowledgeArticle,
  type KnowledgeCreator,
  type KnowledgeTargets,
} from "@/lib/api"

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * « Knowledge base » : la référence générale du ticketing.
 *
 * Toute personne authentifiée ouvre cet écran et y cherche une solution déjà
 * consignée — par département, secteur d'activité, unité, auteur ou mot du
 * texte. Seuls l'administration et les superviseurs voient le bouton de
 * création, qui mène au formulaire dédié.
 */
export default function KnowledgePage() {
  return (
    <AuthGuard>
      <Knowledge />
    </AuthGuard>
  )
}

function Knowledge() {
  const user = useSessionUser()
  const canManage = Boolean(
    user && (user.access.includes("admin") || user.access.includes("manager")),
  )

  const [items, setItems] = useState<KnowledgeArticle[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [targets, setTargets] = useState<KnowledgeTargets | null>(null)
  const [creators, setCreators] = useState<KnowledgeCreator[]>([])

  const [q, setQ] = useState("")
  const [departmentCode, setDepartmentCode] = useState("")
  const [unitPath, setUnitPath] = useState("")
  const [sector, setSector] = useState("")
  const [createdBy, setCreatedBy] = useState("")

  const [opened, setOpened] = useState<KnowledgeArticle | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await knowledgeApi.list(token, {
        q: q.trim() || undefined,
        departmentCode: departmentCode || undefined,
        unitPath: unitPath || undefined,
        createdBy: createdBy || undefined,
      })
      setItems(data)
      // Un article que son auteur retire ferme la lecture en cours ; un article
      // corrigé est relu à neuf dans la fiche ouverte.
      setOpened((current) => {
        if (!current) return current
        const fresh = data.find((row) => row._id === current._id)
        return fresh ?? null
      })
    } catch (err) {
      // Une mise à jour ratée en arrière-plan laisse l'écran tel quel ; le
      // premier chargement, lui, porte l'erreur jusqu'à l'utilisateur.
      if (silent) return
      setError(err instanceof ApiError ? err.message : "Unable to load the knowledge base.")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [q, departmentCode, unitPath, sector, createdBy])

  // Les « trois » sources — liste, écrans de filtrage, auteurs — partent ensemble.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    void knowledgeApi
      .targets(token)
      .then(setTargets)
      .catch(() => setError("Unable to load the departments and units."))
    void knowledgeApi
      .creators(token)
      .then(setCreators)
      .catch(() => setError("Unable to load the article authors."))
  }, [])

  // La saisie du texte déclenche une recherche différée : pas d'appel par
  // frappe, une seule requête une fois la main levée.
  useEffect(() => {
    const timer = setTimeout(() => void load(), q.trim() ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, q])

  // Temps réel : un article créé, corrigé ou retiré par un autre poste arrive
  // par `knowledge:updated` — la liste se met à jour d'elle-même, sans reload.
  // Les rafraîchissements se groupent comme sur la file des tickets : plusieurs
  // gestes rapprochés ne déclenchent qu'un seul appel. Une reconnexion rattrape
  // au passage les événements passés pendant la coupure.
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
    socket.on("knowledge:updated", onUpdated)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("knowledge:updated", onUpdated)
      socket.io.off("reconnect", onReconnect)
    }
  }, [load])

  // Les filtres dépendants : unités et secteurs du département sélectionné.
  const unitsOfDepartment = useMemo(
    () =>
      (targets?.units ?? [])
        .filter((unit) => unit.departmentCode === departmentCode)
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
    [targets, departmentCode],
  )
  const selectedDepartment = useMemo(
    () => (targets?.departments ?? []).find((department) => department.code === departmentCode),
    [targets, departmentCode],
  )

  // Changer de département vide les filtres de son unité et de son secteur :
  // les valeurs précédentes n'appartiennent plus à ce département.
  const onDepartmentChange = (code: string) => {
    setDepartmentCode(code)
    setUnitPath("")
    setSector("")
  }

  const download = async () => {
    const token = getToken()
    if (!token || !opened || !opened.attachment) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await knowledgeApi.downloadAttachment(token, opened)
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

  const remove = async (article: KnowledgeArticle) => {
    const token = getToken()
    if (!token) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await knowledgeApi.remove(token, article._id)
      setItems((current) => current?.filter((row) => row._id !== article._id) ?? current)
      setCreators((current) =>
        current
          .map((creator) =>
            creator._id === String(article.createdBy)
              ? { ...creator, count: creator.count - 1 }
              : creator,
          )
          .filter((creator) => creator.count > 0),
      )
      // Un article retiré depuis sa ligne ne doit pas rester ouvert en lecture.
      if (opened?._id === article._id) setOpened(null)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Unable to delete the article.")
    } finally {
      setDeleting(false)
    }
  }

  const canDelete = (article: KnowledgeArticle) =>
    String(article.createdBy) === String(user?._id) || user?.access.includes("admin") === true

  if (loading && items === null) {
    return (
      <DashboardShell title="Knowledge base" subtitle="Loading the reference…" breadcrumb="Recommendations">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading the knowledge base…
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Knowledge base"
      subtitle="Solutions consigned by administrators and supervisors."
      breadcrumb="Recommendations"
      actions={
        canManage ? (
          <Link href="/knowledge/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              New article
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {/* Barre de filtres : on rétrécit la base, on ne la parcourt pas. */}
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search a problem, a solution…"
                className="h-10 pl-9"
              />
            </div>
            <Select value={departmentCode} onChange={(event) => onDepartmentChange(event.target.value)} className="h-10">
              <option value="">All departments</option>
              {(targets?.departments ?? []).map((department) => (
                <option key={department.code} value={department.code}>
                  {department.name}
                </option>
              ))}
            </Select>
            <Select
              value={unitPath}
              onChange={(event) => setUnitPath(event.target.value)}
              className="h-10"
              disabled={!selectedDepartment}
            >
              <option value="">All units</option>
              {unitsOfDepartment.map((unit) => (
                <option key={unit.path} value={unit.path}>
                  {unit.name}
                </option>
              ))}
            </Select>
            <Select value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} className="h-10">
              <option value="">All authors</option>
              {creators.map((creator) => (
                <option key={creator._id} value={creator._id}>
                  {creator.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-3 text-[11.5px] text-slate-400">
            Filter by department, unit and author.
          </p>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-[13px] text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Searching…
          </p>
        ) : items !== null && items.length === 0 ? (
          <div className="rounded-xl border border-[#e5eaf2] bg-white px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-[#edf8f8] text-[#1aa6a6]">
              <BookOpen className="size-5" />
            </div>
            <h2 className="text-[15px] font-semibold text-[#183b56]">No article matches</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-slate-500">
              {q.trim() || departmentCode || sector || unitPath || createdBy
                ? "Widen the search or clear some filters."
                : "Administrators and supervisors consign their solutions here, with any attached document."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white">
            {(items ?? []).map((article) => (
              <div key={article._id} className="border-b border-[#edf0f5] last:border-b-0">
                <div className="flex w-full items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
                  <UserAvatar
                    userId={article.createdBy}
                    name={article.createdByName}
                    className="mt-0.5 shrink-0"
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpened(article)
                      setDownloadError(null)
                      setDeleteError(null)
                    }}
                  >
                    <span className="block truncate text-[14px] font-semibold text-[#183b56]">
                      {article.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-slate-500">
                      <span className="truncate">
                        {article.departmentName || article.departmentCode} ·{" "}
                        {article.unitName || article.unitPath} · by {article.createdByName} ·{" "}
                        {formatDate(article.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {article.sector && (
                        <span className="rounded-full border border-[#1aa6a6]/20 bg-[#1aa6a6]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f7c7c]">
                          {article.sector}
                        </span>
                      )}
                      {article.attachment && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#dce5ed] bg-[#f7f9fc] px-2 py-0.5 text-[11px] font-medium text-[#183b56]">
                          <FileText className="size-3" />
                          {KNOWLEDGE_ATTACHMENT_LABELS[article.attachment.mimeType]}
                        </span>
                      )}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      className="gap-1"
                      onClick={() => {
                        setOpened(article)
                        setDownloadError(null)
                        setDeleteError(null)
                      }}
                    >
                      <Eye className="size-3" />
                      View
                    </Button>
                    {String(article.createdBy) === String(user?._id) && (
                      <Link href={`/knowledge/${article._id}/edit`}>
                        <Button variant="outline" size="xs" className="gap-1">
                          <Pencil className="size-3" />
                          Update
                        </Button>
                      </Link>
                    )}
                    {canDelete(article) && (
                      <Button
                        variant="outline"
                        size="xs"
                        className="gap-1 text-red-600"
                        onClick={() => void remove(article)}
                        disabled={deleting}
                      >
                        {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                        Delete
                      </Button>
                    )}
                  </span>
                </div>
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
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {opened && String(opened.createdBy) === String(user?._id) && (
                <Link href={`/knowledge/${opened._id}/edit`}>
                  <Button variant="outline" className="w-full gap-2 sm:w-auto">
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                </Link>
              )}
              {opened && canDelete(opened) && (
                <Button variant="outline" className="gap-2 text-red-600" onClick={() => void remove(opened)} disabled={deleting}>
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Delete
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setOpened(null)}>
              Close
            </Button>
          </div>
        }
      >
        {opened && (
          <div className="space-y-5">
            {deleteError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {deleteError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {opened.sector && (
                <span className="rounded-full border border-[#1aa6a6]/20 bg-[#1aa6a6]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f7c7c]">
                  {opened.sector}
                </span>
              )}
              <span className="rounded-full border border-[#dce5ed] bg-[#f7f9fc] px-2 py-0.5 text-[11.5px] text-slate-600">
                {opened.departmentName || opened.departmentCode}
              </span>
              <span className="rounded-full border border-[#dce5ed] bg-[#f7f9fc] px-2 py-0.5 text-[11.5px] text-slate-600">
                {opened.unitName || opened.unitPath}
              </span>
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Written by
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
                Description
              </h3>
              <p className="whitespace-pre-line text-[13.5px] leading-6 text-slate-700">
                {opened.description}
              </p>
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Resolution technique
              </h3>
              <div className="rounded-xl border border-[#e5eaf2] bg-[#f7f9fc] p-4">
                <p className="whitespace-pre-line text-[13.5px] leading-6 text-slate-700">
                  {opened.resolutionTechnique}
                </p>
              </div>
            </div>

            {opened.attachment && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-[#e5eaf2] bg-[#f7f9fc] px-3.5 py-3">
                  <FileText className="size-4 shrink-0 text-[#1aa6a6]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#183b56]">
                      {opened.attachment.name}
                    </span>
                    <span className="block text-[11.5px] text-slate-500">
                      {KNOWLEDGE_ATTACHMENT_LABELS[opened.attachment.mimeType]} ·{" "}
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