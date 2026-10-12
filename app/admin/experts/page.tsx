"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { UserAvatar } from "@/components/profile/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import type { ExpertiseEntryResponse, UserResponse } from "@/lib/api"
import { unitsOfDepartment, useExpertise, useExpertiseSearch } from "@/lib/expertise"
import { useUsersAdmin } from "@/lib/users"
import { useSessionUser } from "@/lib/use-session"
import { useVoiceSearch } from "@/lib/voice-search"

interface FormState {
  mode: "create" | "edit"
  target: ExpertiseEntryResponse | null
}

/**
 * Un expert assigné dans le formulaire. La photo n'est pas renvoyée à la
 * création, elle est donc relue dans l'annuaire ou demandée à l'affichage.
 */
interface SelectedExpert {
  user: string
  email: string
  name: string
}

/**
 * Sélecteur d'expert avec recherche.
 *
 * Un `<select>` natif ne sait pas afficher de photo : on compose donc une liste
 * déroulante où chaque personne apparaît avec son visage, son nom, son email et
 * son département. Les personnes déjà assignées sont retirées de la liste pour
 * éviter les doublons.
 */
function ExpertPicker({
  users,
  selectedIds,
  onAdd,
}: {
  users: UserResponse[]
  selectedIds: string[]
  onAdd: (userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Un clic hors du panneau referme la liste : sans cela elle resterait ouverte
  // par-dessus le reste du formulaire.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const selected = new Set(selectedIds)
  const needle = query.trim().toLowerCase()
  const results = users.filter((user) => {
    if (selected.has(user._id)) return false
    if (!needle) return true
    return (
      user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
    )
  })

  const choose = (userId: string) => {
    onAdd(userId)
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#e5eaf2] bg-white px-3 text-sm text-[#183b56] outline-none transition-colors hover:border-[#1aa6a6] focus:border-[#1aa6a6] focus:ring-2 focus:ring-[#1aa6a6]/20"
      >
        <span className="truncate text-slate-400">Add an expert from the directory...</span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        // La liste s'insère dans le flux sous le bouton : le corps de la modale
        // défile déjà, un panneau flottant s'y ferait rogner.
        <div className="mt-1 w-full overflow-hidden rounded-lg border border-[#e5eaf2] bg-white shadow-sm">
          <div className="border-b border-[#eef2f7] p-2">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email..."
              className="h-9 text-sm"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">
                {users.length === 0
                  ? "No account in the directory."
                  : "No matching person — everyone else is already assigned."}
              </li>
            ) : (
              results.map((user) => (
                <li key={user._id}>
                  <button
                    type="button"
                    onClick={() => choose(user._id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#f2f7fa]"
                  >
                    <UserAvatar
                      userId={user._id}
                      name={user.name}
                      photo={user.photo}
                      size="sm"
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#183b56]">
                        {user.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {user.email}
                      </span>
                    </span>
                    {user.departmentName ? (
                      <span className="hidden shrink-0 truncate text-[11px] text-slate-400 sm:block">
                        {user.departmentName}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function ExpertsPage() {
  return (
    <AuthGuard>
      <Experts />
    </AuthGuard>
  )
}

function Experts() {
  const session = useSessionUser()
  // Trois lectures d'un même écran : l'admin tient le référentiel entier et
  // choisit unité et experts ; le superviseur ne déclare que ses propres
  // problèmes — unité et expert déduits de son compte ; l'employé consulte en
  // lecture seule.
  const isAdmin = Boolean(session?.access.includes("admin"))
  const isSupervisor = Boolean(session && !isAdmin && session.access.includes("manager"))
  const canManage = isAdmin || isSupervisor
  const { entries, departments, units, loading, error, createEntry, updateEntry, deleteEntry } =
    useExpertise()
  const { users } = useUsersAdmin()

  // Parcours de saisie : un département, puis une unité de ce département
  const [departmentCode, setDepartmentCode] = useState("")
  const [unitPath, setUnitPath] = useState("")
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [problem, setProblem] = useState("")
  const [description, setDescription] = useState("")
  /** Ordre de priorité : le premier est l'expert principal, les suivants des suppléants */
  const [experts, setExperts] = useState<SelectedExpert[]>([])
  const [deleting, setDeleting] = useState<ExpertiseEntryResponse | null>(null)
  /** Problème ouvert en lecture seule, avec la liste de ses experts */
  const [viewing, setViewing] = useState<ExpertiseEntryResponse | null>(null)

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setSearch(transcript)
    },
  })

  const unitName = useMemo(() => {
    const map = new Map<string, string>()
    for (const unit of units) map.set(unit.path, unit.name)
    return map
  }, [units])

  const departmentName = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of departments) map.set(department.id, department.name)
    return map
  }, [departments])

  const userById = useMemo(() => new Map(users.map((user) => [user._id, user])), [users])

  // Unités du département choisi, pour la seconde étape
  const departmentUnits = useMemo(
    () => unitsOfDepartment(units, departmentCode),
    [units, departmentCode],
  )

  // Le département change : l'unité retenue n'appartient plus à la nouvelle branche
  const chooseDepartment = (code: string) => {
    setDepartmentCode(code)
    setUnitPath("")
  }

  // Tout le monde lit le référentiel complet : un superviseur voit les problèmes
  // déclarés par les autres (en lecture seule), mais ne crée et ne modifie que
  // les siens.
  const owned = entries

  // Un problème appartient à la personne qui figure parmi ses experts.
  const ownsEntry = (entry: ExpertiseEntryResponse) =>
    Boolean(session && entry.experts.some((expert) => expert.user === session._id))

  // Le département et l'unité sélectionnés réduisent d'abord le périmètre, la
  // recherche textuelle ensuite : les deux filtres se combinent, l'utilisateur
  // peut ainsi chercher « quality » dans un seul département.
  const scoped = useMemo(
    () =>
      owned.filter((entry) => {
        if (departmentCode && entry.departmentCode !== departmentCode) return false
        if (unitPath && entry.unitPath !== unitPath) return false
        return true
      }),
    [owned, departmentCode, unitPath],
  )

  const matched = useExpertiseSearch(scoped, units, departments, search)

  // Les problèmes les plus récemment déclarés remontent en tête de liste.
  const visible = useMemo(
    () =>
      [...matched].sort((a, b) => {
        const at = a.createdAt ? Date.parse(a.createdAt) : 0
        const bt = b.createdAt ? Date.parse(b.createdAt) : 0
        if (bt !== at) return bt - at
        return a.problem.localeCompare(b.problem)
      }),
    [matched],
  )

  const counts = useMemo(() => {
    const byUnit = new Map<string, number>()
    for (const entry of owned) {
      byUnit.set(entry.unitPath, (byUnit.get(entry.unitPath) ?? 0) + 1)
    }
    const withExperts = owned.filter((entry) => entry.experts.length > 0).length
    const covered = new Set(owned.map((entry) => entry.departmentCode).filter(Boolean)).size
    return { byUnit, withExperts, covered }
  }, [owned])

  const openCreate = () => {
    setForm({ mode: "create", target: null })
    setProblem("")
    setDescription("")
    setExperts([])
    setFormError(null)
  }

  const openEdit = (entry: ExpertiseEntryResponse) => {
    setForm({ mode: "edit", target: entry })
    setProblem(entry.problem)
    setDescription(entry.description)
    setExperts(
      entry.experts.map((expert) => ({
        user: expert.user,
        email: expert.email,
        name: expert.name ?? expert.email,
      })),
    )
    setFormError(null)
  }

  const closeForm = () => {
    setForm(null)
    setFormError(null)
  }

  const addExpert = (userId: string) => {
    const user = userById.get(userId)
    if (!user) return
    // Un même expert ne peut pas figurer deux fois : le second deviendrait
    // ambigu pour savoir qui intervient en premier.
    if (experts.some((expert) => expert.user === userId)) return
    setExperts((current) => [
      ...current,
      { user: user._id, email: user.email, name: user.name },
    ])
  }

  const moveExpert = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= experts.length) return
    setExperts((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const label = problem.trim()
    if (label.length < 3) {
      setFormError("The problem needs a label of at least 3 characters.")
      return
    }
    // Le superviseur est son propre expert et son unité vient de son compte :
    // aucun des deux n'est saisi à l'écran, donc aucune garde de saisie ici.
    if (!isSupervisor && experts.length === 0) {
      setFormError("Assign at least one expert to this problem.")
      return
    }

    const targetUnit = form?.mode === "edit" ? form.target?.unitPath : unitPath
    if (!isSupervisor && !targetUnit) {
      setFormError("Select the unit where this problem occurs.")
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const base = {
        problem: label,
        description: description.trim(),
      }
      const roster = experts.map((expert) => ({ user: expert.user, email: expert.email }))

      if (form?.mode === "edit" && form.target) {
        await updateEntry(
          form.target.code,
          isSupervisor ? base : { ...base, experts: roster },
        )
      } else if (isSupervisor) {
        // Unité et expert déduits du compte par le backend.
        await createEntry(base)
      } else {
        await createEntry({ ...base, unitPath: targetUnit, experts: roster })
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The problem could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    setFormError(null)
    try {
      await deleteEntry(deleting.code)
      setDeleting(null)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The problem could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const selectedUnit = form?.mode === "edit" ? form.target?.unitPath : unitPath

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Experts &amp; problems
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          {isSupervisor
            ? "Browse the problems declared across the whole company. Declare the ones you must solve: they are attached to your unit and assigned to you automatically — you cannot change the other entries."
            : isAdmin
              ? "Pick a department, then a unit, and declare the problems that can happen there with the people able to handle them. A ticket arriving anywhere then points straight to the right expert."
              : "Browse the problems each unit can face and the people able to handle them, so a request points straight to the right expert."}
        </p>
      }
      breadcrumb="Services"
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      {/* Statistiques */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Problems declared
          </p>
          <p className="mt-1 text-2xl font-bold text-[#183b56]">{owned.length}</p>
        </div>
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            With an expert
          </p>
          <p className="mt-1 text-2xl font-bold text-[#183b56]">
            {counts.withExperts}
            <span className="ml-1 text-sm font-normal text-slate-400">/ {owned.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Departments covered
          </p>
          <p className="mt-1 text-2xl font-bold text-[#183b56]">
            {counts.covered}
            <span className="ml-1 text-sm font-normal text-slate-400">/ {departments.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Experts referenced
          </p>
          <p className="mt-1 text-2xl font-bold text-[#183b56]">
            {new Set(owned.flatMap((entry) => entry.experts.map((e) => e.user))).size}
          </p>
        </div>
      </div>

      {/* Étape 1 : département, puis unité. Sert de filtre de lecture à tous :
          elle ne pré-remplit plus rien pour un superviseur, dont le problème est
          toujours rattaché à sa propre unité. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#183b56] text-[11px] font-bold text-white">
              1
            </span>
            <label htmlFor="expertise-department" className="text-[13px] font-semibold text-[#183b56]">
              Department
            </label>
          </div>
          <select
            id="expertise-department"
            value={departmentCode}
            onChange={(event) => chooseDepartment(event.target.value)}
            className="mt-3 h-10 w-full rounded-lg border border-[#e5eaf2] bg-white px-3 text-sm text-[#183b56] outline-none focus:border-[#1aa6a6] focus:ring-2 focus:ring-[#1aa6a6]/20"
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.id} · {department.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#183b56] text-[11px] font-bold text-white">
              2
            </span>
            <label htmlFor="expertise-unit" className="text-[13px] font-semibold text-[#183b56]">
              Unit
            </label>
          </div>
          <select
            id="expertise-unit"
            value={unitPath}
            onChange={(event) => setUnitPath(event.target.value)}
            disabled={!departmentCode || departmentUnits.length === 0}
            className="mt-3 h-10 w-full rounded-lg border border-[#e5eaf2] bg-white px-3 text-sm text-[#183b56] outline-none focus:border-[#1aa6a6] focus:ring-2 focus:ring-[#1aa6a6]/20 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {departmentCode
                ? departmentUnits.length === 0
                  ? "No unit in this department"
                  : "Select a unit..."
                : "Select a department first"}
            </option>
            {departmentUnits.map((unit) => (
              <option key={unit.path} value={unit.path}>
                {unit.path} · {unit.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* La déclaration suit le choix de l'unité : le bouton reste sous les deux
          étapes, sinon il faudrait remonter pour l'atteindre. Un employé, lui,
          ne fait que consulter : le bouton ne lui est pas montré. Un
          superviseur déclare son problème sans rien choisir. */}
      {canManage && (
        <div className="mb-6 flex justify-end">
          <Button
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            onClick={openCreate}
            disabled={!isSupervisor && !unitPath}
            title={isSupervisor || unitPath ? undefined : "Select a unit first"}
          >
            <Plus className="size-4" />
            {isSupervisor ? "Declare a problem you must solve" : "Declare a problem"}
          </Button>
        </div>
      )}

      {/* Référentiel */}
      <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[15px] font-semibold text-[#183b56]">Referential</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {visible.length} problem{visible.length === 1 ? "" : "s"}
              {unitPath ? ` on unit ${unitPath}` : ""}
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
                className="h-10 pl-10"
                placeholder="Search a problem, an expert or a unit"
                aria-label="Search a problem, an expert or a unit"
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
                    ? "size-10 shrink-0 border-[#1aa6a6] bg-[#edf8f8] text-[#147878]"
                    : "size-10 shrink-0 border-[#dce5ed] text-[#183b56]"
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
            Listening... say a problem or an expert.
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

        {loading ? (
          <p className="flex items-center gap-2 p-8 text-[13px] text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading the referential...
          </p>
        ) : visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            {search.trim().length > 0 ? (
              <>
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Search className="size-5" />
                </div>
                <p className="text-sm font-medium text-[#183b56]">
                  No problem matches your search
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try another keyword, or clear the search to see the whole referential.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSearch("")}
                  className="mt-4 gap-2 text-[#183b56] hover:bg-[#f0f4f9]"
                >
                  Clear search
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[#183b56]">No problem declared yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  {!canManage
                    ? "No problem has been declared for this perimeter yet."
                    : isSupervisor
                      ? "Use the button above to declare the first problem you must solve."
                      : unitPath
                        ? `Declare the problems that can occur on unit ${unitPath} and assign their experts.`
                        : departmentCode
                          ? "This department has no declared problem. Select a unit to declare one."
                          : "Select a department then a unit to declare the problems it can face."}
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[#edf0f5]">
            {visible.map((entry) => (
              /* Sur téléphone la ligne s'empile : le titre garde toute la largeur,
                 les actions passent sur une ligne à part. */
              <li key={entry.code} className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-4 sm:p-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-5 text-[#183b56]">{entry.problem}</h3>

                  {/* Filière : les deux noms, les identifiants seulement en
                      infobulle, hors de la lecture d'un coup d'œil. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
                    {entry.departmentCode && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3 shrink-0 text-[#1aa6a6]" />
                        {departmentName.get(entry.departmentCode) ?? "Unknown department"}
                      </span>
                    )}
                    {entry.departmentCode && (
                      <ChevronRight className="size-3 shrink-0 text-slate-300" />
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Wrench className="size-3 shrink-0 text-[#1aa6a6]" />
                      {unitName.get(entry.unitPath) ?? "Unknown unit"}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400" title={entry.unitPath}>
                      {entry.code}
                    </span>
                    {!entry.active && (
                      <Badge variant="secondary" className="bg-slate-100 text-[11px] text-slate-500">
                        Inactive
                      </Badge>
                    )}
                  </div>

                  {entry.description && (
                    <p className="mt-2 text-[13px] leading-5 text-slate-500">{entry.description}</p>
                  )}

                  {/* Visage, nom, rôle : rien d'autre. Trois éléments tiennent
                      sur une ligne de téléphone, un e-mail de plus non. */}
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {entry.experts.map((expert, index) => (
                      <li key={expert.user} className="flex min-w-0 items-center gap-2">
                        <UserAvatar
                          userId={expert.user}
                          name={expert.name}
                          photo={expert.photo}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[13px] ${
                              index === 0 ? "font-medium text-[#183b56]" : "text-slate-600"
                            }`}
                          >
                            {expert.name ?? expert.email}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {index === 0 ? "primary expert" : `backup ${index}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Les actions s'alignent à droite dès qu'il y a de la place,
                    et se repartagent sur toute la largeur en dessous sinon. */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {counts.byUnit.get(entry.unitPath) ?? 1} on this unit
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#dce5ed] text-[#183b56]"
                    onClick={() => setViewing(entry)}
                  >
                    <Eye className="size-3.5" />
                    View details
                  </Button>
                  {canManage && (isAdmin || ownsEntry(entry)) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-[#dce5ed] text-[#183b56]"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => {
                          setDeleting(entry)
                          setFormError(null)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Création / modification d'un problème */}
      <Modal
        open={form !== null}
        title={
          form?.mode === "edit"
            ? `Edit ${form.target?.code ?? "problem"}`
            : isSupervisor
              ? "Declare a problem you must solve"
              : "Declare a problem"
        }
        description={
          isSupervisor
            ? `Attached to your unit ${session?.unitPath ?? "?"} · ${
                unitName.get(session?.unitPath ?? "") ?? ""
              } and assigned to you.`
            : form?.mode === "edit"
              ? `Unit ${form.target?.unitPath} · ${unitName.get(form.target?.unitPath ?? "") ?? ""}. The unit cannot be changed.`
              : selectedUnit
                ? `Unit ${selectedUnit} · ${unitName.get(selectedUnit) ?? ""}`
                : "Select a unit first."
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
              form="expertise-form"
              disabled={saving}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {form?.mode === "edit" ? "Save problem" : "Declare problem"}
            </Button>
          </>
        }
      >
        <form id="expertise-form" onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="expertise-problem" className="text-[13px] font-medium text-[#183b56]">
              Problem <span className="text-red-500">*</span>
            </label>
            <Input
              id="expertise-problem"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              className="h-10"
              maxLength={140}
              placeholder="Welding machine breakdown"
              required
              autoFocus
            />
            <p className="text-xs text-slate-400">
              Name the problem as the company does: this wording is what a ticket will be matched
              against.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="expertise-description" className="text-[13px] font-medium text-[#183b56]">
              Description <span className="font-normal text-slate-400">optional</span>
            </label>
            <Textarea
              id="expertise-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Symptoms, usual causes, anything that helps identify the problem."
            />
          </div>

          {/* Experts : le premier est le principal, les suivants des suppléants.
              Un superviseur est son propre expert : le sélecteur disparaît. */}
          {!isSupervisor && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-[13px] font-medium text-[#183b56]">
                Experts <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {experts.length} assigned
              </span>
            </div>

            <ExpertPicker
              users={users}
              selectedIds={experts.map((expert) => expert.user)}
              onAdd={addExpert}
            />

            {experts.length === 0 ? (
              <p className="text-xs text-slate-400">
                No expert yet. The first one added becomes the primary expert.
              </p>
            ) : (
              <ul className="space-y-2">
                {experts.map((expert, index) => (
                  /* Sur téléphone l'identité passe en haut et les trois boutons
                     prennent la largeur restante : aucun des deux ne serre
                     l'autre. */
                  <li
                    key={expert.user}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <UserAvatar
                        userId={expert.user}
                        name={expert.name}
                        photo={userById.get(expert.user)?.photo}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[#183b56]">
                          {expert.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{expert.email}</p>
                      </div>
                      <Badge
                        variant={index === 0 ? "secondary" : "outline"}
                        className={
                          index === 0
                            ? "shrink-0 bg-[#edf8f8] text-[11px] text-[#147878]"
                            : "shrink-0 border-[#e5eaf2] bg-white text-[11px] text-slate-500"
                        }
                      >
                        {index === 0 ? "primary" : `backup ${index}`}
                      </Badge>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      {/* Les deux positions se déplacent d'un cran : un bouton
                          large et bordered se vise sans viser juste. */}
                      <button
                        type="button"
                        aria-label={`Move ${expert.name} up`}
                        title={index === 0 ? "Already the primary expert" : "Move up"}
                        disabled={index === 0}
                        onClick={() => moveExpert(index, -1)}
                        className="flex size-8 items-center justify-center rounded-lg border border-[#dce5ed] bg-white text-[#183b56] transition-colors hover:border-[#1aa6a6] hover:bg-[#edf8f8] hover:text-[#147878] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${expert.name} down`}
                        title={
                          index === experts.length - 1
                            ? "Already the last backup"
                            : "Move down"
                        }
                        disabled={index === experts.length - 1}
                        onClick={() => moveExpert(index, 1)}
                        className="flex size-8 items-center justify-center rounded-lg border border-[#dce5ed] bg-white text-[#183b56] transition-colors hover:border-[#1aa6a6] hover:bg-[#edf8f8] hover:text-[#147878] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${expert.name}`}
                        title={`Remove ${expert.name}`}
                        onClick={() =>
                          setExperts((current) => current.filter((item) => item.user !== expert.user))
                        }
                        className="flex size-8 items-center justify-center rounded-lg border border-[#f0d7d7] bg-white text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[11px] leading-5 text-slate-400">
              Order matters: the first expert is the one proposed when a ticket arrives. The others
              are backups, used if the primary is unavailable. Use the arrows to change who comes
              first.
            </p>
          </div>
          )}
        </form>
      </Modal>

      {/* Détail d'un problème : lecture seule, avec ses experts et leurs visages */}
      <Modal
        open={viewing !== null}
        title={viewing ? `Problem details · ${viewing.code}` : "Problem details"}
        description={
          viewing ? unitName.get(viewing.unitPath) ?? "Unknown unit" : undefined
        }
        onClose={() => setViewing(null)}
        size="lg"
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
            {canManage && viewing && (isAdmin || ownsEntry(viewing)) && (
              <Button
                type="button"
                className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
                onClick={() => {
                  if (viewing) {
                    openEdit(viewing)
                    setViewing(null)
                  }
                }}
              >
                <Pencil className="size-4" />
                Edit this problem
              </Button>
            )}
          </>
        }
      >
        {viewing && (
          <div className="space-y-5">
            {/* Filière d'abord : on sait où le problème se pose avant de lire quoi que
                ce soit. Empilée sur téléphone, en ligne dès qu'il y a de la
                place. Les noms seuls, les identifiants bruitent. */}
            <div className="flex flex-col gap-2 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              {viewing.departmentCode && (
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#183b56]">
                  <Building2 className="size-4 shrink-0 text-[#1aa6a6]" />
                  {departmentName.get(viewing.departmentCode) ?? "Unknown department"}
                </span>
              )}
              {viewing.departmentCode && viewing.unitPath && (
                <>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-slate-300 sm:block" />
                  <span className="hidden text-[11px] text-slate-300 sm:block">/</span>
                </>
              )}
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#183b56]">
                <Wrench className="size-4 shrink-0 text-[#1aa6a6]" />
                {unitName.get(viewing.unitPath) ?? "Unknown unit"}
              </span>
              <div className="flex items-center gap-2 sm:ml-auto">
                <Badge
                  variant="outline"
                  className="border-[#e5eaf2] bg-white font-mono text-[11px] text-slate-500"
                >
                  {viewing.code}
                </Badge>
                {!viewing.active && (
                  <Badge variant="secondary" className="bg-slate-100 text-[11px] text-slate-500">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>

            {/* Le titre colle à sa description : les deux disent la même chose,
                l'un en court, l'autre en détail. */}
            <div className="space-y-1.5">
              <h3 className="text-[15px] font-semibold leading-6 text-[#183b56]">
                {viewing.problem}
              </h3>
              <p className="text-[13px] leading-5 text-slate-600">
                {viewing.description || "No description was provided for this problem."}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                People dedicated to this problem
              </p>
              {viewing.experts.length === 0 ? (
                <p className="text-[13px] text-slate-500">
                  No expert assigned. A ticket pointing here will have nobody to route to.
                </p>
              ) : (
                <ul className="space-y-2">
                  {viewing.experts.map((expert, index) => (
                    <li
                      key={expert.user}
                      className="flex items-center gap-3 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2.5"
                    >
                      <UserAvatar
                        userId={expert.user}
                        name={expert.name}
                        photo={expert.photo}
                        size="default"
                      />
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#183b56]">
                        {expert.name ?? expert.email}
                      </p>
                      <Badge
                        variant={index === 0 ? "secondary" : "outline"}
                        className={
                          index === 0
                            ? "bg-[#edf8f8] text-[11px] text-[#147878]"
                            : "border-[#e5eaf2] bg-white text-[11px] text-slate-500"
                        }
                      >
                        {index === 0 ? "primary expert" : `backup ${index}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Suppression */}
      <Modal
        open={deleting !== null}
        title="Delete this problem?"
        description={
          deleting
            ? `${deleting.problem} (${deleting.code}) will be removed from the referential.`
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
              disabled={saving}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleDelete()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
              Delete problem
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-4 text-[13px] text-slate-600">
            <p>
              Tickets will no longer be able to resolve an expert for this problem from the
              referential.
            </p>
            <div className="rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Current experts</p>
              <ul className="mt-2 space-y-1.5">
                {deleting.experts.map((expert, index) => (
                  <li key={expert.user} className="flex items-center gap-2 text-[#183b56]">
                    <UserAvatar
                      userId={expert.user}
                      name={expert.name}
                      photo={expert.photo}
                      size="sm"
                    />
                    <span className="truncate">
                      {index === 0 ? "Primary" : `Backup ${index}`} ·{" "}
                      {expert.name ?? expert.email}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}