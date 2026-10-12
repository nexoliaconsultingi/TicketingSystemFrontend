"use client"

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

import { notificationApi, type NotificationItem } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"

export interface NotificationsValue {
  /** Les plus récentes en tête, cinquante au plus. */
  items: NotificationItem[]
  /**
   * Non luses : le chiffre de la cloche.
   *
   * Il ne compte jamais deux fois la même notification, et il est repris au
   * serveur dès que le poste revient au premier plan — un chiffre qui dérive
   * pendant que l'onglet dort est un chiffre qui ment à son retour.
   */
  unread: number
  /** Le panneau de la cloche est-il ouvert ? */
  open: boolean
  /**
   * Ouvrir le panneau.
   *
   * Ouvrir, c'est regarder : le compteur tombe à zéro sans qu'il ait fallu
   * cliquer chaque ligne. Les lignes restent marquées jusqu'à la fermeture,
   * faute de quoi on ne pourrait pas compter ce qui venait d'être lu.
   */
  openPanel: () => void
  closePanel: () => void
  /** Dégage le panneau. Effacer n'est pas lire : rien ne revient. */
  clear: () => void
}

const NotificationsContext = createContext<NotificationsValue>({
  items: [],
  unread: 0,
  open: false,
  openPanel: () => {},
  closePanel: () => {},
  clear: () => {},
})

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext)
}

/**
 * Union de la liste serveur et de ce que le temps réel a apporté depuis.
 *
 * La réponse HTTP part avant un `notification:new` et arrive après lui : la
 * remplacer telle quelle effacerait la notification qui vient d'arriver, au
 * moment même où elle doit apparaître. On garde donc tout ce que les deux
 * sources savent, en retirant les doublons — le même exemplaire arrivé par les
 * deux voies.
 */
function mergeItems(server: NotificationItem[], local: NotificationItem[]): NotificationItem[] {
  const known = new Set(server.map((item) => item._id))
  return [...server, ...local.filter((item) => !known.has(item._id))]
    .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 50)
}

/**
 * Les notifications du compte, en temps réel.
 *
 * Elles arrivent par deux chemins qui se recoupent : une lecture HTTP, qui
 * survit à un rechargement et donne la valeur juste même si le temps réel est
 * coupé, et `notification:new`, poussé à la seconde où le serveur en écrit une.
 *
 * Trois défauts sont écartés ici, tous visibles sur la cloche :
 *
 *   - le même événement livré deux fois ferait sauter le chiffre. Un jeu
 *     d'identifiants déjà comptés rend la deuxième livraison sans effet ;
 *   - une réponse lente écraserait une écriture locale plus récente. Tout
 *     geste local invalide les réponses encore en vol ;
 *   - ce qui se passe pendant que l'onglet dort ne parvient jamais au client.
 *     Un retour au premier plan ou une reconnexion relit le serveur.
 */
export function NotificationsProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  /** Identifiants déjà comptés : une notification reçue deux fois n'en fait qu'une. */
  const counted = useRef<Set<string>>(new Set())

  /**
   * Numéro de la dernière lecture partie.
   *
   * Toute écriture locale l'incrémente ; une réponse ne s'applique que si son
   * numéro est toujours le dernier. C'est ce qui empêche un compteur remis à
   * zéro par l'ouverture du panneau d'être relevé par une lecture partie avant.
   */
  const requestSeq = useRef(0)

  /** Le panneau, lisible depuis l'écouteur sans réabonner le socket. */
  const openRef = useRef(false)

  // Un changement de compte repart de zéro : les notifications de la session
  // précédente n'ont rien à dire de la nouvelle.
  useEffect(() => {
    requestSeq.current++
    counted.current = new Set()
    openRef.current = false
    setItems([])
    setUnread(0)
    setOpen(false)
  }, [enabled])

  useEffect(() => {
    openRef.current = open
  }, [open])

  /**
   * Relit le serveur : la liste et le compteur.
   *
   * Ignoré tant que le panneau est ouvert — la personne est en train de lire, et
   * une lecture partie avant l'ouverture retournerait des lignes déjà marquées
   * comme lues, effaçant au passage ce qui venait d'être montré.
   */
  const load = useCallback(async () => {
    if (openRef.current) return

    const token = getToken()
    if (!token) return

    const seq = ++requestSeq.current

    try {
      const [server, { count }] = await Promise.all([
        notificationApi.list(token),
        notificationApi.unreadCount(token),
      ])
      // La liste est fusionnée quoi qu'il arrive : elle ne peut que compléter.
      // Le compteur, lui, ne s'applique qu'à la réponse la plus récente.
      setItems((local) => mergeItems(server, local))
      for (const item of server) counted.current.add(item._id)
      if (requestSeq.current === seq) setUnread(count)
    } catch {
      // Le panneau reste tel quel et le temps réel reprend la main. Un échec
      // réseau n'a rien à signaler ici : il n'y a pas d'action à entreprendre.
    }
  }, [])

  // Lecture initiale.
  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  // Revenir au premier plan après une nuit ou un onglet laissé derrière : ce
  // qui s'est produit pendant ce temps n'a pas été reçu, et seule une relecture
  // le remet dans le chiffre.
  useEffect(() => {
    if (!enabled) return

    const onWake = () => {
      if (document.visibilityState === "hidden") return
      void load()
    }

    window.addEventListener("focus", onWake)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      window.removeEventListener("focus", onWake)
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [enabled, load])

  // Abonnement temps réel.
  useEffect(() => {
    if (!enabled) return

    const token = getToken()
    if (!token) return

    const socket = connectRealtime(token)

    const onNew = (payload: NotificationItem) => {
      if (!payload || typeof payload !== "object" || !payload._id) return
      if (counted.current.has(payload._id)) return
      counted.current.add(payload._id)

      // Une réponse en vol serait plus ancienne que cet événement : elle ne doit
      // plus être appliquée au compteur.
      requestSeq.current++

      // Lu, donc déjà vu : la ligne s'ajoute sans rallumer le compteur, et le
      // serveur doit l'apprendre — la prochaine lecture repartirait sinon d'une
      // notification que la personne n'a jamais vue pour l'afficher.
      const seen = openRef.current
      setItems((current) => mergeItems([{ ...payload, read: seen }], current))

      if (seen) {
        void notificationApi.markRead(token, payload._id).catch(() => {})
      } else {
        setUnread((count) => count + 1)
      }
    }

    // Reconnexion : le serveur a pu écrire pendant la coupure, et aucun événement
    // de cette période ne sera rejoué. Une relecture rattrape ce qui a été manqué.
    const onReconnect = () => {
      void load()
    }

    socket.on("notification:new", onNew)
    socket.io.on("reconnect", onReconnect)

    return () => {
      socket.off("notification:new", onNew)
      socket.io.off("reconnect", onReconnect)
      // La connexion elle-même n'est pas coupée : elle appartient au module, pas
      // au composant. Naviguer d'une page à l'autre sinon réabonnerait pour rien.
    }
  }, [enabled, load])

  const openPanel = useCallback(() => {
    setOpen(true)
    if (!enabled) return

    // Ouvrir, c'est regarder : le chiffre disparaît d'office. Les lignes, elles,
    // gardent leur marque jusqu'à la fermeture — on ne peut pas vérifier un
    // chiffre si tout a l'air identique au premier regard.
    requestSeq.current++
    setUnread(0)

    const token = getToken()
    if (!token) return
    // Un échec ici est sans conséquence pour l'écran : le compteur est déjà à
    // zéro, et la prochaine lecture rendra la valeur du serveur.
    void notificationApi.markAllRead(token).catch(() => {})
  }, [enabled])

  const closePanel = useCallback(() => {
    setOpen(false)
    // Tout était lu dès l'ouverture côté serveur : les marques tombent avec le
    // panneau, et la prochaine ouverture ne signalera que du neuf.
    setItems((current) => current.map((item) => (item.read ? item : { ...item, read: true })))
  }, [])

  const clear = useCallback(() => {
    requestSeq.current++
    counted.current = new Set()
    setItems([])
    setUnread(0)
    if (!enabled) return

    const token = getToken()
    if (!token) return
    void notificationApi.removeAll(token).catch(() => {})
  }, [enabled])

  const value = useMemo(
    () => ({ items, unread, open, openPanel, closePanel, clear }),
    [items, unread, open, openPanel, closePanel, clear],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
