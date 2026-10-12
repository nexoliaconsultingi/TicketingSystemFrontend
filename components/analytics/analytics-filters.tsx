"use client"

import * as React from "react"
import { Filter, RotateCcw, X } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { STATUS_FILTER_OPTIONS, type AnalyticsFilterOptions } from "@/lib/analytics/source"
import { DEFAULT_FILTERS, PRIORITIES, RANGE_OPTIONS, type TicketFilters } from "@/lib/analytics/types"

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_FILTER_OPTIONS.map((entry) => [entry.key, entry.label]),
)

/**
 * Barre de filtres du tableau de bord.
 *
 * Chaque dimension est multi-sélection : une direction raisonne par
 * croisement (« les P1 et P2 de la Finance sur 30 jours »), pas une case à la
 * fois. Une liste vide vaut « pas de filtre » — l'absence de puce se lit
 * immédiatement, alors qu'un « All » à cocher se distingue mal d'une vraie
 * sélection.
 */

interface DimensionProps {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
  /** Libellé d'affichage par clé, quand la clé n'est pas lisible telle quelle. */
  labels?: Readonly<Record<string, string>>
}

function MultiSelect({ label, options, value, onChange, labels }: DimensionProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((entry) => entry !== option) : [...value, option])
  }

  const display = (option: string) => labels?.[option] ?? option
  const summary = value.length === 0 ? "All" : value.length === 1 ? display(value[0]) : `${value.length} selected`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-2.5 text-sm transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          value.length > 0 ? "border-[#2f80ed] text-[#183b56]" : "border-input text-slate-600",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-xs text-slate-400">{label}</span>
          <span className="truncate font-medium">{summary}</span>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-30 mt-1 max-h-64 w-full min-w-52 overflow-auto rounded-lg border border-[#e5eaf2] bg-white p-1 shadow-lg"
        >
          {options.map((option) => {
            const checked = value.includes(option)
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  checked ? "bg-[#eef4fd] font-medium text-[#183b56]" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border text-[10px] text-white",
                    checked ? "border-[#2f80ed] bg-[#2f80ed]" : "border-slate-300",
                  )}
                  aria-hidden
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="truncate">{display(option)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AnalyticsFilters({
  filters,
  options,
  onChange,
  className,
}: {
  filters: TicketFilters
  options: AnalyticsFilterOptions
  onChange: (next: TicketFilters) => void
  className?: string
}) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const chips = (
    Object.keys(filters) as (keyof TicketFilters)[]
  ).flatMap((key) =>
    key === "range" ? [] : filters[key].map((entry) => ({ key, entry })),
  )
  const isDirty =
    filters.range !== DEFAULT_FILTERS.range || chips.length > 0

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#183b56]">
          <Filter className="size-4" aria-hidden />
          Filters
        </h2>
        {isDirty && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500" onClick={() => onChange(DEFAULT_FILTERS)}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Period
          <select
            value={filters.range}
            onChange={(event) => set("range", event.target.value as TicketFilters["range"])}
            className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm text-[#183b56] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <MultiSelect label="Dept" options={options.departments} value={filters.department} onChange={(next) => set("department", next)} />
        <MultiSelect label="Priority" options={PRIORITIES.map((entry) => entry.short)} value={filters.priority} onChange={(next) => set("priority", next)} />
        <MultiSelect label="Category" options={options.categories} value={filters.category} onChange={(next) => set("category", next)} />
        <MultiSelect label="Service" options={options.services} value={filters.service} onChange={(next) => set("service", next)} />
        <MultiSelect
          label="Status"
          options={STATUS_FILTER_OPTIONS.map((entry) => entry.key)}
          labels={STATUS_LABELS}
          value={filters.status}
          onChange={(next) => set("status", next)}
        />
        <MultiSelect label="Team" options={options.teams} value={filters.team} onChange={(next) => set("team", next)} />
        <MultiSelect label="Agent" options={options.agents} value={filters.agent} onChange={(next) => set("agent", next)} />
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map(({ key, entry }) => (
            <li key={`${key}-${entry}`}>
              <button
                type="button"
                onClick={() => set(key, filters[key].filter((value) => value !== entry))}
                className="flex items-center gap-1 rounded-full bg-[#eef4fd] px-2.5 py-1 text-xs font-medium text-[#183b56] hover:bg-[#dbe8fb]"
              >
{key === "status" ? STATUS_LABELS[entry] ?? entry : entry}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove filter {entry}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
