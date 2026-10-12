"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User as UserIcon,
  UserX,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { PhotoPicker } from "@/components/profile/photo-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS,
  authApi,
  ApiError,
  isAvailable,
  USER_ROLE_LABELS,
  type AuthUser,
  type AvailabilityStatus,
} from "@/lib/api"
import { getInitials, getToken, updateStoredUser } from "@/lib/auth"
import { buildAvatarOptions, type AvatarOption } from "@/lib/profile-avatars"

type ProfileForm = {
  name: string
  email: string
  phone: string
  address: string
  photo: string
}

type PasswordForm = {
  currentPassword: string
  password: string
  confirmPassword: string
}

/**
 * La disponibilité voyage dans son propre formulaire et son propre bouton.
 *
 * Mélanger statut et coordonnées dans un seul envoi obligerait à renvoyer tout
 * le profil à chaque changement de statut, donc à exiger le mot de passe
 * courant au passage. Les deux sujets n'ont ni la même fréquence ni le même
 * risque : une absence se déclare en quelques secondes ; un changement d'email
 * est plus rare et engage l'identité du compte.
 */
type AvailabilityForm = {
  availability: AvailabilityStatus
  availabilityNote: string
  availabilityUntil: string
}

const EMPTY_PROFILE: ProfileForm = { name: "", email: "", phone: "", address: "", photo: "" }
const EMPTY_PASSWORD: PasswordForm = { currentPassword: "", password: "", confirmPassword: "" }

export default function SettingsPage() {
  return (
    <AuthGuard>
      <Settings />
    </AuthGuard>
  )
}

function Settings() {
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE)
  const [password, setPassword] = useState<PasswordForm>(EMPTY_PASSWORD)
  const [availability, setAvailability] = useState<AvailabilityForm>({
    availability: "available",
    availabilityNote: "",
    availabilityUntil: "",
  })
  const [user, setUser] = useState<AuthUser | null>(null)
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([])

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [availabilityMessage, setAvailabilityMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null)

  // Les vignettes se dessinent sur un canvas : impossible pendant le rendu
  // serveur, et inutile de les refaire à chaque rendu.
  useEffect(() => {
    setAvatarOptions(buildAvatarOptions())
  }, [])

  // Le profil vient de l'API plutôt que du cache : après un changement
  // d'email effectué ailleurs, la page montre la valeur réelle.
  useEffect(() => {
    let active = true

    const token = getToken()
    if (!token) return

    void authApi
      .me(token)
      .then((loaded) => {
        if (!active) return
        setUser(loaded)
        setProfile({
          name: loaded.name ?? "",
          email: loaded.email ?? "",
          phone: loaded.phone ?? "",
          address: loaded.address ?? "",
          photo: loaded.photo ?? "",
        })
        setAvailability({
          availability: loaded.availability ?? "available",
          availabilityNote: loaded.availabilityNote ?? "",
          availabilityUntil: toDateInputValue(loaded.availabilityUntil),
        })
      })
      .catch(() => {
        if (active) setProfileMessage({ tone: "error", text: "Unable to load your profile." })
      })

    return () => {
      active = false
    }
  }, [])

  const roleLabel = useMemo(() => {
    const role = user?.access?.[0]
    return role ? USER_ROLE_LABELS[role] : "—"
  }, [user])

  /**
   * Nom de département et nom d'unité, avec repli sur la clé.
   *
   * Un nom peut manquer alors qu'une clé existe — unité supprimée du
   * référentiel, département renuméroté. Montrer le code dans ce cas dit
   * encore quelque chose de vrai, là où un tiret ferait croire à une absence
   * de rattachement.
   */
  const departmentLabel = useMemo(() => {
    if (!user) return null
    return user.departmentName || user.departmentCode || null
  }, [user])

  const unitLabel = useMemo(() => {
    if (!user) return null
    return user.unitName || user.unitPath || null
  }, [user])

  const hasDepartment = Boolean(departmentLabel)
  const hasUnit = Boolean(unitLabel)

  // Clés affichées en second, à côté du nom. Relues ici pour que le rendu n'ait
  // pas à supposer que le profil est chargé.
  const departmentName = user?.departmentName ?? null
  const departmentCode = user?.departmentCode ?? null
  const unitName = user?.unitName ?? null
  const unitPath = user?.unitPath ?? null

  // Borne basse du champ date : recalculée à chaque rendu suffit, le jour ne
  // change jamais au milieu d'une session de saisie.
  const today = useMemo(() => localToday(), [])

  const dirty = useMemo(() => {
    if (!user) return false
    return (
      profile.name.trim() !== (user.name ?? "").trim() ||
      profile.email.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase() ||
      profile.phone.trim() !== (user.phone ?? "").trim() ||
      profile.address.trim() !== (user.address ?? "").trim() ||
      // Une data URI se compare telle quelle : c'est la seule écriture possible.
      profile.photo !== (user.photo ?? "")
    )
  }, [profile, user])

  const passwordReady =
    password.currentPassword.length > 0 &&
    password.password.length >= 8 &&
    password.password === password.confirmPassword

  /**
   * Une date de retour ne peut accompagne qu'une absence : la propose pendant
   * un statut « available » serait un contresens que le serveur effacerait
   * silencieusement, en laissant croire à un enregistrement réussi.
   */
  const absenceReason = availability.availability === "available" ? null : availability.availability

  const availabilityDirty = useMemo(() => {
    if (!user) return false
    return (
      absenceReason !== (user.availability ?? "available") ||
      // Tant qu'on est disponible, la note est forcée vide des deux côtés :
      // la comparaison doit ignorer une note résiduelle sans effet.
      (!isAvailable(absenceReason) &&
        (availability.availabilityNote.trim() !== (user.availabilityNote ?? "").trim() ||
          availability.availabilityUntil !== toDateInputValue(user.availabilityUntil)))
    )
  }, [absenceReason, availability.availabilityNote, availability.availabilityUntil, user])

  async function saveAvailability(event: React.FormEvent) {
    event.preventDefault()

    const token = getToken()
    if (!token || !user) return

    setSavingAvailability(true)
    setAvailabilityMessage(null)

    try {
      const absent = availability.availability !== "available"

      const updated = await authApi.updateMe(token, {
        availability: availability.availability,
        availabilityNote: absent ? availability.availabilityNote.trim() : "",
        // Une absence sans date reste « date inconnue » : null, pas une date
        // inventée pour satisfaire le formulaire.
        availabilityUntil: absent && availability.availabilityUntil ? availability.availabilityUntil : null,
      })

      updateStoredUser(updated)
      setUser(updated)
      setAvailability({
        availability: updated.availability ?? "available",
        availabilityNote: updated.availabilityNote ?? "",
        availabilityUntil: toDateInputValue(updated.availabilityUntil),
      })
      setAvailabilityMessage({
        tone: "success",
        text: absent
          ? "Your unavailability has been recorded. New tickets will not be assigned to you."
          : "You are marked as available for new assignments.",
      })
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Unable to save your availability."
      setAvailabilityMessage({ tone: "error", text })
    } finally {
      setSavingAvailability(false)
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()

    const token = getToken()
    if (!token || !user) return

    setSavingProfile(true)
    setProfileMessage(null)

    try {
      const nextEmail = profile.email.trim().toLowerCase()
      const emailChanged = nextEmail !== (user.email ?? "").toLowerCase()

      const updated = await authApi.updateMe(token, {
        name: profile.name.trim(),
        email: nextEmail,
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        photo: profile.photo,
        // L'API exige le mot de passe courant pour retenir un nouvel email.
        ...(emailChanged ? { currentPassword: password.currentPassword } : {}),
      })

      // Le cache alimente le nom affiché dans le shell : sans cette écriture,
      // l'en-tête garderait l'ancienne identité.
      updateStoredUser(updated)
      setUser(updated)
      setProfile({
        name: updated.name ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
        address: updated.address ?? "",
        photo: updated.photo ?? "",
      })
      setProfileMessage({ tone: "success", text: "Your profile has been updated." })
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Unable to save your profile."
      setProfileMessage({ tone: "error", text })
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault()

    const token = getToken()
    if (!token) return

    setSavingPassword(true)
    setPasswordMessage(null)

    try {
      await authApi.updateMe(token, {
        password: password.password,
        currentPassword: password.currentPassword,
      })
      setPassword(EMPTY_PASSWORD)
      setPasswordMessage({ tone: "success", text: "Your password has been changed." })
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Unable to change your password."
      setPasswordMessage({ tone: "error", text })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <DashboardShell
      breadcrumb="Settings"
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Personal <span className="text-[#1aa6a6]">settings</span>
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Keep your contact details up to date. Your role and department are managed by your
          administrator.
        </p>
      }
      actions={
        user?.access?.map((role) => (
          <Badge
            key={role}
            variant="outline"
            className="gap-1.5 border-[#cde6e6] bg-[#f2fbfb] px-3 py-1.5 text-[#147878]"
          >
            {USER_ROLE_LABELS[role]}
          </Badge>
        ))
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section className="rounded-xl border border-[#e4eaf1] bg-white p-5 shadow-sm sm:p-6">
          <header className="mb-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#183b56]">
              <UserIcon className="size-4 text-[#1aa6a6]" />
              Identity &amp; contact
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              This is how your colleagues identify you.
            </p>
          </header>

          <form onSubmit={saveProfile} className="grid gap-5">
            <PhotoPicker
              value={profile.photo}
              initials={user ? getInitials(user.name ?? "") : "?"}
              options={avatarOptions}
              onChange={(photo) => {
                setProfile({ ...profile, photo })
                setProfileMessage(null)
              }}
              disabled={savingProfile}
            />

            <Field label="Full name" icon={<UserIcon className="size-4" />}>
              <Input
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                placeholder="Your full name"
                required
                minLength={2}
                maxLength={100}
              />
            </Field>

            <Field label="Email address" icon={<Mail className="size-4" />}>
              <Input
                type="email"
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                placeholder="you@company.com"
                required
              />
            </Field>

            <Field label="Phone" icon={<Phone className="size-4" />}>
              <Input
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                placeholder="+216 20 000 000"
                maxLength={40}
              />
            </Field>

            <Field label="Address" icon={<MapPin className="size-4" />}>
              <Input
                value={profile.address}
                onChange={(event) => setProfile({ ...profile, address: event.target.value })}
                placeholder="Street, city"
                maxLength={200}
              />
            </Field>

            {/*
              L'API réclame le mot de passe courant dès que l'email change : le
              champ n'apparaît que dans ce cas, pour ne pas faire saisir une
              donnée inutile.
            */}
            {needsEmailProof(profile, user) && (
              <Field label="Current password" icon={<KeyRound className="size-4" />}>
                <Input
                  type="password"
                  value={password.currentPassword}
                  onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                  placeholder="Confirm with your current password"
                  autoComplete="current-password"
                />
              </Field>
            )}

            <FormMessage message={profileMessage} />

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={savingProfile || !dirty}>
                {savingProfile && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-[#e4eaf1] bg-white p-5 shadow-sm sm:p-6">
          <header className="mb-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#183b56]">
              <KeyRound className="size-4 text-[#1aa6a6]" />
              Password
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              At least 8 characters. Your current password is required.
            </p>
          </header>

          <form onSubmit={savePassword} className="grid gap-4">
            <Field label="Current password" icon={<KeyRound className="size-4" />}>
              <Input
                type="password"
                value={password.currentPassword}
                onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                autoComplete="current-password"
                required
              />
            </Field>

            <Field label="New password" icon={<KeyRound className="size-4" />}>
              <Input
                type="password"
                value={password.password}
                onChange={(event) => setPassword({ ...password, password: event.target.value })}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <Field label="Confirm new password" icon={<KeyRound className="size-4" />}>
              <Input
                type="password"
                value={password.confirmPassword}
                onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })}
                autoComplete="new-password"
                required
              />
            </Field>

            {password.password.length > 0 && password.password !== password.confirmPassword && (
              <p className="text-xs text-amber-600">The two passwords do not match.</p>
            )}

            <FormMessage message={passwordMessage} />

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={savingPassword || !passwordReady}>
                {savingPassword && <Loader2 className="mr-2 size-4 animate-spin" />}
                Change password
              </Button>
            </div>
          </form>

          {/* Le rattachement est présenté comme une localisation, pas comme une donnée
              technique. « DEPT-002 » dans une liste de clés n'apprend rien au
              collaborateur ; le nom du département, puis le nom de l'unité dans
              cette même department, disent où il travaille et à qui il écrit.
              Le chemin `1.1.1` reste affiché en second : il sert à l'administrateur
              et évite qu'un utilisateur voie un code brut. */}
          <div className="mt-6 overflow-hidden rounded-lg border border-[#e4eaf1] bg-[#f7f9fc]">
            <p className="flex items-center gap-1.5 border-b border-[#e4eaf1] bg-[#eef2f7] px-4 py-2 text-[11px] font-semibold tracking-wide text-[#183b56] uppercase">
              <Building2 className="size-3.5" />
              Where you work
            </p>

            <dl className="divide-y divide-[#e4eaf1] text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <dt className="text-xs text-slate-500">Role</dt>
                <dd className="text-right font-medium text-[#183b56]">{roleLabel}</dd>
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <dt className="text-xs text-slate-500">Department</dt>
                <dd className="text-right">
                  {hasDepartment ? (
                    <>
                      <span className="font-medium text-[#183b56]">{departmentLabel}</span>
                      {departmentName && departmentCode && (
                        <span className="ml-1.5 text-[11px] text-slate-400">{departmentCode}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">Not set</span>
                  )}
                </dd>
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <dt className="text-xs text-slate-500">Unit</dt>
                <dd className="text-right">
                  {hasUnit ? (
                    <>
                      <span className="font-medium text-[#183b56]">{unitLabel}</span>
                      {unitName && unitPath && (
                        <span className="ml-1.5 text-[11px] text-slate-400">{unitPath}</span>
                      )}
                    </>
                  ) : hasDepartment ? (
                    <span className="text-slate-400">Whole department</span>
                  ) : (
                    <span className="text-slate-400">Not set</span>
                  )}
                </dd>
              </div>
            </dl>

            <p className="border-t border-[#e4eaf1] px-4 py-2.5 text-[11.5px] leading-5 text-slate-400">
              Your role, department and unit are set by your administrator. They decide which tickets
              reach you: a ticket you declare is routed to the department and unit shown here.
            </p>
          </div>
        </section>
      </div>

      {/*
        Carte pleine largeur sous les deux colonnes : le statut conditionne
        l'attribution des tickets, il doit sauter aux yeux sans avoir à faire
        défiler une colonne latérale.
      */}
      <section className="mt-6 rounded-xl border border-[#e4eaf1] bg-white p-5 shadow-sm sm:p-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#183b56]">
            {isAvailable(availability.availability) ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <UserX className="size-4 text-amber-600" />
            )}
            Availability
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Tell your team when you cannot take new tickets. While you are unavailable, no new
            ticket will be assigned to you.
          </p>
        </header>

        <form onSubmit={saveAvailability} className="grid gap-5">
          {/*
            Un groupe de boutons plutôt qu'un <select> : les motifs sont peu
            nombreux, les afficher évite d'en oublier un, et chaque libellé
            reste lisible sans avoir à ouvrir un menu.
          */}
          <div className="grid gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="text-slate-400">
                <UserIcon className="size-4" />
              </span>
              Status
            </span>
            <div className="flex flex-wrap gap-2">
              <AvailabilityOption
                selected={availability.availability === "available"}
                onSelect={() => setAvailability({ ...availability, availability: "available" })}
                disabled={savingAvailability}
                tone="available"
                label="Available"
              />
              {ABSENCE_REASONS.map((reason) => (
                <AvailabilityOption
                  key={reason}
                  selected={availability.availability === reason}
                  onSelect={() => setAvailability({ ...availability, availability: reason })}
                  disabled={savingAvailability}
                  tone={availability.availability === reason ? "absent" : "idle"}
                  label={ABSENCE_REASON_LABELS[reason]}
                />
              ))}
            </div>
          </div>

          {absenceReason && (
            <>
              <Field label="Details (optional)" icon={<UserX className="size-4" />}>
                <Input
                  value={availability.availabilityNote}
                  onChange={(event) =>
                    setAvailability({ ...availability, availabilityNote: event.target.value })
                  }
                  placeholder="e.g. recovering from surgery"
                  maxLength={160}
                />
              </Field>

              <Field label="Expected return (optional)" icon={<CalendarClock className="size-4" />}>
                <Input
                  type="date"
                  value={availability.availabilityUntil}
                  // Une date de retour passée n'aide personne : elle laisserait
                  // croire qu'un statut serait dû hier.
                  min={today}
                  onChange={(event) =>
                    setAvailability({ ...availability, availabilityUntil: event.target.value })
                  }
                />
              </Field>
              <p className="-mt-2 text-xs text-slate-400">
                Leave both fields empty if you do not know yet. Your administrator can also update
                this status on your behalf.
              </p>
            </>
          )}

          <FormMessage message={availabilityMessage} />

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={savingAvailability || !availabilityDirty}>
              {savingAvailability && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save availability
            </Button>
          </div>
        </form>
      </section>
    </DashboardShell>
  )
}

function AvailabilityOption({
  selected,
  onSelect,
  disabled,
  label,
  tone,
}: {
  selected: boolean
  onSelect: () => void
  disabled: boolean
  label: string
  tone: "available" | "absent" | "idle"
}) {
  const tones = {
    available: "border-emerald-200 bg-emerald-50 text-emerald-800",
    absent: "border-amber-300 bg-amber-50 text-amber-800",
    idle: "border-[#e4eaf1] bg-white text-slate-600 hover:border-[#cde6e6] hover:bg-[#f7fbfb]",
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        selected ? tones[tone] : tones.idle
      }`}
    >
      {label}
    </button>
  )
}

function needsEmailProof(profile: ProfileForm, user: AuthUser | null): boolean {
  if (!user) return false
  return profile.email.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase()
}

/**
 * Date du jour au format attendu par <input type="date">, calculée en heure
 * locale. `toISOString` passerait en UTC et pourrait reculer d'un jour le long
 * d'un décalage horaire, interdisant à tort la date du jour.
 */
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Extrait la partie date d'une valeur renvoyée par l'API.
 *
 * Le serveur stocke une date de retour à minuit UTC. La reformater en heure
 * locale pourrait décaler l'affichage d'un jour : on garde donc le segment
 * textual, qui reflète exactement la date saisie.
 */
function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : ""
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      {children}
    </label>
  )
}

function FormMessage({
  message,
}: {
  message: { tone: "success" | "error"; text: string } | null
}) {
  if (!message) return null

  const isError = message.tone === "error"
  return (
    <p
      className={`flex items-start gap-2 text-xs ${
        isError ? "text-red-600" : "text-emerald-700"
      }`}
      role="status"
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      )}
      {message.text}
    </p>
  )
}