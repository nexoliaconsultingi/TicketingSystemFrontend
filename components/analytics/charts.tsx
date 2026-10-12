"use client"

import * as React from "react"

import { cn } from "cn"

/**
 * Graphiques du module analytique, dessinés en SVG.
 *
 * Aucune bibliothèque de graphiques n'est installée dans ce projet, et en
 * ajouter une pour cinq vues simples aurait coûté plus de poids que les
 * graphiques eux-mêmes. Ces primitives couvrent exactement ce dont le tableau
 * de bord a besoin : aire, barres, anneau, jauge.
 *
 * Elles sont lisibles par un lecteur d'écran : chaque figure porte un `role`
 * et une description, et les données restent disponibles dans le DOM.
 */

export const CHART_COLORS = {
  primary: "#183b56",
  accent: "#2f80ed",
  success: "#1f9d6b",
  warning: "#d97706",
  danger: "#d64545",
  muted: "#94a3b8",
} as const

const PRIORITY_COLORS: Record<string, string> = {
  P1: CHART_COLORS.danger,
  P2: CHART_COLORS.warning,
  P3: CHART_COLORS.accent,
  P4: CHART_COLORS.muted,
}

export function priorityColor(key: string) {
  return PRIORITY_COLORS[key] ?? CHART_COLORS.muted
}

function niceMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return step * magnitude
}

/** Message commun affiché quand une série est vide : jamais de « 0 » trompeur. */
function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-[#e5eaf2] text-sm text-slate-400">
      {label}
    </div>
  )
}

export interface AreaPoint {
  label: string
  value: number
  comparison?: number | null
}

/**
 * Aire evolution + ligne de comparaison période précédente.
 * Les deux séries partagent la même échelle : une échelle séparée ferait
 * front-runner deux périodes identiques.
 */
function TrendChart({
  data,
  height = 220,
  valueLabel,
  comparisonLabel,
  formatValue = (value: number) => String(Math.round(value)),
  className,
}: {
  data: AreaPoint[]
  height?: number
  valueLabel: string
  comparisonLabel?: string
  formatValue?: (value: number) => string
  className?: string
}) {
  const [hover, setHover] = React.useState<number | null>(null)

  if (data.length === 0) return <EmptyState label="No data for this selection" />

  const width = 720
  const padding = { top: 16, right: 12, bottom: 28, left: 44 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const peak = niceMax(
    Math.max(1, ...data.map((point) => Math.max(point.value, point.comparison ?? 0))),
  )
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0
  const toY = (value: number) => padding.top + plotHeight - (value / peak) * plotHeight
  const toX = (index: number) => padding.left + index * stepX

  const line = (accessor: (point: AreaPoint) => number | null | undefined) => {
    const segments: string[] = []
    let drawing = false
    data.forEach((point, index) => {
      const value = accessor(point)
      if (value === null || value === undefined) {
        drawing = false
        return
      }
      segments.push(`${drawing ? "L" : "M"}${toX(index).toFixed(1)} ${toY(value).toFixed(1)}`)
      drawing = true
    })
    return segments.join(" ")
  }

  const area = `${line((point) => point.value)} L${toX(data.length - 1).toFixed(1)} ${(
    padding.top + plotHeight
  ).toFixed(1)} L${toX(0).toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`

  // Un libellé sur deux au-delà de 8 points : sinon les dates se chevauchent.
  const labelStride = data.length > 8 ? Math.ceil(data.length / 8) : 1
  const active = hover === null ? null : data[hover]

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`${valueLabel}${comparisonLabel ? ` compared with ${comparisonLabel}` : ""}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="analytics-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + plotHeight * ratio
          const value = peak * (1 - ratio)
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e5eaf2"
                strokeWidth="1"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                {formatValue(value)}
              </text>
            </g>
          )
        })}

        {data.length > 1 && <path d={area} fill="url(#analytics-area)" />}

        {comparisonLabel && (
          <path
            d={line((point) => point.comparison)}
            fill="none"
            stroke={CHART_COLORS.muted}
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}

        <path d={line((point) => point.value)} fill="none" stroke={CHART_COLORS.accent} strokeWidth="2" />

        {data.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            {index % labelStride === 0 && (
              <text
                x={toX(index)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400 text-[11px]"
              >
                {point.label}
              </text>
            )}
            <rect
              x={toX(index) - stepX / 2}
              y={padding.top}
              width={Math.max(stepX, 1)}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
            {hover === index && (
              <circle cx={toX(index)} cy={toY(point.value)} r="4" fill={CHART_COLORS.accent} />
            )}
          </g>
        ))}
      </svg>

      {active && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-[#e5eaf2] bg-white px-3 py-2 text-xs shadow-sm">
          <p className="font-medium text-[#183b56]">{active.label}</p>
          <p className="text-slate-600">
            {valueLabel}: <span className="font-medium">{formatValue(active.value)}</span>
          </p>
          {active.comparison != null && comparisonLabel && (
            <p className="text-slate-500">
              {comparisonLabel}: {formatValue(active.comparison)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
  color?: string
  secondary?: number | null
}

/** Barres horizontales classées : lisible même avec des libellés longs. */
function RankedBars({
  data,
  formatValue = (value: number) => String(value),
  secondaryLabel,
  className,
}: {
  data: BarDatum[]
  formatValue?: (value: number) => string
  secondaryLabel?: string
  className?: string
}) {
  const peak = niceMax(Math.max(1, ...data.map((datum) => Math.max(datum.value, datum.secondary ?? 0))))

  if (data.length === 0) return <EmptyState label="No data for this selection" />

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {data.map((datum) => (
        <li key={datum.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-600" title={datum.label}>
            {datum.label}
          </span>
          <span className="flex flex-col gap-1">
            <span className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(datum.value / peak) * 100}%`, backgroundColor: datum.color ?? CHART_COLORS.accent }}
              />
            </span>
            {datum.secondary != null && (
              <span className="h-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-slate-300"
                  style={{ width: `${(datum.secondary / peak) * 100}%` }}
                  title={secondaryLabel}
                />
              </span>
            )}
          </span>
          <span className="text-right font-medium tabular-nums text-[#183b56]">{formatValue(datum.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Anneau de répartition : part, libellé et total affichés au centre. */
function DonutChart({
  data,
  total,
  centerLabel,
  size = 180,
  className,
}: {
  data: BarDatum[]
  total: number | null
  centerLabel: string
  size?: number
  className?: string
}) {
  if (data.length === 0 || total === null || total <= 0) {
    return <EmptyState label="No data for this selection" />
  }

  const radius = size / 2 - 12
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-40 shrink-0"
        role="img"
        aria-label={`${centerLabel}: ${total}`}
      >
        <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {data.map((datum) => {
            const share = datum.value / total
            const dash = share * circumference
            const element = (
              <circle
                key={datum.label}
                r={radius}
                fill="none"
                stroke={datum.color ?? CHART_COLORS.accent}
                strokeWidth="16"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return element
          })}
        </g>
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          className="fill-[#183b56] text-2xl font-semibold"
        >
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" className="fill-slate-400 text-[11px]">
          {centerLabel}
        </text>
      </svg>

      <ul className="flex min-w-40 flex-col gap-2 text-sm">
        {data.map((datum) => (
          <li key={datum.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: datum.color ?? CHART_COLORS.accent }}
            />
            <span className="truncate text-slate-600">{datum.label}</span>
            <span className="ml-auto font-medium tabular-nums text-[#183b56]">
              {Math.round((datum.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Jauge d'atteinte d'objectif, avec repère de cible. */
function GaugeChart({
  value,
  target,
  label,
  className,
}: {
  value: number | null
  target: number
  label: string
  className?: string
}) {
  // Sans mesure, la jauge ne doit pas se vider à 0 % : ce serait une
  // traduction graphique d'un échec de performance qui n'a pas eu lieu.
  if (value === null) return <EmptyState label={`No ${label.toLowerCase()} data for this selection`} />

  const clamped = Math.max(0, Math.min(100, value))
  const radius = 54
  const circumference = Math.PI * radius
  const filled = (clamped / 100) * circumference
  const targetX = 100 + (Math.max(0, Math.min(100, target)) / 100) * radius - radius

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <svg viewBox="0 0 200 116" className="h-28 w-full max-w-56" role="img" aria-label={`${label}: ${clamped}%`}>
        <path
          d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
          fill="none"
          stroke={clamped >= target ? CHART_COLORS.success : CHART_COLORS.danger}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
        <line
          x1={targetX}
          y1="88"
          x2={targetX}
          y2="106"
          stroke={CHART_COLORS.primary}
          strokeWidth="2"
          strokeDasharray="3 3"
        />
        <text x="100" y="92" textAnchor="middle" className="fill-[#183b56] text-2xl font-semibold">
          {clamped}%
        </text>
      </svg>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

/** Colonnes verticales pour les profils de durée (MTTA / MTTR par période). */
function ColumnChart({
  data,
  height = 180,
  formatValue = (value: number) => String(Math.round(value)),
  valueLabel,
  className,
}: {
  data: BarDatum[]
  height?: number
  formatValue?: (value: number) => string
  valueLabel: string
  className?: string
}) {
  if (data.length === 0) return <EmptyState label="No data for this selection" />

  const width = 640
  const padding = { top: 16, right: 8, bottom: 30, left: 40 }
  const plotHeight = height - padding.top - padding.bottom
  const peak = niceMax(Math.max(...data.map((datum) => Math.max(datum.value, datum.secondary ?? 0))))
  const slot = (width - padding.left - padding.right) / data.length
  const barWidth = Math.min(46, slot * 0.6)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={valueLabel}
    >
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + plotHeight * ratio
        return (
          <g key={ratio}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5eaf2" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {formatValue(peak * (1 - ratio))}
            </text>
          </g>
        )
      })}

      {data.map((datum, index) => {
        const x = padding.left + slot * index + (slot - barWidth) / 2
        const barHeight = (datum.value / peak) * plotHeight
        return (
          <g key={datum.label}>
            <rect
              x={x}
              y={padding.top + plotHeight - barHeight}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill={datum.color ?? CHART_COLORS.accent}
            />
            {datum.secondary != null && (
              <rect
                x={x + barWidth + 4}
                y={padding.top + plotHeight - (datum.secondary / peak) * plotHeight}
                width={Math.max(barWidth / 2, 6)}
                height={(datum.secondary / peak) * plotHeight}
                rx="3"
                fill="#cbd5e1"
              />
            )}
            <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {datum.label}
            </text>
            <text
              x={x + barWidth / 2}
              y={padding.top + plotHeight - barHeight - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[11px]"
            >
              {formatValue(datum.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export { TrendChart, RankedBars, DonutChart, GaugeChart, ColumnChart, EmptyState }
