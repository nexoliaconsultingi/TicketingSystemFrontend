"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { UserAvatar } from "@/components/profile/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getToken } from "@/lib/auth"
import { useSessionUser } from "@/lib/use-session"
import {
  ApiError,
  RECOMMENDATION_MAX_BYTES,
  recommendationApi,
  type CreateRecommendationInput,
  type CreatedRecommendation,
  type RecommendationAttachment,
  type RecommendationRecipient,
  type RecommendationScope,
  type RecommendationTargets,
} from "@/lib/api"

/** Seuls ces formats sont acceptés, à l'écran comme au serveur. */
const ACCEPTED_TYPES = ["application/pdf", "image/png"]

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

/**
 * Périmètre en une ligne — même libellé que les deux autres écrans, pour que le
 * même message se reconnaisse de partout : « Operations · Site A ».
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

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * « New recommendation » : diffuser un message aux équipes.
 *
 * L'administrateur et le superviseur publient ; un collaborateur qui ouvrirait
 * cet écran par l'adresse n'y trouverait que le refus — le serveur refuse de
 * toute façon, et l'écran le dit avant d'avoir fait appeler l'API.
 *
 * Le périmètre est déclaré en deux temps : le département d'abord, ses unités
 * ensuite. Une seule liste de toutes les unités de l'entreprise obligerait à
 * connaître l'organigramme par cœur pour viser juste.
 */
export default function NewRecommendationPage() {
  return (
    <AuthGuard>
      <NewRecommendation />
    </AuthGuard>
  )
}

function NewRecommendation() {
  const router = useRouter()
  const user = useSessionUser()
  const isPublisher = Boolean(
    user && (user.access.includes("admin") || user.access.includes("manager")),
  )

  if (user === null) {
    return (
      <DashboardShell title="New recommendation" subtitle="Checking your access…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Checking your access…
        </p>
      </DashboardShell>
    )
  }

  if (!isPublisher) {
    return <PublishDenied onBack={() => router.replace("/recommendations")} />
  }

  return <RecommendationForm onDone={() => router.replace("/recommendations/published")} />
}

/**
 * Refus poli.
 *
 * Même forme que le refus de la section d'administration : un cadre, une raison,
 * une issue. « Accès refusé » brut laisserait croire à une erreur.
 */
function PublishDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f7f9fc] px-5 text-[#172033]">
      <div className="w-full max-w-md rounded-xl border border-[#e5eaf2] bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-lg font-semibold text-[#183b56]">Publication not available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Recommendations are published by administrators and supervisors. You can still read the
          messages addressed to you.
        </p>
        <Button className="mt-6 w-full" onClick={onBack}>
          Back to recommendations
        </Button>
      </div>
    </div>
  )
}

function RecommendationForm({ onDone }: { onDone: () => void }) {
  const [targets, setTargets] = useState<RecommendationTargets | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  /** Départements retenus, et pour chacun les chemins d'unités cochés. */
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [departmentToAdd, setDepartmentToAdd] = useState("")
  const [attachment, setAttachment] = useState<(RecommendationAttachment & { data: string }) | null>(
    null,
  )
  const [fileError, setFileError] = useState<string | null>(null)
  /** Membres des unités cochées : tous gardés par défaut, quelques-uns écarter. */
  const [members, setMembers] = useState<RecommendationRecipient[] | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  /** Identifiants des membres décochés — la seule chose qu'on envoie au serveur. */
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set())
  /** Relance le chargement de l'effectif après un échec. */
  const [retryTick, setRetryTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [published, setPublished] = useState<CreatedRecommendation | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    void recommendationApi
      .targets(token)
      .then(setTargets)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Unable to load the organization."),
      )
      .finally(() => setLoading(false))
  }, [])

  /**
   * L'effectif des unités cochées.
   *
   * Chargé à chaque changement de périmètre pour deux raisons : l'auteur voit
   * à qui il parle avant d'envoyer, et il peut écarter des membres un par un.
   * La liste doit rester fidèle à ce que le serveur publiera — d'où l'appel au
   * serveur plutôt qu'une liste d'utilisateurs prise ailleurs. Une réponse
   * tardive d'une requête abandonnée est ignorée via `cancelled`.
   */
  useEffect(() => {
    const token = getToken()
    const paths = Object.values(selections).flat()
    if (!token || paths.length === 0) {
      setMembers(null)
      setMembersLoading(false)
      setMembersError(null)
      setExcludedIds(new Set())
      return
    }

    let cancelled = false
    setMembersLoading(true)
    setMembersError(null)
    void recommendationApi
      .recipients(token, paths)
      .then((list) => {
        if (cancelled) return
        setMembers(list)
        // Nouveau périmètre : tout le monde repart coché.
        setExcludedIds(new Set())
      })
      .catch((err) => {
        if (cancelled) return
        setMembers(null)
        setMembersError(
          err instanceof ApiError ? err.message : "Unable to load the members of these units.",
        )
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selections, retryTick])

  const selectedCount = Object.values(selections).reduce((total, paths) => total + paths.length, 0)
  const memberCount = members?.length ?? 0
  const keptCount = memberCount - excludedIds.size
  // Publier exige un destinataire connu : l'effectif doit être chargé, sans
  // erreur, et ne pas avoir été entièrement décoché.
  const canPublish =
    title.trim().length >= 3 &&
    message.trim().length >= 1 &&
    selectedCount > 0 &&
    !membersLoading &&
    !membersError &&
    members !== null &&
    keptCount > 0 &&
    !saving

  const toggleUnit = (code: string, path: string) => {
    setSelections((current) => {
      const selected = new Set(current[code] ?? [])
      if (selected.has(path)) selected.delete(path)
      else selected.add(path)
      return { ...current, [code]: [...selected] }
    })
  }

  const removeDepartment = (code: string) => {
    setSelections((current) => {
      const rest = { ...current }
      delete rest[code]
      return rest
    })
  }

  const toggleMember = (id: string) => {
    setExcludedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** « Tout le monde » : cocher réintègre tous les membres, décocher les retire tous. */
  const setEveryMember = (checked: boolean) => {
    if (checked || !members) setExcludedIds(new Set())
    else setExcludedIds(new Set(members.map((member) => member._id)))
  }

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    // Le champ se remet à zéro : reprendre le même fichier après l'avoir retiré
    // doit déclencher cet événement, sinon le second choix n'arrive jamais.
    event.target.value = ""
    setFileError(null)
    setAttachment(null)
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Only PDF and PNG files can be attached.")
      return
    }
    if (file.size > RECOMMENDATION_MAX_BYTES) {
      setFileError("The file must be 4 MB or smaller.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        name: file.name,
        mimeType: file.type as "application/pdf" | "image/png",
        size: file.size,
        data: String(reader.result),
      })
    }
    reader.onerror = () => setFileError("Unable to read the file.")
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    const token = getToken()
    if (!token || !canPublish) return
    setSaving(true)
    setPublishError(null)
    try {
      const scopes = Object.entries(selections)
        .filter(([, paths]) => paths.length > 0)
        .map(([departmentCode, unitPaths]) => ({ departmentCode, unitPaths }))

      const input: CreateRecommendationInput = {
        title: title.trim(),
        message: message.trim(),
        scopes,
      }
      // Seuls les membres décochés partent : le périmètre reste la règle, et
      // c'est le serveur qui en retire les identifiants.
      if (excludedIds.size) input.excludedUserIds = [...excludedIds]
      if (attachment) input.attachment = attachment

      const created = await recommendationApi.create(token, input)
      setPublished(created)
      // Une publication réussie repart d'une page vierge : le titre, le texte et
      // le périmètre appartiennent au message envoyé, pas à celui qui vient.
      setTitle("")
      setMessage("")
      setSelections({})
      setAttachment(null)
      setFileError(null)
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : "Unable to publish the message.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell title="New recommendation" subtitle="Loading the organization…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading departments and units…
        </p>
      </DashboardShell>
    )
  }

  if (published) {
    return (
      <DashboardShell title="New recommendation" subtitle="Published." breadcrumb="Recommendations">
        <div className="space-y-5">
          <div className="rounded-xl border border-[#e5eaf2] bg-white px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <h2 className="text-[15px] font-semibold text-[#183b56]">Recommendation published</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-slate-500">
              {published.recipientCount > 0
                ? `Delivered to ${published.recipientCount} recipient${published.recipientCount === 1 ? "" : "s"}. They have been notified.`
                : "No account matches this scope yet — nothing was delivered."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setPublished(null)}>
                <Plus className="size-4" />
                Publish another
              </Button>
              <Button className="gap-2" onClick={onDone}>
                <ArrowLeft className="size-4" />
                Back to recommendations
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#e5eaf2] bg-white p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-[#183b56]">{published.title}</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {formatDate(published.createdAt)} · {scopeSummary(published.scopes)}
            </p>
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-6 text-slate-700">
              {published.message}
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Recipients
                </h3>
                {published.recipientCount > 0 && (
                  <span className="text-[12px] text-slate-500">
                    {published.recipientCount} member{published.recipientCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {published.recipients.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#dce5ed] bg-[#f7f9fc] px-4 py-3 text-[12.5px] text-slate-500">
                  No account matched this scope at publication time.
                </p>
              ) : (
                <div className="max-h-72 divide-y divide-[#f2f5f9] overflow-y-auto rounded-lg border border-[#edf0f5]">
                  {published.recipients.map((member) => (
                    <div key={member._id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <UserAvatar userId={member._id} name={member.name} photo={member.photo} size="sm" className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[#183b56]">{member.name}</span>
                        <span className="block truncate text-[11.5px] text-slate-400">{member.email}</span>
                      </span>
                      <span className="hidden shrink-0 rounded bg-[#eef4fa] px-2 py-0.5 text-[11px] text-[#183b56] sm:inline">
                        {member.unitName ?? member.unitPath}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  const chosenDepartments = Object.keys(selections)
  const addableDepartments = (targets?.departments ?? []).filter(
    (department) => !(department.code in selections),
  )
  const unitsOf = (code: string) =>
    (targets?.units ?? [])
      .filter((unit) => unit.departmentCode === code)
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))

  return (
    <DashboardShell
      title="New recommendation"
      subtitle="Address a message to whole departments or to some of their units."
      breadcrumb="Recommendations"
      actions={
        <Button variant="outline" className="gap-2" onClick={onDone}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      }
    >
      <div className="space-y-5">
        {loadError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {loadError}
          </p>
        )}

        <div className="space-y-5 rounded-xl border border-[#e5eaf2] bg-white p-5 sm:p-6">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Title</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Safety briefing on Friday"
              maxLength={150}
              autoFocus
            />
            <span className="block text-[11.5px] text-slate-400">
              What the message is about, in one line. At least 3 characters.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Message</span>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Everyone on the branch attends the safety briefing at 14:00 on Friday."
              rows={6}
              maxLength={5000}
            />
            <span className="block text-[11.5px] text-slate-400">
              The text everyone addressed will read, up to 5000 characters.
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Attachment (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,application/pdf,image/png"
                className="hidden"
                onChange={onFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachment !== null}
              >
                <Paperclip className="size-4" />
                Choose a file
              </Button>
              {attachment && (
                <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[#dce5ed] bg-[#f7f9fc] px-3 py-1.5 text-[12.5px] text-[#183b56]">
                  <FileText className="size-3.5 shrink-0 text-[#1aa6a6]" />
                  <span className="truncate">{attachment.name}</span>
                  <span className="shrink-0 text-slate-400">{formatSize(attachment.size)}</span>
                  <button
                    type="button"
                    aria-label="Remove the attachment"
                    className="shrink-0 text-slate-400 hover:text-red-500"
                    onClick={() => setAttachment(null)}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
            <span className="block text-[11.5px] text-slate-400">
              A PDF or a PNG file, up to 4 MB. Everyone addressed can download it.
            </span>
            {fileError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {fileError}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {/* Choisir le département l'ajoute tout de suite : deux gestes pour
                un résultat qu'on attend immédiat laissaient croire que les
                unités ne se chargeaient pas. Le sélecteur se vide après chaque
                choix pour proposer la suite — un département ajouté ne se
                rerajoute pas. */}
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[#183b56]">Address it to</span>
              <Select
                value={departmentToAdd}
                onChange={(event) => {
                  const code = event.target.value
                  if (!code) return
                  setSelections((current) => ({ ...current, [code]: current[code] ?? [] }))
                  setDepartmentToAdd("")
                }}
                disabled={addableDepartments.length === 0}
              >
                <option value="">
                  {loadError
                    ? "Unable to load the organization"
                    : addableDepartments.length === 0
                      ? "Every department is already selected"
                      : "Choose a department…"}
                </option>
                {addableDepartments.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.name} ({department.code})
                    {department.active ? "" : " · inactive"}
                  </option>
                ))}
              </Select>
            </label>

            {chosenDepartments.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#dce5ed] bg-[#f7f9fc] px-4 py-3 text-[12.5px] text-slate-500">
                Pick a department above: its units are listed here to be ticked. A message with no
                unit addressed is not published.
              </p>
            )}

            {chosenDepartments.map((code) => {
              const department = (targets?.departments ?? []).find((item) => item.code === code)
              const units = unitsOf(code)
              return (
                <div key={code} className="overflow-hidden rounded-xl border border-[#e5eaf2]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#edf0f5] bg-[#f7f9fc] px-4 py-2.5">
                    <p className="min-w-0 truncate text-[13px] font-semibold text-[#183b56]">
                      {department?.name ?? code}
                      <span className="ml-2 font-normal text-slate-400">
                        {(selections[code] ?? []).length} unit
                        {(selections[code] ?? []).length === 1 ? "" : "s"} selected
                      </span>
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-slate-400 hover:text-red-500"
                      aria-label={`Remove ${department?.name ?? code}`}
                      onClick={() => removeDepartment(code)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="max-h-64 divide-y divide-[#f2f5f9] overflow-y-auto px-4">
                    {units.length === 0 && (
                      <p className="py-3 text-[12.5px] text-slate-400">
                        This department has no unit yet.
                      </p>
                    )}
                    {units.map((unit) => {
                      const depth = unit.path.split(".").length - 1
                      const checked = (selections[code] ?? []).includes(unit.path)
                      return (
                        <label
                          key={unit.path}
                          className="flex cursor-pointer items-center gap-3 py-2.5 text-[13px] text-slate-700 hover:text-[#183b56]"
                          style={{ paddingLeft: depth * 18 }}
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-[#1aa6a6]"
                            checked={checked}
                            onChange={() => toggleUnit(code, unit.path)}
                          />
                          <span className="min-w-0 truncate">
                            {unit.name}
                            <span className="ml-2 text-[11.5px] text-slate-400">{unit.path}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {selectedCount > 0 && (
              <p className="text-[11.5px] text-slate-400">
                Selecting a unit also addresses all of its sub-units.
              </p>
            )}
          </div>
        </div>

        {/*
            Destinataires : l'effectif des unités cochées, tel que le serveur
            le publiera. Tout le monde est coché d'entrée — l'auteur retire
            d'éventuels exceptions un par un, et n'envoie jamais un message
            qu'aucun membre ne reçoit.
        */}
        {selectedCount > 0 && (
          <div className="space-y-3 rounded-xl border border-[#e5eaf2] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#183b56]">Recipients</span>
              {!membersLoading && !membersError && members !== null && (
                <span className="text-[12px] text-slate-400">
                  {keptCount} of {memberCount} member{memberCount === 1 ? "" : "s"} selected
                </span>
              )}
            </div>

            {membersLoading && (
              <p className="flex items-center gap-2 text-[13px] text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading the members of the addressed units…
              </p>
            )}

            {membersError && (
              <div className="space-y-3">
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  {membersError}
                </p>
                <Button type="button" variant="outline" onClick={() => setRetryTick((tick) => tick + 1)}>
                  Try again
                </Button>
              </div>
            )}

            {!membersLoading && !membersError && members !== null && memberCount === 0 && (
              <p className="rounded-lg border border-dashed border-[#dce5ed] bg-[#f7f9fc] px-4 py-3 text-[12.5px] text-slate-500">
                No account belongs to the addressed units — nothing would be delivered.
              </p>
            )}

            {!membersLoading && !membersError && members !== null && memberCount > 0 && (
              <>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#dce5ed] bg-[#f7f9fc] px-4 py-3 text-[13px] text-[#183b56]">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[#1aa6a6]"
                    checked={excludedIds.size === 0}
                    onChange={(event) => setEveryMember(event.target.checked)}
                  />
                  <span className="font-medium">Send to every member of the addressed units</span>
                </label>

                <div className="max-h-64 divide-y divide-[#f2f5f9] overflow-y-auto rounded-lg border border-[#edf0f5] px-4">
                  {members.map((member) => (
                    <label
                      key={member._id}
                      className="flex cursor-pointer items-center gap-3 py-2.5 text-[13px] text-slate-700 hover:text-[#183b56]"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[#1aa6a6]"
                        checked={!excludedIds.has(member._id)}
                        onChange={() => toggleMember(member._id)}
                      />
                      <UserAvatar userId={member._id} name={member.name} photo={member.photo} size="sm" className="shrink-0" />
                      <span className="min-w-0 truncate">
                        {member.name}
                        <span className="ml-2 text-[11.5px] text-slate-400">{member.email}</span>
                      </span>
                      <span className="ml-auto shrink-0 rounded bg-[#eef4fa] px-2 py-0.5 text-[11px] text-[#183b56]">
                        {member.unitName ?? member.unitPath}
                      </span>
                    </label>
                  ))}
                </div>

                <p className="text-[11.5px] text-slate-400">
                  Untick the members who should not receive the message — the others still do. At
                  least one member must keep it.
                </p>
              </>
            )}
          </div>
        )}

        {publishError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {publishError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-slate-500">
            {selectedCount === 0
              ? "No unit addressed yet."
              : members !== null && !membersLoading && !membersError
                ? keptCount > 0
                  ? `${selectedCount} unit${selectedCount === 1 ? "" : "s"} addressed · ${keptCount} of ${memberCount} member${memberCount === 1 ? "" : "s"} will receive it.`
                  : "No member selected — keep at least one recipient."
                : "Resolving the recipients…"}
          </p>
          <Button onClick={() => void submit()} disabled={!canPublish}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Publish
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}
