"use client"

import * as React from "react"
import { BookOpen, X } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"

/**
 * Glossaire des indicateurs.
 *
 * Un tableau de bord qui affiche « MTTR 1,1 jour » sans dire ce qu'il mesure
 * produit deux mauvaises lectures : soit la direction lit un chiffre qu'elle ne
 * sait pas interpréter, soit elle le prend pour une durée de traitement et
 * ignore l'indicateur. Chaque définition est donc écrite ici, et référencée
 * depuis les cartes via l'icône d'information.
 */
const ENTRIES: { acronym: string; label: string; definition: string }[] = [
  {
    acronym: "Total tickets",
    label: "Volume",
    definition:
      "Tickets created during the selected period. Compared with the immediately preceding period of the same length.",
  },
  {
    acronym: "Open backlog",
    label: "Backlog",
    definition:
      "Tickets not yet resolved at this instant, whatever their creation date. A 7-day view does not hide tickets opened earlier.",
  },
  {
    acronym: "SLA compliance",
    label: "Réponse dans les délais",
    definition:
      "Share of tickets whose first response to the requester met the promised deadline (set by the active policy per priority). Only tickets with a recorded response are counted.",
  },
  {
    acronym: "MTTA",
    label: "Mean time to acknowledge",
    definition:
      "Average delay between a ticket being created and an agent taking it in charge.",
  },
  {
    acronym: "MTTR",
    label: "Mean time to resolve",
    definition:
      "Average delay between creation and resolution. Resolutions already recorded; it says nothing about tickets still open.",
  },
  {
    acronym: "FCR",
    label: "First contact resolution",
    definition:
      "Share of resolved tickets that were resolved without being returned to dispatch or re-assigned to another supervisor.",
  },
  {
    acronym: "Reopen rate",
    label: "Rate of reopens",
    definition:
      "Share of resolved tickets that were reopened after being resolved. A high rate points to premature diagnoses.",
  },
  {
    acronym: "Escalation rate",
    label: "Rate of transfers & returns",
    definition: "Share of tickets handed back to the dispatch centre or re-assigned to another supervisor.",
  },
  {
    acronym: "CSAT",
    label: "User satisfaction",
    definition:
      "Share of positive ratings (4 or 5 out of 5) among users who answered. Non-responses are excluded, never counted as dissatisfaction.",
  },
  {
    acronym: "At risk",
    label: "Échéance proche",
    definition:
      "Open ticket whose first response deadline is approaching: it has not been replied to yet and is in the last 40% of its promised response window.",
  },
]

export function KpiGuide({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-[#e5eaf2] text-slate-600"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <BookOpen className="size-4" aria-hidden />
        KPI guide
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,26rem)] rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#183b56]">How to read these indicators</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close the KPI guide</span>
            </button>
          </div>
          <dl className="flex flex-col gap-3">
            {ENTRIES.map((entry) => (
              <div key={entry.acronym}>
                <dt className="text-sm font-medium text-[#183b56]">
                  {entry.acronym}
                  <span className="ml-1.5 font-normal text-slate-400">{entry.label}</span>
                </dt>
                <dd className="text-xs text-slate-600">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

export { ENTRIES as KPI_GUIDE_ENTRIES }
