"use client"

import { useCallback, useEffect, useState } from "react"

import type { AuthUser } from "@/lib/api"
import { fetchSessionUser, getStoredUser } from "@/lib/auth"

/**
 * Identité de la personne connectée, avec rafraîchissement côté serveur.
 *
 * Le cache local sert uniquement à afficher quelque chose au premier rendu : il
 * est modifiable depuis le navigateur et peut être périmé. Un changement fait
 * ailleurs — rôle modifié par un administrateur, statut d'absence corrigé —
 * n'y passerait jamais. Une seule relecture à l'arrivée sur une page suffit :
 * les écrans qui modifient la session écrivent déjà le cache en retour via
 * `updateStoredUser`, et le hook les relit à la demande.
 *
 * Le rafraîchissement ne doit jamais remplacer un utilisateur par `null` : en
 * cas d'échec réseau, on garde la dernière valeur connue plutôt que de
 * déconnecter quelqu'un sous un simple problème de connexion.
 */
export function useSessionUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null)

  const refresh = useCallback(async () => {
    const fresh = await fetchSessionUser()
    if (fresh) setUser(fresh)
    else setUser((current) => current ?? getStoredUser())
  }, [])

  useEffect(() => {
    // Rendu immédiat depuis le cache, puis confirmation par le serveur.
    setUser(getStoredUser())
    void refresh()
  }, [refresh])

  return user
}