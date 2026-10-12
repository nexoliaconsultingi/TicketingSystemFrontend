"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { slaApi, ticketApi, type SlaPolicy } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { useTicketFeed } from "@/lib/use-ticket-feed"

import {
  buildFilterOptions,
  toAnalyticsTickets,
  type AnalyticsFilterOptions,
} from "./source"
import type { AnalyticsTicket } from "./types"

export interface LiveAnalyticsData {
  tickets: AnalyticsTicket[]
  options: AnalyticsFilterOptions
  policy: SlaPolicy | null
  /** Horloge locale, rafraîchie toutes les minutes : fait avancer les dépassements. */
  now: number
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  /** Instant de la dernière lecture réussie, ou `null` avant la première. */
  lastUpdatedAt: number | null
  refresh: () => void
}

/**
 * Données vivantes du module « Analytics & Monitoring ».
 *
 * Tout part d'un seul rechargement : la file complète des tickets
 * (`/ticket/api/tickets`) et la politique SLA en vigueur. Elles sont mises en
 * forme par `lib/analytics/source` — c'est cette couche qui sait ce que le
 * modèle réel peut mesurer.
 *
 * La page se met à jour :
 *  - à l'abonnement socket `tickets:updated` : toute décision d'un poste
 *    concurrent (distribution, prise en revue, acceptation, résolution,
 *    retour, clôture) déclenche la relecture, groupée sur 400 ms ;
 *  - au retour sur l'onglet : revenir après avoir laissé le navigateur de côté
 *    réconcilie l'écran avec le monde sans attendre le signal ;
 *  - par une horloge locale d'une minute : les échéances ouvertes franchies
 *    passent « at risk » puis « breached » même sans événement réseau.
 */
export function useAnalyticsLiveData(): LiveAnalyticsData {
  const [tickets, setTickets] = useState<AnalyticsTicket[]>([])
  const [options, setOptions] = useState<AnalyticsFilterOptions>({
    departments: [],
    categories: [],
    services: [],
    teams: [],
    agents: [],
  })
  const [policy, setPolicy] = useState<SlaPolicy | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const hasLoaded = useRef(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    if (hasLoaded.current) setIsRefreshing(true)
    else setIsLoading(true)
    setError(null)

    try {
      const [queue, policyData] = await Promise.all([ticketApi.queue(token), slaApi.get(token)])
      const mapped = toAnalyticsTickets(queue.tickets, policyData)
      setTickets(mapped)
      setOptions(buildFilterOptions(mapped))
      setPolicy(policyData)
      setNow(Date.now())
      setLastUpdatedAt(Date.now())
      hasLoaded.current = true
    } catch {
      setError("Unable to load ticket activity. Check your connection, then try again.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [load])

  useTicketFeed({ onRefresh: load })

  return { tickets, options, policy, now, isLoading, isRefreshing, error, lastUpdatedAt, refresh: load }
}