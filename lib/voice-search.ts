"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Reconnaissance vocale appliquée à un champ de recherche.
 *
 * L'API Web Speech n'est pas disponible partout : Firefox ne l'expose pas du
 * tout, et Chromium exige une connexion sécurisée ou `localhost`. Le hook
 * signale donc sa disponibilité au lieu de lever, ce qui permet à l'interface
 * de masquer simplement le micro quand la dictée est impossible.
 *
 * La reconnaissance est volontairement à instance unique : `continuous` est
 * désactivé, chaque appui sur le micro écoute une phrase puis rend la main.
 * Un appui pendant l'écoute interrompt la session en cours.
 */

/** Constructeur présent sur la fenêtre, qu'il soit préfixé ou non. */
function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/** Une reconnaissance n'existe pas partout : l'interface s'adapte. */
export function isVoiceSearchSupported(): boolean {
  return getConstructor() !== null
}

/** Raison pour laquelle la dictée est indisponible, à loguer si nécessaire. */
export function voiceUnsupportedReason(): string | null {
  if (isVoiceSearchSupported()) return null
  if (typeof window === "undefined") return null
  return "Voice search is not available in this browser. Chrome, Edge or Safari support it."
}

/**
 * Langue de reconnaissance par défaut.
 *
 * Volontairement fixée à lenglish plutôt qu'égale à `navigator.language` :
 * la reconnaissance suit la langue demandée, et l'utilisateur peut parler
 * anglais alors que son navigateur est en français. Suivre le navigateur
 * ferait transcrire « logistics » en « logistique », qui ne correspond à aucun
 * nom de département de l'annuaire. Les données et l'interface étant en
 * anglais, c'est l'anglais qui doit être reconnu.
 */
const DEFAULT_LANG = "en-US"

export interface VoiceSearchOptions {
  /**
   * Langue de reconnaissance. Par défaut l'anglais : voir `DEFAULT_LANG`.
   * Utile si un annuaire est saisi dans une autre langue.
   */
  lang?: string
  onResult: (transcript: string) => void
}

export interface VoiceSearch {
  /** `false` quand le navigateur n'expose pas la reconnaissance vocale. */
  supported: boolean
  /** `true` entre le démarrage et la fin de l'écoute. */
  listening: boolean
  /**
   * Message d'erreur de la dernière tentative, `null` tant qu'aucune erreur
   * n'est survenue.
   *
   * L'indisponibilité du navigateur n'en fait pas partie : l'interface masque
   * simplement le micro, et un bandeau d'erreur à ce sujet n'apprendrait à rien
   * puisqu'aucun contrôle n'est proposé.
   */
  error: string | null
  /** Démarre l'écoute, ou l'interrompt si une session est déjà en cours. */
  toggle: () => void
}

export function useVoiceSearch({ lang, onResult }: VoiceSearchOptions): VoiceSearch {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La session vit dans une ref : elle n'a pas vocation à redessiner, et
  // `abort()` doit rester possible au démontage sans casser les callbacks.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    setSupported(isVoiceSearchSupported())
  }, [])

  // Une écoute en cours ne doit pas survivre au démontage du composant.
  useEffect(
    () => () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    },
    [],
  )

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Recognition = getConstructor()
    if (!Recognition) {
      setError(voiceUnsupportedReason())
      return
    }

    setError(null)

    try {
      const recognition = new Recognition()
      recognition.lang = lang ?? DEFAULT_LANG
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        // Le dernier segment finalisé porte la phrase complète : les résultats
        // intermédiaires sont écartés pour ne pas déclencher la recherche à
        // chaque mot reconnu.
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (result.isFinal) {
            const transcript = result[0]?.transcript?.trim()
            if (transcript) onResultRef.current(transcript)
          }
        }
      }

      recognition.onerror = (event) => {
        // `no-speech` et `aborted` correspondent à un arrêt volontaire ou à un
        // micro silencieux : ils ne méritent pas de message d'erreur.
        if (event.error === "no-speech" || event.error === "aborted") return
        setError(
          event.error === "not-allowed"
            ? "Microphone access was refused. Allow it in your browser settings to use voice input."
            : `Voice input failed (${event.error}).`,
        )
      }

      recognition.onend = () => {
        recognitionRef.current = null
        setListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setListening(true)
    } catch (cause) {
      recognitionRef.current = null
      setListening(false)
      setError(
        cause instanceof Error
          ? `Voice search is unavailable: ${cause.message}`
          : "Voice search is unavailable.",
      )
    }
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, error, toggle }
}