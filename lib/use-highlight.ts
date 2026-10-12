"use client"

import { useSearchParams } from "next/navigation"

/**
 * Cible de la recherche globale de l'en-tête.
 *
 * La recherche pointe sur un élément précis, pas seulement sur la page qui le
 * contient : elle transmet son identifiant dans l'URL (`?highlight=…`). Chaque
 * écran d'arrivée lit ce paramètre et ouvre la fiche de l'élément — ou
 * surligne sa ligne dans l'organigramme — une seule fois à l'arrivée.
 */
export function useHighlightParam(): string | null {
  const searchParams = useSearchParams()
  return searchParams.get("highlight")
}