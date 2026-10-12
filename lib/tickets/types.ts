/**
 * Domaine du module de gestion des tickets.
 *
 * Ce module est volontairement autonome : il ne dépend pas de `lib/analytics`
 * (dont les tickets sont un jeu de démonstration analytique, pas des tickets
 * métier). Les types sont conçus comme un sous-ensemble de `UserResponse` pour
 * qu'un branchement sur `userApi` plus tard reste un simple adaptateur.
 */

import type { UserResponse } from "@/lib/api"

/**
 * Catalogue des activités qu'un intervenant peut être déclaré compétent pour.
 *
 * C'est le vocabulaire de référence du module : une compétence est toujours
 * un couple (personne, activité). Sans ce catalogue, deux personnes ne
 * pourraient jamais être comparées, et l'attribution deviendrait impossible à
 * justifier devant l'utilisateur.
 */
export const ACTIVITIES = [
  { key: "network", label: "Network outage", short: "Network" },
  { key: "hardware", label: "Hardware failure", short: "Hardware" },
  { key: "software", label: "Software & licensing", short: "Software" },
  { key: "access", label: "Access & rights", short: "Access" },
  { key: "security", label: "Security incident", short: "Security" },
  { key: "data", label: "Data loss & restore", short: "Data" },
  { key: "telecom", label: "Telecom & lines", short: "Telecom" },
  { key: "shared", label: "Mailbox & shared resources", short: "Shared" },
] as const

export type ActivityKey = (typeof ACTIVITIES)[number]["key"]

export const ACTIVITY_KEYS: readonly ActivityKey[] = ACTIVITIES.map((entry) => entry.key)

export function activityLabel(key: ActivityKey): string {
  return ACTIVITIES.find((entry) => entry.key === key)?.label ?? key
}

/** Priorités du module, indépendantes de celles du module analytique. */
export const TICKET_PRIORITIES = [
  { key: "P1", label: "P1 · Critical", slaHours: 4 },
  { key: "P2", label: "P2 · High", slaHours: 8 },
  { key: "P3", label: "P3 · Medium", slaHours: 24 },
  { key: "P4", label: "P4 · Low", slaHours: 72 },
] as const

export type TicketPriority = (typeof TICKET_PRIORITIES)[number]["key"]

/**
 * Cycle de vie d'un ticket.
 *
 * `pending_dispatch` est l'état d'attente : le ticket a été signalé mais
 * personne ne le porte encore. C'est l'état dans lequel la page se place par
 * défaut, parce que c'est là qu'une décision humaine est attendue.
 */
export const TICKET_STATUSES = [
  { key: "pending_dispatch", label: "Awaiting dispatch", tone: "amber" },
  { key: "assigned", label: "Assigned", tone: "teal" },
  { key: "in_progress", label: "In progress", tone: "teal" },
  { key: "resolved", label: "Resolved", tone: "green" },
  { key: "closed", label: "Closed", tone: "slate" },
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]["key"]

export const TICKET_STATUS_KEYS: readonly TicketStatus[] = TICKET_STATUSES.map((entry) => entry.key)

export function statusLabel(key: TicketStatus): string {
  return TICKET_STATUSES.find((entry) => entry.key === key)?.label ?? key
}

/** Qui a fait naître le ticket : un responsable de zone ou le dispatcher. */
export type TicketOrigin = "zone_head" | "dispatcher"

/** Trace d'un mouvement sur le ticket, pour expliquer l'attribution retenue. */
export interface TicketEvent {
  at: string
  /** Identifiant de l'auteur du mouvement. */
  actor: string
  kind: "created" | "assigned" | "reassigned" | "rejected" | "status"
  /** Phrase rédigée au moment du mouvement, affichée telle quelle dans l'historique. */
  detail: string
}

export interface ManagedTicket {
  id: string
  /** Référence courte et lisible, ex. « TKT-1042 ». */
  reference: string
  title: string
  description: string
  activity: ActivityKey
  priority: TicketPriority
  status: TicketStatus
  origin: TicketOrigin
  departmentCode: string
  /** Chemin de l'unité (= zone) concernée, ou `null` pour le département entier. */
  unitPath: string | null
  /** Nom lisible de la zone, figé à la création pour l'historique. */
  unitName: string | null
  createdBy: string
  /** Intervenant retenu, `null` tant que le ticket attend une répartition. */
  assignedTo: string | null
  createdAt: string
  updatedAt: string
  history: TicketEvent[]
}

/**
 * Compétence déclarée par un responsable de zone.
 *
 * Une entrée relie une personne, un périmètre (département + zone) et les
 * activités dont elle a la charge. Le périmètre est stocké ici et non lu sur la
 * fiche de la personne : c'est le responsable qui décide qui intervient dans
 * SA zone, même si l'intéressé est rattaché ailleurs.
 */
export interface ResponderRecord {
  userId: string
  departmentCode: string
  unitPath: string | null
  activities: ActivityKey[]
  /**
   * Absence déclarée. `null` = disponible.
   *
   * Distincte de la compétence : on peut être compétent et néanmoins absent.
   * Les deux notions bloquent l'attribution, mais pour deux raisons
   * différentes, et l'utilisateur doit lire la bonne.
   */
  unavailability: Unavailability | null
}

export interface Unavailability {
  reason: string
  /** Fin d'absence au format ISO, ou `null` si indéterminée. */
  until: string | null
  /**
   * Origine de la déclaration.
   *
   * Indispensable pour que les deux sources ne se marchent pas dessus : une
   * absence déclarée dans le profil est la source de vérité et doit remplacer
   * une saisie locale, tandis qu'une absence saisie à la main dans le registre
   * des compétences ne doit pas disparaître parce que la fiche de la personne
   * ne dit rien. `local` par défaut, pour ne pas distinguer les anciennes
   * fiches déjà enregistrées.
   */
  source?: "account" | "local"
}

/**
 * Personne sélectionnable dans les listes de répartition.
 *
 * Miroit `UserResponse` : `fromUserResponse` permet de brancher `userApi` sans
 * réécrire l'interface.
 */
export interface StaffMember {
  id: string
  name: string
  role: "admin" | "manager" | "employee"
  departmentCode: string | null
  unitPath: string | null
  departmentName: string | null
  unitName: string | null
}

export function fromUserResponse(user: UserResponse): StaffMember {
  return {
    id: user._id,
    name: user.name,
    // `UserResponse.access` est un tableau alors que l'interface n'en retient
    // qu'un : le niveau le plus élevé gagne, sinon le premier de la liste.
    role: pickPrimaryRole(user.access),
    departmentCode: user.departmentCode,
    unitPath: user.unitPath ?? null,
    departmentName: user.departmentName,
    unitName: user.unitName ?? null,
  }
}

function pickPrimaryRole(access: readonly string[]): StaffMember["role"] {
  if (access.includes("admin")) return "admin"
  if (access.includes("manager")) return "manager"
  return "employee"
}

/** Une zone est une unité de l'organigramme ; `null` désigne le département. */
export interface TicketScope {
  departmentCode: string
  unitPath: string | null
}

export function scopeKey(scope: TicketScope): string {
  return `${scope.departmentCode}::${scope.unitPath ?? "-"}`
}
