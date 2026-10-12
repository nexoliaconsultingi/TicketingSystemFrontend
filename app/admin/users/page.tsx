"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import {
  Building2,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Eye,
  Loader2,
  LogIn,
  Mail,
  MapPin,
  Mic,
  MicOff,
  Network,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  UserX,
  type LucideIcon,
} from "lucide-react"
// Aliasé : le fichier construit aussi un `new Image()` DOM pour décoder le
// fichier choisi, que l'import de next/image masquerait sinon.
import NextImage from "next/image"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import {
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS,
  isAvailable,
  USER_ROLE_LABELS,
  USER_ROLES,
  type AbsenceReason,
  type AvailabilityStatus,
  type UserResponse,
  type UserRole,
} from "@/lib/api"
import { useCompanyAdmin } from "@/lib/company"
import { useUserSearch } from "@/lib/fuzzy-search"
import { unitIndent, unitsForDepartment, useUnits } from "@/lib/units"
import { useUsersAdmin } from "@/lib/users"
import { useHighlightParam } from "@/lib/use-highlight"
import { useSessionUser } from "@/lib/use-session"
import { useVoiceSearch } from "@/lib/voice-search"

interface UserDraft {
  firstName: string
  lastName: string
  email: string
  password: string
  departmentCode: string
  unitPath: string
  address: string
  phone: string
  role: UserRole
  /** Data URI base64 de la photo de profil, ou chaîne vide. */
  photo: string
  /** Disponibilité déclarée par la personne, corrigible par l'admin. */
  availability: AvailabilityStatus
  availabilityNote: string
  /** Date de retour attendue, ou chaîne vide si elle n'est pas connue. */
  availabilityUntil: string
}

const EMPTY_DRAFT: UserDraft = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  departmentCode: "",
  unitPath: "",
  address: "",
  phone: "",
  role: "employee",
  photo: "",
  // Un compte naît disponible : c'est la seule valeur cohérente tant que la
  // personne ne s'est pas déclarée absente.
  availability: "available",
  availabilityNote: "",
  availabilityUntil: "",
}

/**
 * Photo de profil : réduite dans le navigateur avant l'envoi.
 *
 * Le backend ne sert aucun fichier statique et tourne sur Vercel, où le disque
 * est éphémère : l'image est stockée en base64 dans le document, comme le logo
 * de la société. Sans réduction, une photo de téléphone de 5 Mo alourdirait la
 * liste des utilisateurs — d'où ce recadrage carré de 256 px en JPEG.
 */
const PHOTO_SIZE = 256
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

async function fileToAvatarDataUri(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The photo could not be read."))
    reader.onerror = () => reject(new Error("The photo could not be read."))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("The selected file is not a valid image."))
    img.src = dataUrl
  })

  // Recadrage centré sur le plus petit côté, puis mise à l'échelle : l'avatar
  // est affiché en cercle, un cadrage carré évite les déformations.
  const side = Math.min(image.width, image.height)
  const sourceX = (image.width - side) / 2
  const sourceY = (image.height - side) / 2

  const canvas = document.createElement("canvas")
  canvas.width = PHOTO_SIZE
  canvas.height = PHOTO_SIZE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("The photo could not be processed.")
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)

  // JPEG : la transparence du PNG n'a pas d'intérêt dans un avatar, et le JPEG
  // produit un base64 nettement plus court.
  return canvas.toDataURL("image/jpeg", 0.85)
}

/**
 * Le backend ne stocke qu'un `name`. On expose deux champs de saisie et on
 * recompose « prénom nom » : le découpage à la volée évite de dupliquer
 * l'identité dans deux colonnes qui divergeeraient.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

const STEPS = [
  { id: 1, title: "Identity", hint: "First and last name, contact details" },
  { id: 2, title: "Department", hint: "Department, then one of its units" },
  { id: 3, title: "Role", hint: "Access level and password" },
] as const

const MIN_PASSWORD_LENGTH = 8

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  admin: "border-[#183b56]/20 bg-[#183b56]/5 text-[#183b56]",
  manager: "border-[#1aa6a6]/30 bg-[#edf8f8] text-[#147a7a]",
  employee: "border-[#e5eaf2] bg-slate-50 text-slate-500",
}

function formatDate(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Date seule, sans heure : une date de retour n'a pas d'heure, et afficher
 * minuit UTC ferait apparaître un jour différent de celui qui a été saisi.
 */
function formatDay(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Ligne de la fiche de consultation : libellé au-dessus, valeur en dessous.
 * `muted` signale une information absente plutôt qu'un champ réellement vide.
 */
function DetailField({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className={`mt-1 truncate text-[13px] ${muted ? "text-amber-600" : "text-[#183b56]"}`}>
        {value}
      </dd>
    </div>
  )
}

export default function UsersPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <Users />
      </Suspense>
    </AuthGuard>
  )
}
function Users() {
  const { departments } = useCompanyAdmin()
  const { users, loading, error, createUser, updateUser, deleteUser, sendPassword } =
    useUsersAdmin()
  // Annuaire ouvert à tous les connectés : seul l'admin voit les actions.
  // Le même hook alimente le shell, la valeur (avec rafraîchissement serveur)
  // est donc déjà chaude à l'arrivée sur la page.
  const session = useSessionUser()
  const isAdmin = Boolean(session?.access.includes("admin"))

  const [search, setSearch] = useState("")

  // Cible de la recherche globale de l'en-tête : ouvrir directement la fiche.
  const highlight = useHighlightParam()
  const handledHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!highlight || handledHighlightRef.current === highlight) return
    if (loading || users.length === 0) return
    if (!users.some((user) => user._id === highlight)) return
    handledHighlightRef.current = highlight
    setDetailsId(highlight)
  }, [highlight, users, loading])

  // La dictée alimente le même champ que la frappe clavier : une seule
  // recherche, deux entrées.
  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setSearch(transcript)
    },
  })

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  // Consultation : lecture seule, distincte de la modification pour ne jamais
  // risquer une saisie par inadvertance.
  const [detailsId, setDetailsId] = useState<string | null>(null)

  /**
   * Mot de passe affiché après l'enregistrement.
   *
   * Il ne vit que le temps de cette fenêtre : à la fermeture il est
   * définitivement perdu, la base n'en conservant que le hash bcrypt.
   */
  const [revealed, setRevealed] = useState<{
    userId: string
    name: string
    email: string
    password: string
    phone: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [mailState, setMailState] = useState<"idle" | "sending" | "sent" | "failed">("idle")

  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT)
  const [step, setStep] = useState(1)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  /**
   * Saisie dans le formulaire : efface l'erreur en cours. Sans cela le
   * message rouge restait affiché même une fois le champ corrigé, jusqu'à
   * un nouveau clic sur « Next ».
   */
  const updateDraft = (update: (current: UserDraft) => UserDraft) => {
    setDraft(update)
    setFormError(null)
  }

  /**
   * Photo choisie dans l'explorateur : réduite puis convertie en data URI. Le
   * fichier lui-même n'est jamais envoyé, seule l'image réduite l'est.
   */
  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Vider la valeur permet de re-sélectionner le même fichier après un retrait.
    event.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setFormError("The selected file is not an image. Please choose a JPEG, PNG or WebP file.")
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setFormError(`The photo is too large. Please choose a file under ${PHOTO_MAX_BYTES / 1024 / 1024} MB.`)
      return
    }

    setPhotoBusy(true)
    try {
      const photo = await fileToAvatarDataUri(file)
      updateDraft((current) => ({ ...current, photo }))
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The photo could not be processed.")
    } finally {
      setPhotoBusy(false)
    }
  }

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.active),
    [departments],
  )

  // Unités de la branche du département choisi : la liste alimente le select
  // de l'étape 2 et se recalcule à chaque changement de département.
  const { units, loading: unitsLoading } = useUnits()
  const departmentUnits = useMemo(
    () => unitsForDepartment(units, draft.departmentCode),
    [units, draft.departmentCode],
  )

  /**
   * Champs interrogeables d'un compte.
   *
   * Rôles et motifs d'indisponibilité y sont mis sous forme de texte : chercher
   * « sick » ou « vacation » doit ramener la personne concernée, sans quoi il
   * faudrait connaître le code interne du motif.
   */
  const toSearchableUser = useCallback(
    (user: UserResponse) => ({
      name: user.name,
      email: user.email,
      roles: user.access.map((role) => USER_ROLE_LABELS[role] ?? role).join(" "),
      department: `${user.departmentName ?? ""} ${user.departmentCode ?? ""}`.trim(),
      unit: user.unitName ?? "",
      phone: user.phone ?? "",
      availability: isAvailable(user.availability)
        ? "available"
        : [
            ABSENCE_REASON_LABELS[user.availability as AbsenceReason],
            user.availabilityNote ?? "",
          ].join(" "),
    }),
    [],
  )

  const filtered = useUserSearch(users, search, toSearchableUser)

  // La fiche suit toujours la liste à jour : si le compte est supprimé pendant
  // qu'elle est ouverte, la modale se referme d'elle-même.
  const detailsUser = detailsId ? (users.find((user) => user._id === detailsId) ?? null) : null

  const counts = useMemo(() => {
    const result: Record<UserRole, number> = { admin: 0, manager: 0, employee: 0 }
    for (const user of users) {
      for (const role of user.access) {
        if (role in result) result[role] += 1
      }
    }
    return result
  }, [users])

  const resetForm = () => {
    setFormMode(null)
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
    setStep(1)
  }

  const openCreate = () => {
    setFormMode("create")
    setEditing(null)
    setDraft({ ...EMPTY_DRAFT, departmentCode: activeDepartments[0]?.id ?? "" })
    setFormError(null)
    setStep(1)
  }

  const openEdit = (id: string) => {
    const user = users.find((candidate) => candidate._id === id)
    if (!user) return

    setFormMode("edit")
    setEditing(id)
    setDraft({
      ...splitName(user.name),
      email: user.email,
      password: "",
      departmentCode: user.departmentCode ?? "",
      unitPath: user.unitPath ?? "",
      address: user.address ?? "",
      phone: user.phone ?? "",
      role: user.access[0] ?? "employee",
      photo: user.photo ?? "",
      // Un compte antérieur à la disponibilité n'a pas de statut : il est
      // considéré disponible, jamais absent.
      availability: user.availability ?? "available",
      availabilityNote: user.availabilityNote ?? "",
      availabilityUntil: user.availabilityUntil ? user.availabilityUntil.slice(0, 10) : "",
    })
    setFormError(null)
    setStep(1)
  }

  /**
   * Contrôle les champs d'une étape. Appelé UNIQUEMENT au moment de la
   * validation finale, jamais lors d'un changement d'étape : naviguer doit
   * rester possible même quand une étape est incomplète, pour pouvoir
   * revenir corriger un champ oublié sans tout ressaisir.
   */
  const validateStep = (target: number): string | null => {
    if (target === 1) {
      if (draft.firstName.trim().length < 1) return "The first name is required."
      if (draft.lastName.trim().length < 1) return "The last name is required."
      if (!draft.email.trim()) return "The email address is required."
      if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return "The email address is not valid."
    }
    if (target === 2) {
      if (!draft.departmentCode) return "Select the department this employee belongs to."
    }
    if (target === 3) {
      // En modification, un mot de passe vide conserve l'existant : rien à
      // exiger. Le message d'erreur sur la longueur n'apparaît donc qu'au
      // moment de créer le compte avec un mot de passe trop court.
      if (formMode === "create" && draft.password.length < MIN_PASSWORD_LENGTH) {
        return `The password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
      }
    }
    return null
  }

  /**
   * Navigation libre entre les étapes, dans les deux sens.
   *
   * Aucune validation ici, volontairement : en création comme en modification
   * l'utilisateur doit pouvoir inspecter et modifier n'importe quelle étape,
   * y compris revenir en arrière quand il a oublié quelque chose.
   */
  const goToStep = (target: number) => {
    const wanted = Math.min(STEPS.length, Math.max(1, target))
    setFormError(null)
    setStep(wanted)
  }

  /** Retour en arrière : toujours possible. */
  const goBack = () => {
    goToStep(step - 1)
  }

  /**
   * Enregistrement du compte.
   *
   * Volontairement déclenchée par onClick et non par la soumission du
   * formulaire. Le bouton « Next » et le bouton d'enregistrement se
   * remplacent mutuellement dans le pied de la modale : si l'enregistrement
   * passait par un submit natif, Chrome réévaluait l'activation au relâchement
   * du clic, trouvait le bouton de soumission et enregistrait le compte — la
   * modale se fermait alors qu'on cherchait juste à changer d'étape.
   */
  const saveUser = async () => {
    // L'enregistrement n'a de sens que depuis la dernière étape.
    if (step !== STEPS.length) return

    // Validation finale uniquement : on repasse par les trois étapes et on
    // saute directement à celle qui bloque, plutôt que d'afficher une erreur
    // sur une étape où le champ à corriger n'est pas visible.
    for (const target of [1, 2, 3]) {
      const message = validateStep(target)
      if (message) {
        setFormError(message)
        setStep(target)
        return
      }
    }

    const name = [draft.firstName.trim(), draft.lastName.trim()].join(" ")
    const email = draft.email.trim()
    const unitPath = draft.unitPath || null
    // Conservé avant resetForm : c'est le seul endroit d'où le mot de passe
    // pourra encore être relu, le champ du formulaire étant vidé ensuite.
    const password = draft.password
    const phone = draft.phone?.trim() ?? ""

    setSaving(true)
    setFormError(null)
    try {
      let savedId: string
      if (formMode === "edit" && editing) {
        await updateUser(editing, {
          name,
          email,
          departmentCode: draft.departmentCode,
          unitPath,
          address: draft.address.trim(),
          phone,
          photo: draft.photo,
          access: [draft.role],
          availability: draft.availability,
          // Précision et date de retour n'ont de sens que si le statut les porte.
          availabilityNote: draft.availability === "available" ? "" : draft.availabilityNote.trim(),
          availabilityUntil: draft.availability === "available" ? null : draft.availabilityUntil || null,
          // Un mot de passe laissé vide conserve celui déjà en base
          ...(password ? { password } : {}),
        })
        savedId = editing
      } else {
        const created = await createUser({
          name,
          email,
          password,
          departmentCode: draft.departmentCode,
          unitPath,
          address: draft.address.trim(),
          phone,
          photo: draft.photo,
          access: [draft.role],
          availability: draft.availability,
          availabilityNote: draft.availability === "available" ? "" : draft.availabilityNote.trim(),
          availabilityUntil: draft.availability === "available" ? null : draft.availabilityUntil || null,
        })
        savedId = created
      }

      resetForm()

      // La fenêtre n'a de sens que si un mot de passe vient d'être défini :
      // en modification sans nouveau mot de passe, il n'y a rien à montrer.
      if (password) {
        setCopied(false)
        setMailState("idle")
        setRevealed({ userId: savedId, name, email, password, phone })
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The user could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return

    setSaving(true)
    setFormError(null)
    try {
      await deleteUser(deleting)
      setDeleting(null)
      if (editing === deleting) resetForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The user could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  /**
   * Envoie le mot de passe affiché à l'employé, si l'admin le souhaite.
   *
   * Facultatif par construction : fermer la fenêtre sans cliquer ici est un
   * choix valide, l'admin reste alors seul responsable de la transmission.
   */
  const handleSendPassword = async () => {
    if (!revealed || mailState === "sending") return

    setMailState("sending")
    try {
      const result = await sendPassword(revealed.userId, revealed.password)
      setMailState(result.emailSent ? "sent" : "failed")
    } catch {
      setMailState("failed")
    }
  }

  /** Fermeture de la fenêtre : le mot de passe disparaît définitivement. */
  const closeRevealed = () => {
    setRevealed(null)
    setCopied(false)
    setMailState("idle")
  }

  const deletingUser = users.find((user) => user._id === deleting) ?? null

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Users &amp; teams
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          {isAdmin
            ? "Create and manage the employees of the ticketing platform: identity, department, unit and role."
            : "Read-only directory of the ticketing platform: identity, department, unit and availability."}
        </p>
      }
      breadcrumb={isAdmin ? "Platform administration" : "Organisation"}
      actions={
        isAdmin ? (
          <Button
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            onClick={openCreate}
            disabled={loading}
          >
            <Plus className="size-4" />
            New user
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {USER_ROLES.map((role) => (
            <div
              key={role}
              className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm"
            >
              <p className="text-[13px] font-medium text-slate-500">
                {USER_ROLE_LABELS[role]}
              </p>
              <p className="mt-2 text-2xl font-bold text-[#183b56]">{counts[role]}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#183b56]">Directory</h2>
              <p className="mt-1 text-sm text-slate-500">
                {users.length} user{users.length === 1 ? "" : "s"} registered
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-64">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(event.target.value)
                  }
                  className="h-9 pl-9"
                  placeholder="Search a user"
                  aria-label="Search a user"
                />
              </div>

              {/*
                Le micro n'apparaît que si le navigateur expose la
                reconnaissance vocale : mieux vaut un champ seul qu'un bouton
                qui échoue sans explication.
              */}
              {voice.supported && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={voice.listening ? "Stop voice search" : "Search by voice"}
                  aria-pressed={voice.listening}
                  title={voice.listening ? "Stop listening" : "Search by voice"}
                  onClick={voice.toggle}
                  className={
                    voice.listening
                      ? "size-9 shrink-0 border-[#1aa6a6] bg-[#edf8f8] text-[#147878]"
                      : "size-9 shrink-0 border-[#dce5ed] text-[#183b56]"
                  }
                >
                  {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              )}
            </div>
          </div>

          {voice.listening && (
            <p className="flex items-center gap-2 border-b border-[#edf0f5] bg-[#f2fbfb] px-5 py-2.5 text-[13px] text-[#147878]">
              <span className="size-2 animate-pulse rounded-full bg-[#1aa6a6]" />
              Listening... say a name, a role or a department.
            </p>
          )}
          {voice.error && (
            <p role="alert" className="border-b border-[#edf0f5] px-5 py-2.5 text-[13px] text-amber-700">
              {voice.error}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {error}
            </div>
          )}

          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <UserRound className="size-5" />
              </div>
              <p className="text-sm font-medium text-[#183b56]">
                {users.length === 0 ? "No user yet" : "No user matches your search"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {users.length === 0
                  ? isAdmin
                    ? "Create your first employee account to start assigning tickets."
                    : "The directory has no members yet."
                  : "Try another keyword or clear the search field."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#edf0f5]">
              {filtered.map((user) => (
                <li
                  key={user._id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                      {user.photo ? (
                        // Même rendu que le logo de la société : la photo est
                        // déjà une data URI réduite, l'optimiseur n'a rien à faire.
                        <NextImage
                          src={user.photo}
                          alt={`Photo of ${user.name}`}
                          width={40}
                          height={40}
                          unoptimized
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#183b56]">{user.name}</p>
                        {user.access.map((role) => (
                          <Badge
                            key={role}
                            variant="outline"
                            className={ROLE_BADGE_CLASS[role]}
                          >
                            {USER_ROLE_LABELS[role] ?? role}
                          </Badge>
                        ))}
                        {user.mustChangePassword && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                          >
                            Temporary password
                          </Badge>
                        )}
                        {user.isOnline && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 text-[11px] text-emerald-700"
                          >
                            Online
                          </Badge>
                        )}
                        {/* Un absent reste en ligne : l'indicateur ne dit rien de sa charge. */}
                        {!isAvailable(user.availability) && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                          >
                            <UserX className="size-3" aria-hidden="true" />
                            {ABSENCE_REASON_LABELS[user.availability as AbsenceReason]}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[13px] text-slate-500">{user.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="size-3.5" />
                          {user.departmentName ?? user.departmentCode ?? "No department"}
                        </span>
                        {user.unitName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Network className="size-3.5" />
                            {user.unitName}
                          </span>
                        ) : null}
                        {user.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" aria-hidden="true" />
                            {user.phone}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600">No phone number</span>
                        )}
                        <span>Last login {formatDate(user.lastLoginAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Icône + libellé comme sur les autres écrans d'administration. La liste est
                      plate et le conteneur se replie déjà : sur téléphone les
                      trois boutons passent à la ligne, entiers. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`View details of ${user.name}`}
                      className="gap-2 text-slate-400 hover:bg-[#f0f4f9] hover:text-[#183b56]"
                      onClick={() => setDetailsId(user._id)}
                    >
                      <Eye className="size-3.5" />
                      Details
                    </Button>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${user.name}`}
                        className="gap-2 text-slate-400 hover:bg-[#f0f4f9] hover:text-[#183b56]"
                        onClick={() => openEdit(user._id)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${user.name}`}
                        className="gap-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => {
                          setDeleting(user._id)
                          setFormError(null)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Consultation : fiche détaillée en lecture seule */}
      <Modal
        open={detailsUser !== null}
        title="User details"
        description="Read-only view of this employee account."
        onClose={() => setDetailsId(null)}
        size="lg"
        // Une fiche longue en feuille glissante sur téléphone place son bouton
        // d'action sous le pouce, souvent hors de l'écran. Centrée, elle reste
        // lisible d'un bloc.
        centerOnMobile
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDetailsId(null)}>
              Close
            </Button>
            {isAdmin && (
              <Button
                type="button"
                className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
                onClick={() => {
                  const id = detailsUser?._id
                  setDetailsId(null)
                  if (id) openEdit(id)
                }}
              >
                <Pencil className="size-4" />
                Edit user
              </Button>
            )}
          </div>
        }
      >
        {detailsUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
                {detailsUser.photo ? (
                  <NextImage
                    src={detailsUser.photo}
                    alt={`Photo of ${detailsUser.name}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-7" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-[#183b56]">{detailsUser.name}</p>
                  {detailsUser.access.map((role) => (
                    <Badge
                      key={role}
                      variant="outline"
                      className={ROLE_BADGE_CLASS[role]}
                    >
                      {USER_ROLE_LABELS[role] ?? role}
                    </Badge>
                  ))}
                  {detailsUser.mustChangePassword && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                    >
                      Temporary password
                    </Badge>
                  )}
                  {detailsUser.isOnline && (
                    <Badge variant="secondary" className="bg-emerald-50 text-[11px] text-emerald-700">
                      Online
                    </Badge>
                  )}
                  {!isAvailable(detailsUser.availability) && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                    >
                      <UserX className="size-3" aria-hidden="true" />
                      {ABSENCE_REASON_LABELS[detailsUser.availability as AbsenceReason]}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-[13px] text-slate-500">{detailsUser.email}</p>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <DetailField icon={Mail} label="Email address" value={detailsUser.email} />
              <DetailField
                icon={Building2}
                label="Department"
                value={detailsUser.departmentName ?? detailsUser.departmentCode ?? "—"}
              />
              {detailsUser.unitName && (
                <DetailField icon={Network} label="Unit" value={detailsUser.unitName} />
              )}
              <DetailField
                icon={Phone}
                label="Phone"
                value={detailsUser.phone || "No phone number"}
                muted={!detailsUser.phone}
              />
              <DetailField
                icon={UserX}
                label="Availability"
                value={
                  isAvailable(detailsUser.availability)
                    ? "Available"
                    : [ABSENCE_REASON_LABELS[detailsUser.availability as AbsenceReason]]
                        // La date n'est informative que si elle existe : l'annoncer
                        // « — » ferait croire à une information manquante.
                        .concat(detailsUser.availabilityUntil ? [formatDay(detailsUser.availabilityUntil)] : [])
                        .join(" · ")
                }
              />
              <DetailField
                icon={MapPin}
                label="Address"
                value={detailsUser.address || "No address"}
                muted={!detailsUser.address}
              />
              <DetailField
                icon={LogIn}
                label="Last login"
                value={formatDate(detailsUser.lastLoginAt)}
              />
              <DetailField
                icon={Clock}
                label="Last seen"
                value={formatDate(detailsUser.lastSeenAt)}
              />
              <DetailField
                icon={CalendarDays}
                label="Registered"
                value={formatDate(detailsUser.createdAt)}
              />
            </dl>
          </div>
        )}
      </Modal>

      {/* Création / modification */}
      <Modal
        open={formMode !== null}
        title={formMode === "edit" ? "Edit user" : "Create a new user"}
        description={
          formMode === "edit"
            ? "Update the profile of this employee. Leave the password empty to keep the current one."
            : "The employee will be able to sign in with this email and password."
        }
        onClose={resetForm}
        size="lg"
        // Un formulaire de cette hauteur est illisible en feuille glissante :
        // sur téléphone, il faudrait faire défiler jusqu'aux boutons, qui
        // seraient de toute façon sous le clavier.
        centerOnMobile
        footer={
          /* Navigation placée dans le pied de la modale et non dans la zone
             défilante : elle reste toujours visible et ne peut pas être
             confondu avec un bouton du formulaire. */
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 text-slate-500"
              onClick={() => (step === 1 ? resetForm() : goBack())}
            >
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            <p className="hidden min-w-0 flex-1 truncate text-center text-[12px] text-slate-400 sm:block">
              Step {step} of {STEPS.length}
            </p>

            {step < STEPS.length ? (
              <Button
                type="button"
                onClick={() => goToStep(step + 1)}
                className="shrink-0 gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                disabled={saving}
                onClick={() => void saveUser()}
                className="shrink-0 gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {formMode === "edit" ? "Save user" : "Create user"}
              </Button>
            )}
          </div>
        }
      >
        {/* onSubmit avale la soumission implicite (touche Entree dans un champ) :
            l'enregistrement ne passe que par saveUser, sur le bouton. */}
        <form
          id="user-form"
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => event.preventDefault()}
          className="space-y-6"
        >
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          {/* Progression.
              Sur mobile, seuls le libellé de l'étape courante et les pastilles
              sont affichés : les trois intitulés côte à côte débordaient et
              faisaient apparaître une barre de défilement horizontale. */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 sm:hidden">
              <p className="min-w-0 truncate text-[13px] font-medium text-[#183b56]">
                Step {step} of {STEPS.length} · {STEPS[step - 1].title}
              </p>
              <p className="shrink-0 text-[11px] text-slate-400">{STEPS[step - 1].hint}</p>
            </div>

            <ol className="flex items-center gap-1.5 sm:gap-2">
              {STEPS.map((entry, index) => {
const state = step === entry.id ? "current" : step > entry.id ? "done" : "todo"
              // Toutes les étapes restent cliquables : la validation n'a lieu
              // qu'à l'enregistrement, on ne bloque donc jamais la navigation.
              return (
                  <li key={entry.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => goToStep(entry.id)}
                      aria-current={state === "current" ? "step" : undefined}
                      title={`${entry.title} — ${entry.hint}`}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition-colors sm:px-3 ${
                        state === "current"
                          ? "border-[#1aa6a6] bg-[#f0fbfb]"
                          : state === "done"
                            ? "border-[#d8e9e9] bg-white hover:bg-[#f8fafc]"
                            : "border-[#e5eaf2] bg-[#fafbfd] hover:bg-[#f8fafc]"
                      } cursor-pointer`}
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          state === "done" || state === "current"
                            ? "bg-[#1aa6a6] text-white"
                            : "bg-[#eef1f6] text-slate-500"
                        }`}
                      >
                        {state === "done" ? <Check className="size-3.5" /> : entry.id}
                      </span>
                      <span className="hidden min-w-0 sm:block">
                        <span className="block truncate text-[13px] font-medium text-[#183b56]">
                          {entry.title}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">{entry.hint}</span>
                      </span>
                    </button>
                    {index < STEPS.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`hidden h-px w-3 shrink-0 sm:block ${
                          step > entry.id ? "bg-[#1aa6a6]" : "bg-[#e5eaf2]"
                        }`}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </div>

          {/* ---- Étape 1 : identité ---- */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Photo de profil : facultative, réduite dans le navigateur avant
                  d'être stockée en base64 dans le document utilisateur. */}
              <div className="space-y-2">
                <span className="text-[13px] font-medium text-[#183b56]">Photo</span>
                <div className="flex items-center gap-4">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
                    {draft.photo ? (
                      <NextImage
                        src={draft.photo}
                        alt="Photo preview"
                        width={80}
                        height={80}
                        unoptimized
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserRound className="size-8" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                    >
                      {draft.photo ? "Replace photo" : "Choose a photo"}
                    </Button>
                    {draft.photo && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => updateDraft((current) => ({ ...current, photo: "" }))}
                        disabled={photoBusy}
                      >
                        Remove
                      </Button>
                    )}
                    <span className="text-xs text-slate-500">
                      {photoBusy
                        ? "Processing the photo…"
                        : "Optional. JPEG, PNG or WebP, resized automatically."}
                    </span>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    className="hidden"
                    data-testid="user-photo-input"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="user-first-name" className="text-[13px] font-medium text-[#183b56]">
                    First name
                  </label>
                  <Input
                    id="user-first-name"
                    value={draft.firstName}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateDraft((current) => ({ ...current, firstName: event.target.value }))
                    }
                    className="h-10"
                    maxLength={60}
                    placeholder="Amine"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="user-last-name" className="text-[13px] font-medium text-[#183b56]">
                    Last name
                  </label>
                  <Input
                    id="user-last-name"
                    value={draft.lastName}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateDraft((current) => ({ ...current, lastName: event.target.value }))
                    }
                    className="h-10"
                    maxLength={60}
                    placeholder="Mahfoud"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="user-email" className="text-[13px] font-medium text-[#183b56]">
                    Email address
                  </label>
                  <Input
                    id="user-email"
                    type="email"
                    value={draft.email}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    className="h-10"
                    maxLength={100}
                    placeholder="amine@nexolia.com"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="user-phone" className="text-[13px] font-medium text-[#183b56]">
                    Phone number
                  </label>
                  <Input
                    id="user-phone"
                    type="tel"
                    autoComplete="tel"
                    value={draft.phone}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="h-10"
                    maxLength={40}
                    placeholder="+216 20 000 000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="user-address" className="text-[13px] font-medium text-[#183b56]">
                  Address
                </label>
                <Input
                  id="user-address"
                  autoComplete="street-address"
                  value={draft.address}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateDraft((current) => ({ ...current, address: event.target.value }))
                  }
                  className="h-10"
                  maxLength={200}
                  placeholder="12 rue de la Liberté, Tunis 1000"
                />
              </div>
            </div>
          )}

          {/* ---- Étape 2 : département, entité puis unité ---- */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="user-department" className="text-[13px] font-medium text-[#183b56]">
                  Department
                </label>
                <Select
                  id="user-department"
                  value={draft.departmentCode}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    updateDraft((current) => ({
                      ...current,
                      departmentCode: event.target.value,
                      // L'unité doit rester dans la branche du département :
                      // on la vide plutôt que de conserver une valeur invalide.
                      unitPath: "",
                    }))
                  }
                  className="h-10"
                >
                  <option value="">Select a department</option>
                  {activeDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
                {activeDepartments.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No active department is available. Create one first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="user-unit" className="text-[13px] font-medium text-[#183b56]">
                  Unit
                </label>
                <Select
                  id="user-unit"
                  value={draft.unitPath}
                  disabled={!draft.departmentCode || unitsLoading}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    updateDraft((current) => ({ ...current, unitPath: event.target.value }))
                  }
                  className="h-10"
                >
                  <option value="">
                    {unitsLoading
                      ? "Loading units…"
                      : draft.departmentCode
                        ? "Select a unit"
                        : "Select a department first"}
                  </option>
                  {departmentUnits.map((unit) => (
                    <option key={unit.path} value={unit.path}>
                      {`${"— ".repeat(Math.max(0, unitIndent(unit.path) - 1))}${unit.name} (${unit.path})`}
                    </option>
                  ))}
                </Select>
                {draft.departmentCode && !unitsLoading && departmentUnits.length === 0 && (
                  <p className="text-xs text-amber-600">
                    This department has no unit yet. Create one in “Organizational Structure”.
                  </p>
                )}
                {draft.departmentCode && departmentUnits.length > 0 && (
                  <p className="text-xs text-slate-400">
                    Only the units attached to the selected department are listed, including its
                    sub-units.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---- Étape 3 : rôle ---- */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="user-role" className="text-[13px] font-medium text-[#183b56]">
                  Role
                </label>
                <Select
                  id="user-role"
                  value={draft.role}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    updateDraft((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                    }))
                  }
                  className="h-10"
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {USER_ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="user-password" className="text-[13px] font-medium text-[#183b56]">
                  Password
                </label>
                <Input
                  id="user-password"
                  type="text"
                  value={draft.password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateDraft((current) => ({ ...current, password: event.target.value }))
                  }
                  className="h-10"
                  maxLength={100}
                  placeholder={
                    formMode === "edit" ? "Leave empty to keep the current password" : "At least 8 characters"
                  }
                  autoComplete="new-password"
                />
                <p className="text-xs text-slate-400">
                  {formMode === "edit"
                    ? "Changing the password here also clears the temporary password flag."
                    : "If the employee forgets it later, use the reset action to send a temporary password by email."}
                </p>
              </div>

              {/*
                L'admin peut corriger un statut que la personne a oublié de
                déclarer, ou qu'elle a déclaré et qui n'a plus cours. Le champ
                reste visible en création : un compte créé pour quelqu'un en
                congé ne doit pas recevoir de tickets dès sa première journée.
              */}
              <div className="space-y-2">
                <label htmlFor="user-availability" className="text-[13px] font-medium text-[#183b56]">
                  Availability
                </label>
                <Select
                  id="user-availability"
                  value={draft.availability}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    updateDraft((current) => ({ ...current, availability: event.target.value as AvailabilityStatus }))
                  }
                  className="h-10"
                >
                  <option value="available">Available</option>
                  {ABSENCE_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {ABSENCE_REASON_LABELS[reason]}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-400">
                  An unavailable user is excluded from ticket assignment. The person can also
                  change this status themselves.
                </p>
              </div>

              {draft.availability !== "available" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="user-availability-note" className="text-[13px] font-medium text-[#183b56]">
                      Details (optional)
                    </label>
                    <Input
                      id="user-availability-note"
                      value={draft.availabilityNote}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        updateDraft((current) => ({ ...current, availabilityNote: event.target.value }))
                      }
                      className="h-10"
                      maxLength={160}
                      placeholder="e.g. hospital leave until Monday"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="user-availability-until" className="text-[13px] font-medium text-[#183b56]">
                      Expected return (optional)
                    </label>
                    <Input
                      id="user-availability-until"
                      type="date"
                      value={draft.availabilityUntil}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        updateDraft((current) => ({ ...current, availabilityUntil: event.target.value }))
                      }
                      className="h-10"
                    />
                  </div>
                </div>
              )}

              {/* Rappel de ce qui sera enregistré */}
              <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] px-4 py-3 text-[12px] sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-slate-400">Name</dt>
                  <dd className="truncate font-medium text-[#183b56]">
                    {draft.firstName.trim() || "—"} {draft.lastName.trim()}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Department</dt>
                  <dd className="truncate font-medium text-[#183b56]">
                    {activeDepartments.find((d) => d.id === draft.departmentCode)?.name ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Unit</dt>
                  <dd className="truncate font-medium text-[#183b56]">
                    {departmentUnits.find((unit) => unit.path === draft.unitPath)?.name ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Role</dt>
                  <dd className="truncate font-medium text-[#183b56]">
                    {USER_ROLE_LABELS[draft.role]}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Availability</dt>
                  <dd className="truncate font-medium text-[#183b56]">
                    {draft.availability === "available"
                      ? "Available"
                      : ABSENCE_REASON_LABELS[draft.availability]}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </form>
      </Modal>

      {/* Confirmation de suppression */}
      <Modal
        open={deleting !== null}
        title="Delete this user"
        description={deletingUser ? `${deletingUser.name} · ${deletingUser.email}` : undefined}
        onClose={() => setDeleting(null)}
        // Confirmation courte : centrée, elle se lit d'un coup et son bouton
        // reste hors du clavier.
        centerOnMobile
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete user
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This action is permanent. The account loses its access immediately and cannot be recovered.
        </p>
      </Modal>

      {/* Mot de passe vient d'être défini : affiché une seule fois, puis perdu.
          Fermer cette fenêtre est un choix explicite de l'admin — il ne
          pourra plus le retrouver, la base n'en gardant que le hash. */}
      <Modal
        open={revealed !== null}
        title="Password saved"
        description={revealed ? `${revealed.name} · ${revealed.email}` : undefined}
        onClose={closeRevealed}
        // Fenêtre courte : centrée comme les autres dialogues de confirmation.
        centerOnMobile
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={closeRevealed}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={mailState === "sending" || mailState === "sent"}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              onClick={handleSendPassword}
            >
              {mailState === "sending" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {mailState === "sending"
                ? "Sending…"
                : mailState === "sent"
                  ? "Email sent"
                  : "Send by email"}
            </Button>
          </>
        }
      >
        {revealed && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-4 py-4">
              <p className="font-mono text-lg tracking-wider text-[#183b56]">
                {revealed.password}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-slate-500"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(revealed.password)
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            {mailState === "sent" ? (
              <p className="text-xs text-emerald-700">
                The password was emailed to {revealed.email}.
              </p>
            ) : mailState === "failed" ? (
              <p className="text-xs text-red-600">
                The email could not be sent. Share this password with the employee manually
                {revealed.phone ? ` by calling ${revealed.phone}` : ""}.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Sending it by email is optional: you can also copy the password and hand it over
                yourself.
              </p>
            )}

            <p className="text-xs text-slate-400">
              This password is displayed only once. Once you close this window it can no longer be
              retrieved.
            </p>
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}
