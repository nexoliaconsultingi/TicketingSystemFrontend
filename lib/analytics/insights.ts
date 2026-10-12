/**
 * Génération automatique des conclusions de pilotage.
 *
 * Le texte est calculé à partir de l'instantané (`AnalyticsSnapshot`), jamais
 * écrit à l'avance : changer de période ou de filtres change le discours. C'est
 * la garantie qu'aucun chiffre « de démonstration » ne puisse se glisser dans
 * une phrase.
 */
import type { AnalyticsSnapshot, InsightReport } from "./types"

const nf = new Intl.NumberFormat("en-GB")

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? "+" : ""}${rounded}`
}

function pct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

function hours(value: number) {
  return value >= 24 ? `${(value / 24).toFixed(1)} days` : `${value.toFixed(1)} h`
}

/**
 * Variation en pourcentage. `null` dès qu'une des deux périodes est sans
 * donnée : on ne compare pas une mesure à une absence de mesure.
 */
function variation(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/** Compte formaté, ou « — » si l'indicateur n'a pas de valeur. */
function count(value: number | null) {
  return value === null ? "—" : nf.format(value)
}

export function buildInsights(snapshot: AnalyticsSnapshot): InsightReport {
  const { kpis, departments, categories, backlog, health } = snapshot
  const summary: string[] = []
  const risks: InsightReport["risks"] = []
  const positives: InsightReport["positives"] = []
  const recommendations: string[] = []

  // --- Phrase d'ouverture : le volume, sans le qualifier de bon ou de mauvais.
  const volumeVariation = backlog.volumeVariation
  if (kpis.totalTickets.current === 0) {
    summary.push("No ticket matches the current filters, so no trend can be stated.")
  } else if (volumeVariation === null) {
    summary.push(`No comparable volume for the previous period, so no trend can be stated.`)
  } else {
    const direction = volumeVariation > 0 ? "increased" : volumeVariation < 0 ? "decreased" : "held steady"
    const magnitude = Math.abs(volumeVariation)
    summary.push(
      `Ticket volume ${direction} by ${magnitude.toFixed(1)}% compared with the previous period (${count(
        kpis.totalTickets.current,
      )} tickets created).`,
    )
  }

  if (backlog.createdInRange === 0 && backlog.resolvedInRange === 0) {
    summary.push("Creation and resolution volumes are both zero: there is no activity to compare.")
  } else if (backlog.trend === "up") {
    const gap = backlog.createdInRange - backlog.resolvedInRange
    const contributors = topContributors(departments, (department) => department.tickets)
    summary.push(
      `The backlog is growing: ${nf.format(gap)} more tickets were created than resolved in the period, led by ${contributors}.`,
    )
  } else if (backlog.trend === "down") {
    const gap = backlog.resolvedInRange - backlog.createdInRange
    summary.push(`The backlog is shrinking: ${nf.format(gap)} more tickets were resolved than created in the period.`)
  } else {
    summary.push("Creation and resolution volumes are balanced: the backlog is stable.")
  }

  // --- Respect des engagements.
  summary.push(
    `First-response SLA compliance stands at ${pct(kpis.slaCompliance.current)}${
      kpis.slaCompliance.previous ? ` against ${pct(kpis.slaCompliance.previous)} previously` : ""
    }, with ${count(kpis.breached.current)} breach${kpis.breached.current === 1 ? "" : "es"} recorded.`,
  )

  const mttrVariation = variation(kpis.mttr.current, kpis.mttr.previous)
  const csatVariation = variation(kpis.csat.current, kpis.csat.previous)
  summary.push(
    `Mean time to resolve is ${kpis.mttr.current === null ? "not measurable yet" : hours(kpis.mttr.current)}${
      mttrVariation === null ? "" : `, ${mttrVariation < 0 ? "an improvement" : "a deterioration"} of ${Math.abs(mttrVariation).toFixed(1)}%`
    }.`,
  )
  summary.push(
    `User satisfaction is ${pct(kpis.csat.current)} over ${nf.format(snapshot.csatResponses)} responses${
      csatVariation === null ? "" : `, ${csatVariation < 0 ? "down" : "up"} ${Math.abs(csatVariation).toFixed(1)} points`
    }.`,
  )

  // --- Risques : uniquement ce qui est réellement chiffré.
  if (health.criticalOpen > 0) {
    risks.push({
      label: `${health.criticalOpen} critical ticket${health.criticalOpen === 1 ? "" : "s"} open`,
      detail: "Critical tickets require an active owner and a communication to the requester.",
      severity: "critical",
    })
  }
  if (health.atRisk > 0) {
    risks.push({
      label: `${health.atRisk} ticket${health.atRisk === 1 ? "" : "s"} at risk of SLA breach`,
      detail: "The response deadline has not passed yet, but these tickets are in the last 40% of their promised response window.",
      severity: health.atRisk > 5 ? "critical" : "attention",
    })
  }
  if (health.oldBacklog > 0) {
    risks.push({
      label: `${health.oldBacklog} unresolved ticket${health.oldBacklog === 1 ? "" : "s"} older than 7 days`,
      detail: "An ageing backlog usually means work is waiting on validation or on a third party.",
      severity: health.oldBacklog > 20 ? "critical" : "attention",
    })
  }

  const worstDepartment = [...departments].sort((a, b) => a.slaCompliance - b.slaCompliance)[0]
  if (worstDepartment && worstDepartment.slaCompliance < 95 && worstDepartment.breached > 0) {
    risks.push({
      label: `${worstDepartment.name} has the lowest SLA compliance (${pct(worstDepartment.slaCompliance)})`,
      detail: `${nf.format(worstDepartment.breached)} tickets breached the target for this department.`,
      severity: worstDepartment.slaCompliance < 88 ? "critical" : "attention",
    })
  }

  const fastestGrowing = [...departments].sort(
    (a, b) => (b.tickets - b.previousTickets) - (a.tickets - a.previousTickets),
  )[0]
  if (fastestGrowing && fastestGrowing.previousTickets > 0) {
    const delta = variation(fastestGrowing.tickets, fastestGrowing.previousTickets) ?? 0
    if (delta > 5) {
      risks.push({
        label: `${fastestGrowing.name} volume up ${delta.toFixed(1)}%`,
        detail: `${nf.format(fastestGrowing.tickets)} tickets versus ${nf.format(fastestGrowing.previousTickets)} previously.`,
        severity: delta > 20 ? "critical" : "attention",
      })
    }
  }

  // --- Tendances positives : uniquement en amélioration mesurée.
  if (
    mttrVariation !== null &&
    mttrVariation < -3 &&
    kpis.mttr.previous !== null &&
    kpis.mttr.current !== null
  ) {
    positives.push({
      label: `Resolution time improved ${Math.abs(mttrVariation).toFixed(1)}%`,
      detail: `${hours(kpis.mttr.previous)} → ${hours(kpis.mttr.current)}.`,
    })
  }
  const fcrVariation = variation(kpis.fcr.current, kpis.fcr.previous)
  if (fcrVariation !== null && fcrVariation > 2) {
    positives.push({
      label: `First contact resolution improved ${fcrVariation.toFixed(1)} points`,
      detail: `${pct(kpis.fcr.previous)} → ${pct(kpis.fcr.current)}.`,
    })
  }
  if (backlog.trend === "down") {
    positives.push({
      label: "Backlog is decreasing",
      detail: "More tickets are being resolved than created.",
    })
  }
  const improvingDepartments = departments.filter(
    (department) =>
      department.previousSlaCompliance > 0 && department.slaCompliance - department.previousSlaCompliance > 2,
  )
  for (const department of improvingDepartments.slice(0, 2)) {
    positives.push({
      label: `${department.name} improved its SLA compliance`,
      detail: `${pct(department.previousSlaCompliance)} → ${pct(department.slaCompliance)}.`,
    })
  }
  if (positives.length === 0) {
    positives.push({
      label: "No significant improvement detected this period",
      detail: "Every indicator is flat or trending unfavourably.",
    })
  }

  // --- Recommandations : chacune est reliée à un constat chiffré.
  if (worstDepartment && worstDepartment.slaCompliance < 92) {
    recommendations.push(
      `Review ${worstDepartment.name} support capacity and investigate the recurring requests behind its ${nf.format(
        worstDepartment.breached,
      )} SLA breaches.`,
    )
  }
  const worstCategory = categories.filter((category) => category.slaCompliance > 0).sort(
    (a, b) => a.slaCompliance - b.slaCompliance,
  )[0]
  if (worstCategory && worstCategory.slaCompliance < 90) {
    recommendations.push(
      `Analyse the “${worstCategory.name}” category: ${nf.format(worstCategory.tickets)} tickets at ${pct(
        worstCategory.slaCompliance,
      )} SLA compliance and ${hours(worstCategory.mttrHours)} average resolution.`,
    )
  }
  const worstReopen = [...categories].sort((a, b) => b.reopenRate - a.reopenRate)[0]
  if (worstReopen && worstReopen.reopenRate > 10) {
    recommendations.push(
      `Tighten the resolution process for “${worstReopen.name}”: ${pct(worstReopen.reopenRate)} of its tickets are reopened, which suggests diagnoses are closed prematurely.`,
    )
  }
  if (health.oldBacklog > 0) {
    recommendations.push(
      `Schedule a backlog clearing session: ${nf.format(health.oldBacklog)} tickets have been waiting for more than 7 days.`,
    )
  }
  if (kpis.escalationRate.current !== null && kpis.escalationRate.current > 15) {
    recommendations.push(
      `Return / reassignment rate is ${pct(kpis.escalationRate.current)}: review how first assignments match supervisor expertise to reduce hands changing between supervisors.`,
    )
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain the current operating rhythm; no intervention is required by the indicators.")
  }

  return {
    summary,
    risks: risks.slice(0, 6),
    positives: positives.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    feedback: [],
  }
}

function topContributors(departments: AnalyticsSnapshot["departments"], score: (department: (typeof departments)[number]) => number) {
  const sorted = [...departments].sort((a, b) => score(b) - score(a))
  const first = sorted[0]
  if (!first) return "no department"
  return sorted.length > 1 ? `${first.name} and ${sorted[1]!.name}` : first.name
}

/**
 * Retours utilisateurs saisis dans le tableau de bord. Volontairement hors
 * calcul : ce sont des commentaires, pas une statistique.
 *
 * En attendant que la v1 demande et expose les avis nominatifs, la liste est
 * vide : rien d'inventé ne s'affichera sous ce titre.
 */
export const FEEDBACK_COMMENTS: InsightReport["feedback"] = []

export { signed, pct, hours, variation }
