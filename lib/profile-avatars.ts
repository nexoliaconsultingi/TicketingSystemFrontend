/**
 * Avatars proposés dans les paramètres.
 *
 * Le serveur n'accepte qu'une data URI JPEG, PNG ou WebP. Les vignettes ne
 * peuvent donc pas être des SVG encodés sous une étiquette « image/png » : le
 * navigateur refuserait ensuite de les décoder, et l'étiquette serait fausse.
 * Elles sont réellement dessinées sur un canvas puis encodées en PNG, ce qui
 * produit des octets valides et conformes à `PHOTO_PATTERN`.
 *
 * Volontairement neutres et figuratifs : une galerie de photos de personnes
 * réelles poserait la question de leur licence d'usage.
 */

export interface AvatarSpec {
  id: string
  label: string
  /** Teinte de fond, affichée pendant le chargement et derrière la vignette. */
  tone: string
  /** Couleur de la silhouette. */
  color: string
}

export const AVATAR_SPECS: AvatarSpec[] = [
  { id: "teal", label: "Teal", tone: "#e6f6f6", color: "#1aa6a6" },
  { id: "navy", label: "Navy", tone: "#e8edf2", color: "#183b56" },
  { id: "violet", label: "Violet", tone: "#eeecf9", color: "#7868b8" },
  { id: "amber", label: "Amber", tone: "#fdf1e2", color: "#d7953e" },
  { id: "slate", label: "Slate", tone: "#eef1f6", color: "#64748b" },
  { id: "coral", label: "Coral", tone: "#fbeae6", color: "#e2725b" },
]

/** Côté des vignettes générées. L'avatar est affiché bien plus petit. */
const AVATAR_SIZE = 128

export interface AvatarOption {
  id: string
  label: string
  dataUri: string
  tone: string
}

/**
 * Dessine les vignettes et renvoie des data URI PNG.
 *
 * Appelé uniquement dans le navigateur : `canvas` n'existe pas côté serveur, et
 * le résultat est memorisé par l'appelant pour ne pas redessiner à chaque
 * rendu.
 */
export function buildAvatarOptions(): AvatarOption[] {
  return AVATAR_SPECS.map((spec) => ({
    id: spec.id,
    label: `${spec.label} avatar`,
    tone: spec.tone,
    dataUri: drawAvatar(spec),
  }))
}

function drawAvatar(spec: AvatarSpec): string {
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE

  const context = canvas.getContext("2d")
  if (!context) return ""

  context.fillStyle = spec.tone
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)

  // Silhouette tête-et-épaules, proportionnée à la vignette.
  context.fillStyle = spec.color
  context.beginPath()
  context.arc(AVATAR_SIZE / 2, AVATAR_SIZE * 0.375, AVATAR_SIZE * 0.165, 0, Math.PI * 2)
  context.fill()

  context.beginPath()
  context.moveTo(AVATAR_SIZE * 0.185, AVATAR_SIZE)
  context.bezierCurveTo(
    AVATAR_SIZE * 0.185,
    AVATAR_SIZE * 0.685,
    AVATAR_SIZE * 0.36,
    AVATAR_SIZE * 0.61,
    AVATAR_SIZE / 2,
    AVATAR_SIZE * 0.61,
  )
  context.bezierCurveTo(
    AVATAR_SIZE * 0.64,
    AVATAR_SIZE * 0.61,
    AVATAR_SIZE * 0.815,
    AVATAR_SIZE * 0.685,
    AVATAR_SIZE * 0.815,
    AVATAR_SIZE,
  )
  context.closePath()
  context.fill()

  return canvas.toDataURL("image/png")
}