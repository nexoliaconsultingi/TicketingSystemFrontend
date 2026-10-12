"use client"

import type { ReactNode } from "react"

import { UnseenBadgesProvider } from "@/components/realtime/unseen-badge-provider"
import { useSessionUser } from "@/lib/use-session"

/**
 * Rend les compteurs de navigation disponibles partout dans l'application.
 *
 * Il est placé à la racine, et non dans le `DashboardShell` ou dans les pages de
 * listes, pour deux raisons distinctes.
 *
 * La **portée** : les compteurs sont affichés dans la barre latérale, sur tous les
 * écrans où une personne passe — son tableau de bord, ses dossiers, les réglages.
 * Les rattacher à leur seule page les ferait disparaître dès qu'on en sort, à
 * l'instant précis où ils doivent rappeler qu'il y a eu du nouveau. Et symétriquement,
 * une page doit pouvoir *agir* sur un compteur — ouvrir une fiche, distribuer un
 * dossier, prendre en charge : hors de l'arbre du fournisseur, `markSeen` retomberait
 * sur la valeur par défaut, celle d'un compteur qui ne s'efface jamais.
 *
 * La **continuité** : un fournisseur à la racine survit aux navigations. Les
 * compteurs ne se réinitialisent donc pas à chaque changement d'écran, et leur écoute
 * du flux direct reste ouverte pendant que la personne travaille.
 *
 * Chaque compteur est monté selon ce que le compte peut réellement recevoir. Un
 * demandeur n'a ni dossiers à distribuer ni dossiers à traiter : ni lecture ni
 * abonnement à payer. Un administrateur n'a pas de dossiers à traiter, mais la porte
 * reste ouverte — une distribution peut viser n'importe quel compte, et mieux vaut
 * afficher un chiffre exact que laisser une distribution s'annoncer à personne.
 *
 * Aucun compteur n'est monté tant que l'identité n'est pas connue. `useSessionUser`
 * renvoie `null` au premier rendu et ne renseigne qu'ensuite, depuis le cache puis
 * le serveur : ouvrir les compteurs sur cette valeur reviendrait à les allumer pour
 * tout le monde, y compris pour un visiteur non connecté. Le cas le plus coûteux est
 * celui d'un employé : il adresse une requête qui ne peut aboutir qu'à un refus, à
 * chaque chargement, pour un chiffre qu'il n'a jamais à afficher.
 */
export function UnseenBadgesGate({ children }: { children: ReactNode }) {
  const user = useSessionUser()
  const known = Boolean(user)
  const distributes = known && (user?.access.includes("admin") ?? false)
  const handles = known && ((user?.access.includes("manager") ?? false) || (user?.access.includes("admin") ?? false))

  return (
    <UnseenBadgesProvider dispatch={distributes} assigned={handles}>
      {children}
    </UnseenBadgesProvider>
  )
}
