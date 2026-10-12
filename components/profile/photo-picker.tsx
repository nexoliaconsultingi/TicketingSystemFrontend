"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, Loader2, Trash2, Upload, User as UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Sélection d'une photo de profil.
 *
 * Le stockage est un data URI base64 dans le document utilisateur, pas un
 * fichier sur disque : la taille est donc comptée en caractères et plafonnée
 * par le serveur (`PHOTO_MAX_LENGTH`). Une photo de téléphone brute dépasse
 * largement cette limite, d'où la redimension et la compressionObligatoires
 * avant l'envoi.
 */

/** Reprend la limite du serveur, en caractères de data URI. */
export const PHOTO_MAX_LENGTH = 300_000

/** Formats acceptés par le serveur : le motif est vérifié côté API. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** Côté du carré final. Au-delà, le poids est inutile pour un avatar. */
const TARGET_SIZE = 320

/**
 * Position verticale du recadrage, entre 0 (haut) et 1 (bas).
 *
 * Un cadrage centré à 0.35 laisse voir le visage plutôt que le torse sur une
 * photo de portrait, mais trop remonte risque de couper les cheveux sur un
 * cadrage serré. 0.3 est le compromis le plus courant dans les interfaces de
 * profil.
 */
const VERTICAL_FOCUS = 0.3

/**
 * Avatars proposés.
 *
 * Ce sont des silhouettes vectorielles rendues en data URI SVG... sauf que le
 * serveur n'accepte que JPEG, PNG et WebP. Elles sont donc fournies par le
 * parent sous forme de data URI déjà conforme, jamais construites ici.
 */
export interface PhotoOption {
  id: string
  label: string
  /** Data URI conforme au motif du serveur, ou vide pour l'initiales. */
  dataUri: string
  /** Teinte de fond, utilisée pour la vignette et l'initiale. */
  tone: string
}

export function PhotoPicker({
  value,
  initials,
  options,
  onChange,
  disabled = false,
}: {
  value: string
  initials: string
  options: PhotoOption[]
  onChange: (photo: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labelId = useId()

  // Le message d'erreur vit dans un état, mais le fichier est lu dans un
  // gestionnaire asynchrone : un composant démonté entre-temps ne doit pas
  // tenter d'écrire dans un état inexistant.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Vide après traitement, sinon re-sélectionner le même fichier ne
    // déclencherait pas l'événement.
    event.target.value = ""
    if (!file) return

    setError(null)

    if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      setError(
        file.type === "image/heic" || file.type === "image/heif"
          ? "HEIC photos are not supported. Save the photo as JPEG or PNG and try again."
          : "Choose a JPEG, PNG or WebP image.",
      )
      return
    }

    setBusy(true)
    try {
      const dataUri = await compress(file)
      if (!alive.current) return

      onChange(dataUri)
    } catch (error) {
      if (!alive.current) return
      // `compress` signale explicitement une image trop lourde : le message
      // est alors plus utile que l'erreur technique.
      const tooLarge = error instanceof Error && error.message.startsWith("PHOTO_TOO_LARGE")
      setError(
        tooLarge
          ? "This photo is too heavy even after compression. Try a smaller or simpler image."
          : "Unable to read this image. JPEG, PNG and WebP are supported.",
      )
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return (
    <div>
      <p id={labelId} className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <UserIcon className="size-4 text-slate-400" />
        Profile photo
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Preview photo={value} initials={initials} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e4eaf1] bg-white px-3 py-2 text-xs font-medium text-[#183b56] transition-colors hover:border-[#a8d9d8]",
                (disabled || busy) && "pointer-events-none opacity-50",
              )}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {busy ? "Preparing…" : "Upload a photo"}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="sr-only"
                onChange={handleFile}
                disabled={disabled || busy}
              />
            </label>

            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4eaf1] bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                Remove
              </button>
            )}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            JPEG, PNG or WebP. The photo is resized to {TARGET_SIZE}×{TARGET_SIZE} before
            sending.
          </p>

          {error && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-600">Or pick an avatar</p>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => {
                const selected = value === option.dataUri
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onChange(option.dataUri)}
                    disabled={disabled}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={selected}
                    className={cn(
                      "relative size-12 overflow-hidden rounded-full ring-offset-2 transition-all",
                      selected
                        ? "ring-2 ring-[#1aa6a6]"
                        : "ring-1 ring-[#e4eaf1] hover:ring-[#a8d9d8]",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                    style={{ backgroundColor: option.tone }}
                  >
                    {option.dataUri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.dataUri} alt={option.label} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-sm font-semibold text-white">
                        {initials}
                      </span>
                    )}
                    {selected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-[#183b56]/45 text-white">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Preview({ photo, initials }: { photo: string; initials: string }) {
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-[#d7eeee] ring-1 ring-[#e4eaf1]">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Your profile photo" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-2xl font-semibold text-[#176b6b]">
          {initials}
        </span>
      )}
    </div>
  )
}

/**
 * Redimensionne au carré et compresse en JPEG.
 *
 * Trois points corrigent des défauts visibles dans le cercle :
 *
 * 1. Le JPEG n'a pas de canal alpha. Sans fond posé au préalable, une photo
 *    PNG transparente (capture d'écran, logo) ressortait sur un rectangle noir.
 * 2. Le recadrage se fait au centre de l'image, mais sur une photo de
 *    téléphone en orientation portrait, le sujet est souvent en haut : un
 *    décalage vertical vers le haut montre le visage plutôt que le torse.
 * 3. La qualité ne descendait que si la data URI dépassait le plafond. Une
 *    image très détaillée le dépassait à tous les paliers, et la dernière
 *    qualité (0.4) était renvoyée sans recontrôle — donc potentiellement
 *    refusée par le serveur.
 *
 * La boucle s'arrête sur le premier palier valide : le résultat est toujours
 * vérifié avant d'être renvoyé, et un échec est signalé plutôt que masqué.
 */
async function compress(file: File): Promise<string> {
  const bitmap = await loadBitmap(file)
  const { width, height } = bitmap
  if (!width || !height) throw new Error("Image has no dimensions")

  const side = Math.min(width, height)
  const size = Math.min(TARGET_SIZE, side)

  // Recadrage centré horizontalement, remonté verticalement pour garder le
  // visage dans le rond plutôt que le torse.
  const sx = (width - side) / 2
  const sy = (height - side) * VERTICAL_FOCUS

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas unavailable")

  // Fond blanc : le format de sortie n'a pas d'alpha, et un PNG transparent
  // deviendrait sinon un rectangle noir.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, size, size)

  // `imageSmoothingQuality` évite le rendu en escalier après réduction.
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"

  // `drawImage` reçoit la zone source au format naturel, et la zone
  // destination en pixels du canvas : la mise à l'échelle est explicite.
  context.drawImage(
    bitmap,
    sx,
    sy,
    side,
    side,
    0,
    0,
    size,
    size,
  )

  let smallest: string | null = null
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
    const dataUri = canvas.toDataURL("image/jpeg", quality)
    if (dataUri.length <= PHOTO_MAX_LENGTH) return dataUri
    smallest = dataUri
  }

  // Aucun palier ne passe : l'erreur est signalée à l'appelant, qui affiche un
  // message, plutôt que d'envoyer une photo que le serveur refusera.
  throw new Error(
    smallest ? `PHOTO_TOO_LARGE:${smallest.length}` : "Unable to encode this image.",
  )
}

/**
 * Décode le fichier.
 *
 * `createImageBitmap` est le chemin rapide. Le repli par `<img>` couvre
 * Safari, qui ne l'implémente pas partout.
 */
function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadViaImageElement(file))
  }
  return loadViaImageElement(file)
}

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Unable to decode image"))
    }
    image.src = url
  })
}