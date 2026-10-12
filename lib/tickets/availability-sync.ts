"use client"

import { useEffect, useState } from "react"

import {
  ABSENCE_REASON_LABELS,
  isAvailable,
  userApi,
  type AbsenceReason,
  type AvailabilityEntry,
} from "@/lib/api"
import { getToken } from "@/lib/auth"
import type { ResponderRecord, Unavailability } from "@/lib/tickets/types"

/**
 * Reporte les disponibilités déclarées dans les profils sur les fiches
 * d'intervenants utilisées par le dispatch.
 *
 * Le registre des compétences vit dans le navigateur et la disponibilité vit
 * en base : sans ce pont, une absence déclarée dans `/settings` resterait
 * invisible au dispatcher, qui continuerait de proposer la personne.
 *
 * Deux règles gouvernent la fusion, parce que les deux sources peuvent
 * contredire la fiche locale :
 *
 *  - la fiche du compte l'emporte quand elle déclare une absence, c'est la
 *    déclaration que la personne elle-même a faite ;
 *  - elle n'efface jamais une absence saisie à la main dans le registre, sinon
 *    un simple retour au statut « disponible » depuis les paramètres
 *    supprimerait une information que seul le registre connaît.
 *
 * Seules les absences déjà issues de ce pont sont effacées par un retour au
 * statut disponible : `source: "account"` identifie exactement ce que cette
 * synchronisation a écrit.
 */

/** Compare deux absences, pour ne rien réécrire quand rien n'a changé. */
function sameAbsence(
  left: Unavailability | null,
  right: Unavailability | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.reason === right.reason &&
    left.until === right.until &&
    (left.source ?? "local") === (right.source ?? "local")
  )
}

export function availabilityFromAccount(entry: AvailabilityEntry): Unavailability | null {
  if (isAvailable(entry.availability)) return null

  const label = ABSENCE_REASON_LABELS[entry.availability as AbsenceReason]
  // La précision saisie par la personne s'ajoute au motif plutôt que de le
  // remplacer : « Business trip · Genève » est plus utile que l'un ou l'autre.
  const reason = entry.availabilityNote ? `${label} · ${entry.availabilityNote}` : label

  return { reason, until: entry.availabilityUntil ?? null, source: "account" }
}

/**
 * Applique une liste de disponibilités aux fiches d'intervenants.
 *
 * Fonction pure, séparée du hook pour rester lisible et testable seule. Elle
 * renvoie les fiches à réécrire plutôt que l'état complet : l'appelant n'écrit
 * que ce qui a réellement changé, ce qui évite une boucle entre la
 * synchronisation et le rendu.
 */
export function mergeAvailability(
  responders: ResponderRecord[],
  entries: AvailabilityEntry[],
): { changed: ResponderRecord[]; next: ResponderRecord[] } {
  const byUserId = new Map(entries.map((entry) => [entry._id, entry]))

  const changed: ResponderRecord[] = []
  const next = responders.map((record) => {
    const entry = byUserId.get(record.userId)
    // Pas de fiche en base : personne de la démonstration, ou compte supprimé.
    // Dans les deux cas, la fiche locale reste seule maîtresse.
    if (!entry) return record

    const declared = availabilityFromAccount(entry)
    const current = record.unavailability
    const ownedByAccount = (current?.source ?? "local") === "account"

    // Une fiche déclarant « disponible » n'efface pas une absence saisie à la
    // main : seule une absence déjà issue de ce pont peut être retirée ainsi.
    if (!declared && current && !ownedByAccount) return record

    if (sameAbsence(current, declared)) return record

    const merged: ResponderRecord = { ...record, unavailability: declared }
    changed.push(merged)
    return merged
  })

  return { changed, next }
}

/**
 * Charge les disponibilités de l'équipe si le rôle y a droit.
 *
 * Renvoie `null` tant que le chargement n'a pas abouti, et `[]` si l'appel est
 * refusé : l'écran de dispatch n'a rien à afficher dans ce cas, et une erreur
 * visible pour un simple employé n'aurait aucun sens. Une liste vide ne doit
 * jamais effacer les absences déjà connues localement — `mergeAvailability`
 * s'en assure en ne rien effaçant pour un compte absent de la réponse.
 */
export function useTeamAvailability(canDispatch: boolean): AvailabilityEntry[] | null {
  const [entries, setEntries] = useState<AvailabilityEntry[] | null>(null)

  useEffect(() => {
    if (!canDispatch) return

    const token = getToken()
    if (!token) return

    let active = true
    void userApi
      .availability(token)
      .then((loaded) => {
        if (active) setEntries(loaded)
      })
      .catch(() => {
        if (active) setEntries([])
      })

    return () => {
      active = false
    }
  }, [canDispatch])

  return entries
}