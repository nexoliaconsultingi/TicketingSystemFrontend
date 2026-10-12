"use client"

import { useEffect } from "react"

import { getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"

/**
 * Signal sonore poussé avec une notification.
 *
 * Le navigateur refuse de faire entendre du son avant que la personne n'ait
 * cliqué quelque part : c'est sa règle d'autoplay, elle n'est pas contournable.
 * Deux conséquences, assumées toutes deux :
 *
 *   - le premier geste de la session (connexion, choix dans un menu) « ouvre »
 *     le son par une lecture muette de la piste ;
 *   - une notification reçue avant ce geste reste silencieuse. Elle survient
 *     alors sur l'écran de connexion, où personne n'attend d'être averti, et sa
 *     cloche ou son compteur reste là.
 *
 * Le fichier est appelé depuis l'origine de Next.js — `public/` est servi par
 * Next, pas par l'API : l'URL du serveur d'API n'y résoudrait rien.
 */
const SOUND_SRC = "/sound/notifSoundTicket.mp3"

/**
 * Avis sonore des notifications reçues en direct.
 *
 * Un seul écouteur, monté à la racine : il couvre les trois chemins du serveur
 * (`notifyUser`, `notifyAdmins`, `notifyByRole`), qui émettent tous
 * `notification:new` vers la room du compte concerné. L'abonner plusieurs fois
 * ferait retentir le signal plusieurs fois pour une seule notification.
 *
 * Seules les notifications déclenchent le son, pas `tickets:updated` : ce
 * dernier part à chaque étape d'un dossier — déclaration, révision, attribution,
 * résolution, avis — et l'administrateur les reçoit toutes. Un signal par étape
 * rendrait l'écran inutilisable en quelques minutes.
 *
 * Rend `null` : c'est un écouteur, rien à afficher.
 */
export function NotificationSound() {
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const socket = connectRealtime(token)

    // Un seul `Audio` pour toute la session : réutiliser la piste déjà chargée
    // coûte une lecture, récréer un élément relancerait le téléchargement des
    // 76 ko à chaque notification.
    const audio = new Audio(SOUND_SRC)
    audio.preload = "auto"

    /**
     * Ouvre le son au premier geste de la session.
     *
     * La lecture est muette et immédiatement interrompue : elle ne fait que
     * franchir la condition posée par le navigateur, personne n'entend rien.
     * Les écoutes se retirent ensuite d'elles-mêmes : ce n'est plus nécessaire.
     */
    const unlock = () => {
      audio.muted = true
      void audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
        })
        .catch(() => {
          // Toujours refusé : la règle du navigateur n'est pas satisfaite et le
          // prochain geste retentera. Rien à signaler à la personne.
        })
        .finally(() => {
          audio.muted = false
        })

      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }

    window.addEventListener("pointerdown", unlock)
    window.addEventListener("keydown", unlock)

    const onNotification = () => {
      // Repartir du début : une notification qui arrive pendant le son précédent
      // doit être entendue en entier, pas fondre dans ce qui sonne encore. À
      // l'inverse, une notification silencieuse laissée sur pause par l'écran
      // d'accueil reprendrait à mi-parcours.
      audio.currentTime = 0
      void audio.play().catch(() => {
        // Aucun geste encore, ou lecture refusée par le navigateur. Le son
        // reste silencieux : l'information est déjà portée par la cloche et le
        // compteur, et bloquer l'écran pour réclamer un clic serait pire.
      })
    }

    socket.on("notification:new", onNotification)

    return () => {
      socket.off("notification:new", onNotification)
      // La connexion est celle du module, pas celle de ce composant : elle reste
      // ouverte pour les compteurs et les dossiers. Seul le joueur est fermé.
      audio.pause()
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [])

  return null
}
