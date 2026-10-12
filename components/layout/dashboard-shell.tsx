"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import {
  BarChart3,
  BookMarked,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ClipboardList,
  Gauge,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Menu,
  Network,
  Send,
  Settings2,
  Ticket,
  UserX,
  Users,
  Wrench,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { GlobalSearch } from "@/components/layout/global-search"
import { ProfileMenu } from "@/components/layout/profile-menu"
import {
  ABSENCE_REASON_LABELS,
  isAvailable,
  type AbsenceReason,
  type AvailabilityStatus,
} from "@/lib/api"
import { NotificationBell } from "@/components/realtime/notification-bell"
import { useUnseenBadge, type UnseenBadgeKind } from "@/components/realtime/unseen-badge-provider"
import { useSessionUser } from "@/lib/use-session"
import { useCompanyProfile } from "@/lib/company"

interface NavItem {
  label: string
  icon: ComponentType<{ className?: string }>
  /**
   * Compteur dynamique, résolu au rendu.
   *
   * `dispatchUnseen` lit le nombre de tickets attendant une première décision,
   * `assignedUnseen` le nombre de dossiers attendant le superviseur. Les deux
   * retombent à zéro à l'ouverture de leur écran. La valeur n'est pas portée par
   * l'entrée : elle change en cours de session, et un module ne peut pas la connaître.
   */
  badge?: UnseenBadgeKind
  href?: string
  /**
   * Masquée aux seuls administrateurs. Un écran partagé (consultation seule)
   * glissé comme entrée « doublon » pour les non-admins : l'admin, lui, garde
   * la version complète de « Platform administration ».
   */
  hideForAdmins?: boolean
  /**
   * Cible du superviseur. Une entrée partagée avec l'admin peut mener ailleurs
   * selon le rôle : le superviseur prépare le catalogue alors que l'admin le
   * commande, ou l'inverse. Résolue à la valeur de `href` pour l'admin.
   */
  managerHref?: string
}

interface NavGroup {
  label: string
  adminOnly?: boolean
  /**
   * Rendu aux seuls employés, et à eux seuls. Les entrées listées ici ne
   * descendant pas à un rôle : un employé qui les verrait n'aurait derrière
   * aucune page qui lui appartienne.
   */
  employeeOnly?: boolean
  items: NavItem[]
}

/**
 * Accueil d'un employé.
 *
 * Ce que sa vie quotidienne touche : son activité, le ticketing, les services
 * qu'il peut demander, la base de connaissances — une référence commune qu'il
 * peut consulter et filtrer sans rien pouvoir y écrire — et ses informations
 * personnelles. Les groupes Control / Organisation restent masqués car leurs
 * entrées sont soit réservées à l'administration, soit des écrans hors de sa
 * portée.
 */
const employeeNavGroups: NavGroup[] = [
  {
    label: "My work",
    items: [
      { label: "My activity", icon: LayoutDashboard, href: "/" },
      { label: "My Tickets", icon: Ticket, href: "/tickets" },
    ],
  },
  {
    label: "Services",
    items: [
      { label: "Service catalogue", icon: BriefcaseBusiness, href: "/services" },
      // Même stratégie SLA que celle que lit la hiérarchie : l'employé voit le
      // délai de réponse promis pour chaque priorité.
      { label: "SLA response deadlines", icon: Gauge, href: "/sla" },
      // Référentiel des experts en lecture seule : l'employé sait qui traite
      // quel problème, sans rien pouvoir y changer.
      { label: "Experts & problems", icon: Wrench, href: "/admin/experts" },
    ],
  },
  {
    label: "Recommendations",
    items: [
      { label: "Recommendations", icon: Megaphone, href: "/recommendations" },
      { label: "Knowledge base", icon: BookOpen, href: "/knowledge" },
    ],
  },
  {
    label: "Organisation",
    items: [
      // Annuaire en lecture seule : l'employé voit ses collègues, sans action.
      { label: "Users & teams", icon: Users, href: "/admin/users" },
      // Les processus du système, expliqués en schémas : utiles à tous.
      { label: "Workflows", icon: ClipboardList, href: "/workflows" },
      // Le guide d'utilisation, documenté par section et par rôle.
      { label: "User manual", icon: BookMarked, href: "/manual" },
      { label: "Personal settings", icon: Settings2, href: "/settings" },
    ],
  },
]

const navGroups: NavGroup[] = [
  {
    label: "Support",
    // Réservé à l'administration : distribuer un ticket est une décision qui
    // engage un tiers. Un superviseur garde « My Tickets » et « Tickets to
    // handle », qui sont ses propres dossiers.
    adminOnly: true,
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/" },
      {
        label: "Dispatch centre",
        icon: Inbox,
        href: "/admin/tickets",
        badge: "dispatch",
      },
    ],
  },
  {
    label: "Control",
    items: [
      { label: "Tickets to handle", icon: ListTodo, href: "/assigned", badge: "assigned" },
      { label: "My Tickets", icon: Ticket, href: "/tickets" },
    ],
  },
  {
    label: "Recommendations",
    // Reçues d'un côté, diffusées de l'autre : les deux activités ne se
    // lisent pas du même écran, l'une recevant ce que l'autre envoie. Seul
    // l'administration et les responsables y accèdent — un employé ne voit
    // pas ce groupe et garde l'entrée de réception de sa section « My work ».
    items: [
      { label: "Recommendations", icon: Megaphone, href: "/recommendations" },
      { label: "My publications", icon: Send, href: "/recommendations/published" },
      { label: "Knowledge base", icon: BookOpen, href: "/knowledge" },
    ],
  },
  {
    label: "Services",
    // Une seule place pour le catalogue et la stratégie SLA, quel que soit le
    // rôle : l'admin les gère (/admin/services, /admin/sla) et le superviseur
    // prépare le catalogue et lit la stratégie. Cette section remplace les deux
    // entrées qui vivaient dans « Platform administration » — rien d'autre ne
    // les affiche, ce qui évite le doublon.
    items: [
      { label: "Service catalogue", icon: BriefcaseBusiness, href: "/admin/services" },
      { label: "SLA response deadlines", icon: Gauge, href: "/admin/sla", managerHref: "/sla" },
      // Stock de matériel : l'admin alimente l'inventaire, le superviseur le
      // consulte et libère des biens quand il répond à un ticket.
      { label: "Assets & CMDB", icon: Network, href: "/assets" },
      // Référentiel des problèmes par unité : l'admin le tient, mais le
      // superviseur qui connaît le terrain déclare aussi les problèmes et
      // désigne leurs experts.
      { label: "Experts & problems", icon: Wrench, href: "/admin/experts" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { label: "Workflows", icon: ClipboardList, href: "/workflows" },
      { label: "User manual", icon: BookMarked, href: "/manual" },
      // Un superviseur n'administre pas la plateforme, mais consulte
      // l'annuaire : l'admin garde l'entrée complète de « Platform
      // administration » et ne voit donc pas ce doublon.
      { label: "Users & teams", icon: Users, href: "/admin/users", hideForAdmins: true },
      { label: "Settings", icon: Settings2, href: "/settings" },
    ],
  },
  {
    label: "Platform administration",
    adminOnly: true,
    items: [
      { label: "Company information", icon: Landmark, href: "/admin/company" },
      { label: "Departments", icon: Building2, href: "/admin/departments" },
      { label: "Organizational Structure", icon: Network, href: "/admin/units" },
      { label: "Users & teams", icon: Users, href: "/admin/users" },
      // « Experts & problems » vit désormais dans la section « Services »,
      // partagée avec les superviseurs : l'entrée n'est pas dupliquée ici.
      { label: "Reports & KPIs", icon: BarChart3, href: "/admin/analytics" },
    ],
  },
]

const ROLE_LABELS: Record<string, string> = {
  admin: "Manager (Gérant)",
  manager: "Supervisor (Responsable)",
  employee: "Employee",
}

function formatRole(access?: string[]) {
  if (!access || access.length === 0) return ROLE_LABELS.admin
  return access.map((role) => ROLE_LABELS[role] ?? role).join(" · ")
}

const DashboardToastContext = createContext<(message: string) => void>(() => {})

export function useDashboardToast() {
  return useContext(DashboardToastContext)
}

/**
 * Pastille d'indisponibilité.
 *
 * Rien n'est affiché quand la personne est disponible : un badge « Available »
 * répéterait une absence d'information et alourdirait l'en-tête. Le libellé du
 * motif est porté par `title`, ce qui laisse le survol disponible sans rogner le
 * texte sur mobile.
 */
function AvailabilityBadge({
  status,
  className,
}: {
  status?: AvailabilityStatus
  className?: string
}) {
  if (isAvailable(status)) return null

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ${className ?? ""}`}
      title={`Unavailable — ${ABSENCE_REASON_LABELS[status as AbsenceReason]}`}
    >
      <UserX className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{ABSENCE_REASON_LABELS[status as AbsenceReason]}</span>
    </span>
  )
}

/**
 * Ce que chaque compteur annonce, une fois le nombre connu.
 *
 * La formule est distincte pour chaque section, et elle doit l'être : « 3 » à côté
 * de « Dispatch centre » et « 3 » à côté de « Tickets to handle » ne désignent pas la
 * même chose, et une personne qui ne voit que la pastille doit pouvoir les distinguer
 * au premier coup d'œil.
 */
const UNSEEN_LABELS: Record<UnseenBadgeKind, (count: number) => string> = {
  dispatch: (count) => `${count} ticket${count > 1 ? "s" : ""} awaiting a first review`,
  assigned: (count) => `${count} ticket${count > 1 ? "s" : ""} waiting to be handled`,
}

/**
 * Pastille de compteur sur une entrée de navigation.
 *
 * Rien n'est rendu à zéro : une pastille « 0 » signalerait un travail à faire
 * alors qu'il n'y en a pas. Au-delà de 99 la pastille est plafonnée, avec la
 * valeur exacte en infobulle — un nombre à cinq chiffres déformerait la barre
 * latérale sans rien apprendre de plus.
 *
 * Le chiffre est doublé d'un libellé : pour un lecteur d'écran, « 3 » seul ne
 * dit pas ce qu'il faut faire. La région `status` fait en outre annoncer la mise
 * à jour quand le compteur change, sans que la personne soit déjà sur l'écran concerné.
 */
function NavBadge({ item, isActive }: { item: NavItem; isActive: boolean }) {
  // Le compteur est demandé même pour une entrée sans pastille, et non
  // conditionnellement : un hook appelé dans une branche n'en serait pas un. La
  // valeur lue est alors ignorée, et une section sans compteur n'en a pas.
  const { count: unseen } = useUnseenBadge(item.badge ?? "dispatch")
  if (!item.badge || unseen <= 0) return null

  const exact = UNSEEN_LABELS[item.badge](unseen)
  const shown = unseen > 99 ? "99+" : String(unseen)

  return (
    <span
      role="status"
      aria-label={exact}
      title={exact}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
        isActive ? "bg-white/15 text-white" : "bg-[#1aa6a6]/10 text-[#0f7c7c]"
      }`}
    >
      {shown}
    </span>
  )
}

/**
 * Une entrée de navigation, lien ou bouton.
 *
 * Composant à part entière, et non JSX inline, pour une raison précise : il lit
 * le compteur dans le contexte, or le `DashboardShell` qui fournit ce contexte
 * est aussi le composant qui rend cette liste. Un `useDispatchUnseen()` appelé
 * dans le shell lirait la valeur par défaut — celle d'avant la fourniture — et
 * l'effacement au clic ne se déclencherait jamais.
 */
function NavEntry({
  item,
  isActive,
  notify,
}: {
  item: NavItem
  isActive: boolean
  notify: (message: string) => void
}) {
  const { markSeen } = useUnseenBadge(item.badge ?? "dispatch")
  const Icon = item.icon

  const classes = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
    isActive
      ? "bg-[#183b56] text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-50 hover:text-[#183b56]"
  }`

  const content = (
    <>
      <Icon className="size-[17px]" />
      <span className="flex-1">{item.label}</span>
      <NavBadge item={item} isActive={isActive} />
    </>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        className={classes}
        aria-current={isActive ? "page" : undefined}
        // Cliquer une entrée porteuse d'un compteur, c'est dire « j'y vais, j'ai
        // vu l'alerte ». Le routage ne se rejoue pas quand on est déjà sur la
        // page : sans ce clic, le nombre resterait affiché sur un écran que
        // la personne vient explicitement de rouvrir.
        onClick={item.badge ? markSeen : undefined}
      >
        {content}
      </Link>
    )
  }

  return (
    <button className={classes} onClick={() => notify(`${item.label} will be available in the next module`)}>
      {content}
    </button>
  )
}

export function DashboardShell({
  children,
  title,
  subtitle,
  breadcrumb = "Platform administration",
  actions,
}: {
  children: ReactNode
  title: ReactNode
  subtitle: ReactNode
  breadcrumb?: string
  actions?: ReactNode
}) {
  const pathname = usePathname()
  const user = useSessionUser()
  const { profile } = useCompanyProfile()
  const companyName = profile.name || "Nexolia"
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState("")

  const userName = user?.name ?? "Amine Mahfoud"
  const userRole = formatRole(user?.access)
  const isPlatformAdmin = !user || user.access.includes("admin")

  /**
   * Un employé pur — ni gérant ni responsable — ne voit que son propre menu.
   * Le rôle est doublement present dans `access` pour un compte cumulant les
   * deux : l'administration garde alors la main, d'où les deux exclusions.
   */
  const isPlainEmployee = Boolean(
    user && !user.access.includes("admin") && !user.access.includes("manager"),
  )

  const visibleGroups = useMemo(
    () => (isPlainEmployee ? employeeNavGroups : navGroups),
    [isPlainEmployee],
  )

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 2600)
  }, [])

  const contextValue = useMemo(() => notify, [notify])

  return (
    // Le compteur de répartition est fourni par le layout de la section admin,
    // qui enveloppe le shell comme la page : ici on ne fait que le lire.
    <DashboardToastContext.Provider value={contextValue}>
      {/* Le document entier est l'unique zone de défilement : la sidebar reste
          collée en haut (`sticky`) pendant que la page défile, ce qui évite
          d'empiler deux barres de défilement côte à côte. */}
      <div className="min-h-dvh bg-[#f7f9fc] text-[#172033]">
      <div className="flex min-h-dvh">
        {sidebarOpen && (
          <button
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#e5eaf2] bg-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:self-start`}
        >
          <div className="flex h-20 shrink-0 items-center gap-3 border-b border-[#edf0f5] px-6">
            <div className="auth-logo-ring flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
              {profile.logo ? (
                <Image
                  src={profile.logo}
                  alt={`${companyName} logo`}
                  width={40}
                  height={40}
                  priority
                  unoptimized
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-[#183b56]">
                  {companyName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight tracking-[0.1em] text-[#183b56] uppercase">
                {companyName}
              </p>
              <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.2em] text-[#1aa6a6]">
                Service Desk
              </p>
            </div>
            <button
              className="ml-auto lg:hidden"
              aria-label="Close"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-6">
            <div className="mb-6 rounded-xl bg-[#edf8f8] p-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[#1aa6a6] text-white">
                  <Building2 className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{profile.name}</p>
                  <p className="text-[11px] text-slate-500">Primary organisation</p>
                </div>
                <ChevronDown className="size-4 text-slate-400" />
              </div>
            </div>

            <nav className="flex flex-col gap-6" aria-label="Main navigation">
              {visibleGroups
                .filter((group) => !group.adminOnly || isPlatformAdmin)
                .map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {group.items
                        .filter((item) => !item.hideForAdmins || !isPlatformAdmin)
                        .map((item) => {
                          // Le superviseur peut viser un autre écran que l'admin
                          // pour la même entrée (voir `managerHref`).
                          const href =
                            !isPlatformAdmin && item.managerHref ? item.managerHref : item.href
                          const resolved = { ...item, href }
                          return (
                            <NavEntry
                              key={item.label}
                              item={resolved}
                              isActive={Boolean(href && pathname === href)}
                              notify={notify}
                            />
                          )
                        })}
                    </div>
                  </div>
                ))}
            </nav>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center justify-between border-b border-[#e5eaf2] bg-white px-4 sm:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
              <GlobalSearch user={user} />
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              {/* Visible partout : quelqu'un d'absent doit le voir sans avoir à
                  ouvrir ses paramètres, avant de promettre sa disponibilité. */}
              <AvailabilityBadge status={user?.availability} />
              <ProfileMenu name={userName} role={userRole} photo={user?.photo} />
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <span>Home</span>
                  <span>/</span>
                  <span>{breadcrumb}</span>
                </div>
                {title}
                {subtitle}
              </div>
              {actions}
            </div>

            {children}
          </div>
        </main>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-50 rounded-lg bg-[#183b56] px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
      </div>
    </DashboardToastContext.Provider>
  )
}
