"use client"

import { useCallback, useEffect, useState } from "react"

import { companyApi, type CompanyResponse, type DepartmentResponse } from "@/lib/api"
import { getToken } from "@/lib/auth"

export const BUSINESS_DOMAINS = ["product", "service", "both"] as const

export type BusinessDomain = (typeof BUSINESS_DOMAINS)[number]

export interface CompanyProfile {
  name: string
  logo: string
  domain: BusinessDomain
  description: string
  services: string[]
}

export interface Department {
  id: string
  name: string
  services: string[]
  description: string
  active: boolean
  createdAt?: string
  updatedAt?: string
  /**
   * Unités racines portées par ce département : un département peut alimenter
   * autant d'arbres que nécessaire, donc la liste est vide s'il n'en a aucune.
   */
  rootUnits?: { path: string; name: string }[]
}

/**
 * Saisie d'un département.
 *
 * `services` a été retiré de l'interface : le backend le valorise à `[]` à la
 * création et le préserve quand la clé est absente d'une mise à jour, donc il
 * n'y a rien à envoyer.
 */
export interface DepartmentDraft {
  name: string
  description: string
}

export const BUSINESS_DOMAIN_LABELS: Record<BusinessDomain, string> = {
  product: "Product",
  service: "Service",
  both: "Product & service",
}

export const BUSINESS_DOMAIN_DESCRIPTIONS: Record<BusinessDomain, string> = {
  product: "The organisation designs, manufactures or resells physical or digital goods.",
  service: "The organisation delivers expertise, support or managed services to its clients.",
  both: "The organisation combines a product portfolio with a service offering.",
}

/** Valeurs de repli affichées pendant le chargement ou si l'API est injoignable. */
export const FALLBACK_PROFILE: CompanyProfile = {
  name: "Global Industries",
  logo: "/nexoliaLogo/logo.png",
  domain: "both",
  description:
    "Global Industries is a multinational group operating across 14 countries. The company combines a hardware product line with a recurring service portfolio covering maintenance, integration and managed support.",
  services: [],
}

function toDomain(value: unknown): BusinessDomain {
  return BUSINESS_DOMAINS.includes(value as BusinessDomain)
    ? (value as BusinessDomain)
    : FALLBACK_PROFILE.domain
}

/** Accepte aussi les réponses partielles et purge les valeurs invalides. */
function toProfile(payload: Partial<CompanyResponse> | null | undefined): CompanyProfile {
  if (!payload) return FALLBACK_PROFILE

  return {
    name: typeof payload.name === "string" && payload.name ? payload.name : FALLBACK_PROFILE.name,
    logo: typeof payload.logo === "string" ? payload.logo : FALLBACK_PROFILE.logo,
    domain: toDomain(payload.domain),
    description: typeof payload.description === "string" ? payload.description : "",
    services: Array.isArray(payload.services)
      ? [
          ...new Set(
            payload.services
              .filter((service): service is string => typeof service === "string")
              .map((service) => service.trim())
              .filter(Boolean),
          ),
        ]
      : [],
  }
}

function toDepartment(payload: Partial<DepartmentResponse>): Department {
  return {
    id: String(payload.id ?? ""),
    name: typeof payload.name === "string" ? payload.name : "",
    services: Array.isArray(payload.services)
      ? payload.services.filter((service): service is string => typeof service === "string")
      : [],
    description: typeof payload.description === "string" ? payload.description : "",
    active: payload.active !== false,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    rootUnits: Array.isArray(payload.rootUnits)
      ? payload.rootUnits
          .filter(
            (unit): unit is { path: string; name: string } =>
              typeof unit?.path === "string" && typeof unit?.name === "string",
          )
          .sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }))
      : [],
  }
}

function requireToken(): string {
  const token = getToken()
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.")
  }
  return token
}

/**
 * Identité de l'entreprise, lue par tous les écrans publics (page de connexion).
 * L'endpoint est public : aucun token n'est nécessaire.
 */
export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(FALLBACK_PROFILE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const payload = await companyApi.getCompany()
      setProfile(toProfile(payload))
      setError(null)
    } catch {
      setError("Unable to load the company information.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { profile, loading, error, refresh }
}

/**
 * Administration plateforme : lecture et écriture de l'entreprise et des départements.
 * Toutes les écritures passent par l'API, le token de session est ajouté à chaque appel.
 */
export function useCompanyAdmin() {
  const [profile, setProfile] = useState<CompanyProfile>(FALLBACK_PROFILE)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = requireToken()
      const [companyPayload, departmentsPayload] = await Promise.all([
        companyApi.getCompany(),
        companyApi.listDepartments(token),
      ])

      setProfile(toProfile(companyPayload))
      setDepartments(departmentsPayload.map(toDepartment))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load company data.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateProfile = useCallback(async (input: Partial<CompanyProfile>) => {
    const token = requireToken()
    const payload = await companyApi.updateCompany(token, {
      name: input.name,
      logo: input.logo,
      domain: input.domain,
      description: input.description,
      services: input.services,
    })
    setProfile(toProfile(payload))
    return toProfile(payload)
  }, [])

  const fetchDepartment = useCallback(async (id: string) => {
    const token = requireToken()
    return toDepartment(await companyApi.getDepartment(token, id))
  }, [])

  const createDepartment = useCallback(async (input: DepartmentDraft) => {
    const token = requireToken()
    const created = toDepartment(
      await companyApi.createDepartment(token, {
        name: input.name,
        description: input.description,
      }),
    )
    setDepartments((current) =>
      [...current, created].sort((a, b) => a.id.localeCompare(b.id)),
    )
    return created
  }, [])

  const updateDepartment = useCallback(async (id: string, input: Partial<DepartmentDraft>) => {
    const token = requireToken()
    const updated = toDepartment(await companyApi.updateDepartment(token, id, input))
    setDepartments((current) =>
      current
        .map((department) => (department.id === id ? { ...department, ...updated } : department))
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
    return updated
  }, [])

  const deleteDepartment = useCallback(async (id: string) => {
    const token = requireToken()
    await companyApi.deleteDepartment(token, id)
    setDepartments((current) => current.filter((department) => department.id !== id))
  }, [])

  return {
    profile,
    departments,
    loading,
    error,
    refresh,
    updateProfile,
    fetchDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
  }
}
