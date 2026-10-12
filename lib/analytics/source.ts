/**
 * Pont entre l'API des tickets et le module « Analytics & Monitoring ».
 *
 * Le module analytique travaille sur une forme normalisée (`AnalyticsTicket`)
 * ; le serveur renvoie sa propre fiche (`TicketResponse`). Ce fichier est la
 * seule traduction : tout ce qui est réel — références, priorités, dates de
 * réponse et de résolution, échéance figée, avis, mains successives — est lu
 * ici, et seule cette couche sait ce que le système peut ou ne peut pas
 * mesurer.
 *
 * Trois dimensions du jeu de démonstration n'existent pas dans le modèle réel
 * et ne sont donc pas inventées ici :
 *
 *  - la catégorie : le fichier d'un ticket ne classe pas la demande ; la
 *    dimension prend la zone d'orgue (unité) concernée ;
 *  - le service et l'équipe : rien ne distingue « L1 », « L2 »… dans le flux
 *    réel ; chaque ticket est donc rattaché à une valeur unique « General » ;
 *  - l'escalade : le système mesure des mains successives — un superviseur
 *    rend le dossier au centre (`returned`) ou un autre est désigné
 *    (`reassigned`) — pas des paliers de support.
 */
import type { SlaPolicy, SlaRule, TicketResponse } from "@/lib/api"
import type { AnalyticsTicket, PriorityKey, TicketStatus } from "./types"

/** Priorité réelle (côté serveur) → priorité du module analytique. */
const PRIORITY_KEYS: Record<string, PriorityKey> = {
  critical: "P1",
  high: "P2",
  medium: "P3",
  low: "P4",
}

/** Statut réel → statut du module analytique. */
const STATUS_KEYS: Record<string, TicketStatus> = {
  new: "new",
  being_reviewed: "acknowledged",
  under_analysis: "in_progress",
  in_progress: "in_progress",
  resolved: "resolved",
  closed: "closed",
}

/** Politique par défaut quand une priorité n'a pas de règle dans la politique en vigueur. */
const DEFAULT_POLICY_MINUTES: Record<PriorityKey, number> = {
  P1: 60,
  P2: 120,
  P3: 240,
  P4: 480,
}

function responseMinutesOf(priority: PriorityKey, rules: SlaRule[]): number {
  const realKey = Object.keys(PRIORITY_KEYS).find((entry) => PRIORITY_KEYS[entry] === priority)
  const rule = rules.find((entry) => entry.priority === realKey)
  return rule?.responseMinutes ?? DEFAULT_POLICY_MINUTES[priority]
}

function flagsOf(history: TicketResponse["history"]) {
  let returnedToDispatch = false
  let reassigned = false
  for (const entry of history) {
    if (entry.kind === "returned") returnedToDispatch = true
    else if (entry.kind === "reassigned") reassigned = true
  }
  return { returnedToDispatch, reassigned }
}

export function toAnalyticsTickets(rows: TicketResponse[], policy: SlaPolicy): AnalyticsTicket[] {
  return rows.map((ticket) => {
    const priority = PRIORITY_KEYS[ticket.priority] ?? "P3"
    const acknowledgedAt = ticket.respondedAt ? Date.parse(ticket.respondedAt) : null
    const resolvedAt = ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : null
    const closedAt = ticket.closedAt ? Date.parse(ticket.closedAt) : null
    const responseDeadlineAt = ticket.responseDeadlineAt ? Date.parse(ticket.responseDeadlineAt) : null
    const { returnedToDispatch, reassigned } = flagsOf(ticket.history)
    const responded = acknowledgedAt !== null
    const open = resolvedAt === null && ticket.status !== "closed"

    return {
      id: ticket.reference,
      subject: ticket.title,
      createdAt: Date.parse(ticket.createdAt),
      acknowledgedAt,
      resolvedAt,
      closedAt,
      status: STATUS_KEYS[ticket.status] ?? "new",
      priority,
      department: ticket.departmentName ?? ticket.departmentCode ?? "Unspecified",
      category: ticket.unitName ?? "General",
      service: "General",
      team: "General",
      agent: ticket.assignedToName ?? "Unassigned",
      // Le délai est la promesse en vigueur. Un ticket répondu est jugé sur
      // l'échéance figée à la réponse, pas sur la politique d'aujourd'hui.
      slaMinutes: responseMinutesOf(priority, policy.rules),
      slaActive: responded ? responseDeadlineAt !== null : open && policy.enabled,
      responseDeadlineAt: responded ? responseDeadlineAt : null,
      resolvedFirstContact: resolvedAt !== null && !returnedToDispatch && !reassigned,
      escalated: returnedToDispatch || reassigned,
      returnedToDispatch,
      reassigned,
      // Aucun mécanisme de réouverture dans le flux réel : un dossier résolu
      // n'est ni restituable ni réaffectable.
      reopened: 0,
      csat: ticket.rating ?? null,
    }
  })
}

export interface AnalyticsFilterOptions {
  departments: string[]
  categories: string[]
  services: string[]
  teams: string[]
  agents: string[]
}

export function distinct(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export function buildFilterOptions(tickets: AnalyticsTicket[]): AnalyticsFilterOptions {
  return {
    departments: distinct(tickets.map((ticket) => ticket.department)),
    categories: distinct(tickets.map((ticket) => ticket.category)),
    services: distinct(tickets.map((ticket) => ticket.service)),
    teams: distinct(tickets.map((ticket) => ticket.team)),
    agents: distinct(tickets.map((ticket) => ticket.agent)),
  }
}

/** États proposés par le filtre « Status », avec le raccourci « Open ». */
export const STATUS_FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: "open", label: "Open (unresolved)" },
  { key: "new", label: "Awaiting response" },
  { key: "acknowledged", label: "Under review" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
]