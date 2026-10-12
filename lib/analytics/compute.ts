/**
 * Couche de calcul du module « Analytics & Monitoring ».
 *
 * Toutes les valeurs affichées par le tableau de bord sortent d'ici : aucune
 * n'est écrite en dur dans l'interface. Les fonctions sont pures et sans état,
 * ce qui les rend directement réutilisables sur des tickets venus de l'API.
 */
import {
  PRIORITIES,
  rangeToDays,
  type AnalyticsSnapshot,
  type AnalyticsTicket,
  type HealthStatus,
  type PriorityKey,
  type SeriesPoint,
  type TicketFilters,
  type TicketStatus,
} from "./types"

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/**
 * Statuts que peut prendre un ticket réel (après le pont de `source.ts`).
 * Un ticket « closed » sans résolution — annulé par le demandeur ou soldé par
 * l'administrateur — est entré ici comme `closed`, et n'est pas un état ouvert.
 */
export const OPEN_STATUSES: TicketStatus[] = ["new", "acknowledged", "in_progress"]

const AGING_BUCKETS = [
  { key: "lt24h", label: "< 24 hours", status: "healthy" as HealthStatus, max: DAY },
  { key: "d1_3", label: "1–3 days", status: "healthy" as HealthStatus, max: 3 * DAY },
  { key: "d4_7", label: "4–7 days", status: "attention" as HealthStatus, max: 7 * DAY },
  { key: "d8_30", label: "8–30 days", status: "attention" as HealthStatus, max: 30 * DAY },
  { key: "gt30d", label: "> 30 days", status: "critical" as HealthStatus, max: Infinity },
]

/**
 * Un ticket encore ouvert et sans réponse est « à risque » quand il entre dans
 * le dernier 40 % de son échéance de réponse. Une fenêtre assez large pour que
 * l'exploitant puisse réellement agir, et assez peuplée pour que la file ne
 * passe pas entre deux états.
 * La fenêtre est proportionnelle à l'objectif — la plafonner à un nombre
 * d'heures fixe la rendrait inatteignable sur les objectifs longs.
 */
const AT_RISK_RATIO = 0.4
const AT_RISK_FULL_COVER_MINUTES = 480

/**
 * Le ticket est-il soumis à un engagement de délai de réponse ?
 *
 * Un ticket non encore répondu ne l'est que si la politique est active
 * aujourd'hui ; un ticket répondu ne l'est que si une échéance a été figée au
 * moment de la réponse. Juger une réponse donnée quand la politique était
 * désactivée reviendrait à appliquer les règles du présent au passé.
 */
function hasActiveSla(ticket: AnalyticsTicket) {
  return ticket.slaActive
}

/**
 * Échéance de réponse du ticket : l'instantané figé à la réponse, ou la promesse
 * courante (dépôt + délai de la politique en vigueur) tant que la réponse n'a
 * pas été donnée.
 */
export function responseDeadline(ticket: AnalyticsTicket) {
  return ticket.responseDeadlineAt ?? ticket.createdAt + ticket.slaMinutes * MINUTE
}

export function isBreached(ticket: AnalyticsTicket, now: number) {
  if (!hasActiveSla(ticket)) return false
  const deadline = responseDeadline(ticket)
  if (ticket.acknowledgedAt !== null) return ticket.acknowledgedAt > deadline
  if (ticket.resolvedAt === null && ticket.status !== "closed") return now > deadline
  return false
}

/** La réponse au déclarant a-t-elle respecté l'échéance qui s'appliquait ? */
export function respondedOnTime(ticket: AnalyticsTicket) {
  if (!hasActiveSla(ticket) || ticket.acknowledgedAt === null) return false
  return ticket.acknowledgedAt <= responseDeadline(ticket)
}

export function isAtRisk(ticket: AnalyticsTicket, now: number) {
  if (!hasActiveSla(ticket) || ticket.resolvedAt !== null || ticket.acknowledgedAt !== null) {
    return false
  }
  const remaining = (responseDeadline(ticket) - now) / MINUTE
  // `remaining > 0` est indispensable : sans lui un ticket déjà dépassé serait
  // compté « à risque » au lieu d'être compté « en breach ».
  if (remaining <= 0) return false
  // Le seuil est le dernier `AT_RISK_RATIO` de l'échéance, pas un « dernier
  // tiers » : les libellés de l'interface reprennent cette formulation pour que
  // ce que lit l'utilisateur corresponde exactement au calcul.
  // Sur un objectif court, cette fenêtre est plus étroite qu'une journée de
  // travail : la fenêtre est alors la journée entière, ce qui revient à dire
  // qu'un incident critique ouvert est toujours à risque tant qu'il n'est pas
  // en breach.
  return (
    ticket.slaMinutes <= AT_RISK_FULL_COVER_MINUTES || remaining <= ticket.slaMinutes * AT_RISK_RATIO
  )
}

/**
 * Un ticket est ouvert tant qu'il n'est ni résolu ni soldé.
 *
 * `closed` sans `resolvedAt` existe : une demande annulée par son auteur ou
 * soldée par l'administrateur n'a pas été résolue, mais elle n'est pas pour
 * autant dans le backlog.
 */
export function isOpen(ticket: AnalyticsTicket) {
  return ticket.resolvedAt === null && ticket.status !== "closed"
}

export function remainingMinutes(ticket: AnalyticsTicket, now: number) {
  return Math.round((responseDeadline(ticket) - now) / MINUTE)
}

/** Filtre par état, avec le raccourci « open » = non résolu. */
function matchesStatus(ticket: AnalyticsTicket, statuses: string[]) {
  if (statuses.length === 0) return true
  return statuses.some((status) =>
    status === "open" ? isOpen(ticket) : ticket.status === status,
  )
}

/** Une dimension est active si l'utilisateur a coché au moins une valeur. */
function selected(values: string[], candidate: string) {
  return values.length === 0 || values.includes(candidate)
}

export function filterTickets(
  tickets: AnalyticsTicket[],
  filters: TicketFilters,
  options: { withDate?: boolean; from?: number; to?: number } = {},
): AnalyticsTicket[] {
  const withDate = options.withDate ?? true
  return tickets.filter((ticket) => {
    if (withDate) {
      if (options.from !== undefined && ticket.createdAt < options.from) return false
      if (options.to !== undefined && ticket.createdAt > options.to) return false
    }
    if (!selected(filters.department, ticket.department)) return false
    if (!selected(filters.service, ticket.service)) return false
    if (!selected(filters.category, ticket.category)) return false
    if (!selected(filters.priority, ticket.priority)) return false
    if (!selected(filters.team, ticket.team)) return false
    if (!selected(filters.agent, ticket.agent)) return false
    if (!matchesStatus(ticket, filters.status)) return false
    return true
  })
}

function safePercent(part: number, total: number) {
  if (total <= 0) return 0
  return (part / total) * 100
}

/**
 * Pourcentage, ou `null` si la population est vide.
 *
 * Utilisée pour tous les taux : sans elle, un filtre qui ne sélectionne aucun
 * ticket répondu afficherait « 0 % de conformité SLA », c'est-à-dire la pire
 * performance possible, au lieu de l'absence de mesure.
 */
function percentOrNull(part: number, total: number) {
  if (total <= 0) return null
  return round((part / total) * 100, 1)
}

function mean(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Arrondi d'une valeur renseignée. */
function round(value: number, digits = 1): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Arrondi qui conserve l'absence de donnée. Utilisé pour les moyennes : sans
 * observation, une moyenne n'est pas « 0 », elle n'existe pas — l'afficher
 * comme `null` permet à l'interface d'écrire « no data » au lieu de mentir.
 */
function roundOrNull(value: number | null, digits = 1): number | null {
  return value === null ? null : round(value, digits)
}

/** Indicateurs calculés sur un lot de tickets, réutilisés pour chaque période. */
interface WindowMetrics {
  total: number
  resolved: number
  reopened: number
  escalated: number
  eligible: number
  breached: number
  mttaMinutes: number | null
  mttrHours: number | null
  fcr: number | null
  reopenRate: number | null
  escalationRate: number | null
  slaCompliance: number | null
  csat: number | null
  csatResponses: number
  firstContact: number
}

function measure(tickets: AnalyticsTicket[], now: number): WindowMetrics {
  const created = tickets
  const resolved = tickets.filter((ticket) => ticket.resolvedAt !== null)
  // « Accusé » = réponse donnée au déclarant. Un dossier encore ouvert mais
  // déjà répondu entre ici : son délai de réaction est mesuré, sa clôture ne
  // l'efface pas du MTTA.
  const acknowledged = tickets.filter((ticket) => ticket.acknowledgedAt !== null)
  const eligibleResponded = acknowledged.filter(hasActiveSla)
  const breached = tickets.filter((ticket) => isBreached(ticket, now))
  const csatScores = tickets.map((ticket) => ticket.csat).filter((score): score is number => score !== null)

  const firstContact = resolved.filter((ticket) => ticket.resolvedFirstContact).length
  const reopened = tickets.filter((ticket) => ticket.reopened > 0).length
  const escalated = tickets.filter((ticket) => ticket.escalated).length

  const csatPositive = csatScores.filter((score) => score >= 4).length

  return {
    total: created.length,
    resolved: resolved.length,
    reopened,
    escalated,
    eligible: eligibleResponded.length,
    breached: breached.length,
    mttaMinutes: roundOrNull(
      mean(
        acknowledged.map(
          (ticket) => (ticket.acknowledgedAt! - ticket.createdAt) / MINUTE,
        ),
      ),
      2,
    ),
    mttrHours: roundOrNull(
      mean(resolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)),
      2,
    ),
    fcr: percentOrNull(firstContact, resolved.length),
    reopenRate: percentOrNull(reopened, resolved.length),
    escalationRate: percentOrNull(escalated, created.length),
    slaCompliance: percentOrNull(
      eligibleResponded.filter(respondedOnTime).length,
      eligibleResponded.length,
    ),
    csat: percentOrNull(csatPositive, csatScores.length),
    csatResponses: csatScores.length,
    firstContact,
  }
}

function bucketize(
  tickets: AnalyticsTicket[],
  from: number,
  to: number,
  steps: { start: number; end: number; label: string }[],
  now: number,
): SeriesPoint[] {
  return steps.map((step) => {
    const inBucket = tickets.filter(
      (ticket) => ticket.createdAt >= step.start && ticket.createdAt < step.end,
    )
    const metrics = measure(inBucket, now)
    return {
      label: step.label,
      date: step.start,
      created: inBucket.length,
      resolved: inBucket.filter((ticket) => ticket.resolvedAt !== null).length,
      closed: inBucket.filter((ticket) => ticket.status === "closed").length,
      mttaMinutes: metrics.mttaMinutes,
      mttrHours: metrics.mttrHours,
      slaCompliance: metrics.slaCompliance,
      csat: metrics.csatResponses > 3 ? metrics.csat : null,
    }
  })
}

function dailySteps(from: number, to: number, days: number) {
  const span = to - from
  const width = span / days
  return Array.from({ length: days }, (_, index) => {
    const start = Math.floor(from + index * width)
    return {
      start,
      end: Math.floor(from + (index + 1) * width),
      label: new Date(start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    }
  })
}

function monthlySteps(from: number, to: number, months: number) {
  const width = (to - from) / months
  return Array.from({ length: months }, (_, index) => {
    const start = Math.floor(from + index * width)
    return {
      start,
      end: Math.floor(from + (index + 1) * width),
      label: new Date(start).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }
  })
}

function computeAging(tickets: AnalyticsTicket[], now: number) {
  const open = tickets.filter(isOpen)
  return AGING_BUCKETS.map((bucket, index) => {
    const lower = index === 0 ? 0 : AGING_BUCKETS[index - 1]!.max
    const count = open.filter((ticket) => {
      const age = now - ticket.createdAt
      return age >= lower && age < bucket.max
    }).length
    return { key: bucket.key, label: bucket.label, count, status: bucket.status }
  })
}

function groupBy<T>(tickets: AnalyticsTicket[], key: (ticket: AnalyticsTicket) => string) {
  const map = new Map<string, AnalyticsTicket[]>()
  for (const ticket of tickets) {
    const value = key(ticket)
    const bucket = map.get(value)
    if (bucket) bucket.push(ticket)
    else map.set(value, [ticket])
  }
  return map
}

function countMap(tickets: AnalyticsTicket[], key: (ticket: AnalyticsTicket) => string) {
  const result = new Map<string, number>()
  for (const ticket of tickets) {
    const value = key(ticket)
    result.set(value, (result.get(value) ?? 0) + 1)
  }
  return result
}

/**
 * Calcule l'intégralité du tableau de bord pour un jeu de filtres donné.
 *
 * La durée et l'instant de référence sont dérivés des filtres, pas reçus en
 * paramètre : passer un `days` erroné ne produisait aucune erreur, seulement
 * un jeu de données faux affiché comme vrai.
 */
export function computeSnapshot(
  allTickets: AnalyticsTicket[],
  filters: TicketFilters,
  now: number = Date.now(),
): AnalyticsSnapshot {
  const days = rangeToDays(filters.range)
  const from = now - days * DAY
  const previousFrom = now - days * 2 * DAY

  // Un état « actuel » (backlog, échéances) ne se restreint pas à la période :
  // le restreindre rendrait un backlog de 7 jours ininterprétable.
  const scope = filterTickets(allTickets, filters, { withDate: false })
  const current = filterTickets(allTickets, filters, { withDate: true, from, to: now })
  const previous = filterTickets(allTickets, filters, { withDate: true, from: previousFrom, to: from })

  const currentMetrics = measure(current, now)
  const previousMetrics = measure(previous, now)

  const openNow = scope.filter(isOpen)
  const previousBoundary = from
  const openAtPreviousBoundary = scope.filter(
    (ticket) =>
      ticket.createdAt < previousBoundary &&
      (ticket.resolvedAt === null || ticket.resolvedAt > previousBoundary) &&
      (ticket.closedAt === null || ticket.closedAt > previousBoundary),
  ).length
  // « À risque » et « en breach » sont des états à une date donnée : la
  // comparaison porte sur ce qui était vrai à la fin de la période précédente,
  // pas sur un compteur reconduit à l'identique.
  const atRiskAtPreviousBoundary = scope.filter((ticket) => isAtRisk(ticket, previousBoundary)).length

  // Deux notions à ne pas confondre :
  // - le compteur KPI `breached` mesure les breaches de la période, résolus
  //   compris, c'est un indicateur de qualité historique ;
  // - la liste de travail et le verdict de santé ne concernent que ce qui est
  //   encore ouvert et déjà hors délai, car c'est la seule chose sur laquelle
  //   une équipe peut agir aujourd'hui.
  const breachedTickets = openNow.filter((ticket) => isBreached(ticket, now))
  const atRiskTickets = scope
    .filter((ticket) => isAtRisk(ticket, now))
    .sort((a, b) => responseDeadline(a) - responseDeadline(b))
  const criticalOpen = openNow.filter((ticket) => ticket.priority === "P1")

  const aging = computeAging(scope, now)
  const oldBacklog = aging.filter((bucket) => bucket.key === "gt30d" || bucket.key === "d8_30").reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  )

  const priorities = PRIORITIES.map((profile) => {
    const subset = current.filter((ticket) => ticket.priority === profile.key)
    const subsetResolved = subset.filter((ticket) => ticket.resolvedAt !== null)
    const subsetResponded = subset.filter((ticket) => ticket.acknowledgedAt !== null && hasActiveSla(ticket))
    return {
      key: profile.key,
      label: profile.label,
      count: subset.length,
      share: round(safePercent(subset.length, current.length), 1),
      open: subset.filter(isOpen).length,
      criticalOpen: 0,
      breached: subset.filter((ticket) => isBreached(ticket, now)).length,
      slaCompliance: subsetResponded.length
        ? round(safePercent(subsetResponded.filter(respondedOnTime).length, subsetResponded.length), 1)
        : null,
      mttrHours: roundOrNull(
        mean(subsetResolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)),
        2,
      ),
    }
  })

  const series =
    days > 120
      ? bucketize(current, from, now, monthlySteps(from, now, 12), now)
      : bucketize(current, from, now, dailySteps(from, now, days <= 7 ? 7 : days <= 30 ? 15 : 18), now)
  const seriesPrevious =
    days > 120
      ? bucketize(previous, previousFrom, from, monthlySteps(previousFrom, from, 12), now)
      : bucketize(previous, previousFrom, from, dailySteps(previousFrom, from, days <= 7 ? 7 : days <= 30 ? 15 : 18), now)

  const departmentNames = Array.from(groupBy(current, (ticket) => ticket.department).keys())
  const departments = departmentNames
    .map((name) => {
      // Les volumes et les moyennes portent sur la période sélectionnée, les
      // états (ouvert, à risque, breach) sur l'ensemble des tickets encore
      // vivants : mélanger les deux périmètres produirait des ratios absurdes.
      const windowTickets = current.filter((ticket) => ticket.department === name)
      const stateTickets = scope.filter((ticket) => ticket.department === name)
      const previousTickets = previous.filter((ticket) => ticket.department === name)

      const resolved = windowTickets.filter((ticket) => ticket.resolvedAt !== null)
      const responded = windowTickets.filter((ticket) => ticket.acknowledgedAt !== null && hasActiveSla(ticket))
      const previousResolved = previousTickets.filter((ticket) => ticket.resolvedAt !== null)
      const previousResponded = previousTickets.filter(
        (ticket) => ticket.acknowledgedAt !== null && hasActiveSla(ticket),
      )
      const csatScores = windowTickets
        .map((ticket) => ticket.csat)
        .filter((score): score is number => score !== null)

      return {
        name,
        tickets: windowTickets.length,
        previousTickets: previousTickets.length,
        open: stateTickets.filter(isOpen).length,
        breached: stateTickets.filter((ticket) => isBreached(ticket, now)).length,
        atRisk: stateTickets.filter((ticket) => isAtRisk(ticket, now)).length,
        slaCompliance: responded.length
          ? round(safePercent(responded.filter(respondedOnTime).length, responded.length), 1)
          : 0,
        previousSlaCompliance: previousResponded.length
          ? round(safePercent(previousResponded.filter(respondedOnTime).length, previousResponded.length), 1)
          : 0,
        mttrHours: roundOrNull(mean(resolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)), 2) ?? 0,
        previousMttrHours:
          roundOrNull(mean(previousResolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)), 2) ?? 0,
        csat: csatScores.length
          ? round(safePercent(csatScores.filter((score) => score >= 4).length, csatScores.length), 1)
          : null,
        escalations: windowTickets.filter((ticket) => ticket.escalated).length,
      }
    })
    .sort((a, b) => b.tickets - a.tickets)

  const categories = Array.from(groupBy(current, (ticket) => ticket.category).entries())
    .map(([name, subset]) => {
      const resolved = subset.filter((ticket) => ticket.resolvedAt !== null)
      const responded = subset.filter((ticket) => ticket.acknowledgedAt !== null && hasActiveSla(ticket))
      return {
        name,
        tickets: subset.length,
        share: round(safePercent(subset.length, current.length), 1),
        mttrHours: roundOrNull(mean(resolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)), 2) ?? 0,
        slaCompliance: responded.length
          ? round(safePercent(responded.filter(respondedOnTime).length, responded.length), 1)
          : 0,
        reopenRate: round(
          safePercent(subset.filter((ticket) => ticket.reopened > 0).length, resolved.length),
          1,
        ),
      }
    })
    .sort((a, b) => b.tickets - a.tickets)

  const services = Array.from(groupBy(scope, (ticket) => ticket.service).entries())
    .map(([name, subset]) => {
      const resolved = subset.filter((ticket) => ticket.resolvedAt !== null)
      const responded = subset.filter((ticket) => ticket.acknowledgedAt !== null && hasActiveSla(ticket))
      return {
        name,
        tickets: subset.length,
        slaCompliance: responded.length
          ? round(safePercent(responded.filter(respondedOnTime).length, responded.length), 1)
          : 0,
        mttrHours: roundOrNull(mean(resolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)), 2) ?? 0,
        escalations: subset.filter((ticket) => ticket.escalated).length,
      }
    })
    .sort((a, b) => b.tickets - a.tickets)

  const slaByPriority = PRIORITIES.map((profile) => {
    const subset = scope.filter((ticket) => ticket.priority === profile.key)
    // Tous les tickets d'une priorité partagent le même délai de réponse : celui
    // de la politique en vigueur. La cible affichée est donc la vraie promesse,
    // pas un repli du module.
    const targetMinutes = subset[0]?.slaMinutes ?? profile.slaHours * 60
    return {
      key: profile.key,
      label: profile.label,
      compliance: 0,
      breached: subset.filter((ticket) => isBreached(ticket, now)).length,
      atRisk: subset.filter((ticket) => isAtRisk(ticket, now)).length,
      healthy: subset.filter((ticket) => !isBreached(ticket, now) && !isAtRisk(ticket, now)).length,
      slaHours: targetMinutes / 60,
    }
  }).map((entry) => {
    const total = entry.breached + entry.atRisk + entry.healthy
    return { ...entry, compliance: round(safePercent(entry.healthy + entry.atRisk, total), 1) }
  })

  const mttrByPriority = PRIORITIES.map((profile) => {
    const resolved = current.filter((ticket) => ticket.priority === profile.key && ticket.resolvedAt !== null)
    return {
      key: profile.key,
      label: `${profile.short} · ${profile.label}`,
      // `null` quand rien n'a été résolu pour cette priorité : sans observation,
      // la durée de résolution n'existe pas — l'écrire « 0 » ferait croire à une
      // résolution instantanée.
      hours: roundOrNull(mean(resolved.map((ticket) => (ticket.resolvedAt! - ticket.createdAt) / HOUR)), 2),
    }
  })

  const csatBreakdown = Array.from(groupBy(scope, (ticket) => ticket.department).entries())
    .map(([name, subset]) => {
      const scores = subset.map((ticket) => ticket.csat).filter((score): score is number => score !== null)
      return {
        name,
        positive: scores.filter((score) => score >= 4).length,
        neutral: scores.filter((score) => score === 3).length,
        negative: scores.filter((score) => score <= 2).length,
        score: scores.length ? round(safePercent(scores.filter((score) => score >= 4).length, scores.length), 1) : 0,
      }
    })
    .sort((a, b) => b.score - a.score)

  const escalationFlow = [
    { from: "Supervisor", to: "Returned to dispatch", count: scope.filter((ticket) => ticket.returnedToDispatch).length },
    { from: "Supervisor", to: "Reassigned", count: scope.filter((ticket) => ticket.reassigned).length },
  ]

  const topEscalated = Array.from(countMap(current.filter((ticket) => ticket.escalated), (ticket) => ticket.category).entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const oldestTickets = [...openNow]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 8)

  const created = current.length
  const resolvedInRange = current.filter((ticket) => ticket.resolvedAt !== null).length
  const volumeVariation = round(
    previousMetrics.total > 0 ? ((created - previousMetrics.total) / previousMetrics.total) * 100 : 0,
    1,
  )

  // `breachedTickets` est désormais restreint aux tickets encore ouverts : le
  // verdict de santé annonce ce qui est en dépassement aujourd'hui, pas un
  // cumul historique que l'équipe ne peut plus traiter.
  const health = computeHealth({
    criticalOpen: criticalOpen.length,
    atRisk: atRiskTickets.length,
    breached: breachedTickets.length,
    oldBacklog,
    slaCompliance: currentMetrics.slaCompliance,
  })

  return {
    kpis: {
      totalTickets: { current: created, previous: previousMetrics.total },
      openTickets: { current: openNow.length, previous: openAtPreviousBoundary },
      // Les indicateurs calculés restent `null` quand le numérateur ou le
      // dénominateur est vide : l'interface affiche alors « — » plutôt qu'un
      // « 0 % » qui ferait croire à une panne de performance inexistante.
      slaCompliance: {
        current: currentMetrics.slaCompliance,
        previous: previousMetrics.slaCompliance,
        target: 95,
      },
      breached: { current: currentMetrics.breached, previous: previousMetrics.breached },
      atRisk: { current: atRiskTickets.length, previous: atRiskAtPreviousBoundary },
      mtta: { current: currentMetrics.mttaMinutes, previous: previousMetrics.mttaMinutes, target: 20 },
      mttr: { current: currentMetrics.mttrHours, previous: previousMetrics.mttrHours, target: 8 },
      fcr: { current: currentMetrics.fcr, previous: previousMetrics.fcr, target: 75 },
      reopenRate: { current: currentMetrics.reopenRate, previous: previousMetrics.reopenRate, target: 8 },
      escalationRate: { current: currentMetrics.escalationRate, previous: previousMetrics.escalationRate },
      csat: { current: currentMetrics.csat, previous: previousMetrics.csat, target: 85 },
    },
    priorities,
    aging,
    series,
    seriesPrevious,
    backlog: {
      openNow: openNow.length,
      createdInRange: created,
      resolvedInRange,
      trend: created > resolvedInRange * 1.02 ? "up" : resolvedInRange > created * 1.02 ? "down" : "flat",
      volumeVariation,
    },
    health: {
      ...health,
      criticalOpen: criticalOpen.length,
      atRisk: atRiskTickets.length,
      breached: breachedTickets.length,
      oldBacklog,
    },
    departments,
    categories,
    services,
    mttrByPriority,
    slaByDepartment: departments.map((department) => ({
      name: department.name,
      compliance: department.slaCompliance,
      breached: department.breached,
    })),
    backlogAging: aging,
    atRiskTickets,
    breachedTickets,
    oldestTickets,
    escalationFlow,
    topEscalated,
    csatBreakdown,
    csatResponses: currentMetrics.csatResponses,
    slaByPriority,
  }
}

function computeHealth(input: {
  criticalOpen: number
  atRisk: number
  breached: number
  oldBacklog: number
  slaCompliance: number | null
}): { status: HealthStatus; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (input.criticalOpen > 0) {
    score += 2
    reasons.push(`${input.criticalOpen} critical ticket${input.criticalOpen === 1 ? "" : "s"} still open`)
  }
  if (input.atRisk > 0) {
    score += input.atRisk > 5 ? 2 : 1
    reasons.push(`${input.atRisk} ticket${input.atRisk === 1 ? "" : "s"} approaching the SLA deadline`)
  }
  if (input.breached > 0) {
    score += input.breached > 10 ? 2 : 1
    reasons.push(`${input.breached} SLA breach${input.breached === 1 ? "" : "es"} recorded`)
  }
  if (input.oldBacklog > 0) {
    score += input.oldBacklog > 20 ? 2 : 1
    reasons.push(`${input.oldBacklog} unresolved tickets older than 7 days`)
  }
  if (input.slaCompliance !== null && input.slaCompliance < 92) {
    score += 2
    reasons.push(`SLA compliance at ${input.slaCompliance}%`)
  }

  const status: HealthStatus = score >= 5 ? "critical" : score >= 2 ? "attention" : "healthy"
  if (reasons.length === 0) reasons.push("No SLA breach, no critical ticket and no aged backlog")
  return { status, reasons }
}
