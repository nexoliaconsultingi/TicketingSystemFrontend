"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import {
  Building2,
  ChevronRight,
  FolderTree,
  Layers,
  Loader2,
  Mic,
  MicOff,
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
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import {
  MAX_DEPTH,
  countDescendants,
  usedDepartmentCodes,
  useUnitSearch,
  useUnits,
  type Unit,
} from "@/lib/units"
import { useVoiceSearch } from "@/lib/voice-search"
import { useHighlightParam } from "@/lib/use-highlight"

interface FormState {
  mode: "create" | "edit"
  parent: Unit | null
  target: Unit | null
}

/**
 * Étiquette du département propriétaire d'une unité.
 *
 * Le backend propage le département depuis la racine jusqu'aux sous-unités :
 * chaque nœud peut donc afficher son department, et pas seulement les racines.
 * C'est ce qui permet de lire « cette unité est devant le département X »
 * directement sur la ligne, sans remonter l'arbre.
 */
function DepartmentBadge({ code, name }: { code: string | null; name?: string }) {
  if (!code) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        No department
      </span>
    )
  }

  return (
    <span
      title={`Department ${code}${name ? ` · ${name}` : ""}`}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-[#eef2f8] px-2 py-0.5 text-[11px] font-medium text-[#35506b]"
    >
      <Building2 className="size-3 shrink-0" />
      <span className="truncate">{name ?? code}</span>
    </span>
  )
}

export default function UnitsPage() {
  return (
    <AdminGuard>
      <Suspense fallback={null}>
        <Units />
      </Suspense>
    </AdminGuard>
  )
}

function Units() {
  const { tree, units, departments, loading, error, createUnit, updateUnit, deleteUnit } =
    useUnits()

  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [departmentCode, setDepartmentCode] = useState("")
  const [deleting, setDeleting] = useState<Unit | null>(null)
  const [deleteCount, setDeleteCount] = useState(0)

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setSearch(transcript)
    },
  })

  const query = search.trim()

  // Cible de la recherche globale de l'en-tête : déplier la branche puis
  // surligner la ligne de l'unité recherchée, et s'y rendre.
  const highlight = useHighlightParam()
  const handledHighlightRef = useRef<string | null>(null)
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null)
  const highlightRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!highlight || handledHighlightRef.current === highlight) return
    if (loading || units.length === 0) return
    if (!units.some((unit) => unit.path === highlight)) return
    handledHighlightRef.current = highlight
    setHighlightedPath(highlight)
    // Déplier tous les ancêtres : sans cela la branche resterait fermée et la
    // ligne ciblée ne serait pas visible dans l'arbre.
    setCollapsed((current) => {
      const next = new Set(current)
      const segments = highlight.split(".")
      let acc = ""
      for (const segment of segments) {
        acc = acc ? `${acc}.${segment}` : segment
        next.delete(acc)
      }
      return next
    })
  }, [highlight, units, loading])

  useEffect(() => {
    if (!highlightedPath) return
    highlightRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [highlightedPath])

  const departmentName = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of departments) map.set(department.id, department.name)
    return map
  }, [departments])

  // Nombre de nœuds de premier niveau par département : sert à informer dans
  // le sélecteur qu'un département peut déjà être découpé en plusieurs branches.
  const rootCountByDepartment = useMemo(() => {
    const counts = new Map<string, number>()
    for (const unit of units) {
      if (unit.parentPath || !unit.departmentCode) continue
      counts.set(unit.departmentCode, (counts.get(unit.departmentCode) ?? 0) + 1)
    }
    return counts
  }, [units])

  // Unités correspondant à la recherche, avec leurs ancêtres pour garder le
  // contexte : le hook ajoute déjà les ancêtres de chaque résultat.
  const searchResult = useUnitSearch(units, departments, query)

  const isVisible = (unit: Unit): boolean =>
    query.length === 0 || searchResult.paths.has(unit.path)

  // En recherche, tout est ouvert : sinon les résultats seraient cachés
  const isOpen = (unit: Unit): boolean => query.length > 0 || !collapsed.has(unit.path)

  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Un département actif convient à une nouvelle racine : un même département
  // peut porter plusieurs nœuds de premier niveau.
  const defaultDepartment = () => departments.find((department) => department.active)?.id ?? ""

  const openCreate = (parent: Unit | null) => {
    setForm({ mode: "create", parent, target: null })
    setName("")
    setDescription("")
    setDepartmentCode(parent ? "" : defaultDepartment())

    if (parent && parent.depth >= MAX_DEPTH) {
      setFormError(`Units cannot be nested more than ${MAX_DEPTH} levels deep.`)
      return
    }

    setFormError(null)
  }

  const openEdit = (unit: Unit) => {
    setForm({ mode: "edit", parent: null, target: unit })
    setName(unit.name)
    setDescription(unit.description)
    setDepartmentCode(unit.parentPath ? "" : (unit.departmentCode ?? ""))
    setFormError(null)
  }

  const closeForm = () => {
    setForm(null)
    setName("")
    setDescription("")
    setDepartmentCode("")
    setFormError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (name.trim().length < 2) {
      setFormError("The unit name must be at least 2 characters.")
      return
    }

    if (!form) return

    // Une racine doit toujours être rattachée à un département
    const isRoot = !form.parent && !form.target?.parentPath
    if (isRoot && !departmentCode) {
      setFormError("Select the department this root unit belongs to.")
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (form.mode === "edit" && form.target) {
        await updateUnit(form.target.path, {
          name: name.trim(),
          description: description.trim(),
          ...(isRoot ? { departmentCode: departmentCode || null } : {}),
        })
      } else {
        await createUnit({
          name: name.trim(),
          parentPath: form.parent?.path ?? null,
          departmentCode: isRoot ? departmentCode : null,
          description: description.trim(),
        })
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The unit could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const askDelete = (unit: Unit) => {
    setDeleting(unit)
    setDeleteCount(countDescendants(tree, unit.path))
    setFormError(null)
  }

  const handleDelete = async () => {
    if (!deleting) return

    setSaving(true)
    setFormError(null)
    try {
      await deleteUnit(deleting.path)
      setDeleting(null)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The unit could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const maxDepth = units.reduce((max, unit) => Math.max(max, unit.depth), 0)
  const visibleCount = query ? searchResult.count : units.length

  const renderNode = (unit: Unit, depth: number): React.ReactNode => {
    if (!isVisible(unit)) return null
    const hasChildren = unit.children.length > 0
    const open = isOpen(unit)

    return (
      <li key={unit.path}>
        <div
          ref={unit.path === highlightedPath ? highlightRowRef : undefined}
          data-unit-path={unit.path}
          className={`group flex items-center gap-2 border-b border-[#edf0f5] py-2.5 pr-3 transition-colors ${
            unit.path === highlightedPath
              ? "bg-[#f0fbfb] ring-2 ring-[#1aa6a6] ring-inset"
              : "hover:bg-[#f7f9fc]"
          }`}
          style={{ paddingLeft: `${depth * 22 + 12}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(unit.path)}
              aria-label={open ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
              aria-expanded={open}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-[#183b56]"
            >
              <ChevronRight
                className={cn("size-4 transition-transform", open && "rotate-90")}
              />
            </button>
          ) : (
            <span className="size-6 shrink-0" />
          )}

          <span
            className="shrink-0 rounded-md bg-[#edf8f8] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#147878]"
            title={`Level ${unit.depth}`}
          >
            {unit.path}
          </span>

          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[#183b56]">
              {unit.name}
            </span>

            {/*
              Sur téléphone, le département passe sous le nom : sur une seule
              ligne, il écrase le nom de l'unité, qui est l'information
              principale.
            */}
            <span className="mt-1 block sm:hidden">
              <DepartmentBadge
                code={unit.departmentCode}
                name={departmentName.get(unit.departmentCode ?? "")}
              />
            </span>
          </div>

          <span className="hidden shrink-0 sm:inline-flex">
            <DepartmentBadge
              code={unit.departmentCode}
              name={departmentName.get(unit.departmentCode ?? "")}
            />
          </span>

          {unit.description && (
            <span className="hidden min-w-0 max-w-xs truncate text-xs text-slate-400 lg:block">
              {unit.description}
            </span>
          )}

          {/*
            Icône + libellé comme ailleurs dans l'administration. Le libellé
            ne s'affiche qu'à partir de lg : sur une ligne d'arbre indentée, il
            pousserait le nom de l'unité hors de l'écran. En dessous, l'icône
            seule suffit — et le title reste là pour le survol.
          */}
          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Add a sub-unit under ${unit.name}`}
              title="Add a sub-unit"
              className="text-slate-400 hover:text-[#1aa6a6]"
              onClick={() => openCreate(unit)}
            >
              <Plus className="size-3.5" />
              <span className="hidden lg:inline">Add sub-unit</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit ${unit.name}`}
              title="Edit"
              className="text-slate-400 hover:text-[#183b56]"
              onClick={() => openEdit(unit)}
            >
              <Pencil className="size-3.5" />
              <span className="hidden lg:inline">Edit</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Delete ${unit.name}`}
              title="Delete"
              className="text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => askDelete(unit)}
            >
              <Trash2 className="size-3.5" />
              <span className="hidden lg:inline">Delete</span>
            </Button>
          </span>
        </div>

        {hasChildren && open && <ul>{unit.children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    )
  }

  const isFormRoot = form !== null && !form.parent && !form.target?.parentPath

  const formTitle = !form
    ? ""
    : form.mode === "edit"
      ? `Edit unit ${form.target?.path ?? ""}`
      : form.parent
        ? `New sub-unit under ${form.parent.path} · ${form.parent.name}`
        : "New root unit"

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Organizational Structure
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Each department owns one or several root units, and their teams nest below: 1, 1.1,
          1.1.1 and beyond.
        </p>
      }
      actions={
        <Button
          className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          onClick={() => openCreate(null)}
          disabled={loading}
        >
          <Plus className="size-4" />
          New root unit
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Units
            </p>
            <p className="mt-1 text-2xl font-bold text-[#183b56]">{units.length}</p>
          </div>
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Root units
            </p>
            <p className="mt-1 text-2xl font-bold text-[#183b56]">{tree.length}</p>
          </div>
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Departments linked
            </p>
            <p className="mt-1 text-2xl font-bold text-[#183b56]">
              {usedDepartmentCodes(units).size}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {departments.length}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Deepest level
            </p>
            <p className="mt-1 text-2xl font-bold text-[#183b56]">
              {maxDepth}
              <span className="ml-1 text-sm font-normal text-slate-400">/ {MAX_DEPTH}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#183b56]">Organizational chart</h2>
              <p className="mt-1 text-sm text-slate-500">
                {query
                  ? `${visibleCount} unit(s) match "${search.trim()}"`
                  : "Click a node to expand or collapse its branch."}
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
                  placeholder="Search a unit, a code or a department"
                  aria-label="Search a unit, a code or a department"
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
                  {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              )}
            </div>
          </div>

          {voice.listening && (
            <p className="flex items-center gap-2 border-b border-[#edf0f5] bg-[#f2fbfb] px-5 py-2.5 text-[13px] text-[#147878]">
              <span className="size-2 animate-pulse rounded-full bg-[#1aa6a6]" />
              Listening... say a unit name or a department.
            </p>
          )}
          {voice.error && (
            <p
              role="alert"
              className="border-b border-[#edf0f5] px-5 py-2.5 text-[13px] text-amber-700"
            >
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

          {loading && units.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading the unit tree...
            </div>
          ) : units.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <FolderTree className="size-5" />
              </div>
              <p className="text-sm font-medium text-[#183b56]">No unit yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create a root unit and link it to a department to start the chart.
              </p>
              <Button
                type="button"
                onClick={() => openCreate(null)}
                className="mt-4 gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              >
                <Plus className="size-4" />
                New root unit
              </Button>
            </div>
          ) : query.length > 0 && searchResult.count === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Search className="size-5" />
              </div>
              <p className="text-sm font-medium text-[#183b56]">No unit matches your search</p>
              <p className="mt-1 text-sm text-slate-500">
                Try another name or code, or clear the search to see the whole chart.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSearch("")}
                className="mt-4 gap-2 text-[#183b56] hover:bg-[#f0f4f9]"
              >
                Clear search
              </Button>
            </div>
          ) : (
            <ul className="py-1">{tree.map((unit) => renderNode(unit, 0))}</ul>
          )}
        </div>
      </div>

      {/* Création / modification */}
      <Modal
        open={form !== null}
        title={formTitle}
        description={
          !form
            ? undefined
            : form.mode === "edit"
              ? "The code identifies the unit in the chart and cannot be changed."
              : form.parent
                ? `The code is generated automatically as the next free number under ${form.parent.path}.`
                : "The code is generated automatically as the next free root number."
        }
        centerOnMobile
        onClose={closeForm}
        footer={
          <>
            <Button type="button" variant="ghost" className="text-slate-500" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="unit-form"
              disabled={saving}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
              {form?.mode === "edit" ? "Save unit" : "Create unit"}
            </Button>
          </>
        }
      >
        <form id="unit-form" onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          {form?.mode === "edit" && form.target && (
            <div className="flex items-center gap-3 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] p-3.5">
              <span className="rounded-md bg-[#edf8f8] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#147878]">
                {form.target.path}
              </span>
              <span className="text-[13px] text-slate-600">
                Level {form.target.depth} of {MAX_DEPTH}
              </span>
            </div>
          )}

          {isFormRoot && (
            <div className="space-y-2">
              <label htmlFor="unit-department" className="text-[13px] font-medium text-[#183b56]">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="unit-department"
                value={departmentCode}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  setDepartmentCode(event.target.value)
                }
                className="h-10 w-full rounded-lg border border-[#e5eaf2] bg-white px-3 text-sm text-[#183b56] outline-none focus:border-[#1aa6a6] focus:ring-2 focus:ring-[#1aa6a6]/20"
              >
                <option value="">Select a department...</option>
                {departments.map((department) => {
                  const rootCount = rootCountByDepartment.get(department.id) ?? 0
                  return (
                    <option key={department.id} value={department.id}>
                      {department.id} · {department.name}
                      {rootCount > 0 ? ` (${rootCount} root unit${rootCount === 1 ? "" : "s"})` : ""}
                      {!department.active ? " (inactive)" : ""}
                    </option>
                  )
                })}
              </select>
              <p className="text-[11px] leading-5 text-slate-400">
                A department can own several root units. Sub-units inherit the department from
                their branch.
              </p>
            </div>
          )}

          {!isFormRoot && form?.mode === "create" && form.parent && (
            <div className="flex items-center gap-3 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] p-3.5">
              <Building2 className="size-4 shrink-0 text-[#147878]" />
              <span className="text-[13px] text-slate-600">
                Inherits{" "}
                <strong className="font-semibold text-[#183b56]">
                  {departmentName.get(form.parent.departmentCode ?? "") ?? form.parent.departmentCode ?? "no department"}
                </strong>{" "}
                from {form.parent.path}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="unit-name" className="text-[13px] font-medium text-[#183b56]">
              Unit name
            </label>
            <Input
              id="unit-name"
              value={name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setName(event.target.value)
              }
              className="h-10"
              maxLength={100}
              placeholder={form?.parent ? "Network Team" : "IT"}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="unit-description" className="text-[13px] font-medium text-[#183b56]">
                Description
              </label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {description.length}/400
              </span>
            </div>
            <Textarea
              id="unit-description"
              value={description}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(event.target.value)
              }
              rows={4}
              maxLength={400}
              placeholder="Responsibilities covered by this unit."
            />
          </div>
        </form>
      </Modal>

      {/* Suppression */}
      <Modal
        open={deleting !== null}
        title="Delete this branch?"
        description={
          deleting
            ? `${deleting.path} · ${deleting.name}${deleteCount > 0 ? ` and ${deleteCount} sub-unit(s)` : ""} will be removed.`
            : undefined
        }
        onClose={() => setDeleting(null)}
        centerOnMobile
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
              Delete branch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {deleteCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-800">
              This unit has <strong>{deleteCount}</strong> sub-unit(s). They will be deleted with
              it.
            </div>
          )}
          <p className="text-[13px] leading-6 text-slate-600">
            This action is permanent. Codes are reused only after the highest existing number is
            recalculated, so removing a branch can renumber the units created afterwards.
          </p>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}
        </div>
      </Modal>
    </DashboardShell>
  )
}
