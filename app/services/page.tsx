"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, Suspense } from "react"
import {
  BriefcaseBusiness,
  Check,
  Gauge,
  Loader2,
  Mic,
  MicOff,
  Search,
  X,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ServiceRequestDialog } from "@/components/services/service-request-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials, getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITY_CLASSES,
  TICKET_PRIORITY_LABELS,
  serviceApi,
  type ServiceResponse,
  type TicketResponse,
} from "@/lib/api"
import { useVoiceSearch } from "@/lib/voice-search"
import { createFuzzyFilter } from "@/lib/fuzzy-search"
import { connectRealtime } from "@/lib/realtime"

/**
 * « Service catalogue » : la vitrine des services préparés par l'administration.
 *
 * Ce que l'employé et le superviseur demandent se trouve ici, pas dans les
 * tickets : demander un service n'est pas déclarer un problème, et mélanger les
 * deux rendait « My Tickets » confus. Un clic ouvre la demande, dont tout est
 * verrouillé par le service — seule la description reste libre.
 */
export default function ServiceCataloguePage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <ServiceCatalogue />
      </Suspense>
    </AuthGuard>
  )
}

function ServiceCatalogue() {
  const [services, setServices] = useState<ServiceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  // Service en cours de demande : ouvre le dialogue pré-rempli.
  const [requesting, setRequesting] = useState<ServiceResponse | null>(null)
  // Dernière demande envoyée : la confirmation porte sa référence, et la
  // fermer rend l'écran à son état d'avant.
  const [lastRequest, setLastRequest] = useState<TicketResponse | null>(null)

  // La dictée alimente le même champ que la frappe clavier.
  const voice = useVoiceSearch({
    onResult: (transcript) => setSearch(transcript),
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
  }, [])

  // Temps réel : un service ajouté, corrigé ou retiré par un autre poste
  // arrive par `services:updated` — la vitrine se met à jour d'elle-même,
  // sans recharger la page. Les rafraîchissements se groupent, et une
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
    const onReconnect = () => void load({ silent: true })
    socket.on("services:updated", onUpdated)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("services:updated", onUpdated)
      socket.io.off("reconnect", onReconnect)
    }
  }, [])

  // Seuls les services disponibles sont demandables ; les désactivés restent
  // invisibles ici, et se voient dans l'écran d'administration.
  const activeServices = useMemo(() => services.filter((service) => service.active), [services])

  const searchable = useMemo(
    () =>
      activeServices.map((service) => ({
        item: service,
        name: service.name,
        code: service.code,
        description: service.description,
        supervisorName: service.supervisorName,
        departmentName: service.departmentName ?? "",
      })),
    [activeServices],
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

  const filtered = useMemo(
    () => filterServices(search).map((entry) => entry.item),
    [filterServices, search],
  )

  return (
    <DashboardShell
      title="Service catalogue"
      subtitle="Browse ready-made services and request one in a single click: it goes straight to the service's supervisor."
    >
      <div className="space-y-5">
        {lastRequest && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 text-[13px] text-emerald-800">
              <p className="font-medium">
                Request sent — {lastRequest.reference} was created for {lastRequest.assignedToName}.
              </p>
              <p className="mt-0.5 text-emerald-700">
                The supervisor of this service will take it from there.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-emerald-700 hover:bg-emerald-100"
              onClick={() => setLastRequest(null)}
            >
              <X className="size-3.5" />
              Dismiss
            </Button>
            <Link
              href="/tickets"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "shrink-0 gap-1.5 text-emerald-700 hover:bg-emerald-100",
              })}
            >
              Track it
            </Link>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#183b56]">Available services</h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeServices.length} service{activeServices.length === 1 ? "" : "s"} you can
                request right now
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-96">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
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
                {activeServices.length === 0
                  ? "No service available yet"
                  : "No service matches your search"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {activeServices.length === 0
                  ? "Check back later, or declare a ticket for anything not covered here."
                  : "Try another keyword or clear the search field."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((service) => (
                <button
                  key={service._id}
                  type="button"
                  onClick={() => setRequesting(service)}
                  className="group flex flex-col gap-2.5 rounded-xl border border-[#e5eaf2] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#1aa6a6] hover:bg-[#f7fbfb]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#edf8f8] text-[#1aa6a6]">
                      <BriefcaseBusiness className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#183b56]">
                        {service.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={TICKET_PRIORITY_CLASSES[service.priority]}
                      >
                        {TICKET_PRIORITY_LABELS[service.priority]}
                      </Badge>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-5 text-slate-500">
                    {service.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar className="size-6">
                        {service.supervisorPhoto ? (
                          <AvatarImage src={service.supervisorPhoto} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-[#d7eeee] text-[10px] font-semibold text-[#176b6b]">
                          {getInitials(service.supervisorName)}
                        </AvatarFallback>
                      </Avatar>
                      {service.supervisorName}
                    </span>
                    {(service.departmentName ?? service.unitName) && (
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="size-3.5" />
                        {service.departmentName ?? ""}
                        {service.unitName ? ` · ${service.unitName}` : ""}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ServiceRequestDialog
        service={requesting}
        onClose={() => setRequesting(null)}
        onRequested={(created) => {
          setRequesting(null)
          setLastRequest(created)
        }}
      />
    </DashboardShell>
  )
}