"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Ticket as TicketIcon,
} from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { buttonVariants } from "@/components/ui/button"
import { MetricsCard } from "@/components/dashboard/metrics-card"
import { TicketStatusBadge } from "@/components/tickets/ticket-view"
import { formatDuration, useEmployeeKpis } from "@/lib/tickets/employee-kpis"
import { getToken } from "@/lib/auth"
import { ApiError, ticketApi, type AuthUser, type TicketResponse } from "@/lib/api"

/**
 * Accueil d'un employé : ses propres chiffres, et rien d'autre.
 *
 * Volontairement sans les indicateurs d'organisation, de SLA ni le catalogue de
 * services du tableau de bord d'administration : un employé n'a aucun droit de
 * lecture sur l'activité globale de la plateforme, et afficher des chiffres
 * qu'il ne peut pas lire serait un mensonge plus qu'un raccourci.
 */
export function EmployeeDashboard({ user }: { user: AuthUser }) {
  const [tickets, setTickets] = useState<TicketResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Seuls les tickets déclarés par la personne : « received » contient ce qu'elle
  // traite en tant que superviseur, ce qui n'est pas « ses demandes ».
  const kpis = useEmployeeKpis(tickets)

  useEffect(() => {
    let active = true
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    void (async () => {
      try {
        const data = await ticketApi.mine(token)
        if (active) setTickets(data.submitted)
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : "Unable to load your tickets.",
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    // L'annulation évite d'écrire dans l'état après le départ de l'écran.
    return () => {
      active = false
    }
  }, [])

  const firstName = user.name?.split(" ")[0] ?? "there"

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [],
  )

  return (
    <DashboardShell
      breadcrumb="My activity"
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Hello {firstName}, <span className="text-[#1aa6a6]">here are your numbers.</span>
        </h1>
      }
      subtitle={<p className="mt-2 text-sm text-slate-500">{today} · Your requests only</p>}
    >
      {error && (
        <p className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
        aria-label="My key metrics"
      >
        <MetricsCard
          label="My tickets"
          value={loading ? "—" : kpis.total}
          metric="reported"
          icon={<TicketIcon className="size-5" />}
        />
        <MetricsCard
          label="Still open"
          value={loading ? "—" : kpis.open}
          metric="tickets"
          variant={kpis.open > 0 ? "warning" : "default"}
          icon={<Clock3 className="size-5" />}
        />
        <MetricsCard
          label="Resolved"
          value={kpis.resolutionRate === null ? "—" : kpis.resolutionRate}
          metric={kpis.resolutionRate === null ? undefined : "%"}
          trend={kpis.resolutionRate === null ? undefined : "up"}
          trendValue={
            kpis.resolutionRate === null ? undefined : `${kpis.done} of ${kpis.total} closed`
          }
          variant="success"
          icon={<CheckCircle2 className="size-5" />}
        />
        <MetricsCard
          label="Median resolution"
          value={formatDuration(kpis.medianResolutionHours)}
          icon={<Clock3 className="size-5" />}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section className="rounded-xl border border-[#e4eaf1] bg-white p-5 shadow-sm">
          <header className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#183b56]">Open requests</h2>
            <Link
              href="/tickets"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              See all
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </header>

          {kpis.openTickets.length === 0 ? (
            <EmptyState total={kpis.total} />
          ) : (
            <ul className="divide-y divide-[#eef1f6]">
              {kpis.openTickets.slice(0, 5).map((ticket) => (
                <li key={ticket._id} className="flex items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#edf8f8] text-[#1aa6a6]">
                    {ticket.status === "new" ||
                    ticket.status === "being_reviewed" ||
                    ticket.status === "under_analysis" ? (
                      <Loader2 className="size-4" />
                    ) : (
                      <TicketIcon className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#183b56]">{ticket.title}</p>
                    <p className="truncate text-xs text-slate-500">{ticket.reference}</p>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-6">
          <section className="rounded-xl border border-[#e4eaf1] bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#183b56]">What happens next</h2>
            <ol className="mt-3 grid gap-3 text-xs text-slate-600">
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1aa6a6]">1.</span>
                You report a request; the support centre takes it in review.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1aa6a6]">2.</span>
                It is assigned to an available supervisor, who confirms they will take it.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1aa6a6]">3.</span>
                They work on it, then resolve it and describe the result. It is finally closed. You
                can follow it in My Tickets.
              </li>
            </ol>
          </section>

          <section className="rounded-xl bg-[#183b56] p-5 text-white shadow-sm">
            <h2 className="text-base font-semibold">Need something?</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Open a request and track its progress from your dashboard.
            </p>
            <Link
              href="/tickets"
              className={buttonVariants({
                className: "mt-4 w-full border border-white/15 bg-white/10 text-white hover:bg-white/20",
              })}
            >
              <Plus className="mr-1.5 size-4" />
              New request
            </Link>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}

function EmptyState({ total }: { total: number }) {
  return (
    <div className="rounded-lg border border-dashed border-[#dde5ef] px-4 py-10 text-center">
      <TicketIcon className="mx-auto size-6 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-[#183b56]">No open request</p>
      <p className="mt-1 text-xs text-slate-500">
        {total === 0
          ? "You have not reported anything yet."
          : `All ${total} of your tickets are closed.`}
      </p>
    </div>
  )
}