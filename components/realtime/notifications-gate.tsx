"use client"

import type { ReactNode } from "react"

import { NotificationsProvider } from "@/components/realtime/notifications-provider"
import { useSessionUser } from "@/lib/use-session"

/**
 * Rend les notifications du compte disponibles partout dans l'application.
 *
 * Placé à la racine, à côté des compteurs, pour les mêmes raisons : la cloche est
 * dans l'en-tête de tous les écrans, elle doit connaître son chiffre dès la
 * première navigation et non au chargement suivant ; et un fournisseur qui
 * survit aux navigations garde l'écoute temps réel ouverte pendant que la
 * personne travaille.
 *
 * Rien n'est monté tant que l'identité n'est pas connue : `useSessionUser`
 * renvoie `null` au premier rendu et ne renseigne qu'ensuite. Ouvrir les
 * notifications sur cette valeur reviendrait à les interroger pour un visiteur
 * non connecté — une requête qui ne peut aboutir qu'à un refus, à chaque
 * chargement, pour un panneau qui n'existe pas encore sur cet écran.
 */
export function NotificationsGate({ children }: { children: ReactNode }) {
  const user = useSessionUser()

  return <NotificationsProvider enabled={Boolean(user)}>{children}</NotificationsProvider>
}
