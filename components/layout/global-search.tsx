"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Mic, MicOff, Network, Search, Ticket, Users } from "lucide-react"

import { Input } from "@/components/ui/input"
import { getToken } from "@/lib/auth"
import { createFuzzyFilter } from "@/lib/fuzzy-search"
import { useVoiceSearch } from "@/lib/voice-search"
import {
  companyApi,
  ticketApi,
  TICKET_STATUS_LABELS,
  unitApi,
  userApi,
  type AuthUser,
  type DepartmentResponse,
  type TicketResponse,
  type UnitResponse,
  type UserResponse,
} from "@/lib/api"

/**
 * Recherche globale de l'en-tête.
 *
 * Ouverte à tous, mais calibrée sur le rôle : l'administration peut chercher
 * l'annuaire complet, la file de tickets, les départements et les unités ;
 * superviseurs et employés cherchent leurs propres tickets et l'annuaire des
 * collègues (exposé par le serveur sous forme réduite), mais ni départements
 * ni unités — ces endpoints restent réservés à l'admin côté serveur.
 *
 * Le micro et le filtrage flou (Fuse.js) sont partagés avec les pages
 * Departments et Users & teams : la dictée alimente le même champ que la
 * frappe, et une saisie approximative — d'autant plus fréquente au micro —
 * retrouve la cible sans exiger la sous-chaîne exacte.
 */

/** Champs d'un utilisateur, du plus au moins pertinent pour la recherche. */
const USER_SEARCH_KEYS = [
  { name: "name", weight: 0.4 },
  { name: "email", weight: 0.3 },
  { name: "department", weight: 0.2 },
  { name: "unit", weight: 0.1 },
] as const

const TICKET_SEARCH_KEYS = [
  { name: "reference", weight: 0.35 },
  { name: "title", weight: 0.3 },
  { name: "createdByName", weight: 0.2 },
  { name: "description", weight: 0.15 },
] as const

const DEPARTMENT_SEARCH_KEYS = [
  { name: "name", weight: 0.5 },
  { name: "services", weight: 0.3 },
  { name: "description", weight: 0.2 },
] as const

const UNIT_SEARCH_KEYS = [
  { name: "name", weight: 0.45 },
  { name: "path", weight: 0.35 },
  { name: "departmentCode", weight: 0.1 },
  { name: "description", weight: 0.1 },
] as const
export function GlobalSearch({ user }: { user: AuthUser | null }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [users, setUsers] = useState<UserResponse[]>([])
  const [tickets, setTickets] = useState<TicketResponse[]>([])
  const [departments, setDepartments] = useState<DepartmentResponse[]>([])
  const [units, setUnits] = useState<UnitResponse[]>([])

  const isAdmin = Boolean(user && user.access.includes("admin"))

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées. Lancer le micro depuis l'en-tête ouvre le
  // panneau et pose le focus, pour que le résultat reste visible.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setQuery(transcript)
      setOpen(true)
      inputRef.current?.focus()
    },
  })

  // Les listes ne sont chargées qu'une fois, à la première ouverture. Elles sont
  // de taille interne (entreprise), un filtrage client n'a pas besoin de requêtes
  // supplémentaires à chaque frappe.
  useEffect(() => {
    if (!open || loaded) return
    const token = getToken()
    if (!token) return

    let alive = true
    setLoading(true)

    const load = async () => {
      try {
        if (isAdmin) {
          const [userRows, queue, deptRows, unitTree] = await Promise.all([
            userApi.list(token),
            ticketApi.queue(token),
            companyApi.listDepartments(token),
            unitApi.list(token),
          ])
          if (!alive) return
          setUsers(userRows)
          setTickets(queue.tickets)
          setDepartments(deptRows)
          setUnits(unitTree.units)
        } else {
          // L'annuaire est ouvert aux connectés (le serveur en retire les
          // champs sensibles) : superviseurs et employés trouvent un collègue
          // par son nom. Les autres lectures restent comme avant.
          const [userRows, mine] = await Promise.all([
            userApi.list(token),
            ticketApi.mine(token),
          ])
          if (!alive) return
          setUsers(userRows)
          // La page d'arrivée (« My Tickets ») n'affiche que les demandes
          // déposées : ne chercher que celles-là, pour que le clic aboutisse
          // toujours sur un ticket visible à l'arrivée.
          setTickets(mine.submitted)
        }
        setLoaded(true)
      } catch {
        // Une panne réseau n'empêche pas de naviguer : on laisse juste la
        // recherche fermée silencieusement.
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [open, isAdmin, loaded])

  // Fermeture au clic hors du champ, comme un menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

const needle = query.trim()

  // Chaque corpus est aplati une fois (liste chargée), puis passé à un filtre
  // Fuse.js : la frappe comme la dictée retrouvent leurs cibles malgré fautes
  // et préfixes tronqués, exactement comme sur Departments / Users & teams.
  const usersSearchable = useMemo(
    () =>
      users.map((entry) => ({
        item: entry,
        name: entry.name,
        email: entry.email,
        department: entry.departmentName ?? "",
        unit: entry.unitName ?? "",
      })),
    [users],
  )
  const userFilter = useMemo(
    () => createFuzzyFilter(usersSearchable, USER_SEARCH_KEYS),
    [usersSearchable],
  )
  const foundUsers = useMemo(() => {
    if (!needle) return []
    return userFilter(needle)
      .slice(0, 6)
      .map((entry) => entry.item)
  }, [needle, userFilter])

  const ticketsSearchable = useMemo(
    () =>
      tickets.map((entry) => ({
        item: entry,
        reference: entry.reference,
        title: entry.title,
        description: entry.description,
        createdByName: entry.createdByName ?? "",
      })),
    [tickets],
  )
  const ticketFilter = useMemo(
    () => createFuzzyFilter(ticketsSearchable, TICKET_SEARCH_KEYS),
    [ticketsSearchable],
  )
  const foundTickets = useMemo(() => {
    if (!needle) return []
    return ticketFilter(needle)
      .map((entry) => entry.item)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 6)
  }, [needle, ticketFilter])

  const departmentsSearchable = useMemo(
    () =>
      departments.map((entry) => ({
        item: entry,
        name: entry.name,
        services: entry.services.join(" "),
        description: entry.description ?? "",
      })),
    [departments],
  )
  const departmentFilter = useMemo(
    () => createFuzzyFilter(departmentsSearchable, DEPARTMENT_SEARCH_KEYS),
    [departmentsSearchable],
  )
  const foundDepartments = useMemo(() => {
    if (!needle || !isAdmin) return []
    return departmentFilter(needle)
      .slice(0, 6)
      .map((entry) => entry.item)
  }, [needle, isAdmin, departmentFilter])

  const unitsSearchable = useMemo(
    () =>
      units.map((entry) => ({
        item: entry,
        name: entry.name,
        path: entry.path,
        departmentCode: entry.departmentCode ?? "",
        description: entry.description ?? "",
      })),
    [units],
  )
  const unitFilter = useMemo(() => createFuzzyFilter(unitsSearchable, UNIT_SEARCH_KEYS), [unitsSearchable])
  const foundUnits = useMemo(() => {
    if (!needle || !isAdmin) return []
    return unitFilter(needle)
      .slice(0, 6)
      .map((entry) => entry.item)
  }, [needle, isAdmin, unitFilter])

  const hasAny =
    foundUsers.length > 0 ||
    foundTickets.length > 0 ||
    foundDepartments.length > 0 ||
    foundUnits.length > 0

  const go = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    // Visible dès le plus petit écran : le champ prend la largeur disponible et
    // se replie (min-w-0), puis retrouve sa largeur fixe à partir de md.
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1 md:w-72 md:flex-none"
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            event.currentTarget.blur()
          }
        }}
        placeholder="Search users, tickets, departments…"
        aria-label="Global search"
        aria-expanded={open}
        className="h-10 border-0 bg-slate-50 pl-10 pr-9 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#1aa6a6]"
      />

      {/*
        Micro intégré au champ, comme sur Departments et Users & teams : la
        phrase reconnue remplit la même recherche, qui filtre alors comme une
        frappe — y compris par Fuse.js. Masqué quand le navigateur n'expose pas
        la reconnaissance vocale.
      */}
      {voice.supported && (
        <button
          type="button"
          aria-label={voice.listening ? "Stop voice search" : "Search by voice"}
          aria-pressed={voice.listening}
          title={voice.listening ? "Stop listening" : "Search by voice"}
          onClick={() => {
            setOpen(true)
            inputRef.current?.focus()
            voice.toggle()
          }}
          className={`absolute top-1/2 right-1.5 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors ${
            voice.listening
              ? "bg-[#1aa6a6]/15 text-[#147878]"
              : "text-slate-400 hover:bg-slate-100 hover:text-[#183b56]"
          }`}
        >
          {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
      )}

      {open && (
        <div className="absolute top-12 left-0 z-50 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-[#e5eaf2] bg-white p-2 shadow-lg">
          {voice.listening && (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-[#147878]">
              <span className="size-2 animate-pulse rounded-full bg-[#1aa6a6]" />
              Listening... say a name, a reference or a keyword.
            </p>
          )}
          {voice.error && (
            <p role="alert" className="px-3 py-3 text-[13px] text-amber-700">
              {voice.error}
            </p>
          )}
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </p>
          ) : !needle ? (
            <p className="px-3 py-3 text-[13px] text-slate-400">
              Type to search users, tickets, departments and units.
            </p>
          ) : !hasAny ? (
            <p className="px-3 py-3 text-[13px] text-slate-400">No match for “{query.trim()}”.</p>
          ) : (
            <div className="space-y-2">
              {foundUsers.length > 0 && (
                <ResultGroup label="Users" icon={<Users className="size-3.5" />} count={foundUsers.length}>
                  {foundUsers.map((item) => (
                    <ResultRow
                      key={item._id}
                      icon="user"
                      title={item.name}
                      subtitle={[item.email, item.departmentName].filter(Boolean).join(" · ")}
                      onClick={() => go(`/admin/users?highlight=${encodeURIComponent(item._id)}`)}
                    />
                  ))}
                </ResultGroup>
              )}

              {foundTickets.length > 0 && (
                <ResultGroup label="Tickets" icon={<Ticket className="size-3.5" />} count={foundTickets.length}>
                  {foundTickets.map((item) => (
                    <ResultRow
                      key={item._id}
                      icon="ticket"
                      title={`${item.reference} — ${item.title}`}
                      subtitle={[
                        TICKET_STATUS_LABELS[item.status],
                        item.createdByName,
                        item.departmentName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onClick={() =>
                        go(
                          `${isAdmin ? "/admin/tickets" : "/tickets"}?highlight=${encodeURIComponent(item._id)}`,
                        )
                      }
                    />
                  ))}
                </ResultGroup>
              )}

              {foundDepartments.length > 0 && (
                <ResultGroup
                  label="Departments"
                  icon={<Building2 className="size-3.5" />}
                  count={foundDepartments.length}
                >
                  {foundDepartments.map((item) => (
                    <ResultRow
                      key={item.id}
                      icon="department"
                      title={item.name}
                      subtitle={item.description || item.services.join(", ") || "Department"}
                      onClick={() => go(`/admin/departments?highlight=${encodeURIComponent(item.id)}`)}
                    />
                  ))}
                </ResultGroup>
              )}

              {foundUnits.length > 0 && (
                <ResultGroup label="Units" icon={<Network className="size-3.5" />} count={foundUnits.length}>
                  {foundUnits.map((item) => (
                    <ResultRow
                      key={item.path}
                      icon="unit"
                      title={item.name}
                      subtitle={[item.path, item.departmentCode].filter(Boolean).join(" · ")}
                      onClick={() => go(`/admin/units?highlight=${encodeURIComponent(item.path)}`)}
                    />
                  ))}
                </ResultGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({
  label,
  icon,
  count,
  children,
}: {
  label: string
  icon: ReactNode
  count: number
  children: ReactNode
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-3 pt-1 pb-1 text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
        {icon}
        {label}
        <span className="text-slate-300">({count})</span>
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

const ROW_ICONS: Record<string, ReactNode> = {
  user: <Users className="size-4 text-[#1aa6a6]" />,
  ticket: <Ticket className="size-4 text-[#1aa6a6]" />,
  department: <Building2 className="size-4 text-[#1aa6a6]" />,
  unit: <Network className="size-4 text-[#1aa6a6]" />,
}

function ResultRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#f7f9fc]"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#eef7f7]">
        {ROW_ICONS[icon]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[#183b56]">{title}</span>
        <span className="block truncate text-[11.5px] text-slate-400">{subtitle}</span>
      </span>
    </button>
  )
}