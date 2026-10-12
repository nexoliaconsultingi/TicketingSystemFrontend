"use client"

import { useEffect, useRef } from "react"

import { getToken } from "@/lib/auth"
import { connectRealtime, type TicketUpdatedPayload } from "@/lib/realtime"

/**
 * Abonnement aux changements d'un dossier, pour tout écran qui le suit.
 *
 * Un dossier est regardé par trois personnes à la fois — l'administrateur qui le
 * distribue, le demandeur qui l'a déclaré, le superviseur qui le traite — et
 * chacune peut agir sur lui depuis un autre poste. Sans signal, chacune continue
 * d'afficher un état périmé jusqu'à ce qu'elle recharge sa page, et agit donc sur
 * une étape qui n'est plus la bonne.
 *
 * Le signal ne dit pas quoi afficher. Il dit deux choses, et les deux sont traitées
 * à des rythmes différents.
 *
 * `onEvent` est appelé **immédiatement** : il sert aux réactions qui ne dépendent
 * d'aucune lecture — refermer une fiche sur un dossier supprimé, abandonner un
 * dialogue devenu caduc. Un délai se verrait à l'écran et laisserait l'utilisateur
 * agir sur une étape disparue.
 *
 * `onRefresh` est appelé **après un court regroupement** : il sert à relire la
 * liste, et une décision produit souvent plusieurs événements — une distribution
 * en produit au moins deux. Relire à chacun ferait clignoter l'écran pour aboutir
 * à la même liste.
 *
 * Le regroupement est court (400 ms) parce qu'il ne doit pas laisser l'écran en
 * retard : il ne sert qu'à réunir ce qui arrive ensemble.
 */
export function useTicketFeed({
  onEvent,
  onRefresh,
  delay = 400,
}: {
  /** Réaction immédiate à une décision, sans lecture réseau. */
  onEvent?: (payload: TicketUpdatedPayload) => void
  /** Relecture de la liste, regroupée sur quelques centaines de millisecondes. */
  onRefresh: () => void
  delay?: number
}) {
  // Les callbacks sont recreated à chaque rendu. Les lire par une référence évite
  // de dépendre de leur identité dans l'effet d'abonnement : sans cela, la
  // connexion serait coupée et refermée à chaque rendu de la page.
  const handlers = useRef({ onEvent, onRefresh })

  useEffect(() => {
    handlers.current = { onEvent, onRefresh }
  }, [onEvent, onRefresh])

  useEffect(() => {
    const token = getToken()
    if (!token) return

    const socket = connectRealtime(token)
    let pending: number | null = null

    const onUpdated = (payload: TicketUpdatedPayload) => {
      if (!payload?.id) return

      handlers.current.onEvent?.(payload)

      if (pending !== null) window.clearTimeout(pending)
      pending = window.setTimeout(() => {
        pending = null
        handlers.current.onRefresh()
      }, delay)
    }

    socket.on("tickets:updated", onUpdated)

    return () => {
      // Le regroupement en cours est annulé avec l'écran : relire une liste au
      // moment où l'on quitte la page ne servirait à rien et annulerait le
      // rechargement du suivant.
      if (pending !== null) window.clearTimeout(pending)
      socket.off("tickets:updated", onUpdated)
    }
  }, [delay])
}
