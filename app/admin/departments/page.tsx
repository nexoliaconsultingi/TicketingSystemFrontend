"use client"

import { useEffect, useMemo, useRef, useState, Suspense } from "react"
import Link from "next/link"
import {
  Building2,
  Check,
  Eye,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"

import { AdminGuard } from "@/components/auth/admin-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { useCompanyAdmin, type Department, type DepartmentDraft } from "@/lib/company"
import { useDepartmentSearch } from "@/lib/fuzzy-search"
import { useHighlightParam } from "@/lib/use-highlight"
import { companyApi, unitApi, type UnitResponse } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { unitIndent, unitsForDepartment } from "@/lib/units"
import { useVoiceSearch } from "@/lib/voice-search"

const EMPTY_DRAFT: DepartmentDraft = { name: "", description: "" }

function formatDate(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DepartmentsPage() {
  return (
    <AdminGuard>
      <Suspense fallback={null}>
        <Departments />
      </Suspense>
    </AdminGuard>
  )
}

function Departments() {
  const {
    departments,
    loading,
    error,
    fetchDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
  } = useCompanyAdmin()

  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // modales
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<Department | null>(null)
  const [viewing, setViewing] = useState<Department | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [deleting, setDeleting] = useState<Department | null>(null)

  const [draft, setDraft] = useState<DepartmentDraft>(EMPTY_DRAFT)

  // Unités de l'organigramme, chargées pour la popup de détail : le backend
  // n'expose que les racines sur le département, or laBranche complète
  // intéresse l'utilisateur.
  const [units, setUnits] = useState<UnitResponse[]>([])
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [unitsLoading, setUnitsLoading] = useState(false)

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setSearch(transcript)
    },
  })

  const filtered = useDepartmentSearch(departments, search)

  // Unités rattachées au département ouvert, racines et descendantes.
  const viewingUnits = useMemo(
    () => (viewing ? unitsForDepartment(units, viewing.id) : []),
    [units, viewing],
  )

  const openCreate = () => {
    setFormMode("create")
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const openEdit = (department: Department) => {
    setFormMode("edit")
    setEditing(department)
    setDraft({
      name: department.name,
      description: department.description,
    })
    setFormError(null)
  }

  const closeForm = () => {
    setFormMode(null)
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  // La popup recharge le département depuis l'API pour afficher des dates à jour,
// et remonte l'organigramme pour lister les unités rattachées.
  const openDetails = async (department: Department) => {
    setViewing(department)
    setViewLoading(true)
    setUnitsError(null)
    try {
      setViewing(await fetchDepartment(department.id))
    } catch {
      // La version déjà en cache reste affichée
    } finally {
      setViewLoading(false)
    }

    if (units.length === 0) {
      setUnitsLoading(true)
      try {
        const token = getToken()
        if (!token) throw new Error("no token")
        setUnits((await unitApi.list(token)).units)
      } catch {
        // Sans organigramme, la fiche reste valable : seules les unités
        // manquent, ce qui est signalé séparément.
        setUnitsError("The organizational structure could not be loaded.")
      } finally {
        setUnitsLoading(false)
      }
    }
  }

  // Cible de la recherche globale de l'en-tête : ouvrir la fiche de ce département.
  // Déclaré après `openDetails` (const) pour éviter le zero temporal dead zone.
  const highlight = useHighlightParam()
  const handledHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!highlight || handledHighlightRef.current === highlight) return
    if (loading || departments.length === 0) return
    const department = departments.find((candidate) => candidate.id === highlight)
    if (!department) return
    handledHighlightRef.current = highlight
    void openDetails(department)
  }, [highlight, departments, loading, openDetails])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = draft.name.trim()
    if (name.length === 0) {
      setFormError("The department name is required.")
      return
    }

    // `services` n'est volontairement pas envoyé : à la création le backend le
    // valorise à un tableau vide, et à la modification son absence préserve ce
    // qui existe déjà. Le champ a été retiré de l'interface.
    const input = { name, description: draft.description.trim() }

    setSaving(true)
    setFormError(null)
    try {
      if (formMode === "edit" && editing) {
        await updateDepartment(editing.id, input)
      } else {
        await createDepartment(input)
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The department could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return

    setSaving(true)
    setFormError(null)
    try {
      await deleteDepartment(deleting.id)
      setDeleting(null)
      if (editing?.id === deleting.id) closeForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The department could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const formTitle =
    formMode === "edit" && editing ? `Edit ${editing.id}` : "Create a new department"

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">Departments</h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Organise your company into departments, each carrying its own name and description.
        </p>
      }
      actions={
        <Button
          className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          onClick={openCreate}
          disabled={loading}
        >
          <Plus className="size-4" />
          New department
        </Button>
      }
    >
      <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#183b56]">Directory</h2>
            <p className="mt-1 text-sm text-slate-500">
              {departments.length} department{departments.length === 1 ? "" : "s"} registered
            </p>
          </div>
<div className="flex w-full items-center gap-2 sm:w-96">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(event.target.value)
                  }
                  className="h-9 pl-9"
                  placeholder="Search a department"
                  aria-label="Search a department"
                />
              </div>

              {/*
                Le micro n'apparaît que si le navigateur expose la
                reconnaissance vocale : mieux vaut un champ seul qu'un bouton
                qui échoue sans explication.
              */}
              {voice.supported && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={voice.listening ? "Stop voice search" : "Search by voice"}
                  aria-pressed={voice.listening}
                  title={voice.listening ? "Stop listening" : "Search by voice"}
                  onClick={voice.toggle}
                  className={
                    voice.listening
                      ? "size-9 shrink-0 border-[#1aa6a6] bg-[#edf8f8] text-[#147878]"
                      : "size-9 shrink-0 border-[#dce5ed] text-[#183b56]"
                  }
                >
                  {voice.listening ? (
                    <MicOff className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                </Button>
              )}
            </div>
        </div>

{voice.listening && (
              <p className="flex items-center gap-2 border-b border-[#edf0f5] bg-[#f2fbfb] px-5 py-2.5 text-[13px] text-[#147878]">
                <span className="size-2 animate-pulse rounded-full bg-[#1aa6a6]" />
                Listening... say a department name.
              </p>
            )}
            {voice.error && (
              <p role="alert" className="border-b border-[#edf0f5] px-5 py-2.5 text-[13px] text-amber-700">
                {voice.error}
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
              >
                {error}
              </div>
            )}

        {loading && departments.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading departments...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Building2 className="size-5" />
            </div>
            <p className="text-sm font-medium text-[#183b56]">
              {departments.length === 0 ? "No department yet" : "No department matches your search"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {departments.length === 0
                ? "Create your first department to organise your company."
                : "Try another keyword or clear the search field."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#edf0f5]">
            {filtered.map((department) => (
              <li
                key={department.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#183b56]">{department.name}</p>
                      <Badge
                        variant="outline"
                        className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
                      >
                        {department.id}
                      </Badge>
                      {(department.rootUnits?.length ?? 0) > 0 ? (
                        // Un département peut porter plusieurs nœuds de premier
                        // niveau : tous sont listés, pas seulement le premier.
                        department.rootUnits!.map((unit) => (
                          <Link
                            key={unit.path}
                            href="/admin/units"
                            title="See this branch in the organizational structure"
                            className="inline-flex items-center gap-1 rounded-md bg-[#eef2f8] px-2 py-0.5 text-[11px] font-medium text-[#35506b] transition-colors hover:bg-[#e3eaf3]"
                          >
                            <Network className="size-3" />
                            {unit.path} · {unit.name}
                          </Link>
                        ))
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-dashed border-[#e5eaf2] bg-white text-[11px] text-slate-400"
                        >
                          No unit linked
                        </Badge>
                      )}
                      {!department.active && (
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-500"
                        >
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {department.description && (
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
                        {department.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#dce5ed] text-[#183b56]"
                    onClick={() => void openDetails(department)}
                  >
                    <Eye className="size-3.5" />
                    Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#dce5ed] text-[#183b56]"
                    onClick={() => openEdit(department)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setDeleting(department)
                      setFormError(null)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Création / modification d'un département */}
      <Modal
        open={formMode !== null}
        title={formTitle}
        description={
          formMode === "edit"
            ? "Update the name and the description of this department."
            : "The identifier is generated automatically and cannot be changed afterwards."
        }
        onClose={closeForm}
        size="lg"
        centerOnMobile
        footer={
          <>
            <Button type="button" variant="ghost" className="text-slate-500" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="department-form"
              disabled={saving}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {formMode === "edit" ? "Save department" : "Create department"}
            </Button>
          </>
        }
      >
        <form id="department-form" onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="department-name" className="text-[13px] font-medium text-[#183b56]">
              Department name <span className="text-red-500">*</span>
            </label>
            <Input
              id="department-name"
              value={draft.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="h-10"
              maxLength={100}
              placeholder="Information Technology"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="department-description"
                className="text-[13px] font-medium text-[#183b56]"
              >
                Description
                <span className="ml-1.5 font-normal text-slate-400">optional</span>
              </label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {draft.description.length}/400
              </span>
            </div>
            <Textarea
              id="department-description"
              value={draft.description}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              maxLength={400}
              placeholder="Scope, responsibilities and the teams covered by this department."
            />
          </div>
        </form>
      </Modal>

      {/* Détail d'un département */}
      <Modal
        open={viewing !== null}
        title={viewing ? viewing.name : ""}
        description={viewing ? `Identifier ${viewing.id}` : undefined}
        onClose={() => setViewing(null)}
        centerOnMobile
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setViewing(null)}
            >
              Close
            </Button>
            <Button
              type="button"
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              onClick={() => {
                if (!viewing) return
                const target = viewing
                setViewing(null)
                openEdit(target)
              }}
            >
              <Pencil className="size-4" />
              Edit department
            </Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-5">
            {viewLoading && (
              <p className="flex items-center gap-2 text-[13px] text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                Loading the latest information...
              </p>
            )}

            <div className="flex items-center gap-4 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#183b56]">{viewing.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-[#e5eaf2] bg-white font-mono text-[11px] text-slate-500"
                  >
                    {viewing.id}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={viewing.active ? "bg-[#f2fbfb] text-[#147878]" : "bg-slate-100 text-slate-500"}
                  >
                    {viewing.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold text-[#183b56]">
                Description
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">optional</span>
              </h3>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-600">
                {viewing.description || "No description has been provided for this department."}
              </p>
            </div>

            {/*
              Unités rattachées : le backend ne renvoie que les racines, la
              branche complète est donc reconstruite depuis l'organigramme.
            */}
            <div className="border-t border-[#edf0f5] pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-[#183b56]">
                  Linked units
                </h3>
                {viewingUnits.length > 0 && (
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {viewingUnits.length} unit{viewingUnits.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {unitsError ? (
                <p className="mt-2 text-[13px] text-amber-700">{unitsError}</p>
              ) : unitsLoading && viewingUnits.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading units...
                </p>
              ) : viewingUnits.length === 0 ? (
                <p className="mt-2 text-[13px] leading-6 text-slate-500">
                  No unit is linked to this department yet. Create a root unit in the organizational
                  structure and attach it to {viewing.id} to see it here.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[#edf0f5] overflow-hidden rounded-lg border border-[#e5eaf2]">
                  {viewingUnits.map((unit) => (
                    <li key={unit.path} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Layers className="size-3.5 shrink-0 text-[#1aa6a6]" />
                      <span className="shrink-0 font-mono text-[12px] text-slate-400">
                        {unit.path}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] text-[#183b56]"
                        style={{ paddingLeft: `${(unitIndent(unit.path) - 1) * 10}px` }}
                        title={unit.name}
                      >
                        {unit.name}
                      </span>
                      {!unit.active && (
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-[11px] text-slate-500"
                        >
                          Inactive
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <dl className="grid gap-3 border-t border-[#edf0f5] pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Created on</dt>
                <dd className="mt-0.5 text-[13px] text-[#183b56]">{formatDate(viewing.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Last update</dt>
                <dd className="mt-0.5 text-[13px] text-[#183b56]">{formatDate(viewing.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      {/* Suppression */}
      <Modal
        open={deleting !== null}
        title="Delete this department?"
        description={
          deleting
            ? `${deleting.name} (${deleting.id}) will be removed from the directory.`
            : undefined
        }
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={handleDelete}
              className="gap-2"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete department
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-slate-600">
          This action is permanent. Tickets and users already linked to this department keep their
          history, but the department can no longer be selected.
        </p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {formError}
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}
