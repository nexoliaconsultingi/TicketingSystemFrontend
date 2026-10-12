"use client"

import { useEffect, useRef, useState } from "react"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"

import { MATERIAL_IMAGE_MAX_LENGTH } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * Photo d'un produit du stock.
 *
 * Le stockage est un data URI base64 dans le document — pas de fichier sur
 * disque — donc la taille se compte en caractères et le serveur la plafonne
 * (`MATERIAL_IMAGE_MAX_LENGTH`). Une photo d'appareil brute dépasse largement
 * cette limite : l'image est redimensionnée et compressée avant l'envoi.
 *
 * Contrairement à l'avatar de profil, carré et recadré, la photo produit garde
 * son rapport d'aspect : un écran ou une chaise se photographie en travers et
 * le recadrage carré couperait le sujet.
 */

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** Plus grand côté du cliché final. Au-delà, le poids ne sert plus à l'écran. */
const MAX_SIDE = 720

export function MaterialImagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (image: string) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
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
    } catch (err) {
      if (!alive.current) return
      const tooLarge = err instanceof Error && err.message.startsWith("IMAGE_TOO_LARGE")
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
      <p className="mb-2 text-[13px] font-medium text-[#183b56]">
        Product photo
        <span className="ml-1.5 font-normal text-slate-400">optional</span>
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e4eaf1] bg-[#f7f9fc]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Product photo" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-6 text-slate-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e4eaf1] bg-white px-3 py-2 text-xs font-medium text-[#183b56] transition-colors hover:border-[#a8d9d8]",
                (disabled || busy) && "pointer-events-none opacity-50",
              )}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {busy ? "Preparing…" : value ? "Replace photo" : "Upload a photo"}
              <input
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
            JPEG, PNG or WebP. Resized to {MAX_SIDE}px on the long side before sending.
          </p>

          {error && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Réduit le plus grand côté à `MAX_SIDE` puis compresse en JPEG, en gardant le
 * rapport d'aspect. La boucle s'arrête sur le premier palier de qualité sous le
 * plafond du serveur ; un échec est signalé plutôt que masqué.
 */
async function compress(file: File): Promise<string> {
  const bitmap = await loadBitmap(file)
  const { width, height } = bitmap
  if (!width || !height) throw new Error("Image has no dimensions")

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas unavailable")

  // Fond blanc : le JPEG n'a pas d'alpha, une PNG transparente virerait au noir.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, 0, 0, width, height, 0, 0, targetWidth, targetHeight)

  let smallest: string | null = null
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const dataUri = canvas.toDataURL("image/jpeg", quality)
    if (dataUri.length <= MATERIAL_IMAGE_MAX_LENGTH) return dataUri
    smallest = dataUri
  }

  throw new Error(smallest ? `IMAGE_TOO_LARGE:${smallest.length}` : "Unable to encode this image")
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      // Poursuit avec la voie <img> ci-dessous.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
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
