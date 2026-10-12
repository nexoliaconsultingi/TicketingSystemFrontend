"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  companyApi,
  expertiseApi,
  unitApi,
  type DepartmentResponse,
  type ExpertiseEntryResponse,
  type ExpertiseInput,
  type ExpertiseResolveResult,
  type UnitResponse,
} from "@/lib/api"
import { getToken } from "@/lib/auth"
import { createFuzzyFilter } from "@/lib/fuzzy-search"
import { buildUnitTree, unitsForDepartment, type Unit } from "@/lib/units"

function requireToken(): string {
  const token = getToken()
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.")
  }
  return token
}

export interface ExpertiseFilters {
  unitPath?: string
  departmentCode?: string
  q?: string
}

/**
 * Référentiel des experts : les problèmes déclarés sur les unités et les
 * personnes compétentes pour les traiter.
 *
 * L'hook charge également les départements et l'organigramme, dont la page a
 * besoin pour dérouler le parcours « département puis unité puis problèmes ».
 */
export function useExpertise() {
  const [entries, setEntries] = useState<ExpertiseEntryResponse[]>([])
  const [departments, setDepartments] = useState<DepartmentResponse[]>([])
  const [units, setUnits] = useState<UnitResponse[]>([])
  const [tree, setTree] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = requireToken()
      const [payload, deps, chart] = await Promise.all([
        expertiseApi.list(token),
        companyApi.listDepartments(token),
        unitApi.list(token),
      ])
      setEntries(payload)
      setDepartments(deps)
      setUnits(chart.units)
      setTree(buildUnitTree(chart.units))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the expert referential.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createEntry = useCallback(
    async (input: ExpertiseInput) => {
      const created = await expertiseApi.create(requireToken(), input)
      await refresh()
      return created
    },
    [refresh],
  )

  const updateEntry = useCallback(
    async (code: string, input: Partial<ExpertiseInput>) => {
      const updated = await expertiseApi.update(requireToken(), code, input)
      await refresh()
      return updated
    },
    [refresh],
  )

  const deleteEntry = useCallback(
    async (code: string) => {
      await expertiseApi.remove(requireToken(), code)
      setEntries((current) => current.filter((entry) => entry.code !== code))
    },
    [],
  )

  return {
    entries,
    departments,
    units,
    tree,
    loading,
    error,
    refresh,
    createEntry,
    updateEntry,
    deleteEntry,
  }
}

/**
 * Unités d'un département, comme pour le formulaire des employés : la
 * composition du département sert à choisir l'unité concernée par un problème.
 */
export function unitsOfDepartment(
  units: UnitResponse[],
  departmentCode: string | null | undefined,
): UnitResponse[] {
  return unitsForDepartment(units, departmentCode)
}

/**
 * Champs indexés pour la recherche du référentiel, du plus au moins pertinent.
 *
 * Le nom du département et celui de l'unité sont indexés avec leur code : le
 * responsable qui cherche les problèmes d'un périmètre donné par « inbound »
 * ou « 1 · Manufacturing » doit les trouver sans passer par les deux
 * listes déroulantes.
 */
const EXPERTISE_SEARCH_KEYS = [
  { name: "problem", weight: 0.4 },
  { name: "expertsText", weight: 0.25 },
  { name: "unitText", weight: 0.15 },
  { name: "departmentText", weight: 0.15 },
  { name: "code", weight: 0.05 },
]

/**
 * Problèmes correspondant à la recherche, dans l'ordre de pertinence.
 *
 * L'ordre de tri du référentiel n'est pas perdu : les résultats restent groupés
 * par unité, puis par ordre alphabétique, comme sans recherche.
 */
export function useExpertiseSearch(
  entries: ExpertiseEntryResponse[],
  units: UnitResponse[],
  departments: DepartmentResponse[],
  query: string,
): ExpertiseEntryResponse[] {
  const searchable = useMemo(() => {
    const unitNames = new Map(units.map((unit) => [unit.path, unit.name]))
    const departmentNames = new Map(departments.map((department) => [department.id, department.name]))

    return entries.map((entry) => ({
      item: entry,
      problem: entry.problem,
      code: entry.code,
      description: entry.description,
      expertsText: entry.experts.map((expert) => `${expert.name ?? ""} ${expert.email}`).join(" "),
      unitText: `${entry.unitPath} ${unitNames.get(entry.unitPath) ?? "unknown unit"}`,
      departmentText: `${entry.departmentCode ?? ""} ${
        departmentNames.get(entry.departmentCode ?? "") ?? ""
      }`,
    }))
  }, [departments, entries, units])

  const filter = useMemo(() => createFuzzyFilter(searchable, EXPERTISE_SEARCH_KEYS), [searchable])

  return useMemo(() => {
    if (!query.trim()) return searchable.map((entry) => entry.item)

    return filter(query).map((entry) => entry.item)
  }, [filter, query, searchable])
}

const SUGGESTION_DEBOUNCE_MS = 350

/**
 * Experts proposés par le référentiel pour un ticket en cours de saisie.
 *
 * Le module tickets peut tourner sans référentiel alimenté : l'échec d'appel
 * est donc silencieux et bascule `reachable` à `false`, ce qui permet à
 * l'interface de masquer le panneau plutôt que d'annoncer une erreur.
 */
export function useExpertSuggestions(
  criteria: { q: string; departmentCode: string; unitPath: string },
  enabled: boolean,
) {
  const [results, setResults] = useState<ExpertiseResolveResult[]>([])
  const [loading, setLoading] = useState(false)
  const [reachable, setReachable] = useState(true)

  const query = criteria.q.trim()
  const departmentCode = criteria.departmentCode.trim()
  const unitPath = criteria.unitPath.trim()

  useEffect(() => {
    if (!enabled || (query.length < 3 && !unitPath)) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const token = getToken()
        if (!token) {
          setReachable(false)
          setResults([])
          return
        }
        const payload = await expertiseApi.resolve(token, { q: query, departmentCode, unitPath })
        if (cancelled) return
        setResults(payload.results)
        setReachable(true)
      } catch {
        if (cancelled) return
        setReachable(false)
        setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, SUGGESTION_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled, query, departmentCode, unitPath])

  return { results, loading, reachable }
}