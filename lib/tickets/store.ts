"use client"

/**
 * Stockage local du module tickets.
 *
 * Tout passe par une version sérialisée unique dans le localStorage : une
 * seule écriture atomique, donc pas d'état intermédiaire où les tickets
 * seraient à jour mais le registre de compétences non. Le format est celui
 * qu'une future API devra renvoyer, `lib/tickets/types.ts` servant de contrat.
 */

import { useCallback, useEffect, useState } from "react"

import { evaluateCandidate } from "./eligibility"
import {
  scopeKey,
  type ActivityKey,
  type ManagedTicket,
  type ResponderRecord,
  type StaffMember,
  type TicketOrigin,
  type TicketPriority,
  type TicketScope,
} from "./types"

const STORAGE_KEY = "nexolia.tickets.v1"
const SCHEMA_VERSION = 1

export interface TicketStoreState {
  version: number
  tickets: ManagedTicket[]
  responders: ResponderRecord[]
}

export const DEMO_NOTICE =
  "Demonstration data — tickets and competencies are stored in this browser only and are not yet connected to the ticketing database."

/* ------------------------------------------------------------------ */
/* Équipes et interventions de démonstration                          */
/* ------------------------------------------------------------------ */

/**
 * Départements et zones de démonstration.
 *
 * Chaque zone porte son `unitPath` explicite plutôt qu'un chemin reconstruit
 * par indice : c'est le format que renvoie `unitApi.list`, donc le jour où les
 * vraies unités sont branchées il n'y a rien à réinventer.
 */
const DEMO_DEPARTMENTS = [
  {
    code: "DEPT-001",
    name: "Information Technology",
    zones: [
      { path: "1.1", name: "Core infrastructure" },
      { path: "1.2", name: "Workplace support" },
    ],
  },
  {
    code: "DEPT-002",
    name: "Operations",
    zones: [
      { path: "2.1", name: "Logistics" },
      { path: "2.2", name: "Facilities" },
    ],
  },
  {
    code: "DEPT-003",
    name: "Finance",
    zones: [{ path: "3.1", name: "Accounting" }],
  },
] as const

export type DemoZone = (typeof DEMO_DEPARTMENTS)[number]["zones"][number]
export type DemoDepartment = (typeof DEMO_DEPARTMENTS)[number]

const DEMO_STAFF: StaffMember[] = [
  // Responsables de zone : ce sont eux qui constituent les listes.
  { id: "u-head-it", name: "Amine Mahfoud", role: "admin", departmentCode: "DEPT-001", unitPath: null, departmentName: "Information Technology", unitName: null },
  { id: "u-head-it-core", name: "Claire Fontaine", role: "manager", departmentCode: "DEPT-001", unitPath: "1.1", departmentName: "Information Technology", unitName: "Core infrastructure" },
  { id: "u-head-it-wp", name: "Diego Ramirez", role: "manager", departmentCode: "DEPT-001", unitPath: "1.2", departmentName: "Information Technology", unitName: "Workplace support" },
  { id: "u-head-ops", name: "Nadia Belkacem", role: "manager", departmentCode: "DEPT-002", unitPath: "2.1", departmentName: "Operations", unitName: "Logistics" },

  // Intervenants d'Information Technology / Core infrastructure.
  { id: "u-tech-1", name: "Yanis Cherif", role: "employee", departmentCode: "DEPT-001", unitPath: "1.1", departmentName: "Information Technology", unitName: "Core infrastructure" },
  { id: "u-tech-2", name: "Marie Dubois", role: "employee", departmentCode: "DEPT-001", unitPath: "1.1", departmentName: "Information Technology", unitName: "Core infrastructure" },
  { id: "u-tech-3", name: "Sofia Marchetti", role: "employee", departmentCode: "DEPT-001", unitPath: "1.1", departmentName: "Information Technology", unitName: "Core infrastructure" },

  // Intervenants d'Information Technology / Workplace support.
  { id: "u-wp-1", name: "Karim Haddad", role: "employee", departmentCode: "DEPT-001", unitPath: "1.2", departmentName: "Information Technology", unitName: "Workplace support" },
  { id: "u-wp-2", name: "Lena Fischer", role: "employee", departmentCode: "DEPT-001", unitPath: "1.2", departmentName: "Information Technology", unitName: "Workplace support" },

  // Intervenants d'Operations / Logistics.
  { id: "u-ops-1", name: "Thomas Lefevre", role: "employee", departmentCode: "DEPT-002", unitPath: "2.1", departmentName: "Operations", unitName: "Logistics" },
  { id: "u-ops-2", name: "Aya Benali", role: "employee", departmentCode: "DEPT-002", unitPath: "2.1", departmentName: "Operations", unitName: "Logistics" },

  // Intervenants de Finance : aucun n'est déclaré sur le périmètre IT, ce qui
  // permet de vérifier que le refus s'applique aussi hors du périmètre du
  // département du ticket.
  { id: "u-fin-1", name: "Hugo Lefranc", role: "employee", departmentCode: "DEPT-003", unitPath: "3.1", departmentName: "Finance", unitName: "Accounting" },
]

/**
 * Référentiel de compétences initial.
 *
 * Volontairement incomplet : `Marie Dubois` n'est pas déclarée sur « Network
 * outage » et `Sofia Marchetti` est absente. Ces deux cas produisent les deux
 * messages de refus distincts, ce qui rend la règle vérifiable sans avoir à
 * préparer une situation à la main.
 */
const DEMO_RESPONDERS: ResponderRecord[] = [
  { userId: "u-tech-1", departmentCode: "DEPT-001", unitPath: "1.1", activities: ["network", "security", "data"], unavailability: null },
  { userId: "u-tech-2", departmentCode: "DEPT-001", unitPath: "1.1", activities: ["hardware", "software", "shared"], unavailability: null },
  { userId: "u-tech-3", departmentCode: "DEPT-001", unitPath: "1.1", activities: ["hardware", "shared", "telecom"], unavailability: { reason: "medical leave", until: null } },
  { userId: "u-wp-1", departmentCode: "DEPT-001", unitPath: "1.2", activities: ["hardware", "software", "shared"], unavailability: null },
  { userId: "u-wp-2", departmentCode: "DEPT-001", unitPath: "1.2", activities: ["access", "shared"], unavailability: { reason: "training until Friday", until: null } },
  { userId: "u-ops-1", departmentCode: "DEPT-002", unitPath: "2.1", activities: ["hardware", "telecom"], unavailability: null },
  { userId: "u-ops-2", departmentCode: "DEPT-002", unitPath: "2.1", activities: ["access", "hardware"], unavailability: null },
  { userId: "u-fin-1", departmentCode: "DEPT-003", unitPath: "3.1", activities: ["access"], unavailability: null },
]

/** Référence de départ, alignée sur ce que le tableau de bord affiche déjà. */
const FIRST_REFERENCE = 1042

function isoDaysAgo(days: number, hours = 9): string {
  const base = new Date()
  base.setHours(hours, 0, 0, 0)
  base.setDate(base.getDate() - days)
  return base.toISOString()
}

function demoTickets(): ManagedTicket[] {
  const seeds: Array<
    Omit<ManagedTicket, "id" | "reference" | "createdAt" | "updatedAt" | "history">
  > = [
    {
      title: "VPN unreachable for the whole floor",
      description:
        "No one on the second floor can reach the corporate VPN since 08:00. Remote staff are unaffected.",
      activity: "network",
      priority: "P1",
      status: "pending_dispatch",
      origin: "zone_head",
      departmentCode: "DEPT-001",
      unitPath: "1.1",
      unitName: "Core infrastructure",
      createdBy: "u-head-it-core",
      assignedTo: null,
    },
    {
      title: "Badge readers not accepting new cards",
      description: "The two badge readers at the main entrance reject every new badge issued this week.",
      activity: "access",
      priority: "P2",
      status: "pending_dispatch",
      origin: "zone_head",
      departmentCode: "DEPT-001",
      unitPath: "1.2",
      unitName: "Workplace support",
      createdBy: "u-head-it-wp",
      assignedTo: null,
    },
    {
      title: "Shared mailbox missing after migration",
      description: "The shared mailbox support@ disappeared from Outlook after last week's migration.",
      activity: "shared",
      priority: "P3",
      status: "assigned",
      origin: "zone_head",
      departmentCode: "DEPT-001",
      unitPath: "1.2",
      unitName: "Workplace support",
      createdBy: "u-head-it-wp",
      assignedTo: "u-wp-1",
    },
    {
      title: "Warehouse handheld scanners failing to sync",
      description: "Six scanners in the logistics warehouse lose their sync every few minutes.",
      activity: "hardware",
      priority: "P2",
      status: "in_progress",
      origin: "dispatcher",
      departmentCode: "DEPT-002",
      unitPath: "2.1",
      unitName: "Logistics",
      createdBy: "u-head-it",
      assignedTo: "u-ops-1",
    },
    {
      title: "Suspicious sign-in attempts on an account",
      description: "Several failed sign-ins from an unknown country, followed by a successful one.",
      activity: "security",
      priority: "P1",
      status: "assigned",
      origin: "zone_head",
      departmentCode: "DEPT-001",
      unitPath: "1.1",
      unitName: "Core infrastructure",
      createdBy: "u-head-it-core",
      assignedTo: "u-tech-1",
    },
  ]

  return seeds.map((seed, index) => {
    const ageDays = 4 - index
    const createdAt = isoDaysAgo(ageDays)
    const updatedAt = isoDaysAgo(Math.max(0, ageDays - 1))
    const events: ManagedTicket["history"] = [
      {
        at: createdAt,
        actor: seed.createdBy,
        kind: "created",
        detail:
          seed.origin === "zone_head"
            ? "Reported by the zone manager, sent to the dispatcher."
            : "Created and dispatched directly by the dispatcher.",
      },
    ]
    if (seed.assignedTo) {
      events.push({
        at: updatedAt,
        actor: "u-head-it",
        kind: "assigned",
        detail: "Assigned to an operator competent for this activity.",
      })
    }

    return {
      ...seed,
      id: `t-${index + 1}`,
      reference: `TKT-${FIRST_REFERENCE + index}`,
      createdAt,
      updatedAt,
      history: events,
    }
  })
}

function emptyState(): TicketStoreState {
  return { version: SCHEMA_VERSION, tickets: demoTickets(), responders: DEMO_RESPONDERS }
}

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

function read(): TicketStoreState {
  if (typeof window === "undefined") return emptyState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as TicketStoreState
    // Une version différente signifie un format que ce code ne sait pas lire :
    // on repart du jeu de démonstration plutôt que d'un état à moitié compris.
    if (parsed?.version !== SCHEMA_VERSION) return emptyState()
    if (!Array.isArray(parsed.tickets) || !Array.isArray(parsed.responders)) return emptyState()
    return parsed
  } catch {
    return emptyState()
  }
}

function write(state: TicketStoreState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota dépassé ou stockage désactivé : l'interface reste utilisable en
    // mémoire pour la session, seule la persistance est perdue.
  }
}

let sequence = FIRST_REFERENCE + 1000

function nextReference(): string {
  sequence += 1
  return `TKT-${sequence}`
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useTicketStore() {
  const [state, setState] = useState<TicketStoreState>(() => emptyState())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setState(read())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load tickets.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Écriture atomique : tickets et compétences partent dans le même état. */
  const commit = useCallback((updater: (current: TicketStoreState) => TicketStoreState) => {
    setState((current) => {
      const next = updater(current)
      write(next)
      return next
    })
  }, [])

  const createTicket = useCallback(
    (input: {
      title: string
      description: string
      activity: ActivityKey
      priority: TicketPriority
      scope: TicketScope
      unitName: string | null
      origin: TicketOrigin
      createdBy: string
      /** Expert proposé par le référentiel experts, ajouté à l'événement de création */
      expertHint?: string | null
    }) => {
      const ticket: ManagedTicket = {
        id: `t-${Date.now()}`,
        reference: nextReference(),
        title: input.title,
        description: input.description,
        activity: input.activity,
        priority: input.priority,
        status: "pending_dispatch",
        origin: input.origin,
        departmentCode: input.scope.departmentCode,
        unitPath: input.scope.unitPath,
        unitName: input.unitName,
        createdBy: input.createdBy,
        assignedTo: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [
          {
            at: new Date().toISOString(),
            actor: input.createdBy,
            kind: "created",
detail:
              input.origin === "zone_head"
                ? "Reported by the zone manager, sent to the dispatcher."
                : "Created by the dispatcher.",
            },
            // L'expert trouvé dans le référentiel est consigné immédiatement :
            // le dispatcher voit la piste même s'il affecte quelqu'un d'autre.
            ...(input.expertHint
              ? [
                  {
                    at: new Date().toISOString(),
                    actor: input.createdBy,
                    kind: "created" as const,
                    detail: `Referential suggests ${input.expertHint}.`,
                  },
                ]
              : []),
          ],
      }

      commit((current) => ({ ...current, tickets: [ticket, ...current.tickets] }))
      return ticket
    },
    [commit],
  )

  /**
 * Affecte un ticket, en refusant une personne éligible.
 *
 * Le contrôle est ici, et pas seulement dans l'écran de dispatch : l'écran
 * filtre, mais rien n'empêche un autre appel — un raccourci clavier, un script,
 * une future vue — de bypasser un filtre d'interface. Cette action est le seul
 * endroit qui écrit l'affectation, donc le seul où le refus doit être garanti.
 *
 * Elle renvoie le motif du refus au lieu d'écrire en silence : un appelant qui
 * ignore l'échec renverrait le même choix.
 */
const assignTicket = useCallback(
  (
    ticketId: string,
    personId: string,
    actorId: string,
    detail: string,
  ): { ok: true } | { ok: false; reason: string } => {
    let refusal: string | null = null

    commit((current) => {
      const ticket = current.tickets.find((entry) => entry.id === ticketId)
      const person = DEMO_STAFF.find((entry) => entry.id === personId)

      if (!ticket) {
        refusal = "This ticket no longer exists."
        return current
      }
      if (!person) {
        refusal = "This person is not part of the ticketing staff."
        return current
      }

      const eligibility = evaluateCandidate(person, ticket, current.responders)
      if (!eligibility.eligible) {
        refusal = eligibility.reason ?? "This person cannot handle this error."
        return current
      }

      const at = new Date().toISOString()
      const isReassignment = ticket.assignedTo !== null

      return {
        ...current,
        tickets: current.tickets.map((entry) =>
          entry.id !== ticketId
            ? entry
            : {
                ...entry,
                assignedTo: personId,
                status: "assigned",
                updatedAt: at,
                history: [
                  ...entry.history,
                  { at, actor: actorId, kind: isReassignment ? "reassigned" : "assigned", detail },
                ],
              },
        ),
      }
    })

    if (refusal) return { ok: false, reason: refusal }
    return { ok: true }
  },
  [commit],
)

  const setTicketStatus = useCallback(
    (ticketId: string, status: ManagedTicket["status"], actorId: string, detail: string) => {
      commit((current) => ({
        ...current,
        tickets: current.tickets.map((ticket) => {
          if (ticket.id !== ticketId) return ticket
          const at = new Date().toISOString()
          return {
            ...ticket,
            status,
            updatedAt: at,
            history: [...ticket.history, { at, actor: actorId, kind: "status", detail }],
          }
        }),
      }))
    },
    [commit],
  )

  const upsertResponder = useCallback(
    (record: ResponderRecord) => {
      commit((current) => {
        const index = current.responders.findIndex(
          (entry) =>
            entry.userId === record.userId && scopeKey(entry) === scopeKey(record),
        )
        if (index === -1) return { ...current, responders: [...current.responders, record] }
        const next = [...current.responders]
        next[index] = record
        return { ...current, responders: next }
      })
    },
    [commit],
  )

  const removeResponder = useCallback(
    (userId: string, scope: TicketScope) => {
      commit((current) => ({
        ...current,
        responders: current.responders.filter(
          (entry) => !(entry.userId === userId && scopeKey(entry) === scopeKey(scope)),
        ),
      }))
    },
    [commit],
  )

  const resetDemo = useCallback(() => {
    setState(emptyState())
    write(emptyState())
  }, [])

  return {
    tickets: state.tickets,
    responders: state.responders,
    staff: DEMO_STAFF,
    departments: DEMO_DEPARTMENTS,
    loading,
    error,
    refresh,
    createTicket,
    assignTicket,
    setTicketStatus,
    upsertResponder,
    removeResponder,
    resetDemo,
  }
}

export { DEMO_STAFF }
