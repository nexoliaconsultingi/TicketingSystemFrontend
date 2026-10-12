/**
 * Types du module « Analytics & Monitoring ».
 *
 * Les types décrivent la forme que l'API renvoie déjà : les tickets arrivent du
 * serveur (`/ticket/api/tickets`) et sont mis en forme par `lib/analytics/source`.
 * Ni les KPI, ni les graphiques, ni les conclusions générées ne touchent à la
 * source des données : seule cette couche d'entrée change.
 */

export type PriorityKey = "P1" | "P2" | "P3" | "P4"

export type TicketStatus =
  | "new"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "closed"

export const PRIORITIES: {
  key: PriorityKey
  label: string
  short: string
  /** Délai de réponse promis, en heures — repli affiché quand le jeu de données est vide. */
  slaHours: number
}[] = [
  { key: "P1", label: "Critical", short: "P1", slaHours: 1 },
  { key: "P2", label: "High", short: "P2", slaHours: 2 },
  { key: "P3", label: "Medium", short: "P3", slaHours: 4 },
  { key: "P4", label: "Low", short: "P4", slaHours: 8 },
]

/** Filtres neutres : liste vide = dimension non contrainte. */
export const DEFAULT_FILTERS: TicketFilters = {
  range: "30d",
  department: [],
  service: [],
  category: [],
  priority: [],
  status: [],
  team: [],
  agent: [],
}

/** Ticket unitaire : l'atome de tous les calculs du module. */
export interface AnalyticsTicket {
  id: string
  subject: string
  createdAt: number
  acknowledgedAt: number | null
  resolvedAt: number | null
  closedAt: number | null
  status: TicketStatus
  priority: PriorityKey
  department: string
  category: string
  service: string
  team: string
  agent: string
  /** Délai de réponse promis, en minutes, tel qu'appliqué à ce ticket. */
  slaMinutes: number
  /**
   * Le ticket est-il soumis à un engagement de délai ? Un ticket non répondu
   * ne l'est que si la politique est active aujourd'hui ; un ticket répondu
   * ne l'est que si une échéance a été figée à la réponse.
   */
  slaActive: boolean
  /** Échéance de réponse figée au moment de la réponse, quand elle existait. */
  responseDeadlineAt: number | null
  /** Résolu sans avoir été rendu au centre ni réaffecté. */
  resolvedFirstContact: boolean
  /** Rendu au centre de répartition ou réaffecté : reflète `history`. */
  escalated: boolean
  /** Rendu au centre de répartition (événement `returned`). */
  returnedToDispatch: boolean
  /** Réaffecté d'un superviseur à un autre (événement `reassigned`). */
  reassigned: boolean
  /** Nombre de réouvertures après résolution. Aucun mécanisme de réouverture : 0. */
  reopened: number
  /** Note de satisfaction 1..5, absente si l'utilisateur n'a pas répondu. */
  csat: number | null
}

/**
 * Filtres de l'écran. Les dimensions sont des listes : le tableau de bord
 * s'adresse à une direction qui raisonne par croisement (« les P1 et P2 de la
 * Finance sur 30 jours »), pas une case à la fois. Une liste vide vaut
 * « pas de filtre » sur cette dimension.
 */
export interface TicketFilters {
  range: RangeKey
  department: string[]
  service: string[]
  category: string[]
  priority: string[]
  status: string[]
  team: string[]
  agent: string[]
}

export type RangeKey = "7d" | "30d" | "90d" | "12m"

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "12m", label: "Last 12 months", days: 365 },
]

/**
 * Durée d'une plage, en jours.
 */
export function rangeToDays(range: RangeKey): number {
  return RANGE_OPTIONS.find((option) => option.key === range)?.days ?? 30
}

export interface SeriesPoint {
  /** Clé d'étiquette affichée sur l'axe horizontal. */
  label: string
  /** Date de début de la journée/du mois représentée. */
  date: number
  created: number
  resolved: number
  closed: number
  mttaMinutes: number | null
  mttrHours: number | null
  slaCompliance: number | null
  csat: number | null
}

/**
 * Valeur d'un indicateur et de la période précédente.
 *
 * `current` et `previous` acceptent `null` : un taux calculé sans aucune
 * observation n'est pas « 0 % », il n'existe pas. Afficher 0 ferait croire à
 * une performance catastrophique là où il n'y a simplement rien à mesurer.
 */
export interface KpiResult {
  current: number | null
  previous: number | null
  /** Cible de référence affichée en regard, si elle existe. */
  target?: number
}

export interface AnalyticsSnapshot {
  kpis: {
    totalTickets: KpiResult
    openTickets: KpiResult
    slaCompliance: KpiResult
    breached: KpiResult
    atRisk: KpiResult
    mtta: KpiResult
    mttr: KpiResult
    fcr: KpiResult
    reopenRate: KpiResult
    escalationRate: KpiResult
    csat: KpiResult
  }
  priorities: {
    key: PriorityKey
    label: string
    count: number
    share: number
    open: number
    criticalOpen: number
    breached: number
    slaCompliance: number | null
    mttrHours: number | null
  }[]
  aging: { key: string; label: string; count: number; status: HealthStatus }[]
  series: SeriesPoint[]
  /** Même découpage sur la période immédiatement précédente, pour comparaison. */
  seriesPrevious: SeriesPoint[]
  /** Volume observé et esperado, pour le libellé de pression sur le backlog. */
  backlog: {
    openNow: number
    createdInRange: number
    resolvedInRange: number
    trend: "up" | "down" | "flat"
    /** Variation du nombre de tickets créés par rapport à la période précédente. */
    volumeVariation: number
  }
  health: {
    criticalOpen: number
    atRisk: number
    breached: number
    oldBacklog: number
    status: HealthStatus
    reasons: string[]
  }
  departments: {
    name: string
    tickets: number
    previousTickets: number
    open: number
    breached: number
    atRisk: number
    slaCompliance: number
    previousSlaCompliance: number
    mttrHours: number
    previousMttrHours: number
    csat: number | null
    escalations: number
  }[]
  categories: {
    name: string
    tickets: number
    share: number
    mttrHours: number
    slaCompliance: number
    reopenRate: number
  }[]
  services: {
    name: string
    tickets: number
    slaCompliance: number
    mttrHours: number
    escalations: number
  }[]
  mttrByPriority: { key: PriorityKey; label: string; hours: number | null }[]
  slaByDepartment: { name: string; compliance: number; breached: number }[]
  backlogAging: { key: string; label: string; count: number; status: HealthStatus }[]
  atRiskTickets: AnalyticsTicket[]
  breachedTickets: AnalyticsTicket[]
  oldestTickets: AnalyticsTicket[]
  escalationFlow: { from: string; to: string; count: number }[]
  topEscalated: { name: string; count: number }[]
  csatBreakdown: { name: string; positive: number; neutral: number; negative: number; score: number }[]
  csatResponses: number
  slaByPriority: {
    key: PriorityKey
    label: string
    compliance: number
    breached: number
    atRisk: number
    healthy: number
    slaHours: number
  }[]
}

export type HealthStatus = "healthy" | "attention" | "critical"

export interface InsightReport {
  summary: string[]
  risks: { label: string; detail: string; severity: HealthStatus }[]
  positives: { label: string; detail: string }[]
  recommendations: string[]
  /** Points saisis automatiquement par l'utilisateur, hors calcul. */
  feedback: { author: string; date: string; comment: string; score: number }[]
}
