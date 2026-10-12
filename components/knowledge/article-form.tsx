"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, FileText, Loader2, Paperclip, Plus, X } from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getToken } from "@/lib/auth"
import {
  ApiError,
  KNOWLEDGE_ATTACHMENT_LABELS,
  KNOWLEDGE_MAX_BYTES,
  KNOWLEDGE_MIME_TYPES,
  knowledgeApi,
  type CreateKnowledgeArticleInput,
  type KnowledgeArticle,
  type KnowledgeAttachment,
  type KnowledgeMimeType,
  type KnowledgeTargets,
  type UpdateKnowledgeArticleInput,
} from "@/lib/api"

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const ACCEPTED_TYPES = [...KNOWLEDGE_MIME_TYPES]

/**
 * Le formulaire commun de la base de connaissances.
 *
 * Création et correction partagent la même grammaire : mêmes champs, mêmes
 * saisies, mêmes vérifications. La seule différence est le point d'arrivée —
 * `new` publie, `[id]/edit` corrige l'article de son créateur, pièce jointe
 * remplacée ou retirée possible.
 */
export function ArticleForm({
  mode,
  initial,
  onDone,
}: {
  mode: "create" | "edit"
  initial?: KnowledgeArticle
  onDone: () => void
}) {
  const isEdit = mode === "edit"

  const [targets, setTargets] = useState<KnowledgeTargets | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [resolutionTechnique, setResolutionTechnique] = useState(initial?.resolutionTechnique ?? "")
  const [departmentCode, setDepartmentCode] = useState(initial?.departmentCode ?? "")
  const [sector, setSector] = useState(initial?.sector ?? "")
  const [unitPath, setUnitPath] = useState(initial?.unitPath ?? "")
  const [attachment, setAttachment] = useState<(KnowledgeAttachment & { data: string }) | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [created, setCreated] = useState<KnowledgeArticle | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    void knowledgeApi
      .targets(token)
      .then(setTargets)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Unable to load the organization."),
      )
      .finally(() => setLoading(false))
  }, [])

  const selectedDepartment =
    targets?.departments.find((department) => department.code === departmentCode) ?? null
  const unitsOfDepartment = (targets?.units ?? [])
    .filter((unit) => unit.departmentCode === departmentCode)
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))

  // Changer de département, c'est changer d'unité possible.
  const onDepartmentChange = (code: string) => {
    setDepartmentCode(code)
    setSector("")
    setUnitPath("")
  }

  // Si le secteur n'est plus offert par le département (service retiré), ne plus
  // tenter de le renvoyer : le serveur le refuserait et l'article ne partirait pas.
  const keepsSector = useMemo(() => {
    if (isEdit && sector && selectedDepartment) {
      return Boolean(selectedDepartment.services?.includes(sector))
    }
    return true
  }, [isEdit, sector, selectedDepartment])

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length >= 5 &&
    resolutionTechnique.trim().length >= 10 &&
    departmentCode !== "" &&
    unitPath !== "" &&
    !saving

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ""
    setFileError(null)
    setAttachment(null)
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type as KnowledgeMimeType)) {
      setFileError("Only PDF, PNG, JPEG and WebP files can be attached.")
      return
    }
    if (file.size > KNOWLEDGE_MAX_BYTES) {
      setFileError("The file must be 4 MB or smaller.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        name: file.name,
        mimeType: file.type as KnowledgeMimeType,
        size: file.size,
        data: String(reader.result),
      })
    }
    reader.onerror = () => setFileError("Unable to read the file.")
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    const token = getToken()
    if (!token || !canSubmit) return
    setSaving(true)
    setPublishError(null)
    try {
      const base = {
        title: title.trim(),
        description: description.trim(),
        resolutionTechnique: resolutionTechnique.trim(),
        departmentCode,
        unitPath,
      }
      if (isEdit && initial?._id) {
        const input: UpdateKnowledgeArticleInput = { ...base }
        if (sector && keepsSector) input.sector = sector
        if (attachment) input.attachment = attachment
        if (removeAttachment) input.removeAttachment = true
        setCreated(await knowledgeApi.update(token, initial._id, input))
      } else {
        const input: CreateKnowledgeArticleInput = { ...base }
        if (attachment) input.attachment = attachment
        setCreated(await knowledgeApi.create(token, input))
      }
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : "Unable to save the article.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell
        title={isEdit ? "Edit article" : "New article"}
        subtitle="Loading the organization…"
        breadcrumb="Recommendations"
      >
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading departments and units…
        </p>
      </DashboardShell>
    )
  }

  if (created) {
    return (
      <DashboardShell
        title={isEdit ? "Edit article" : "New article"}
        subtitle={isEdit ? "Updated." : "Saved."}
        breadcrumb="Recommendations"
      >
        <div className="rounded-xl border border-[#e5eaf2] bg-white px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-5" />
          </div>
          <h2 className="text-[15px] font-semibold text-[#183b56]">
            {isEdit ? "Article updated in the knowledge base" : "Article saved to the knowledge base"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-slate-500">
            Everyone can now find « {created.title} » under {created.departmentName}.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {!isEdit && (
              <Button variant="outline" className="gap-2" onClick={() => setCreated(null)}>
                <Plus className="size-4" />
                Write another
              </Button>
            )}
            <Button className="gap-2" onClick={onDone}>
              <ArrowLeft className="size-4" />
              Back to the knowledge base
            </Button>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title={isEdit ? "Edit article" : "New article"}
      subtitle={
        isEdit
          ? "Correct what you wrote — it stays your article."
          : "Consign a problem and its resolution technique for the whole team."
      }
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
              placeholder="Printer jams on the second floor"
              maxLength={150}
              autoFocus
            />
            <span className="block text-[11.5px] text-slate-400">
              The problem, in one line. At least 3 characters.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Description</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Symptoms, context, and what was already tried."
              rows={4}
              maxLength={3000}
            />
            <span className="block text-[11.5px] text-slate-400">
              What the problem looks like, for the person who searches it. At least 5 characters.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Resolution technique</span>
            <Textarea
              value={resolutionTechnique}
              onChange={(event) => setResolutionTechnique(event.target.value)}
              placeholder="Steps to reproduce and fix, in order. Be concrete: commands, clicks, settings…"
              rows={6}
              maxLength={5000}
            />
            <span className="block text-[11.5px] text-slate-400">
              How to resolve it, step by step. At least 10 characters — it is what makes the article useful.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#183b56]">Attachment (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachment !== null || (isEdit && !removeAttachment && Boolean(initial?.attachment) && attachment === null)}
              >
                <Paperclip className="size-4" />
                {isEdit && !removeAttachment && initial?.attachment && !attachment
                  ? "Replace the file"
                  : "Choose a file"}
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
              {isEdit && !removeAttachment && !attachment && initial?.attachment && (
                <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[#dce5ed] bg-[#f7f9fc] px-3 py-1.5 text-[12.5px] text-[#183b56]">
                  <FileText className="size-3.5 shrink-0 text-[#1aa6a6]" />
                  <span className="truncate">{initial.attachment.name}</span>
                  <span className="shrink-0 text-slate-400">{formatSize(initial.attachment.size)}</span>
                  <button
                    type="button"
                    aria-label="Remove the attachment"
                    className="shrink-0 text-slate-400 hover:text-red-500"
                    onClick={() => setRemoveAttachment(true)}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
            <span className="block text-[11.5px] text-slate-400">
              A PDF or an image (PNG, JPEG, WebP), up to 4 MB. Everyone can download it.
            </span>
            {fileError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {fileError}
              </p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[#183b56]">Department</span>
              <Select value={departmentCode} onChange={(event) => onDepartmentChange(event.target.value)}>
                <option value="">
                  {loadError
                    ? "Unable to load the organization"
                    : "Choose a department…"}
                </option>
                {(targets?.departments ?? []).map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.name} ({department.code})
                    {department.active ? "" : " · inactive"}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[#183b56]">Unit</span>
              <Select value={unitPath} onChange={(event) => setUnitPath(event.target.value)} disabled={!selectedDepartment}>
                <option value="">
                  {selectedDepartment
                    ? unitsOfDepartment.length > 0
                      ? "Choose a unit…"
                      : "This department has no unit yet"
                    : "Choose a department first"}
                </option>
                {unitsOfDepartment.map((unit) => (
                  <option key={unit.path} value={unit.path}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        {publishError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {publishError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-slate-500">
            {!departmentCode
              ? "Choose a department and a unit."
              : !unitPath
                ? "Pick the unit where the problem belongs."
                : attachment
                  ? `${attachment.name} · ${KNOWLEDGE_ATTACHMENT_LABELS[attachment.mimeType]} · ${formatSize(attachment.size)} will be attached.`
                  : isEdit && removeAttachment
                    ? "The current file will be removed."
                    : "The article will be saved without an attached document."}
          </p>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <CheckCircle2 className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? "Save changes" : "Save article"}
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}
