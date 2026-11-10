"use client"

import { io, type Socket } from "socket.io-client"

/**
 * Connexion Socket.IO, une seule par onglet.
 *
 * Le serveur monte son serveur Socket.IO sur le même processus et le même port que
 * l'API Express, mais l'URL reste distincte de `API_BASE_URL` : par défaut le
 * client viserait l'origine du navigateur, c'est-à-dire le port 3000 de Next.js,
 * où rien n'écoute. Les deux variables peuvent pointer le même hôte, elles ne
 * répondent pas au même protocole.
 */
const RAW_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

if (!RAW_SOCKET_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_SOCKET_URL is not configured");
}

export const SOCKET_URL = (
  RAW_SOCKET_URL || "http://localhost:3320"
).replace(/\/+$/, "");

/**
 * Contenu de l'événement `tickets:updated`.
 *
 * Le serveur n'envoie pas la ligne mise à jour mais trois champs : l'action, la
 * ligne concernée, et le statut qu'elle portait. Les écrans qui doivent
 * reconstruire une liste filtrée et paginée relisent le serveur ; ceux qui doivent
 * seulement retirer une ligne disparue n'ont que faire ce qu'on leur dit.
 */
export interface TicketUpdatedPayload {
  /** L'action menée sur le dossier : `create`, `review`, `delete`… */
  action: string
  /** Le dossier concerné. */
  id: string
  /** Le statut du dossier au moment de l'événement. */
  status: string
}

/**
 * Contenu de l'événement `knowledge:updated`.
 *
 * Le serveur annonce à tout le monde une évolution de la base de connaissances
 * — un article créé, corrigé ou retiré. La ligne complète voyage pour un
 * `create`/`update` ; pour un `delete`, seul l'identifiant compte, l'écran
 * retire la ligne.
 */
export interface KnowledgeUpdatedPayload {
  /** L'action menée sur l'article : `create`, `update`, `delete`. */
  action: string
  /** L'article créé ou corrigé (nul pour une suppression). */
  article?: {
    _id: string
    title: string
    description: string
    resolutionTechnique: string
    departmentCode: string
    departmentName: string
    unitPath: string
    unitName: string
    sector: string
    createdBy: string
    createdByName: string
    createdAt: string
    updatedAt: string
    attachment: { name: string; mimeType: string; size: number } | null
  }
  /** Identifiant de l'article retiré (présent uniquement pour un `delete`). */
  id?: string
}

/**
 * Instance partagée, créée à la première connexion.
 *
 * Un module est chargé une seule fois par le navigateur : la variable conserve
 * donc la même connexion d'un composant à l'autre. Deux sockets pour le même
 * compte créeraient deux rooms `user:<id>` et chaque événement arriverait en
 * double.
 */
let socket: Socket | null = null

/**
 * Ouvre la connexion, ou met à jour le jeton d'une connexion existante.
 *
 * Le jeton voyage dans `auth` et non dans l'URL : il ne se retrouve ainsi ni
 * dans les journaux du serveur ni dans l'historique de navigation. Le serveur le
 * vérifie à la poignée de main et inscrit le socket dans la room de son compte.
 *
 * Appeler la fonction avec un jeton alors qu'une connexion existe met simplement
 * le jeton à jour et relance la connexion : c'est ce qu'il faut après une
 * reconnexion, le serveur ayant refusé l'ancienne poignée de main.
 */
export function connectRealtime(token: string): Socket {
  if (socket) {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    // WebSocket d'abord : la notification est un envoi unique et une reconnexion
    // infrequent doit être immédiate. Le repli sur `polling` reste déclaré car
    // certains proxys d'entreprise bloquent le WebSocket sans le signaler.
    transports: ["websocket", "polling"],
    // Reconnecte indéfiniment, avec un intervalle croissant plafonné : un poste
    // qui revient après une nuit hors ligne doit retrouver le compteur sans
    // recharger la page.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })

  return socket
}

/**
 * Ferme la connexion et oublie l'instance.
 *
 * Appelé à la déconnexion et au changement de compte. Sans cela, le socket
 * conserverait le jeton de la session précédente : la reconnexion automatique
 * rouvrirait alors la room de l'ancien compte.
 */
export function disconnectRealtime(): void {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
}
