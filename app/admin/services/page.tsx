"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import {
  BriefcaseBusiness,
  Check,
  Gauge,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  UserX,
} from "lucide-react"

import { AdminGuard } from "@/components/auth/admin-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useCompanyAdmin } from "@/lib/company"
import { unitsForDepartment } from "@/lib/units"
import { useVoiceSearch } from "@/lib/voice-search"
import { createFuzzyFilter } from "@/lib/fuzzy-search"
import { connectRealtime } from "@/lib/realtime"
import { getInitials, getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_CLASSES,
  TICKET_PRIORITY_LABELS,
  absenceLabel,
  isAvailable,
  serviceApi,
  unitApi,
  userApi,
  type ServiceResponse,
  type TicketPriority,
  type UnitResponse,
  type UserResponse,
} from "@/lib/api"

/**
 * Brouillon du formulaire : rien n'est obligatoire dans la saisie, mais le
 * serveur refuse un service sans superviseur — la demande lancée par l'équipe
 * doit toujours savoir où atterrir.
 */
interface ServiceDraft {
  name: string
  description: string
  departmentCode: string
  unitPath: string
  priority: TicketPriority
  supervisorId: string
  active: boolean
}

const EMPTY_DRAFT: ServiceDraft = {
  name: "",
  description: "",
  departmentCode: "",
  unitPath: "",
  priority: "medium",
  supervisorId: "",
  active: true,
}

export default function ServicesPage() {
  return (
    <AdminGuard includeManager>
      <Suspense fallback={null}>
        <Services />
      </Suspense>
    </AdminGuard>
  )
}

function Services() {
  const { departments } = useCompanyAdmin()

  const [services, setServices] = useState<ServiceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Référentiels du formulaire : les unités pour le sélecteur de périmètre,
  // et les superviseurs pour le détenteur dédié (seule la hiérarchie reçoit
  // des tickets).
  const [units, setUnits] = useState<UnitResponse[]>([])
  const [supervisors, setSupervisors] = useState<UserResponse[]>([])

  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<ServiceResponse | null>(null)
  const [deleting, setDeleting] = useState<ServiceResponse | null>(null)
  const [draft, setDraft] = useState<ServiceDraft>(EMPTY_DRAFT)

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setSearch(transcript)
    },
  })

  const load = async (options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      setServices(await serviceApi.list(token))
    } catch (cause) {
      // Une mise à jour ratée en arrière-plan laisse l'écran tel quel ; le
      // premier chargement, lui, porte l'erreur jusqu'à l'utilisateur.
      if (silent) return
      setError(cause instanceof ApiError ? cause.message : "Unable to load the service catalogue.")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Référentiels chargés une fois : ils changent rarement, et un échec de
    // chargement ne doit pas bloquer la liste des services.
    const token = getToken()
    if (!token) return
    void Promise.all([
      unitApi
        .list(token)
        .then((data) => setUnits(data.units))
        .catch(() => {}),
      userApi
        .list(token)
        .then((users) => setSupervisors(users))
        .catch(() => {}),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Temps réel : un service ajouté, corrigé ou retiré par un autre poste
  // arrive par `services:updated` — la liste se met à jour d'elle-même, sans
  // recharger la page. Les rafraîchissements se groupent, et une reconnexion
  // rattrape au passage les événements passés pendant la coupure.
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
    const onReconnect = () => void load({ silent: true })
    socket.on("services:updated", onUpdated)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("services:updated", onUpdated)
      socket.io.off("reconnect", onReconnect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchable = useMemo(
    () =>
      services.map((service) => ({
        item: service,
        name: service.name,
        code: service.code,
        description: service.description,
        supervisorName: service.supervisorName,
        departmentName: service.departmentName ?? "",
      })),
    [services],
  )

  const filterServices = useMemo(
    () =>
      createFuzzyFilter(searchable, [
        { name: "name", weight: 3 },
        { name: "code", weight: 2 },
        { name: "supervisorName", weight: 1 },
        { name: "departmentName", weight: 1 },
        { name: "description", weight: 1 },
      ]),
    [searchable],
  )

  // Le filtre travaille sur les entrées indexables : on ne garde que le service.
const filtered = useMemo(
  () => filterServices(search).map((entry) => entry.item),
  [filterServices, search],
)

  // Unités portées par le département choisi : le superviseur dédié reçoit
  // dans ce périmètre, il faut donc pouvoir le choisir.
  const unitOptions = useMemo(() => {
    if (!draft.departmentCode) return []
    return unitsForDepartment(units, draft.departmentCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, draft.departmentCode])

  // La hiérarchie seule peut recevoir un ticket. Les administrateurs restent
  // proposés, comme partout : un compte sans `access` est traité comme tel.
  const supervisorOptions = useMemo(
    () =>
      supervisors
        .filter((user) => user.access.includes("manager") || user.access.includes("admin"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [supervisors],
  )

  const openCreate = () => {
    setFormMode("create")
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const openEdit = (service: ServiceResponse) => {
    setFormMode("edit")
    setEditing(service)
    setDraft({
      name: service.name,
      description: service.description,
      departmentCode: service.departmentCode ?? "",
      unitPath: service.unitPath ?? "",
      priority: service.priority,
      supervisorId: service.supervisorId ?? "",
      active: service.active,
    })
    setFormError(null)
  }

  const closeForm = () => {
    setFormMode(null)
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = draft.name.trim()
    const description = draft.description.trim()
    if (name.length < 3 || description.length < 5) {
      setFormError("Give the service a name and describe what it covers.")
      return
    }
    if (!draft.supervisorId) {
      setFormError("Choose the supervisor who receives requests for this service.")
      return
    }

    // Champ vide ou « no scope » → undefined : le serveur l'interprète comme
    // « pas de périmètre fixé », et le centre garde la main dessus.
    const input = {
      name,
      description,
      departmentCode: draft.departmentCode || undefined,
      unitPath: draft.unitPath || undefined,
      priority: draft.priority,
      supervisorId: draft.supervisorId,
      active: draft.active,
    }

    setSaving(true)
    setFormError(null)
    try {
      const token = getToken()
      if (!token) throw new Error("no token")
      if (formMode === "edit" && editing) {
        const updated = await serviceApi.update(token, editing._id, input)
        setServices((current) =>
          current.map((service) => (service._id === updated._id ? updated : service)),
        )
      } else {
        const created = await serviceApi.create(token, input)
        setServices((current) => [...current, created])
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "The service could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return

    setSaving(true)
    setFormError(null)
    try {
      const token = getToken()
      if (!token) throw new Error("no token")
      await serviceApi.remove(token, deleting._id)
      setServices((current) => current.filter((service) => service._id !== deleting._id))
      setDeleting(null)
      if (editing?._id === deleting._id) closeForm()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "The service could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const formTitle =
    formMode === "edit" && editing ? `Edit ${editing.name}` : "Create a new service"

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Service catalogue
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Prepare ready-made services: the team requests them in one click, and the request goes
          straight to the dedicated supervisor.
        </p>
      }
      actions={
        <Button
          className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          onClick={openCreate}
          disabled={loading}
        >
          <Plus className="size-4" />
          New service
        </Button>
      }
    >
      <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#183b56]">Catalogue</h2>
            <p className="mt-1 text-sm text-slate-500">
              {services.length} service{services.length === 1 ? "" : "s"} ready to use
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
                placeholder="Search a service"
                aria-label="Search a service"
              />
            </div>
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
            Listening... say a service name.
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

        {loading && services.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading the service catalogue...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <BriefcaseBusiness className="size-5" />
            </div>
            <p className="text-sm font-medium text-[#183b56]">
              {services.length === 0
                ? "No service yet"
                : "No service matches your search"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {services.length === 0
                ? "Create your first service so the team can request it in one click."
                : "Try another keyword or clear the search field."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#edf0f5]">
            {filtered.map((service) => (
              <li
                key={service._id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                    <BriefcaseBusiness className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#183b56]">{service.name}</p>
                      <Badge
                        variant="outline"
                        className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
                      >
                        {service.code}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={TICKET_PRIORITY_CLASSES[service.priority]}
                      >
                        {TICKET_PRIORITY_LABELS[service.priority]}
                      </Badge>
                      {!service.active && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
                      {service.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                      {(service.departmentName || service.unitName) && (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="size-3.5" />
                          {service.departmentName ?? "—"}
                          {service.unitName ? ` · ${service.unitName}` : ""}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3.5" />
                        {service.supervisorName}
                      </span>
                      {service.configuredByName && (
                        <span>prepared by {service.configuredByName}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#dce5ed] text-[#183b56]"
                    onClick={() => openEdit(service)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setDeleting(service)
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

      {/* Création / modification d'un service */}
      <Modal
        open={formMode !== null}
        title={formTitle}
        description={
          formMode === "edit"
            ? "Update this service. Requests already sent keep their title and priority."
            : "A ready-made request: the team only adds a description, everything else is set here."
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
              form="service-form"
              disabled={saving}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {formMode === "edit" ? "Save service" : "Create service"}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="service-name" className="text-[13px] font-medium text-[#183b56]">
              Service name <span className="text-red-500">*</span>
            </label>
            <Input
              id="service-name"
              value={draft.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="h-10"
              maxLength={140}
              placeholder="Password reset request"
              required
              autoFocus
            />
            <span className="block text-[11.5px] text-slate-400">
              Shown to the team and used as the ticket title. At least 3 characters.
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="service-description"
                className="text-[13px] font-medium text-[#183b56]"
              >
                What this service covers
                <span className="ml-1.5 font-normal text-slate-400">*</span>
              </label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {draft.description.length}/2000
              </span>
            </div>
            <Textarea
              id="service-description"
              value={draft.description}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              maxLength={2000}
              placeholder="What requests fit this service, what is expected, and anything the team should know."
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="service-department"
              className="text-[13px] font-medium text-[#183b56]"
            >
              Department
              <span className="ml-1.5 font-normal text-slate-400">optional</span>
            </label>
            <Select
              id="service-department"
              value={draft.departmentCode}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setDraft((current) => ({
                  ...current,
                  departmentCode: event.target.value,
                  unitPath: "",
                }))
              }
            >
              <option value="">No fixed department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
            <span className="block text-[11.5px] text-slate-400">
              The ticket created from this service is attached to this scope. Leave empty to let the
              dispatch centre decide.
            </span>
          </div>

          {draft.departmentCode && unitOptions.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="service-unit" className="text-[13px] font-medium text-[#183b56]">
                Unit
                <span className="ml-1.5 font-normal text-slate-400">optional</span>
              </label>
              <Select
                id="service-unit"
                value={draft.unitPath}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  setDraft((current) => ({ ...current, unitPath: event.target.value }))
                }
              >
                <option value="">The whole department</option>
                {unitOptions.map((unit) => (
                  <option key={unit.path} value={unit.path}>
                    {unit.path} · {unit.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <span className="text-[13px] font-medium text-[#183b56]">
              Dedicated supervisor <span className="text-red-500">*</span>
            </span>
            {supervisorOptions.length === 0 ? (
              <p className="rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2 text-[13px] text-slate-500">
                No supervisor account exists yet. Create one with the Supervisor role before
                publishing a service.
              </p>
            ) : (
              // Une liste plutôt qu'un menu déroulant : choisir un détenteur
              // demande de le reconnaître, pas seulement de lire son nom. La
              // photo est celle du compte, déjà réduite côté client à
              // l'enregistrement.
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {supervisorOptions.map((user) => {
                  const unavailable = !isAvailable(user.availability)
                  return (
                    <label
                      key={user._id}
                      className={
                        unavailable
                          ? "flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2 opacity-80"
                          : draft.supervisorId === user._id
                            ? "flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#1aa6a6] bg-[#f2fbfb] px-3 py-2"
                            : "flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e5eaf2] px-3 py-2 hover:bg-[#f7f9fc]"
                      }
                    >
                      <input
                        type="radio"
                        name="service-supervisor"
                        value={user._id}
                        checked={draft.supervisorId === user._id}
                        disabled={unavailable}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            supervisorId: event.target.value,
                          }))
                        }
                        className="size-4"
                      />

                      <Avatar className="size-8">
                        {user.photo ? <AvatarImage src={user.photo} alt="" /> : null}
                        <AvatarFallback className="bg-[#d7eeee] text-[11px] font-semibold text-[#176b6b]">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>

                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-[#183b56]">
                          {user.name}
                        </span>
                        <span className="block text-[11.5px] text-slate-400">
                          {[user.departmentName ?? user.departmentCode, user.unitName ?? user.unitPath]
                            .filter(Boolean)
                            .join(" · ") || "No department or unit set"}
                        </span>
                        {unavailable && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-amber-600">
                            <UserX className="size-3" />
                            {absenceLabel(user.availability, user.availabilityNote)}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <span className="block text-[11.5px] text-slate-400">
              Requests on this service are assigned to them the moment they are sent. A supervisor
              who declared an absence stays listed, but cannot be chosen.
            </span>
          </div>

          <div className="space-y-2">
            <label htmlFor="service-priority" className="text-[13px] font-medium text-[#183b56]">
              Default priority
            </label>
            <Select
              id="service-priority"
              value={draft.priority}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setDraft((current) => ({
                  ...current,
                  priority: event.target.value as TicketPriority,
                }))
              }
            >
              {TICKET_PRIORITIES.map((key) => (
                <option key={key} value={key}>
                  {TICKET_PRIORITY_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2.5 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3.5 py-3">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((current) => ({ ...current, active: event.target.checked }))
              }
              className="size-4 accent-[#1aa6a6]"
            />
            <span className="text-[13px] font-medium text-[#183b56]">
              Available to the team
            </span>
          </label>
        </form>
      </Modal>

      {/* Suppression */}
      <Modal
        open={deleting !== null}
        title="Delete this service?"
        description={
          deleting
            ? `${deleting.name} (${deleting.code}) will be removed from the catalogue.`
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
              Delete service
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-slate-600">
          Requests already sent keep their title, priority and assigned supervisor: they do not
          depend on this service. Only the catalogue entry disappears.
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