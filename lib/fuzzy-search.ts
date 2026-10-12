"use client"

import { useMemo } from "react"
import Fuse from "fuse.js"

/**
 * Recherche floue partagée par les annuaires de l'application.
 *
 * Un `includes` exige la chaîne exacte : taper « manufact » ne trouve pas
 * « Manufacturing », alors que c'est la saisie naturelle. Fuse.js tolère les
 * fautes de frappe, les préfixes tronqués et la distance de frappe, ce qui
 * compte d'autant plus que la saisie peut venir du micro.
 *
 * Le classement procède en deux temps. La sous-chaîne est testée d'abord car
 * elle est sans surprise : taper « DEPT-002 » ou « transport » ne doit
 * ramener que ce que l'utilisateur voit dans la liste. Le classement flou ne
 * sert qu'ensuite, pour les fautes de frappe et les préfixes tronqués. Lui
 * seul serait trop permissif — il rapproche « DEPT-002 » des deux autres
 * départements « Logistics », puisque tous leurs noms se ressemblent.
 */

/**
 * Seuil de pertinence du classement flou.
 *
 * Il ne sert qu'au repli : la sous-chaîne est testée d'abord, donc ce seuil
 * ne décide que des cas que la frappe et la dictée ne couvrent pas — fautes de
 * frappe, surtout. Un seuil bas rend ces fautes trouvables sans ramener, sur une
 * saisie exacte, des éléments sans rapport.
 */
const THRESHOLD = 0.4

/** Champs indexés, du plus au moins pertinent. */
const DEPARTMENT_KEYS = [
  { name: "name", weight: 0.5 },
  { name: "id", weight: 0.3 },
  { name: "units", weight: 0.15 },
  { name: "description", weight: 0.05 },
]

/** Nom de champ sous lequel Fuse.js lit la valeur à comparer. */
export type FuzzyKey = { name: string; weight?: number }

/**
 * Construit un filtre réutilisable sur une collection.
 *
 * L'index et l'objet Fuse sont créés une fois pour l'ensemble des requêtes :
 * une frappe au clavier ou une phrase dictée ne fait ensuite que classer.
 * C'est aussi ce qui permet de conserver le contexte d'une saisie sans
 * reconstruire l'index à chaque frappe.
 */
export function createFuzzyFilter<T extends Record<string, unknown>>(
  items: T[],
  keys: readonly FuzzyKey[],
  threshold = THRESHOLD,
): (query: string) => T[] {
  // Le texte aplati sert au test de sous-chaîne, qui doit ignorer la casse et
  // porter sur tous les champs d'un coup.
  const haystacks = items.map((item) =>
    keys
      .map((key) => String(item[key.name] ?? ""))
      .join(" ")
      .toLowerCase(),
  )

  const fuse = new Fuse(items, {
    keys: keys as FuseOptionKey<T>[],
    includeScore: true,
    ignoreLocation: true,
    threshold,
    minMatchCharLength: 2,
  })

  return (query: string) => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return items

    const exact = items.filter((_, index) => haystacks[index].includes(trimmed))
    if (exact.length > 0) return exact

    return fuse.search(trimmed).map((match) => match.item)
  }
}

/** Forme des clés attendue par le constructeur de Fuse.js. */
type FuseOptionKey<T> = { name: keyof T & string; weight?: number }

export interface SearchableDepartment {
  id: string
  name: string
  description: string
  /**
   * Unités portées par le département. Optionnel comme dans le modèle : un
   * département nouvellement créé n'en a aucune.
   */
  rootUnits?: { path: string; name: string }[]
}

/**
 * Departments correspondant à la requête, dans l'ordre de pertinence.
 *
 * La liste complète est renvoyée quand la requête est vide : le champ sert
 * alors seulement à trier visuellement, jamais à masquer des données.
 */
export function useDepartmentSearch<T extends SearchableDepartment>(
  departments: T[],
  query: string,
): T[] {
  // Les unités sont aplaties une fois par changement de l'annuaire, pas à
  // chaque frappe.
  const searchable = useMemo(
    () =>
      departments.map((department) => ({
        item: department,
        id: department.id,
        name: department.name,
        description: department.description,
        units: (department.rootUnits ?? []).flatMap((unit) => [unit.path, unit.name]).join(" "),
      })),
    [departments],
  )

  const filter = useMemo(
    () => createFuzzyFilter(searchable, DEPARTMENT_KEYS),
    [searchable],
  )

  return useMemo(() => filter(query).map((entry) => entry.item), [filter, query])
}

/**
 * Champs d'un compte, à plat pour la recherche.
 *
 * Les libellés de rôle et de motif d'absence sont inclus sous forme de texte :
 * chercher « sick » ou « vacation » doit ramener l'indisponible, sans quoi il
 * faudrait connaître le code interne du motif.
 */
const USER_KEYS = [
  { name: "name", weight: 0.4 },
  { name: "email", weight: 0.25 },
  { name: "roles", weight: 0.15 },
  { name: "department", weight: 0.1 },
  { name: "unit", weight: 0.05 },
  { name: "phone", weight: 0.03 },
  { name: "availability", weight: 0.02 },
]

/**
 * Comptes correspondant à la requête, dans l'ordre de pertinence.
 *
 * Même contrat que `useDepartmentSearch`, et pour la même raison : la liste
 * complète est renvoyée quand la requête est vide, le champ sert à retrouver
 * quelqu'un, jamais à faire disparaître des comptes de l'annuaire.
 */
export function useUserSearch<T>(
  users: T[],
  query: string,
  toSearchable: (user: T) => UserSearchFields,
): T[] {
  // Les champs de recherche sont aplatis une fois par changement d'annuaire,
  // pas à chaque frappe.
  const searchable = useMemo(
    () => users.map((user) => ({ item: user, ...toSearchable(user) }) as SearchableUser<T>),
    [users, toSearchable],
  )

  const filter = useMemo(() => createFuzzyFilter(searchable, USER_KEYS), [searchable])

  return useMemo(() => filter(query).map((entry) => entry.item), [filter, query])
}

/** Champs sur lesquels porte la recherche d'un compte. */
export interface UserSearchFields {
  name: string
  email: string
  roles: string
  department: string
  unit: string
  phone: string
  availability: string
}

/**
 * Compte aplati pour la recherche.
 *
 * L'indexation par chaîne est ce que réclame le constructeur de filtre, dont la
 * contrainte est `Record<string, unknown>` ; sans elle, TypeScript élargit
 * `item` à `unknown` et le résultat cesse d'être une liste de comptes.
 */
type SearchableUser<T> = UserSearchFields & { [key: string]: unknown; item: T }