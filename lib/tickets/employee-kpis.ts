/**
 * Indicateurs d'un employé, calculés sur ses propres tickets.
 *
 * Le périmètre est volontairement étroit : un employé n'a aucun droit de
 * lecture sur l'activité de ses collègues. Les chiffres portent donc
 * exclusivement sur les tickets qu'il a lui-même signalés, jamais sur
 * l'ensemble du parc.
 *
 * Les tickets viennent de l'API : le serveur les filtre déjà par auteur, il
 * n'y a donc pas à filtrer une fois de plus par identifiant. Le hook ne fait
 * que compter.
 */

import { useMemo } from "react"

import type { TicketResponse } from "@/lib/api"

export interface EmployeeKpis {
  /** Total des tickets signalés par l'employé, tous états confondus. */
  total: number
  /** Encore ouverts : déclarés, en revue ou en cours de traitement. */
  open: number
  /** Signalés mais pas encore pris en charge. */
  awaiting: number
  /** Résolus ou clos. */
  done: number
  /**
   * Part des tickets signalés qui aboutissent, en pourcentage.
   * `null` tant qu'aucun ticket n'existe : afficher « 0 % » pour un employé
   * qui n'a jamais rien signalé serait un chiffre faux, pas un zéro.
   */
  resolutionRate: number | null
  /** Délai médian de traitement, en heures, sur les tickets résolus. */
  medianResolutionHours: number | null
  /** Dernier ticket signalé, le plus récent en premier. */
  latest: TicketResponse | null
  /** Les tickets encore ouverts, les plus récents en premier. */
  openTickets: TicketResponse[]
}

/** Ouvert = ni résolu ni soldé. Un dossier soldé est terminé, quel qu'en soit le motif. */
const isDone = (ticket: TicketResponse): boolean =>
  ticket.status === "resolved" || ticket.status === "closed"

/**
 * Durée de traitement, en heures.
 *
 * Mesurée jusqu'à la résolution, pas jusqu'à la clôture : c'est le moment où le
 * problème a reçu une réponse. Un dossier résolu puis mis en attente de clôture
 * ne doit pas gonfler le délai dont le demandeur se plaint.
 */
function resolutionHours(ticket: TicketResponse): number | null {
  const created = new Date(ticket.createdAt).getTime()
  const ended = new Date(ticket.resolvedAt ?? ticket.updatedAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(ended) || ended <= created) return null
  return (ended - created) / 3_600_000
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function useEmployeeKpis(tickets: TicketResponse[]): EmployeeKpis {
  return useMemo(() => {
    const byRecent = (a: TicketResponse, b: TicketResponse) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

    const done = tickets.filter(isDone)
    const durations = done
      .map(resolutionHours)
      .filter((value): value is number => value !== null)

    return {
      total: tickets.length,
      open: tickets.filter((ticket) => !isDone(ticket)).length,
      awaiting: tickets.filter((ticket) => ticket.status === "new" || ticket.status === "being_reviewed")
        .length,
      done: done.length,
      resolutionRate: tickets.length === 0 ? null : Math.round((done.length / tickets.length) * 100),
      medianResolutionHours: median(durations),
      latest: tickets.length > 0 ? [...tickets].sort(byRecent)[0] : null,
      openTickets: tickets.filter((ticket) => !isDone(ticket)).sort(byRecent),
    }
  }, [tickets])
}

/** Durée formatée pour l'affichage : `4 h 12` ou `2 days`. */
export function formatDuration(hours: number | null): string {
  if (hours === null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) {
    const whole = Math.floor(hours)
    const minutes = Math.round((hours - whole) * 60)
    return minutes === 0 ? `${whole} h` : `${whole} h ${String(minutes).padStart(2, "0")}`
  }
  const days = Math.round(hours / 24)
  return `${days} day${days > 1 ? "s" : ""}`
}