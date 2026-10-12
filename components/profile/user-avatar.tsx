"use client"

import { useEffect, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { API_BASE_URL } from "@/lib/api"
import { getInitials, getToken } from "@/lib/auth"

/**
 * Photos de profil chargées à la demande, mises en cache pour la session.
 *
 * Le type associatif retient `null` pour un compte sans photo : le 404 est
 * définitif, inutile de le redemander à chaque rendu. Une erreur réseau, elle,
 * n'est pas mémorisée, pour que la photo réapparaisse au prochain affichage.
 */
const photoCache = new Map<string, string | null>()

/** Chargements en cours, pour ne pas demander deux fois la même photo. */
const inFlight = new Map<string, Promise<string | null>>()

async function loadPhoto(userId: string): Promise<string | null> {
  const cached = photoCache.get(userId)
  if (cached !== undefined) return cached

  const running = inFlight.get(userId)
  if (running) return running

  const request = (async () => {
    const token = getToken()
    if (!token) return null

    try {
      const response = await fetch(`${API_BASE_URL}/user/api/users/${userId}/photo`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      // 403 comme 404 : dans les deux cas l'affichage doit basculer sur les
      // initiales, et le navigateur ne doit pas réessayer à chaque ligne.
      if (!response.ok) {
        photoCache.set(userId, null)
        return null
      }

      const url = URL.createObjectURL(await response.blob())
      photoCache.set(userId, url)
      return url
    } catch {
      return null
    } finally {
      inFlight.delete(userId)
    }
  })()

  inFlight.set(userId, request)
  return request
}

/**
 * Vide le cache des photos.
 *
 * Appelé à la déconnexion : le navigateur garde la page en vie, et sans cela la
 * personne qui se connecte ensuite verrait les visages Hartman déjà chargés.
 */
export function clearUserAvatarCache(): void {
  for (const url of photoCache.values()) {
    if (url) URL.revokeObjectURL(url)
  }
  photoCache.clear()
}

/**
 * Visage d'un compte, avec ses initiales en repli.
 *
 * `photo` évite l'appel réseau quand l'appelant possède déjà la data URI —
 * c'est le cas de l'écran d'administration des utilisateurs. Sinon la photo est
 * demandée à la première apparition du visage.
 */
export function UserAvatar({
  userId,
  name,
  photo,
  size = "default",
  className,
}: {
  userId: string | null | undefined
  name?: string | null
  /** Data URI déjà connue, ou chaîne vide. */
  photo?: string
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  const [src, setSrc] = useState<string | null>(photo || null)

  useEffect(() => {
    if (photo) {
      setSrc(photo)
      return
    }

    if (!userId) {
      setSrc(null)
      return
    }

    // Le composant peut être réutilisé pour un autre dossier avant la fin du
    // téléchargement : `active` évite d'afficher la photo du ticket précédent.
    let active = true
    loadPhoto(userId).then((url) => {
      if (active) setSrc(url)
    })

    return () => {
      active = false
    }
  }, [userId, photo])

  return (
    <Avatar size={size} className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>{getInitials(name || "?")}</AvatarFallback>
    </Avatar>
  )
}
