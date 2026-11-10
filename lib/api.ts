const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!RAW_API_BASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is missing. Check the Frontend environment configuration."
  );
}

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  token?: string | null
}

const GENERIC_ERROR = "Something went wrong. Please try again."

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.message === "string") {
      return payload.message
    }
  } catch {
    return null
  }
  return null
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, token, headers, ...rest } = options

  const finalHeaders = new Headers(headers)
  if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json")
  }
  if (token) {
    finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError("Unable to reach the server. Please check your connection.", 0)
  }

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new ApiError(message ?? `Request failed (${response.status}).`, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/**
 * Hiérarchie de rôles du ticketing.
 * L'ancienne solution exposait admin / store / erp / academy : ces valeurs sont retirées.
 */
export const USER_ROLES = ["admin", "manager", "employee"] as const

export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Manager (Gérant)",
  manager: "Supervisor (Responsable)",
  employee: "Employee",
}

/**
 * Motifs d'indisponibilité.
 *
 * La liste est fermée et doit correspondre à `ABSENCE_REASONS` côté serveur :
 * une valeur inventée ici serait refusée à l'enregistrement. Un motif qui
 * n'entre dans aucune case se déclare sous « other », avec une précision libre.
 */
export const ABSENCE_REASONS = [
  "sick",
  "vacation",
  "business_trip",
  "training",
  "other",
] as const

export type AbsenceReason = (typeof ABSENCE_REASONS)[number]

/** `available` signifie « pas d'absence » : la valeur par défaut d'un compte. */
export type AvailabilityStatus = "available" | AbsenceReason

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  sick: "Sick leave",
  vacation: "Vacation",
  business_trip: "Business trip",
  training: "Training",
  other: "Other",
}

export function isAvailable(status?: AvailabilityStatus): boolean {
  return !status || status === "available"
}

/** Résumé lisible d'une absence, pour un badge. */
export function absenceLabel(status?: AvailabilityStatus, note?: string): string {
  if (isAvailable(status)) return "Available"
  const base = ABSENCE_REASON_LABELS[status as AbsenceReason]
  return note ? `${base} · ${note}` : base
}

export interface AuthUser {
  _id: string
  name: string
  email: string
  access: UserRole[]
  entity?: string
  /** Clé du département, telle que stockée sur le compte. */
  departmentCode?: string | null
  /**
   * Nom du département, résolu par le serveur.
   *
   * Distinct de `departmentCode` : « DEPT-002 » ne dit rien à la personne qui
   * le lit, alors que « Internal Logistics » lui dit où elle travaille. Le code
   * reste disponible pour les écrans techniques.
   */
  departmentName?: string | null
  /** Chemin de l'unité (`1.1.1`), ou `null`. */
  unitPath?: string | null
  /** Nom de l'unité, résolu par le serveur. */
  unitName?: string | null
  phone?: string
  address?: string
  mustChangePassword?: boolean
  photo?: string
  /** Disponibilité déclarée par la personne ; `available` par défaut. */
  availability?: AvailabilityStatus
  /** Précision libre : « jusqu'au 14 », « suite à une opération »… */
  availabilityNote?: string
  /** Date de retour prévue, ou `null` si elle n'est pas connue. */
  availabilityUntil?: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  message: string
  isEmailPasswordRecaptchaVerified?: boolean
}

export interface VerifyCodePayload {
  email: string
  code: string
}

export interface SessionResponse extends AuthUser {
  message: string
  token: string
}

/**
 * Champs que l'intéressé peut corriger sur lui-même.
 *
 * Ni `access`, ni `departmentCode`, ni `unitPath` n'y figurent : ces valeurs
 * décident de ce à quoi la personne a accès et restent gérées par
 * l'administrateur. Le serveur les refuse de toute façon.
 */
export interface SelfUpdateInput {
  name?: string
  email?: string
  phone?: string
  address?: string
  photo?: string
  password?: string
  currentPassword?: string
  /** Déclaration de disponibilité ; absente, la disponibilité est inchangée. */
  availability?: AvailabilityStatus
  availabilityNote?: string
  availabilityUntil?: string | null
}

export const authApi = {
  login(credentials: LoginCredentials) {
    return apiFetch<LoginResponse>("/user/api/login", {
      method: "POST",
      body: credentials,
    })
  },

  verifyCode(payload: VerifyCodePayload) {
    return apiFetch<SessionResponse>("/user/api/verify-code", {
      method: "POST",
      body: payload,
    })
  },

  me(token: string) {
    return apiFetch<AuthUser>("/user/api/me", { token })
  },

  /**
   * Met à jour le profil de l'utilisateur connecté.
   *
   * Le serveur exige `currentPassword` dès que l'email ou le mot de passe
   * change : ces deux opérations transfèrent l'accès au compte.
   */
  updateMe(token: string, input: SelfUpdateInput) {
    return apiFetch<AuthUser>("/user/api/me", {
      method: "PUT",
      token,
      body: input,
    })
  },

  logout(token: string) {
    return apiFetch<{ message: string }>("/user/api/logout", {
      method: "POST",
      token,
    })
  },
}

export { GENERIC_ERROR }

export interface CompanyResponse {
  slug: string
  name: string
  logo: string
  domain: string
  description: string
  services: string[]
}

export interface CompanyProfileInput {
  name?: string
  logo?: string
  domain?: string
  description?: string
  services?: string[]
}

export interface DepartmentResponse {
  id: string
  name: string
  services: string[]
  description: string
  active: boolean
  createdAt?: string
  updatedAt?: string
  /**
   * Unités racines de l'organigramme portées par ce département. Une région
   * peut être découpée en autant de nœuds de premier niveau que nécessaire,
   * donc la liste est vide plutôt que `null` quand il n'y en a aucun.
   */
  rootUnits: { path: string; name: string }[]
}

export interface DepartmentInput {
  name: string
  /**
   * Optionnel : le backend applique `[]` à la création et préserve la valeur
   * existante quand la clé est absente d'une mise à jour.
   */
  services?: string[]
  description?: string
  active?: boolean
}

export const companyApi = {
  /** Public : utilisé par la page de connexion avant toute authentification. */
  getCompany() {
    return apiFetch<CompanyResponse>("/company/api/company")
  },

  updateCompany(token: string, input: CompanyProfileInput) {
    return apiFetch<CompanyResponse>("/company/api/company", {
      method: "PUT",
      token,
      body: input,
    })
  },

  listDepartments(token: string) {
    return apiFetch<DepartmentResponse[]>("/company/api/departments", { token })
  },

  getDepartment(token: string, code: string) {
    return apiFetch<DepartmentResponse>(`/company/api/departments/${encodeURIComponent(code)}`, {
      token,
    })
  },

  createDepartment(token: string, input: DepartmentInput) {
    return apiFetch<DepartmentResponse>("/company/api/departments", {
      method: "POST",
      token,
      body: input,
    })
  },

  updateDepartment(token: string, code: string, input: Partial<DepartmentInput>) {
    return apiFetch<DepartmentResponse>(
      `/company/api/departments/${encodeURIComponent(code)}`,
      { method: "PUT", token, body: input },
    )
  },

  deleteDepartment(token: string, code: string) {
    return apiFetch<{ message: string; id: string }>(
      `/company/api/departments/${encodeURIComponent(code)}`,
      { method: "DELETE", token },
    )
  },
}

export interface UnitResponse {
  /** Chemin hiérarchique, ex : "1.1.1" */
  path: string
  parentPath: string | null
  /** Département dont dépend la branche ; hérité de la racine pour les sous-unités */
  departmentCode: string | null
  name: string
  description: string
  active: boolean
  depth: number
  hasChildren: boolean
  createdAt?: string
  updatedAt?: string
}

export interface UnitNode extends UnitResponse {
  children: UnitNode[]
}

export interface UnitTreeResponse {
  units: UnitResponse[]
  tree: UnitNode[]
}

export interface UnitInput {
  name: string
  parentPath?: string | null
  /** Uniquement pour une unité racine, qui doit appartenir à un département */
  departmentCode?: string | null
  description?: string
  active?: boolean
}

export const unitApi = {
  list(token: string) {
    return apiFetch<UnitTreeResponse>("/company/api/units", { token })
  },

  get(token: string, path: string) {
    return apiFetch<UnitResponse>(`/company/api/units/${encodeURIComponent(path)}`, { token })
  },

  create(token: string, input: UnitInput) {
    return apiFetch<UnitResponse>("/company/api/units", {
      method: "POST",
      token,
      body: input,
    })
  },

  update(token: string, path: string, input: Partial<Omit<UnitInput, "parentPath">>) {
    return apiFetch<UnitResponse>(`/company/api/units/${encodeURIComponent(path)}`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  remove(token: string, path: string) {
    return apiFetch<{ message: string; path: string; deletedCount: number }>(
      `/company/api/units/${encodeURIComponent(path)}`,
      { method: "DELETE", token },
    )
  },
}

export interface ExpertiseExpert {
  user: string
  email: string
  /** Nom résolu côté backend, pour l'affichage */
  name: string | null
  /** Photo de profil en data URI, vide si le compte n'en a pas */
  photo: string
  /** 0 = expert principal, au-delà c'est un suppléant */
  rank: number
}

export interface ExpertiseEntryResponse {
  id: string
  code: string
  /** Libellé du problème, tel qu'il est nommé dans l'entreprise */
  problem: string
  description: string
  unitPath: string
  /** Déduit par le backend de la branche de l'unité, jamais saisi */
  departmentCode: string | null
  active: boolean
  createdAt?: string
  updatedAt?: string
  /** Du principal au dernier suppléant */
  experts: ExpertiseExpert[]
}

export interface ExpertiseInput {
  problem: string
  description?: string
  /**
   * Choisi par l'admin. Un superviseur ne le fournit pas : le backend le déduit
   * de l'unité de rattachement de son compte.
   */
  unitPath?: string
  /**
   * Choisis par l'admin (premier = principal). Un superviseur ne les fournit
   * pas : il est automatiquement le seul expert de son problème.
   */
  experts?: { user: string; email: string }[]
  active?: boolean
}

export interface ExpertiseResolveResult extends ExpertiseEntryResponse {
  score: number
  /** Pourquoi l'entrée a été proposée : aids the admin to understand the suggestion */
  reasons: string[]
}

export const expertiseApi = {
  list(
    token: string,
    filters: { unitPath?: string; departmentCode?: string; q?: string } = {},
  ) {
    const params = new URLSearchParams()
    if (filters.unitPath) params.set("unitPath", filters.unitPath)
    if (filters.departmentCode) params.set("departmentCode", filters.departmentCode)
    if (filters.q) params.set("q", filters.q)
    const query = params.toString()
    return apiFetch<ExpertiseEntryResponse[]>(
      `/company/api/expertise${query ? `?${query}` : ""}`,
      { token },
    )
  },

  create(token: string, input: ExpertiseInput) {
    return apiFetch<ExpertiseEntryResponse>("/company/api/expertise", {
      method: "POST",
      token,
      body: input,
    })
  },

  update(token: string, code: string, input: Partial<ExpertiseInput>) {
    return apiFetch<ExpertiseEntryResponse>(
      `/company/api/expertise/${encodeURIComponent(code)}`,
      { method: "PUT", token, body: input },
    )
  },

  remove(token: string, code: string) {
    return apiFetch<{ message: string; id: string }>(
      `/company/api/expertise/${encodeURIComponent(code)}`,
      { method: "DELETE", token },
    )
  },

  /**
   * Résolution d'expert : ouverte à tout utilisateur authentifié, c'est elle
   * qui évite de parcourir l'annuaire pour savoir qui intervient.
   */
  resolve(
    token: string,
    criteria: { unitPath?: string; departmentCode?: string; q?: string } = {},
  ) {
    const params = new URLSearchParams()
    if (criteria.unitPath) params.set("unitPath", criteria.unitPath)
    if (criteria.departmentCode) params.set("departmentCode", criteria.departmentCode)
    if (criteria.q) params.set("q", criteria.q)
    const query = params.toString()
    return apiFetch<{ count: number; results: ExpertiseResolveResult[] }>(
      `/company/api/expertise/resolve${query ? `?${query}` : ""}`,
      { token },
    )
  },
}

export interface UserResponse {
  _id: string
  name: string
  email: string
  access: UserRole[]
  entity: string
  departmentCode: string | null
  phone?: string
  address?: string
  /** Chemin de l'unité de rattachement dans l'organigramme, ex « 1.1.1 » */
  unitPath?: string | null
  /** Nom de département résolu côté backend, pour l'affichage */
  departmentName: string | null
  /** Nom d'unité résolu côté backend, pour l'affichage */
  unitName?: string | null
  mustChangePassword: boolean
  /** Photo de profil en data URI base64, ou chaîne vide si l'employé n'en a pas. */
  photo?: string
  lastLoginAt?: string | null
  lastSeenAt?: string | null
  isOnline: boolean
  /** Disponibilité déclarée, exposée par la liste des utilisateurs. */
  availability?: AvailabilityStatus
  availabilityNote?: string
  availabilityUntil?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface UserCreateInput {
  name: string
  email: string
  password: string
  departmentCode: string
  /** Entité juridique : informative, n'est plus saisie dans le formulaire. */
  entity?: string
  phone?: string
  address?: string
  unitPath?: string | null
  /** Photo de profil en data URI base64 ; chaîne vide pour la retirer. */
  photo?: string
  access: UserRole[]
  /**
   * Disponibilité à la création. Un compte naît disponible : c'est la seule
   * valeur cohérente tant que la personne ne s'est pas déclarée absente.
   */
  availability?: AvailabilityStatus
  availabilityNote?: string
  availabilityUntil?: string | null
}

export type UserUpdateInput = Partial<UserCreateInput>

/** Ligne renvoyée par `/user/api/availability`, volontairement minimale. */
export interface AvailabilityEntry {
  _id: string
  name: string
  departmentCode: string | null
  unitPath: string | null
  availability: AvailabilityStatus
  availabilityNote: string
  availabilityUntil: string | null
}

/**
 * Résultat de l'envoi par email du mot de passe saisi par l'admin.
 *
 * Le mot de passe ne transite que dans la fenêtre de confirmation : il n'est
 * stocké qu'en bcrypt et ne pourra plus jamais être relu, ni par l'API ni par
 * l'admin.
 */
export interface SendPasswordResponse {
  message: string
  /** false si l'envoi a échoué : l'admin doitdicter le mot de passe */
  emailSent: boolean
  /** Numéro à appeler si l'email n'a pas abouti */
  phone: string
}

export const userApi = {
  list(token: string) {
    return apiFetch<UserResponse[]>("/user/api/users", { token })
  },

  create(token: string, input: UserCreateInput) {
    return apiFetch<{ message: string; _id: string }>("/user/api/users", {
      method: "POST",
      token,
      body: input,
    })
  },

  update(token: string, id: string, input: UserUpdateInput) {
    return apiFetch<{ message: string; user: Omit<UserResponse, "isOnline" | "departmentName"> }>(
      `/user/api/users/${encodeURIComponent(id)}`,
      { method: "PUT", token, body: input },
    )
  },

  remove(token: string, id: string) {
    return apiFetch<{ message: string }>(`/user/api/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    })
  },

  /** Envoie par email à l'employé le mot de passe que l'admin a saisi */
  sendPassword(token: string, id: string, password: string) {
    return apiFetch<SendPasswordResponse>(
      `/user/api/users/${encodeURIComponent(id)}/send-password`,
      { method: "POST", token, body: { password } },
    )
  },

  /**
   * Disponibilités de l'équipe, pour l'écran de dispatch.
   *
   * Volontairement distincte de `list` : celle-ci est réservée à l'admin et
   * ramène tout le compte. Ici il ne faut que le nom, le rattachement et le
   * statut d'absence. Réservée aux rôles qui affectent des tickets.
   */
  availability(token: string) {
    return apiFetch<AvailabilityEntry[]>("/user/api/availability", { token })
  },
}

/*--------------------------------------------------
* Ticketing métier
*
* La liste doit correspondre à `TICKET_STATUSES` côté serveur : un statut
* affiché ici qui n'existe pas là-bas produirait un badge pour un état
* impossible à atteindre.
----------------------------------------------------*/

/**
 * New → Being Reviewed → Under Analysis → In Progress → Resolved → Closed.
 *
 * `under_analysis` est une étape à part entière, et non une décoration de
 * `in_progress` : c'est l'attente d'une décision du superviseur. Le fusionner
 * ferait perdre la distinction de deux situations opposées — « personne n'a
 * encore dit oui » et « quelqu'un travaille là-dessus maintenant » — et le
 * délai se perdrait.
 */
export const TICKET_STATUSES = [
  "new",
  "being_reviewed",
  "under_analysis",
  "in_progress",
  "resolved",
  "closed",
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "New",
  being_reviewed: "Being Reviewed",
  under_analysis: "Under Analysis",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
}

/**
 * Classes du badge de statut.
 *
 * Distinctes et uniques par statut : deux étapes doivent se reconnaître d'un
 * coup d'œil, faute de quoi la file se réduit à une liste grise où l'on ne sait
 * plus ce qui attend une action.
 *
* `under_analysis` est volontairement proche de `being_reviewed` — les deux
 * décrivent une attente, à des mains différentes — mais il tire vers le violet,
 * couleur de l'étape suivante, pour qu'on voie où le dossier va.
 */
export const TICKET_STATUS_CLASSES: Record<TicketStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  being_reviewed: "border-amber-200 bg-amber-50 text-amber-700",
  under_analysis: "border-violet-200 bg-violet-50/70 text-violet-700",
  in_progress: "border-violet-200 bg-violet-50 text-violet-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value)
}

/**
 * Niveaux d'urgence d'un ticket, choisis par le déclarant au dépôt.
 *
 * La liste et l'ordre doivent correspondre à `TICKET_PRIORITIES` côté serveur :
 * un niveau affiché ici qui n'existe pas là-bas produirait un badge pour une
 * valeur impossible à enregistrer.
 */
export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const

export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

/** Couleur du badge : la gravité se lit d'un coup d'œil dans une file. */
export const TICKET_PRIORITY_CLASSES: Record<TicketPriority, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value)
}

export interface TicketHistoryEntry {
  at: string
  actor: string | null
  actorName: string
  /**
   * `accepted` : le superviseur s'engage à traiter le dossier. Distinct de
   * `assigned`, qui est le choix de l'administrateur, et de `returned`, qui
   * renvoie le dossier au dispatch.
   * `returned` : le superviseur a rendu le dossier au centre de répartition.
   * Distinct de `reassigned`, qui le confie à quelqu'un d'autre, et de
   * `closed`, qui l'arrête.
   * `edited` : le demandeur a corrigé sa propre demande avant qu'elle ne soit
   * prise en charge. Distingué de `created` parce qu'il Signale une version
   * antérieure du texte.
   * `rated` : le demandeur a jugé le service rendu. Se produit après `resolved`,
   * et se répète s'il corrige son avis.
   * `material_released` : le superviseur a libéré des biens du stock au
   * demandeur au moment de l'acceptation. Les biens sont dans
   * `releasedMaterial` ; l'événement ne fait que raconter le geste.
   * `escalated` : le balayage SLA a remonté la priorité d'un dossier resté
   * ouvert au-delà de son seuil d'alerte. Écrit sans acteur humain.
   */
  kind:
    | "created"
    | "review"
    | "assigned"
    | "reassigned"
    | "accepted"
    | "returned"
    | "resolved"
    | "edited"
    | "closed"
    | "rated"
    | "material_released"
    | "escalated"
  detail: string
}

/**
 * Position SLA d'un ticket en phase de réponse, calculée par le serveur.
 *
 * L'horloge court depuis le dépôt ; l'écran n'affiche que des dates
 * absolues — il calcule lui-même le compte à rebours à partir d'elles.
 * `null` partout où la politique est désactivée ou le ticket est passé en
 * révision (phase mesurée terminée).
 */
export type SlaState = "on_time" | "warning" | "breached"

export interface TicketSla {
  /** Priorité prise en compte pour le calcul (celle du ticket au moment lu). */
  priority: TicketPriority
  /** Seuil d'alerte : passé cette date, le ticket entre en phase critique. */
  warningAt: string
  /** Délai de réponse promis au déclarant : réponse attendue avant cette date. */
  deadlineAt: string
  state: SlaState
}

export const TICKET_SLA_LABELS: Record<SlaState, string> = {
  on_time: "On time",
  warning: "At alert",
  breached: "Breached",
}

export const TICKET_SLA_CLASSES: Record<SlaState, string> = {
  on_time: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  breached: "border-red-200 bg-red-50 text-red-700",
}

/**
 * Verdict d'une réponse au déclarant, figé au moment où elle a été donnée.
 *
 * `overdue` — et non `breached` — parce qu'un dépassement n'a plus la même
 * lecture une fois le ticket répondu : il ne s'agit plus d'une attente en cours,
 * mais d'une réponse arrivée après le délai. `null` = politique désactivée alors.
 */
export type ResponseSlaState = "on_time" | "warning" | "overdue"

export const RESPONSE_SLA_LABELS: Record<ResponseSlaState, string> = {
  on_time: "Replied on time",
  warning: "Replied at alert",
  overdue: "Replied after SLA",
}

export const RESPONSE_SLA_CLASSES: Record<ResponseSlaState, string> = {
  on_time: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
}

export interface TicketResponse {
  _id: string
  /** Référence courte citée à l'oral : TKT-0001. */
  reference: string
  title: string
  description: string
  status: TicketStatus
  /** Niveau d'urgence choisi par le déclarant au dépôt. */
  priority: TicketPriority
  createdBy: string
  createdByName: string | null
  departmentCode: string | null
  unitPath: string | null
  /** Noms résolus par le serveur : un ticket n'enregistre que des clés. */
  departmentName: string | null
  unitName: string | null
  assignedTo: string | null
  assignedToName: string | null
  assignedAt: string | null
  reviewedBy: string | null
  /** Nom du dispatcheur qui a pris le dossier en revue. */
  reviewedByName: string | null
  reviewedAt: string | null
  /**
   * Réponse au déclarant : l'instant où le centre a pris le ticket en revue, et
   * l'échéance de réponse qui s'appliquait alors (instantané, pas recalcul).
   */
  respondedAt: string | null
  responseDeadlineAt: string | null
  /**
   * Retard de la réponse, en minutes : `> 0` en retard, `≤ 0` à l'heure ou en
   * avance, `null` tant que le ticket n'a pas reçu de réponse (ou échéance
   * inconnue, politique désactivée).
   */
  responseLateMinutes: number | null
  /**
   * Trace figée de la réponse : position SLA à l'instant où elle a été donnée —
   * `on_time` (dans le délai), `warning` (la phase d'alerte était déjà atteinte),
   * `overdue` (le délai était dépassé avant la réponse). `null` si la politique
   * était désactivée à ce moment-là.
   */
  responseSlaState: ResponseSlaState | null
  /**
   * Délai de réaction, en minutes, depuis le dépôt du ticket par le déclarant
   * jusqu'à la réponse. `null` tant que le ticket n'a pas été répondu.
   */
  responseDelayMinutes: number | null
  resolutionNote: string
  resolvedAt: string | null
  /** Qui a terminé le dossier — pas qui le détient : voir `assignedTo`. */
  resolvedBy: string | null
  resolvedByName: string | null
  /** Avis du demandeur : un nombre d'étoiles, ou `null` s'il n'a pas encore noté. */
  rating: number | null
  ratingComment: string
  ratedAt: string | null
  closeReason: string
  closedAt: string | null
  /**
   * Dernier motif de restitution par un superviseur.
   *
   * Separé de l'historique parce que c'est l'information que le centre de
   * répartition doit avoir sous les yeux avant de redistribuer : distribuer à
   * nouveau sans savoir que le dossier a été rendu reproduirait l'échec.
   */
  returnReason: string
  returnedAt: string | null
  returnedByName: string
  createdAt: string
  updatedAt: string
  /**
   * Position SLA du ticket, calculée par le serveur au moment de la lecture.
   *
   * `null` hors politique active ou hors dossier ouvert : aucun badge n'est
   * alors affiché, et la fiche n'annonce pas de délai qui n'existe pas.
   */
  sla: TicketSla | null
  history: TicketHistoryEntry[]
  /**
   * Biens de l'entreprise libérés au demandeur par ce ticket.
   *
   * Rempli quand le superviseur accepte le dossier en libérant du matériel :
   * chaque élément est un bien du module stockMateriel passé à « assigned »,
   * confié au déclarant. La liste reste figée après la libération.
   */
  releasedMaterial: TicketReleasedMaterial[]
}

/**
 * Ligne de produit libérée vue depuis la fiche d'un ticket. Aperçu — code,
 * nom, catégorie et unité copiés du produit au moment de la libération, plus
 * la quantité donnée et, pour un article à rendre, ce qui est déjà revenu.
 */
export interface TicketReleasedMaterial {
  _id: string
  material: string | null
  code: string
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  quantity: number
  reusable: boolean
  returned: number
  returnedAt: string | null
  returnedByName: string
  releasedAt: string | null
  releasedByName: string
  releasedByPhoto: string
}

/** Une ligne du formulaire d'acceptation : produit, quantité, usage. */
export interface ReleaseMaterialLineInput {
  materialId: string
  quantity: number
  reusable?: boolean
}

/** Les deux files de l'écran « My Tickets ». */
export interface MyTicketsResponse {
  submitted: TicketResponse[]
  received: TicketResponse[]
}

export interface TicketQueueResponse {
  tickets: TicketResponse[]
  /** Décompte par statut, renvoyé avec la liste pour éviter un décalage. */
  byStatus: Record<TicketStatus, number>
}

/**
 * Filtre sur la réponse au déclarant.
 *
 * `awaiting` / `overdue` : tickets encore en phase de réponse, respectivement
 * dans les temps et déjà en dépassement. `late` / `ontime` : réponses déjà
 * données, jugées sur l'échéance figée au moment de la réponse.
 */
export type ResponseFilter = "awaiting" | "overdue" | "late" | "ontime"

export interface TicketQueueFilters {
  status?: TicketStatus
  departmentCode?: string
  unitPath?: string
  q?: string
  response?: ResponseFilter
}

/**
 * Point d'expertise d'un superviseur, repris du référentiel « Experts &
 * problems ».
 *
 * `role` distingue l'expert principal d'un suppléant : même liste de problèmes,
 * poids différent. C'est ce qui permet de lire « c'est son domaine » plutôt que
 * « il est dans la boucle ».
 */
export interface SupervisorExpertisePoint {
  code: string
  problem: string
  unitPath: string
  unitName: string | null
  role: "primary" | "substitute"
}

/**
 * Superviseur distribuable, pour la liste de l'écran de répartition.
 *
 * `available` est calculé par le serveur : l'interface ne refait pas la règle,
 * elle ne peut donc pas en diverger. Un superviseur absent est renvoyé quand
 * même, avec son motif — le masquer laisserait l'admin sans explication.
 *
 * Les noms de département et d'unité sont résolus côté serveur, comme pour les
 * tickets. `code` seul ne veut rien dire pour quelqu'un qui distribue : « DSI »
 * est un nom, « 30 » ne l'est pas.
 */
export interface SupervisorOption {
  _id: string
  name: string
  /** Data URI de la photo de profil, ou chaîne vide. */
  photo: string
  departmentCode: string | null
  departmentName: string | null
  unitPath: string | null
  unitName: string | null
  availability: AvailabilityStatus
  availabilityNote: string
  availabilityUntil: string | null
  available: boolean
  expertise: SupervisorExpertisePoint[]
  primaryExpertiseCount: number
}

/**
 * Service du catalogue : une offre prête à l'emploi, préparée par l'admin.
 *
 * Un employé qui choisit ce service déclenche un ticket déjà affecté au
 * superviseur dédié — pas de saisie de titre ni de priorité, la décision a été
 * prise à la configuration, pas à la demande.
 */
export interface ServiceResponse {
  _id: string
  /** Code métier du service, SRV-0001. */
  code: string
  name: string
  description: string
  priority: TicketPriority
  /** Périmètre cible du ticket émis à partir du service. */
  departmentCode: string | null
  unitPath: string | null
  departmentName: string | null
  unitName: string | null
  /** Superviseur dédié : toute demande sur ce service lui est affectée. */
  supervisorId: string | null
  supervisorName: string
  /** Photo du superviseur (data URI base64), pour le reconnaître d'un coup d'œil. */
  supervisorPhoto: string
  /** « Prêt » pour l'équipe, ou masqué du choix rapide. */
  active: boolean
  /** Administrateur qui a configuré ce service. */
  configuredBy: string | null
  configuredByName: string
  createdAt: string
  updatedAt: string
}

export interface CreateServiceInput {
  name: string
  description: string
  departmentCode?: string
  unitPath?: string
  priority: TicketPriority
  supervisorId: string
  active?: boolean
}

export type UpdateServiceInput = Partial<CreateServiceInput>

export const serviceApi = {
  /** Le catalogue est lisible par toute l'équipe : c'est elle qui l'exploite. */
  list(token: string) {
    return apiFetch<ServiceResponse[]>("/service/api/services", { token })
  },

  /** Réservé à l'admin : c'est lui qui prépare les services. */
  create(token: string, input: CreateServiceInput) {
    return apiFetch<ServiceResponse>("/service/api/services", { method: "POST", token, body: input })
  },

  update(token: string, id: string, input: UpdateServiceInput) {
    return apiFetch<ServiceResponse>(`/service/api/services/${encodeURIComponent(id)}`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  remove(token: string, id: string) {
    return apiFetch<{ message: string }>(`/service/api/services/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    })
  },
}

/** Catégorie d'un bien physique : ordre d'affichage du filtre. */
export type MaterialCategory =
  | "computer"
  | "monitor"
  | "keyboard"
  | "mouse"
  | "printer"
  | "phone"
  | "consumable"
  | "desk"
  | "chair"
  | "network"
  | "other"

/** Unité de comptage du stock : « 4 cartons de feuilles », « 6 chaises ». */
export type MaterialUnit = "piece" | "box" | "pallet" | "pack" | "set" | "other"

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "computer",
  "monitor",
  "keyboard",
  "mouse",
  "printer",
  "phone",
  "consumable",
  "desk",
  "chair",
  "network",
  "other",
]

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  computer: "Computer",
  monitor: "Monitor",
  keyboard: "Keyboard",
  mouse: "Mouse",
  printer: "Printer",
  phone: "Phone",
  consumable: "Consumable",
  desk: "Desk",
  chair: "Chair",
  network: "Network",
  other: "Other",
}

export const MATERIAL_UNITS: MaterialUnit[] = ["piece", "box", "pallet", "pack", "set", "other"]

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  piece: "Piece",
  box: "Box / carton",
  pallet: "Pallet",
  pack: "Pack",
  set: "Set / kit",
  other: "Other",
}

/** Reprend la limite du serveur, en caractères de data URI, pour la photo produit. */
export const MATERIAL_IMAGE_MAX_LENGTH = 400_000

/** Nombre + unité, accordé au pluriel : « 3 boxes », « 1 piece ». */
export function formatStockQuantity(quantity: number, unit: MaterialUnit): string {
  const label = MATERIAL_UNIT_LABELS[unit] ?? MATERIAL_UNIT_LABELS.piece
  return `${quantity} ${label.toLowerCase()}${quantity === 1 ? "" : "s"}`
}

/** Bien de l'entreprise, vu depuis le module stockMateriel (Assets & CMDB). */
export interface MaterialItemResponse {
  _id: string
  code: string
  name: string
  category: MaterialCategory
  brand: string
  model: string
  /** Unité de comptage du stock. */
  unit: MaterialUnit
  /** Unités disponibles : décroît à la libération, remonte au retour. */
  stockQuantity: number
  /** Prêté et à rendre (`true`), ou consommé en une fois (`false`). */
  reusable: boolean
  description: string
  /** Photo du produit en data URI base64, vide si aucune. */
  image: string
  createdBy: string | null
  createdByPhoto: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface CreateMaterialInput {
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  stockQuantity: number
  reusable?: boolean
  description?: string
  brand?: string
  model?: string
  image?: string
}

export type UpdateMaterialInput = Partial<CreateMaterialInput>

/** Ligne de sortie réutilisable encore dehors, à rendre au stock. */
export interface MaterialReturnLine {
  lineId: string
  ticketId: string
  ticketReference: string
  employeeName: string
  /** Photo de profil de l'employé (data URI), vide s'il en a pas. */
  employeePhoto: string
  materialId: string
  code: string
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  quantity: number
  returned: number
  remaining: number
  releasedAt: string | null
  releasedByName: string
  releasedByPhoto: string
}

export const materialApi = {
  /** Inventaire lisible par toute l'équipe : c'est elle qui le consulte. */
  list(token: string, params?: { category?: MaterialCategory; q?: string }) {
    const query = new URLSearchParams()
    if (params?.category) query.set("category", params.category)
    if (params?.q) query.set("q", params.q)
    const suffix = query.size ? `?${query.toString()}` : ""
    return apiFetch<MaterialItemResponse[]>(`/stock/api/material${suffix}`, { token })
  },

  /** Sorties réutilisables pas encore rendues, pour la section « retour ». */
  returns(token: string) {
    return apiFetch<MaterialReturnLine[]>("/stock/api/material/returns", { token })
  },

  /** Déclare le retour d'unités : elles regagnent le stock du produit. */
  returnUnits(token: string, input: { ticketId: string; materialId: string; quantity: number }) {
    return apiFetch<{ message: string; remaining: number }>("/stock/api/material/return", {
      method: "POST",
      token,
      body: input,
    })
  },

  /** Réservé à l'admin : seul lui ajoute un produit à l'inventaire. */
  create(token: string, input: CreateMaterialInput) {
    return apiFetch<MaterialItemResponse>("/stock/api/material", { method: "POST", token, body: input })
  },

  update(token: string, id: string, input: UpdateMaterialInput) {
    return apiFetch<MaterialItemResponse>(`/stock/api/material/${encodeURIComponent(id)}`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  remove(token: string, id: string) {
    return apiFetch<{ message: string }>(`/stock/api/material/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    })
  },
}
export interface SlaRule {
  priority: TicketPriority
  /**
   * Délai de réponse, en minutes, mesuré depuis le dépôt du ticket : réponse
   * attendue avant ce délai, sinon le ticket passe en dépassement. Les minutes
   * — et non les heures — représentent les seuils sub-horaires (15 min,
   * 1 h 30…).
   */
  responseMinutes: number
  /** Seuil d'alerte, en minutes : passé ce délai, phase critique (badge orange). */
  warningMinutes: number
}

/** Une durée en minutes, lisible : 15 → « 15 min », 90 → « 1 h 30 », 1440 → « 24 h ». */
export function formatSlaMinutes(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

/**
 * Compte à rebours du délai de réponse : « 45 min left » tant qu'il reste du
 * temps, « 12 min overdue » une fois dépassé. Le nombre est recalculé à chaque
 * lecture — l'écran n'affiche pas une date figée, il affiche ce qui reste.
 */
export function formatSlaRemaining(deadlineAt: string, now = Date.now()): string {
  const deltaMs = new Date(deadlineAt).getTime() - now
  const text = formatSlaMinutes(Math.abs(deltaMs) / 60_000)
  return deltaMs >= 0 ? `${text} left` : `${text} overdue`
}

/**
 * Retard d'une réponse, en clair : « 12 min late », « 2 h late », ou « on time »
 * quand la réponse est arrivée dans les délais (ou en avance). Le chiffre est
 * signé côté serveur : positif = en retard.
 */
export function formatSlaLateness(lateMinutes: number): string {
  if (lateMinutes <= 0) return "on time"
  return `${formatSlaMinutes(lateMinutes)} late`
}

/**
 * Temps de réaction du centre, en clair : « 30 min », « 2 h 15 », ou
 * « under a minute » pour une réponse immédiate. Contrairement au retard, ce
 * délai court depuis le dépôt et ignore les seuils — il dit quand la réponse
 * est arrivée, pas si elle était conforme.
 */
export function formatSlaDelay(delayMinutes: number): string {
  const total = Math.round(delayMinutes)
  if (total <= 0) return "under a minute"
  return formatSlaMinutes(total)
}

/**
 * Ponctualité de la réponse au déclarant, sur l'ensemble des tickets.
 *
 * Deux familles distinctes : les réponses déjà données (`responded`, dont
 * `onTime` / `late`) et la file encore en attente (`awaiting`, dont `atAlert` /
 * `overdue`). `onTimeRate` vaut `null` tant qu'aucune réponse n'a été donnée.
 */
export interface SlaStats {
  responded: number
  onTime: number
  late: number
  /** Taux de réponses à l'heure, en pourcentage entier, ou `null`. */
  onTimeRate: number | null
  /** Retard moyen des seules réponses en retard, en minutes. */
  avgLateMinutes: number
  awaiting: number
  atAlert: number
  overdue: number
}

/**
 * Politique SLA globale, unique pour toute l'équipe.
 *
 * `enabled` est un interrupteur : désactivée, la politique est conservée mais
 * aucun badge ni escalade n'est calculé.
 */
export interface SlaPolicy {
  enabled: boolean
  rules: SlaRule[]
  updatedByName: string
  updatedAt: string | null
}

export type UpdateSlaPolicyInput = Pick<SlaPolicy, "enabled" | "rules">

export const slaApi = {
  /** Chaque rôle lit la politique : c'est elle qui explique les badges. */
  get(token: string) {
    return apiFetch<SlaPolicy>("/sla/api/policy", { token })
  },

  /** Réservé à l'admin : régler les délais engage toute l'équipe. */
  update(token: string, input: UpdateSlaPolicyInput) {
    return apiFetch<SlaPolicy>("/sla/api/policy", { method: "PUT", token, body: input })
  },

  /** Ponctualité des réponses, sur l'ensemble des tickets. Réservé à l'admin. */
  stats(token: string) {
    return apiFetch<SlaStats>("/sla/api/stats", { token })
  },
}

export const ticketApi = {
  /**
   * Déclaration : titre, description et niveau d'urgence. La priorité est
   * obligatoire — le centre trie sur elle sans ouvrir chaque fiche.
   */
  create(token: string, input: { title: string; description: string; priority: TicketPriority }) {
    return apiFetch<TicketResponse>("/ticket/api/tickets", { method: "POST", token, body: input })
  },

  /**
   * Demande lancée depuis le catalogue de services : le titre, la priorité, le
   * périmètre et le superviseur viennent du service. Le demandeur ne fournit
   * que la description de son problème.
   */
  createFromCatalogue(token: string, input: { serviceId: string; description: string }) {
    return apiFetch<TicketResponse>("/ticket/api/tickets/catalogue", {
      method: "POST",
      token,
      body: input,
    })
  },

  /**
   * Correction de sa propre demande, par son auteur et seulement tant qu'elle
   * est au statut « new ». Le serveur refuse après la prise en charge : l'écran
   * ne propose alors plus le bouton.
   */
  update(token: string, id: string, input: { title: string; description: string; priority: TicketPriority }) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  /** Tickets déclarés et tickets reçus, pour l'utilisateur connecté. */
  mine(token: string) {
    return apiFetch<MyTicketsResponse>("/ticket/api/tickets/mine", { token })
  },

  /** File complète du centre de répartition. Réservée à l'administrateur. */
  queue(token: string, filters: TicketQueueFilters = {}) {
    const params = new URLSearchParams()
    if (filters.status) params.set("status", filters.status)
    if (filters.departmentCode) params.set("departmentCode", filters.departmentCode)
    if (filters.unitPath) params.set("unitPath", filters.unitPath)
    if (filters.q) params.set("q", filters.q)
    if (filters.response) params.set("response", filters.response)
    const query = params.toString()
    return apiFetch<TicketQueueResponse>(`/ticket/api/tickets${query ? `?${query}` : ""}`, { token })
  },

  /**
   * Nombre de tickets attendant une première décision, pour l'administrateur
   * connecté. Alimente le compteur affiché sur « Dispatch centre ».
   *
   * La valeur est recalculée par le serveur à chaque lecture : elle ne peut donc
   * pas être mise en cache par le client, au risque d'afficher un dossier que
   * quelqu'un d'autre a déjà pris en revue.
   */
  unseenDispatchCount(token: string) {
    return apiFetch<{ count: number }>("/ticket/api/tickets/queue/unseen", { token })
  },

  /**
   * Marque le centre de répartition comme vu et remet le compteur à zéro.
   *
   * Appelé à l'ouverture de l'écran. Le serveur positionne son curseur à
   * l'instant de l'appel : un ticket déclaré entre le chargement de la liste et
   * l'effacement du compteur reste donc compté.
   */
  markDispatchSeen(token: string) {
    return apiFetch<{ count: number; seenAt: string }>("/ticket/api/tickets/queue/seen", {
      method: "POST",
      token,
    })
  },

  /**
   * Nombre de dossiers attendant le superviseur connecté. Alimente le compteur
   * affiché sur « Tickets to handle ».
   *
   * Le serveur ne compte que ce qui attend encore une action — un dossier distribué
   * ou accepté. Un dossier résolu reste dans la liste du superviseur, sans avoir
   * quoi que ce soit à lui demander : il n'a donc pas à apparaître au compteur.
   */
  unseenAssignedCount(token: string) {
    return apiFetch<{ count: number }>("/ticket/api/tickets/assigned/unseen", { token })
  },

  /**
   * Marque les dossiers à traiter comme vus et remet le compteur à zéro.
   *
   * Appelé à l'ouverture de l'écran, à l'ouverture d'une fiche et après une
   * décision. Le serveur positionne son curseur à l'instant de l'appel : un dossier
   * distribué entre le chargement de la liste et cet effacement reste donc compté.
   */
  markAssignedSeen(token: string) {
    return apiFetch<{ count: number; seenAt: string }>("/ticket/api/tickets/assigned/seen", {
      method: "POST",
      token,
    })
  },

  get(token: string, id: string) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}`, { token })
  },

  /**
   * Prise en charge de la revue.
   *
   * Un POST et non un GET : ouvrir le dossier depuis le centre de répartition
   * est une action, pas une simple lecture. Un rafraîchissement de page ne doit
   * pas faire avancer l'état d'un ticket.
   */
  startReview(token: string, id: string) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/review`, {
      method: "POST",
      token,
    })
  },

  /**
   * Distribution. Le serveur refuse un superviseur indisponible, un compte
   * sans rôle de superviseur, ou un ticket pas encore revu ; l'écran affiche
   * le message tel quel.
   */
  assign(token: string, id: string, input: { assignedTo: string; departmentCode?: string; unitPath?: string }) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/assignment`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  /**
   * Acceptation par le superviseur désigné.
   *
   * Séparée de `assign` parce que ce sont deux décisions de deux personnes :
   * l'administrateur choisit qui pourrait traiter, le superviseur dit s'il
   * s'engage. Le serveur refuse toute autre main, y compris celle d'un autre
   * superviseur.
   */
  accept(token: string, id: string, materials?: ReleaseMaterialLineInput[]) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      token,
      body: materials && materials.length > 0 ? { materials } : {},
    })
  },

  /** Compte rendu du superviseur : ce qu'il a fait, pas « traité ». */
  resolve(token: string, id: string, note: string) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      token,
      body: { note },
    })
  },

  /**
   * Avis du demandeur sur le service rendu, de une à cinq étoiles.
   *
   * Le commentaire est facultatif : il sert à préciser, jamais à autoriser l'avis.
   * Une note seule reste un avis complet, et forcer un texte ferait perdre les
   * étoiles de ceux qui n'écrivent pas.
   */
  rate(token: string, id: string, rating: number, comment = "") {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/rating`, {
      method: "POST",
      token,
      body: { rating, comment },
    })
  },

  /**
   * Rend le dossier au centre de répartition.
   *
   * Utilisé avant comme après le début du traitement : refuser un dossier et
   * abandonner en cours sont le même geste. Réservé au superviseur désigné : le
   * serveur refuse toute autre tentative, y compris celle d'un autre superviseur
   * ou d'un collaborateur.
   */
  returnToDispatch(token: string, id: string, reason: string) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/return`, {
      method: "POST",
      token,
      body: { reason },
    })
  },

  /** Solde le dossier. Réservé à l'administrateur. */
  close(token: string, id: string, reason: string) {
    return apiFetch<TicketResponse>(`/ticket/api/tickets/${encodeURIComponent(id)}/close`, {
      method: "POST",
      token,
      body: { reason },
    })
  },

  /**
   * Suppression définitive, distincte de `close`.
   *
   * Possible à toute étape, pour l'administrateur : c'est le geste qui dégage la
   * file, pas une décision sur le dossier. La confirmation à l'écran reste la
   * seule protection, la suppression étant irréversible. La réponse est un
   * message et non un ticket — il n'y a plus rien à renvoyer.
   */
  remove(token: string, id: string) {
    return apiFetch<{ message: string }>(`/ticket/api/tickets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    })
  },

  /** Superviseurs distribuables, avec leur statut de disponibilité. */
  supervisors(token: string) {
    return apiFetch<SupervisorOption[]>("/ticket/api/tickets/supervisors", { token })
  },
}

/**
 * Une notification de compte.
 *
 * Écrite par le serveur pour un destinataire unique (`targetUserId`) : elle
 * n'existe que poussée, jamais diffusée à un canal entier, et chaque
 * administrateur reçoit donc son propre exemplaire. `link` est l'écran à ouvrir
 * au clic, vide quand'il n'y a rien à ouvrir — une notification peut être pure
 * information.
 */
export interface NotificationItem {
  _id: string
  targetUserId: string
  title: string
  message: string
  type: "info" | "success" | "warning" | "error"
  read: boolean
  link: string
  createdAt: string
  updatedAt: string
}

export const notificationApi = {
  /** Les 50 dernières, de la plus récente à la plus ancienne. */
  list(token: string) {
    return apiFetch<NotificationItem[]>("/user/api/notifications", { token })
  },

  /** Compteur des non lues, tel que le compte est réellement connu du serveur. */
  unreadCount(token: string) {
    return apiFetch<{ count: number }>("/user/api/notifications/unread-count", { token })
  },

  /**
   * Toutes les notifications passent pour lues.
   *
   * Appelé à l'ouverture du panneau : ouvrir, c'est regarder. Le compteur de la
   * cloche tombe alors à zéro sans que personne n'ait à cliquer chaque ligne.
   */
  markAllRead(token: string) {
    return apiFetch<{ message: string; modifiedCount: number }>(
      "/user/api/notifications/read-all",
      { method: "PUT", token },
    )
  },

  /** Une seule notification, pour celle qui arrive pendant que le panneau est ouvert. */
  markRead(token: string, id: string) {
    return apiFetch<NotificationItem>(`/user/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "PUT",
      token,
    })
  },

  /** Dégage le panneau. Effacer n'est pas marquer comme lu : rien ne revient. */
  removeAll(token: string) {
    return apiFetch<{ message: string; deletedCount: number }>("/user/api/notifications", {
      method: "DELETE",
      token,
    })
  },
}

/*--------------------------------------------------
* Recommandations générales
*
* Un message d'encadrement adressé à des équipes entières : l'administrateur et
* le superviseur publient, les membres des unités visées reçoivent. Le
* périmètre voyage en clair — département et unités telles qu'elles étaient à la
* publication — pendant que les destinataires sont arrêtés à cet instant : un
* compte ouvert plus tard n'hérite pas d'un message qui le précède.
----------------------------------------------------*/

/** Unité visée, avec le nom qu'elle portait le jour de la publication. */
export interface RecommendationUnit {
  path: string
  name: string
}

export interface RecommendationScope {
  departmentCode: string
  departmentName: string
  units: RecommendationUnit[]
}

/** Fiche d'une pièce jointe : la liste ne transporte jamais les octets. */
export interface RecommendationAttachment {
  name: string
  mimeType: "application/pdf" | "image/png"
  size: number
}

export interface Recommendation {
  _id: string
  title: string
  message: string
  scopes: RecommendationScope[]
  /** Identifiant du compte qui l'a publiée — le lecteur voit son visage. */
  createdBy: string
  createdByName: string
  createdAt: string
  /** Marqueur propre au lecteur : le même message reste non lu pour les autres. */
  read: boolean
  attachment: RecommendationAttachment | null
}

/** Une publication vue de son auteur : avec son effectif et son suivi de lecture. */
export interface SentRecommendation {
  _id: string
  title: string
  message: string
  scopes: RecommendationScope[]
  createdByName: string
  createdAt: string
  recipientCount: number
  readCount: number
  attachment: RecommendationAttachment | null
}

export interface CreateRecommendationInput {
  title: string
  message: string
  /** Périmètre déclaré : chemins d'unités, libellés résolus par le serveur. */
  scopes: { departmentCode: string; unitPaths: string[] }[]
  /**
   * Membres que l'auteur a décochés dans le formulaire. Le serveur ne fait que
   * retrancher ces identifiants du périmètre : on ne peut pas ajouter un
   * destinataire par ce biais, et vider l'effectif entier est refusé.
   */
  excludedUserIds?: string[]
  /** Data URI (`data:…;base64,…`) lue depuis le fichier choisi au formulaire. */
  attachment?: RecommendationAttachment & { data: string }
}

export interface RecommendationTargets {
  departments: { code: string; name: string; active: boolean }[]
  units: {
    path: string
    name: string
    parentPath: string | null
    /** Hérité de la racine pour une sous-unité : seules les racines en portent. */
    departmentCode: string | null
  }[]
}

export const RECOMMENDATION_MAX_BYTES = 4 * 1024 * 1024

/**
 * Un destinataire de la publication, côté auteur : qui il est, son unité, et
 * s'il a ouvert le message. La liste sert l'écran de succès comme le suivi des
 * lectures — le visage, lui, est chargé à part, comme partout ailleurs.
 */
export interface RecommendationAudienceMember {
  _id: string
  name: string
  email: string
  unitPath: string
  unitName: string | null
  /** Photo de profil en data URI, le visage s'affiche sans appel de plus. */
  photo: string
  /** Lu par ce destinataire. */
  read: boolean
}

/** Une publication juste émise : l'auteur repart avec l'effectif visé. */
export interface CreatedRecommendation extends Recommendation {
  recipientCount: number
  recipients: RecommendationAudienceMember[]
}

/**
 * Membre des unités visées.
 *
 * La liste affichée avant la publication doit être exactement celle à qui le
 * message partira : même ciblage que le serveur, auteur mis à part — il ne se
 * voit jamais lui-même dans la liste.
 */
export interface RecommendationRecipient {
  _id: string
  name: string
  email: string
  unitPath: string
  unitName: string | null
  departmentCode: string | null
  /** Photo de profil en data URI, le visage s'affiche sans appel de plus. */
  photo: string
}

export const recommendationApi = {
  /** Messages reçus, du plus récent au plus ancien. */
  list(token: string) {
    return apiFetch<Recommendation[]>("/recommendation/api/recommendations", { token })
  },

  /** Non lues, pour le lecteur connecté — jamais celles des autres. */
  unreadCount(token: string) {
    return apiFetch<{ count: number }>("/recommendation/api/recommendations/unread-count", { token })
  },

  markRead(token: string, id: string) {
    return apiFetch<{ message: string }>(
      `/recommendation/api/recommendations/${encodeURIComponent(id)}/read`,
      { method: "POST", token },
    )
  },

  markAllRead(token: string) {
    return apiFetch<{ message: string; updatedCount: number }>(
      "/recommendation/api/recommendations/read-all",
      { method: "POST", token },
    )
  },

  /** Publications de l'appelant. Réservé à ceux qui diffusent. */
  sent(token: string) {
    return apiFetch<SentRecommendation[]>("/recommendation/api/recommendations/sent", { token })
  },

  /** Départements et unités disponibles à la publication. */
  targets(token: string) {
    return apiFetch<RecommendationTargets>("/recommendation/api/recommendations/targets", { token })
  },

  /**
   * Membres des unités cochées, pour l'écran qui laisse l'auteur décocher
   * quelques destinataires. Chemins envoyés en paramètres répétés
   * (`?units=1&units=1.1`) — le serveur les déduplique.
   */
  recipients(token: string, unitPaths: string[]) {
    const query = new URLSearchParams()
    for (const path of unitPaths) query.append("units", path)
    return apiFetch<RecommendationRecipient[]>(
      `/recommendation/api/recommendations/recipients?${query.toString()}`,
      { token },
    )
  },

  create(token: string, input: CreateRecommendationInput) {
    return apiFetch<CreatedRecommendation>(
      "/recommendation/api/recommendations",
      { method: "POST", token, body: input },
    )
  },

  /** Qui a lu une publication, pour l'écran de l'auteur. */
  audience(token: string, id: string) {
    return apiFetch<{ recipients: RecommendationAudienceMember[]; recipientCount: number; readCount: number }>(
      `/recommendation/api/recommendations/${encodeURIComponent(id)}/audience`,
      { token },
    )
  },

  /**
   * Retirer une publication.
   *
   * Seul l'auteur peut le faire : le serveur répond 404 à quiconque tente le
   * geste sur le message d'autrui. Les destinataires sont alors prévenus par
   * la cloche — le message disparaît de leur réception, jamais en silence.
   */
  remove(token: string, id: string) {
    return apiFetch<{ message: string; recipientCount: number }>(
      `/recommendation/api/recommendations/${encodeURIComponent(id)}`,
      { method: "DELETE", token },
    )
  },

  /**
   * Télécharge la pièce jointe.
   *
   * `apiFetch` lit du JSON : il ne peut pas servir un fichier. Ici la réponse
   * est lue en octets, et le refus du serveur reste un `ApiError` — l'écran
   * affiche le même type de message quel que soit le motif.
   */
  async downloadAttachment(token: string, recommendation: Recommendation): Promise<Blob> {
    const attachment = recommendation.attachment
    if (!attachment) throw new ApiError("This message has no attachment.", 404)

    let response: Response
    try {
      response = await fetch(
        `${API_BASE_URL}/recommendation/api/recommendations/${encodeURIComponent(recommendation._id)}/attachment`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    } catch {
      throw new ApiError("Unable to reach the server. Please check your connection.", 0)
    }

    if (!response.ok) {
      const message = await readErrorMessage(response)
      throw new ApiError(message ?? `Request failed (${response.status}).`, response.status)
    }

    return await response.blob()
  },
}

/*--------------------------------------------------
* Base de connaissances
*
* La référence générale du ticketing : l'administrateur et le superviseur
* consignent un problème et sa technique de résolution, rattachés à un
* département, un secteur d'activité (un des services du département) et une
* unité. Tout le monde la consulte et la filtre ; personne d'autre ne crée.
---------------------------------------------------*/

/** Fiche d'une pièce jointe : la liste ne transporte jamais les octets. */
export interface KnowledgeAttachment {
  name: string
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"
  size: number
}

export interface KnowledgeArticle {
  _id: string
  title: string
  description: string
  /** La technique de résolution : le cœur de l'article, ce qui le rend référence. */
  resolutionTechnique: string
  departmentCode: string
  departmentName: string
  unitPath: string
  unitName: string
  /** Secteur d'activité : l'un des services du département. */
  sector: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  attachment: KnowledgeAttachment | null
}

export interface CreateKnowledgeArticleInput {
  title: string
  description: string
  resolutionTechnique: string
  departmentCode: string
  unitPath: string
  sector?: string
  /** Data URI (`data:…;base64,…`) lue depuis le fichier choisi au formulaire. */
  attachment?: KnowledgeAttachment & { data: string }
}

/**
 * Correction d'un article, par son créateur uniquement.
 *
 * Reprend les champs de la création ; `removeAttachment` retire la pièce jointe
 * qui existe déjà, sans qu'il faille en renvoyer une autre.
 */
export interface UpdateKnowledgeArticleInput {
  title: string
  description: string
  resolutionTechnique: string
  departmentCode: string
  unitPath: string
  sector?: string
  attachment?: KnowledgeAttachment & { data: string }
  removeAttachment?: boolean
}

/** Écrans de filtrage : départements avec leurs services (les secteurs) et unités. */
export interface KnowledgeTargets {
  departments: { code: string; name: string; active: boolean; services: string[] }[]
  units: {
    path: string
    name: string
    parentPath: string | null
    /** Hérité de la racine pour une sous-unité : seules les racines en portent. */
    departmentCode: string | null
  }[]
}

/** Un auteur d'article, pour le filtre « creator ». */
export interface KnowledgeCreator {
  _id: string
  name: string
  count: number
}

export interface KnowledgeFilters {
  departmentCode?: string
  unitPath?: string
  createdBy?: string
  q?: string
}

export const KNOWLEDGE_MAX_BYTES = 4 * 1024 * 1024

/** Seuls ces formats sont acceptés par le serveur — le naviguer doit s'y tenir. */
export const KNOWLEDGE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const

export type KnowledgeMimeType = (typeof KNOWLEDGE_MIME_TYPES)[number]

/** Étiquette courte d'un type, pour la pastille et la fiche. */
export const KNOWLEDGE_ATTACHMENT_LABELS: Record<KnowledgeMimeType, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WEBP",
}

export const knowledgeApi = {
  list(token: string, filters: KnowledgeFilters = {}) {
    const params = new URLSearchParams()
    if (filters.departmentCode) params.set("departmentCode", filters.departmentCode)
    if (filters.unitPath) params.set("unitPath", filters.unitPath)
    if (filters.createdBy) params.set("createdBy", filters.createdBy)
    if (filters.q) params.set("q", filters.q)
    const query = params.toString()
    return apiFetch<KnowledgeArticle[]>(`/knowledge/api/knowledge${query ? `?${query}` : ""}`, { token })
  },

  targets(token: string) {
    return apiFetch<KnowledgeTargets>("/knowledge/api/knowledge/targets", { token })
  },

  creators(token: string) {
    return apiFetch<KnowledgeCreator[]>("/knowledge/api/knowledge/creators", { token })
  },

  create(token: string, input: CreateKnowledgeArticleInput) {
    return apiFetch<KnowledgeArticle>("/knowledge/api/knowledge", {
      method: "POST",
      token,
      body: input,
    })
  },

  get(token: string, id: string) {
    return apiFetch<KnowledgeArticle>(`/knowledge/api/knowledge/${encodeURIComponent(id)}`, { token })
  },

  /**
   * Correction par le créateur seul : le serveur répond 404 à toute autre main,
   * y compris celle d'un administrateur qui n'a pas écrit l'article.
   */
  update(token: string, id: string, input: UpdateKnowledgeArticleInput) {
    return apiFetch<KnowledgeArticle>(`/knowledge/api/knowledge/${encodeURIComponent(id)}`, {
      method: "PUT",
      token,
      body: input,
    })
  },

  /** Retirer une référence : l'auteur retire la sienne, l'admin n'importe laquelle. */
  remove(token: string, id: string) {
    return apiFetch<{ message: string; title: string }>(
      `/knowledge/api/knowledge/${encodeURIComponent(id)}`,
      { method: "DELETE", token },
    )
  },

  /**
   * Télécharge la pièce jointe.
   *
   * `apiFetch` lit du JSON : il ne peut pas servir un fichier. Ici la réponse
   * est lue en octets, et le refus du serveur reste un `ApiError` — l'écran
   * affiche le même type de message quel que soit le motif.
   */
  async downloadAttachment(token: string, article: KnowledgeArticle): Promise<Blob> {
    const attachment = article.attachment
    if (!attachment) throw new ApiError("This article has no attachment.", 404)

    let response: Response
    try {
      response = await fetch(
        `${API_BASE_URL}/knowledge/api/knowledge/${encodeURIComponent(article._id)}/attachment`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    } catch {
      throw new ApiError("Unable to reach the server. Please check your connection.", 0)
    }

    if (!response.ok) {
      const message = await readErrorMessage(response)
      throw new ApiError(message ?? `Request failed (${response.status}).`, response.status)
    }

    return await response.blob()
  },
}
