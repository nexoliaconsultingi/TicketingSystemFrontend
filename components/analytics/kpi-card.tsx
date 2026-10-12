"use client"

import * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, Minus } from "lucide-react"

import { cn } from "cn"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CHART_COLORS } from "@/components/analytics/charts"

/**
 * Vitrine d'un indicateur : valeur, écart par rapport à la période précédente et
 * cible. L'écart n'est pas décoratif — c'est la moitié de la lecture. Sur une
 * ouverture, une hausse du volume est une mauvaise nouvelle ; sur le taux de
 * résolution au premier contact, c'est une bonne nouvelle. `higherIsBetter`
 * porte cette nuance, faute de quoi le tableau de bord signalerait
 * « en hausse » pour un incident.
 */
export interface KpiCardProps {
  title: string
  /** `null` = indicateur non calculable sur cette sélection : affichage « — ». */
  value: number | null
  previous: number | null
  /** Formatage de la valeur (ex. « 12.4 h »). */
  format?: (value: number) => string
  /** Formatage de l'écart, par défaut un pourcentage. */
  formatDelta?: (value: number) => string
  target?: number
  higherIsBetter?: boolean
  /** Seuil d'alerte : la valeur passe en rouge en dessous. */
  alertBelow?: number
  hint?: string
  /** Numéro d'ordre dans la grille, repris tel quel pour l'affichage. */
  index?: number | string
  className?: string
}

export function KpiCard({
  title,
  value,
  previous,
  format = (input) => new Intl.NumberFormat("en-GB").format(input),
  formatDelta = (input) => `${input > 0 ? "+" : ""}${input.toFixed(1)}%`,
  target,
  higherIsBetter = true,
  alertBelow,
  hint,
  index,
  className,
}: KpiCardProps) {
  const delta =
    value === null || previous === null || previous === 0
      ? null
      : ((value - previous) / previous) * 100
  const improving = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0
  const Icon = delta === null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight

  const isAlert = alertBelow !== undefined && value !== null && value < alertBelow

  return (
    <Card className={cn("gap-3 border-[#e5eaf2] shadow-sm", className)}>
      <CardHeader className="gap-1 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            {title}
            {hint && (
              <span title={hint} className="text-slate-300">
                <Info className="size-3.5" aria-hidden />
                <span className="sr-only">{hint}</span>
              </span>
            )}
          </CardTitle>
          {index !== undefined && (
            <span className="text-xs font-medium tabular-nums text-slate-300">{index}</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            isAlert ? "text-[#d64545]" : "text-[#183b56]",
          )}
        >
          {value === null ? "—" : format(value)}
        </p>

        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {delta === null ? (
            <span className="text-slate-400">No comparison available</span>
          ) : (
            <>
              <Icon
                className={cn(
                  "size-3.5",
                  improving ? "text-[#1f9d6b]" : "text-[#d64545]",
                )}
                aria-hidden
              />
              <span className={cn("font-medium tabular-nums", improving ? "text-[#1f9d6b]" : "text-[#d64545]")}>
                {formatDelta(delta)}
              </span>
              <span className="text-slate-400">vs previous period</span>
            </>
          )}
        </div>

        {target !== undefined && value !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <ArrowRight className="size-3" aria-hidden />
            Target {format(target)}
            <span className={cn(value >= target ? "text-[#1f9d6b]" : "text-[#d97706]")}>
              ({value >= target ? "met" : "not met"})
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Bandeau de synthèse du tableau de bord : ce que la direction doit retenir,
 * écrit à partir des chiffres affichés juste au-dessus.
 */
export function ManagementSummary({
  summary,
  className,
}: {
  summary: string[]
  className?: string
}) {
  if (summary.length === 0) return null

  return (
    <section
      aria-labelledby="management-summary"
      className={cn("rounded-xl border border-[#e5eaf2] bg-[#f8fafc] p-5", className)}
    >
      <h2 id="management-summary" className="text-sm font-semibold tracking-wide text-[#183b56] uppercase">
        Management summary
      </h2>
      <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        {summary.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2f80ed]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pastille d'état (healthy / attention / critical), reused par plusieurs blocs. */
export function HealthBadge({ status, children }: { status: string; children?: React.ReactNode }) {
  const tones: Record<string, string> = {
    healthy: "bg-[#e7f6ef] text-[#1f9d6b]",
    attention: "bg-[#fef3e2] text-[#b45309]",
    critical: "bg-[#fdecec] text-[#d64545]",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        tones[status] ?? tones.attention,
      )}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: status === "healthy" ? CHART_COLORS.success : status === "critical" ? CHART_COLORS.danger : CHART_COLORS.warning }}
        aria-hidden
      />
      {children ?? status}
    </span>
  )
}
