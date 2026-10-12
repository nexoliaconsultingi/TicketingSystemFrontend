"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { companyApi, unitApi, type DepartmentResponse, type UnitNode, type UnitResponse } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { createFuzzyFilter } from "@/lib/fuzzy-search"

export interface Unit extends UnitResponse {
  children: UnitNode[]
}

function requireToken(): string {
  const token = getToken()
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.")
  }
  return token
}

export const MAX_DEPTH = 8

/**
 * Construit l'arbre à partir de la liste plate. Le tri est fait sur le chemin
 * pour que "3.10" se place bien après "3.9".
 */
export function buildUnitTree(units: UnitResponse[]): Unit[] {
  const sorted = [...units].sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }))

  const byPath = new Map<string, Unit>()
  for (const unit of sorted) {
    byPath.set(unit.path, { ...unit, children: [] })
  }

  const roots: Unit[] = []
  for (const unit of byPath.values()) {
    const parent = unit.parentPath ? byPath.get(unit.parentPath) : undefined
    if (parent) {
      parent.children.push(unit)
    } else {
      roots.push(unit)
    }
  }

  return roots
}

/** Aplatit l'arbre en profondeur : renvoie le chemin de chaque unité. */
export function flattenUnits(tree: Unit[]): string[] {
  const out: string[] = []
  const walk = (nodes: Unit[]) => {
    for (const node of nodes) {
      out.push(node.path)
      walk(node.children)
    }
  }
  walk(tree)
  return out
}

/**
 * Nombre de descendants d'une unité, toutes branches confondues.
 * Utilisé pour annoncer la portée d'une suppression avant confirmation.
 */
export function countDescendants(tree: Unit[], path: string): number {
  let total = 0
  const walk = (nodes: Unit[]) => {
    for (const node of nodes) {
      if (node.path === path) {
        const deep = (children: UnitNode[]): number =>
          children.reduce((sum, child) => sum + 1 + deep(child.children), 0)
        total += deep(node.children)
        return
      }
      walk(node.children)
    }
  }
  walk(tree)
  return total
}

/** Départements déjà portés par une unité racine, donc indisponibles. */
export function usedDepartmentCodes(units: UnitResponse[]): Set<string> {
  const used = new Set<string>()
  for (const unit of units) {
    if (!unit.parentPath && unit.departmentCode) used.add(unit.departmentCode)
  }
  return used
}

/**
 * Unités disponibles pour un département donné : toutes les racines qui le
 * portent, plus toute leur descendance.
 *
 * Seul l'unité racine porte `departmentCode` ; les sous-unités héritent du
 * département de leur branche. On parcourt donc l'arbre en descendant depuis
 * chaque racine correspondante, plutôt que de filtrer la liste plate — sinon
 * un département n'afficherait qu'une partie de ses unités.
 *
 * Le résultat est trié par chemin ; l'indentation visuelle se déduit du
 * nombre de segments (voir `unitIndent`).
 */
export function unitsForDepartment(
  units: UnitResponse[],
  departmentCode: string | null | undefined,
): UnitResponse[] {
  const wanted = (departmentCode || "").trim().toUpperCase()
  if (!wanted) return []

  const childrenByParent = new Map<string, UnitResponse[]>()
  for (const unit of units) {
    if (!unit.parentPath) continue
    const siblings = childrenByParent.get(unit.parentPath)
    if (siblings) siblings.push(unit)
    else childrenByParent.set(unit.parentPath, [unit])
  }

  const collected: UnitResponse[] = []
  const walk = (unit: UnitResponse) => {
    collected.push(unit)
    for (const child of childrenByParent.get(unit.path) ?? []) walk(child)
  }

  for (const root of units) {
    if (!root.parentPath && root.departmentCode === wanted) walk(root)
  }

  return collected.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }))
}

/** Nombre de niveaux d'un chemin d'unité : "1" -> 1, "1.1.1" -> 3. */
export function unitIndent(path: string): number {
  return path.split(".").length
}

/** Champs indexés pour la recherche d'unités, du plus au moins pertinent. */
const UNIT_SEARCH_KEYS = [
  { name: "name", weight: 0.45 },
  { name: "path", weight: 0.25 },
  { name: "departmentName", weight: 0.2 },
  { name: "description", weight: 0.1 },
]

export interface UnitSearchResult {
  /**
   * Chemins qui correspondent, Ancêtres compris.
   *
   * L'arbre garde ses ancêtres pour que « 1.1.2 » reste lisible sous « 1.1 » :
   * sans eux, le résultat flottait sans sa branche et l'utilisateur perdait la
   * position dans l'organigramme.
   */
  paths: Set<string>
  /** Nombre d'unités réellement trouvées, ancêtres exclus. */
  count: number
}

/**
 * Unités correspondant à la recherche.
 *
 * `departmentName` est indexé avec le nom du département : chercher « quality »
 * ou « inbound » doit ramener les unités de cette branche, et non celles dont
 * le nom contient ce mot.
 */
export function useUnitSearch(
  units: UnitResponse[],
  departments: DepartmentResponse[],
  query: string,
): UnitSearchResult {
  const departmentNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of departments) map.set(department.id, department.name)
    return map
  }, [departments])

  const searchable = useMemo(
    () =>
      units.map((unit) => ({
        item: unit,
        name: unit.name,
        path: unit.path,
        description: unit.description,
        departmentName:
          `${unit.departmentCode ?? ""} ${departmentNames.get(unit.departmentCode ?? "") ?? ""}`.trim(),
      })),
    [departmentNames, units],
  )

  const filter = useMemo(() => createFuzzyFilter(searchable, UNIT_SEARCH_KEYS), [searchable])

  return useMemo(() => {
    if (!query.trim()) return { paths: new Set<string>(), count: 0 }

    const hits = filter(query)
    const paths = new Set<string>()

    for (const entry of hits) {
      paths.add(entry.item.path)

      // Les ancêtres sont ajoutés au contexte mais ne comptent pas comme
      // résultat : ils servent seulement à rendre le résultat lisible.
      const parts = entry.item.path.split(".")
      parts.pop()
      while (parts.length > 0) {
        paths.add(parts.join("."))
        parts.pop()
      }
    }

    return { paths, count: hits.length }
  }, [filter, query])
}

export function useUnits() {
  const [tree, setTree] = useState<Unit[]>([])
  const [units, setUnits] = useState<UnitResponse[]>([])
  const [departments, setDepartments] = useState<DepartmentResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = requireToken()
      const [payload, deps] = await Promise.all([
        unitApi.list(token),
        companyApi.listDepartments(token),
      ])
      setUnits(payload.units)
      setTree(buildUnitTree(payload.units))
      setDepartments(deps)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the unit tree.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createUnit = useCallback(
    async (input: {
      name: string
      parentPath: string | null
      departmentCode: string | null
      description: string
    }) => {
      const created = await unitApi.create(requireToken(), input)
      await refresh()
      return created
    },
    [refresh],
  )

  const updateUnit = useCallback(
    async (
      path: string,
      input: { name?: string; description?: string; active?: boolean; departmentCode?: string | null },
    ) => {
      const updated = await unitApi.update(requireToken(), path, input)
      await refresh()
      return updated
    },
    [refresh],
  )

  const deleteUnit = useCallback(
    async (path: string) => {
      const result = await unitApi.remove(requireToken(), path)
      await refresh()
      return result
    },
    [refresh],
  )

  return {
    tree,
    units,
    departments,
    loading,
    error,
    refresh,
    createUnit,
    updateUnit,
    deleteUnit,
  }
}
