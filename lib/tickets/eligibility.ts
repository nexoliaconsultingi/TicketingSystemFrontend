/**
 * Règles d'attribution d'un ticket à un intervenant.
 *
 * Fonctions pures, sans React ni stockage : la règle de refus doit être
 * testable et réutilisable par n'importe quel écran.
 */

import {
  ACTIVITIES,
  activityLabel,
  scopeKey,
  type ActivityKey,
  type ManagedTicket,
  type ResponderRecord,
  type StaffMember,
} from "./types"

/** Raisons pour lesquelles une personne ne peut pas prendre un ticket. */
export type RejectionCode = "not_competent" | "unavailable" | "out_of_scope" | "unknown_person"

export interface Eligibility {
  eligible: boolean
  code?: RejectionCode
  /** Phrase prêt à afficher expliquant le refus. */
  reason?: string
  /** Activités de cette personne dans le périmètre du ticket. */
  activities: ActivityKey[]
}

const ELIGIBLE: Eligibility = { eligible: true, activities: [] }

/** Actifs de la personne dans le périmètre du ticket, pour l'affichage. */
function activitiesInScope(
  record: ResponderRecord | undefined,
  ticket: Pick<ManagedTicket, "departmentCode" | "unitPath">,
): ActivityKey[] {
  if (!record) return []
  if (record.departmentCode !== ticket.departmentCode) return []
  if ((record.unitPath ?? null) !== (ticket.unitPath ?? null)) return []
  return record.activities
}

/**
 * Une personne déclarée indisponible porte une date de fin.
 *
 * Une absence sans date est permanente : on la compare donc à l'infini, pas
 * à « maintenant », sinon une absence à durée indéterminée expirerait d'elle-même
 * au premier rendu.
 */
function isStillAbsent(until: string | null, now: number): boolean {
  if (until === null) return true
  const end = new Date(until).getTime()
  return Number.isNaN(end) ? true : end >= now
}

/**
 * Décide si une personne peut prendre en charge un ticket, et sinon pourquoi.
 *
 * L'ordre des vérifications n'est pas cosmétique : il détermine la raison
 * affichée. On regarde d'abord l'absence, parce que c'est le motif le plus
 * fréquent et le plus actionnable ; une personne absente ET non compétente
 * doit se lire « absent » et non « incompétent », sinon l'écran invite à
 * corriger une compétence alors que le vrai levier est l'absence.
 */
export function evaluateCandidate(
  person: StaffMember,
  ticket: ManagedTicket,
  responders: ResponderRecord[],
  now: number = Date.now(),
): Eligibility {
  const record = responders.find((entry) => entry.userId === person.id)
  if (!record) {
    return {
      eligible: false,
      code: "unknown_person",
      activities: [],
      reason: `${person.name} is not registered in any competency list, so they cannot be given any activity to unblock.`,
    }
  }

  const activities = activitiesInScope(record, ticket)

  // Un ticket sans zone ne peut rejoindre aucune liste de compétences : les
  // responsables déclarent des personnes au niveau de leur zone, donc aucun
  // enregistrement ne porte `unitPath: null`. Le dire explicitement évite un
  // refus en cascade qui ne s'explique pas.
  if ((ticket.unitPath ?? null) === null) {
    return {
      eligible: false,
      code: "out_of_scope",
      activities,
      reason:
        "This ticket is not attached to a zone, so no competency list can match it. Attach it to a zone before dispatching.",
    }
  }

  if (
    record.unavailability &&
    isStillAbsent(record.unavailability.until, now) &&
    record.unavailability.reason.trim().length > 0
  ) {
    return {
      eligible: false,
      code: "unavailable",
      activities,
      reason: `${person.name} is declared unavailable (${record.unavailability.reason}). They cannot handle this error, so the ticket must be passed to someone else.`,
    }
  }

  if (!activities.includes(ticket.activity)) {
    return {
      eligible: false,
      code: "not_competent",
      activities,
      reason: `${person.name} is not registered as competent for “${activityLabel(
        ticket.activity,
      )}” in this scope. They cannot handle this error, so the ticket must be passed to someone else.`,
    }
  }

  return { ...ELIGIBLE, activities }
}

/**
 * Liste les personnes affectables à un ticket, les éligibles d'abord.
 *
 * Les personnes non compétentes restent visibles et non triées en fin de
 * liste, avec leur motif : les masquer rendrait l'écran muet sur la raison du
 * refus, alors que l'utilisateur a besoin de comprendre pourquoi il ne peut
 * pas faire son choix.
 */
export function candidatesFor(
  ticket: ManagedTicket,
  staff: StaffMember[],
  responders: ResponderRecord[],
  now: number = Date.now(),
): Array<{ person: StaffMember; eligibility: Eligibility }> {
  const evaluated = staff.map((person) => ({
    person,
    eligibility: evaluateCandidate(person, ticket, responders, now),
  }))

  // Un intervenant déjà porteur d'autres tickets reste affichable : il est
  // compétent, on ne doit pas le faire disparaître. Le tri par éligibilité
  // suffit à remonter les choix possibles en tête.
  return evaluated.sort((a, b) => {
    if (a.eligibility.eligible !== b.eligibility.eligible) {
      return a.eligibility.eligible ? -1 : 1
    }
    return a.person.name.localeCompare(b.person.name, "en")
  })
}

/**
 * Message d'erreur à remonter à l'utilisateur quand il retient une personne
 * non éligible. `null` si le choix est valide.
 */
export function assignmentBlock(
  person: StaffMember | null,
  ticket: ManagedTicket,
  responders: ResponderRecord[],
  now: number = Date.now(),
): string | null {
  if (!person) return "Select the person who will handle this ticket."

  const eligibility = evaluateCandidate(person, ticket, responders, now)
  if (eligibility.eligible) return null
  return eligibility.reason ?? "This person cannot handle this error."
}

/**
 * Intervenants compétents pour une activité donnée dans un périmètre, sans
 * avoir à construire un ticket. Sert au registre des compétences, qui doit
 * pouvoir répondre à « qui sait faire quoi ici » sans créer de ticket au
 * préalable.
 */
export function respondersFor(
  scope: { departmentCode: string; unitPath: string | null },
  activity: ActivityKey | null,
  responders: ResponderRecord[],
  staff: StaffMember[],
  now: number = Date.now(),
): StaffMember[] {
  const key = scopeKey(scope)
  const pool = responders.filter((entry) => scopeKey(entry) === key)
  const scoped = staff.filter((person) => pool.some((entry) => entry.userId === person.id))
  if (activity === null) return scoped

  const fake = {
    departmentCode: scope.departmentCode,
    unitPath: scope.unitPath,
    activity,
  } as ManagedTicket

  return scoped.filter((person) => evaluateCandidate(person, fake, responders, now).eligible)
}

/** Nombre d'intervenants déclarés compétents, toutes activités confondues. */
export function competencyCount(responders: ResponderRecord[]): number {
  return responders.filter((record) => record.activities.length > 0).length
}

export { ACTIVITIES }
