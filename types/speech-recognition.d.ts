/**
 * Types du Web Speech API (reconnaissance vocale).
 *
 * `lib.dom.d.ts` ne déclare que les structures de résultats, ni la classe
 * `SpeechRecognition` ni l'alias `webkitSpeechRecognition` utilisé par
 * Chromium et Safari. Sans ces déclarations, la reconnaissance vocale ne peut
 * pas être utilisée sans contourner le typage.
 *
 * Les types sont volontairement minimaux : seule la surface employée par
 * `useVoiceSearch` est décrite, le reste suit les prototypes de la plateforme.
 */

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}