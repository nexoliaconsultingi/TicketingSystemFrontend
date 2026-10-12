"use client"

import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { ticketApi } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"

/**
 * Les deux compteurs de navigation, décrits une fois pour toutes.
 *
 * Ils partagent la totalité de leur mécanique — lecture au montage, événement
 * poussé, abandon d'une réponse devenue périmée, effacement à l'arrivée sur
 * l'écran — et ne diffèrent que par trois valeurs : la route qui efface, l'événement
 * qui porte le nombre, et la question posée au serveur. Écrire cette différence une
 * seule fois sous forme de configuration évite d'avoir deux exemplaires d'une
 * logique dont la partie subtil est justement celle qu'il ne faut pas laisser diverger.
 */
const UNSEEN_BADGES = {
  /** Files du centre de répartition, pour un compte qui distribue les dossiers. */
  dispatch: {
    path: "/admin/tickets",
    event: "dispatch:unseen",
    read: (token: string) => ticketApi.unseenDispatchCount(token),
    mark: (token: string) => ticketApi.markDispatchSeen(token),
  },
  /** Dossiers distribués au superviseur, qui ne concernent que lui. */
  assigned: {
    path: "/assigned",
    event: "assigned:unseen",
    read: (token: string) => ticketApi.unseenAssignedCount(token),
    mark: (token: string) => ticketApi.markAssignedSeen(token),
  },
} as const

export type UnseenBadgeKind = keyof typeof UNSEEN_BADGES

/** Message poussé par le serveur à chaque changement du nombre de dossiers à traiter. */
interface UnseenPayload {
  count: number
}

export interface UnseenValue {
  count: number
  /**
   * Declare the section as seen: the badge returns to zero.
   *
   * The screen calls this on every action that proves the tickets have been read —
   * opening the list, opening a ticket's details, accepting, resolving. Waiting for
   * the next visit would leave a number on a list the person is already working
   * through.
   */
  markSeen: () => void
}

interface UnseenContextValue {
  dispatch: UnseenValue
  assigned: UnseenValue
}

/**
 * Un compteur sans valeur et sans effet.
 *
 * Renvoyé à la place d'une valeur réelle pour un compte qui n'a pas le droit de la
 * consulter : un badge absent n'affiche alors jamais de chiffre, et `markSeen` ne
 * part pas vers une route qui serait refusée.
 */
const INERT: UnseenValue = { count: 0, markSeen: () => {} }

const UnseenBadgeContext = createContext<UnseenContextValue>({
  dispatch: INERT,
  assigned: INERT,
})

/**
 * Le compteur demandé, ou un compteur inerte si le compte n'y a pas droit.
 *
 * L'entrée de navigation interroge le contexte sans savoir quel rôle affiche l'écran :
 * elle demande « le compteur de cette section », et ce n'est qu'ici qu'on décide
 * qu'un demandeur n'en a aucun.
 */
export function useUnseenBadge(kind: UnseenBadgeKind): UnseenValue {
  return useContext(UnseenBadgeContext)[kind]
}

/**
 * Un compteur personnel : état, lecture initiale, écoute temps réel, effacement.
 *
 * La valeur arrive par deux chemins qui se recoupent :
 *
 *   - une lecture HTTP au montage, qui survit à un rechargement de page et donne
 *     la valeur juste même si le temps réel est coupé ;
 *   - un événement poussé par le serveur à chaque changement du nombre de dossiers.
 *
 * La lecture HTTP est abandonnée dès qu'une valeur plus fraîche existe : sinon une
 * réponse partie avant la distribution d'un dossier l'écraserait, et le compteur
 * n'annoncerait rien. L'inverse compte tout autant — un effacement local ne doit pas
 * être annulé par une lecture partie avant lui, qui remettrait le compteur à son
 * ancienne valeur sur un écran où la personne a déjà tout regardé.
 */
function useUnseenCounter(kind: UnseenBadgeKind, enabled: boolean): UnseenValue {
  const badge = UNSEEN_BADGES[kind]
  const pathname = usePathname()
  const [count, setCount] = useState(0)

  /**
   * Une valeur plus récente que la lecture HTTP encore en vol.
   *
   * `true` signifie « la réponse du serveur ne doit plus être appliquée ». Passé à
   * `true` par un événement temps réel ou par un effacement à l'arrivée sur l'écran.
   */
  const superseded = useRef(false)

  // Un changement de compte repart de zéro : le compteur de la session précédente
  // n'a pas à être appliqué à la nouvelle.
  useEffect(() => {
    superseded.current = false
    setCount(0)
  }, [enabled])

  // Lecture initiale.
  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    void (async () => {
      const token = getToken()
      if (!token) return
      try {
        const { count: initial } = await badge.read(token)
        if (cancelled || superseded.current) return
        setCount(initial)
      } catch {
        // Le compteur reste à zéro et le temps réel reprendra la main. Un échec
        // réseau n'a rien à signaler à l'utilisateur : il n'y a pas d'action à
        // entreprendre, et une alerte ici serait du bruit sur un écran déjà dense.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, badge])

  // Abonnement temps réel.
  useEffect(() => {
    if (!enabled) return

    const token = getToken()
    if (!token) return

    const socket = connectRealtime(token)

    const onUnseen = (payload: UnseenPayload) => {
      const value = Number(payload?.count)
      if (!Number.isFinite(value) || value < 0) return
      superseded.current = true
      setCount(value)
    }

    socket.on(badge.event, onUnseen)

    return () => {
      socket.off(badge.event, onUnseen)
      // La connexion elle-même n'est pas coupée : elle appartient au module, pas au
      // composant. Naviguer d'une page à l'autre sinon réabonnerait pour rien et
      // ferait clignoter le temps réel à chaque écran.
    }
  }, [enabled, badge])

  /**
   * Ouverture de la section : le compteur retombe à zéro.
   *
   * L'effacement a lieu à l'arrivée et non au retour de l'écran. Un dossier
   * distribué pendant que la personne consulte une autre page doit de nouveau
   * s'annoncer : rien ne rafraîchit cette liste d'elle-même, et un « 1 » prévient
   * qu'il y a eu du nouveau depuis.
   *
   * Le curseur est positionné par le serveur à l'instant de l'appel, et non au
   * dernier dossier affiché : un dossier arrivé entre le chargement de la liste et
   * cet effet resterait sinon invisible jusqu'à la visite suivante.
   */
  const markSeen = useCallback(() => {
    if (!enabled) return

    superseded.current = true
    setCount(0)

    const token = getToken()
    if (!token) return

    void badge
      .mark(token)
      // Un échec ici est sans conséquence : le compteur est déjà à zéro à
      // l'écran, et la prochaine lecture HTTP rendra la valeur du serveur.
      .catch(() => {})
  }, [enabled, badge])

  useEffect(() => {
    if (pathname !== badge.path) return
    markSeen()
  }, [markSeen, pathname, badge])

  return useMemo(() => ({ count, markSeen }), [count, markSeen])
}

/**
 * Les compteurs de navigation, partagés par toute l'application.
 *
 * Placé à la racine, et non dans le `DashboardShell` ou dans les pages de listes :
 * le compteur est affiché dans la barre latérale partout, y compris sur un écran où
 * la personne ne regarde pas ses dossiers — et c'est précisément là qu'il doit
 * rappeler qu'il y a eu du nouveau. Une page doit aussi pouvoir *agir* sur lui :
 * hors de l'arbre du fournisseur, `markSeen` retomberait sur la valeur par défaut,
 * celle d'un compteur qui ne s'efface jamais.
 *
 * Un fournisseur à la racine survit en outre aux navigations : les compteurs ne se
 * réinitialisent pas à chaque changement d'écran, et leur écoute du flux direct reste
 * ouverte pendant que la personne travaille.
 *
 * Chaque compteur n'est monté que pour les comptes concernés : un demandeur n'a ni
 * dossiers à distribuer ni dossiers à traiter, et n'a donc ni lecture ni abonnement
 * à payer.
 */
export function UnseenBadgesProvider({
  dispatch,
  assigned,
  children,
}: {
  /** Le compteur du centre de répartition, pour un compte qui distribue des dossiers. */
  dispatch: boolean
  /** Le compteur des dossiers à traiter, pour un compte qui peut en recevoir. */
  assigned: boolean
  children: ReactNode
}) {
  const dispatchValue = useUnseenCounter("dispatch", dispatch)
  const assignedValue = useUnseenCounter("assigned", assigned)

  const value = useMemo(
    () => ({ dispatch: dispatchValue, assigned: assignedValue }),
    [dispatchValue, assignedValue],
  )

  return <UnseenBadgeContext.Provider value={value}>{children}</UnseenBadgeContext.Provider>
}
