import type { AuthUser } from "@/lib/api"

const TOKEN_KEY = "nexolia.token"
const USER_KEY = "nexolia.user"
const PENDING_AUTH_KEY = "nexolia.pending-auth"

export interface PendingAuth {
  email: string
  remember: boolean
}

export const AUTH_COOKIE = "nexolia_token"

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function writeCookie(token: string, remember: boolean): void {
  const encoded = encodeURIComponent(token)
  const maxAge = remember ? `; max-age=${SESSION_MAX_AGE_SECONDS}` : ""
  document.cookie = `${AUTH_COOKIE}=${encoded}; path=/; SameSite=Lax${maxAge}`
}

function deleteCookie(): void {
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function readCookie(): string | null {
  if (!isBrowser()) return null

  for (const part of document.cookie.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    if (part.slice(0, separator).trim() !== AUTH_COOKIE) continue
    const value = part.slice(separator + 1).trim()
    if (value.length === 0) continue
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}

export function saveSession(token: string, user: AuthUser, remember: boolean): void {
  if (!isBrowser()) return

  const storage = remember ? window.localStorage : window.sessionStorage
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(USER_KEY, JSON.stringify(user))
  writeCookie(token, remember)
}

export function getToken(): string | null {
  if (!isBrowser()) return null
  return (
    window.sessionStorage.getItem(TOKEN_KEY) ??
    window.localStorage.getItem(TOKEN_KEY) ??
    readCookie()
  )
}

export function getStoredUser(): AuthUser | null {
  if (!isBrowser()) return null

  const raw =
    window.sessionStorage.getItem(USER_KEY) ?? window.localStorage.getItem(USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

/**
 * Le proxy (proxy.ts) se fie au cookie, les gardes React au stockage local.
 * Si les deux divergent (cookie résiduel, stockage vidé), la session devient
 * inatteignable : /login redirige vers / puis / renvoie vers /login.
 * Cette fonction réaligne les deux états à partir du cookie.
 */
export async function reconcileSession(): Promise<boolean> {
  if (!isBrowser()) return false

  const cookieToken = readCookie()
  if (!cookieToken) {
    if (!window.sessionStorage.getItem(TOKEN_KEY) && !window.localStorage.getItem(TOKEN_KEY)) {
      return false
    }
    writeCookie(getToken() ?? "", true)
    return true
  }

  const storedToken = getToken()
  const storedUser = getStoredUser()
  if (storedToken === cookieToken && storedUser) return true

  try {
    const { authApi } = await import("@/lib/api")
    const user = await authApi.me(cookieToken)
    saveSession(cookieToken, user, true)
    return true
  } catch {
    clearSession()
    return false
  }
}

/**
 * Résout l'utilisateur auprès de l'API au lieu de lire le stockage local.
 *
 * Le rôle d'administration doit faire foi côté serveur : `getStoredUser` lit un
 * objet modifiable depuis le navigateur, alors que `/user/api/me` relit le
 * document en base à chaque appel. Utilisé par AdminGuard avant d'ouvrir la
 * section Platform administration, puis pour rafraîchir la session locale.
 */
export async function fetchSessionUser(): Promise<AuthUser | null> {
  if (!isBrowser()) return null

  const token = getToken() ?? readCookie()
  if (!token) return null

  try {
    const { authApi } = await import("@/lib/api")
    const user = await authApi.me(token)
    const remember = Boolean(window.localStorage.getItem(TOKEN_KEY))
    saveSession(token, user, remember)
    return user
  } catch {
    clearSession()
    return null
  }
}

export function clearSession(): void {
  if (!isBrowser()) return

  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(USER_KEY)
  deleteCookie()
}

/**
 * Réécrit le profil mis en cache après une auto-modification.
 *
 * Le nom et l'email sont affichés dans le shell et l'en-tête : sans cette
 * mise à jour, l'utilisateur continuerait de voir son ancienne identité jusqu'à
 * la prochaine connexion.
 *
 * L'écriture vise le stockage qui porte réellement le profil. Les deux
 * emplacements sont traités car un compte « se souvenir de moi » peut avoir
 * laissé une copie de l'autre époque : lire l'un des deux suffit à afficher
 * l'ancien nom.
 */
export function updateStoredUser(user: AuthUser): void {
  if (!isBrowser()) return

  const serialized = JSON.stringify(user)
  if (window.localStorage.getItem(USER_KEY) !== null) {
    window.localStorage.setItem(USER_KEY, serialized)
  }
  if (window.sessionStorage.getItem(USER_KEY) !== null) {
    window.sessionStorage.setItem(USER_KEY, serialized)
  }
}

export function setPendingAuth(email: string, remember: boolean): void {
  if (!isBrowser()) return
  window.sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify({ email, remember }))
}

export function getPendingAuth(): PendingAuth | null {
  if (!isBrowser()) return null

  const raw = window.sessionStorage.getItem(PENDING_AUTH_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PendingAuth
    if (typeof parsed?.email !== "string" || parsed.email.length === 0) {
      return null
    }
    return { email: parsed.email, remember: parsed.remember !== false }
  } catch {
    return null
  }
}

export function clearPendingAuth(): void {
  if (!isBrowser()) return
  window.sessionStorage.removeItem(PENDING_AUTH_KEY)
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}
