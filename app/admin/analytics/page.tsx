"use client"

import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ThumbsUp,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react"

import { cn } from "cn"
import { AdminGuard } from "@/components/auth/admin-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  GaugeChart,
  RankedBars,
  TrendChart,
  priorityColor,
} from "@/components/analytics/charts"
import { AnalyticsFilters } from "@/components/analytics/analytics-filters"
import { HealthBadge, KpiCard, ManagementSummary } from "@/components/analytics/kpi-card"
import { KpiGuide } from "@/components/analytics/kpi-guide"
import { computeSnapshot } from "@/lib/analytics/compute"
import { buildInsights } from "@/lib/analytics/insights"
import { useAnalyticsLiveData } from "@/lib/analytics/use-live-data"
import { DEFAULT_FILTERS, type AnalyticsSnapshot, type TicketFilters } from "@/lib/analytics/types"

const number = new Intl.NumberFormat("en-GB")
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

function hours(value: number) {
  if (value >= 48) return `${(value / 24).toFixed(1)} d`
  return `${value.toFixed(1)} h`
}

function minutes(value: number) {
  return value < 60 ? `${Math.round(value)} min` : `${(value / 60).toFixed(1)} h`
}

function days(value: number) {
  return value >= 2 ? `${Math.round(value)} days` : `${Math.round(value)} day`
}

function age(ticket: { createdAt: number }, now: number) {
  return days((now - ticket.createdAt) / 86400000)
}

function SectionTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#eef4fd] text-[#2f80ed]">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold text-[#183b56]">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function Panel({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("gap-3 border-[#e5eaf2] shadow-sm", className)}>
      {(title || description) && (
        <CardHeader className="px-5 pt-5">
          {title && <CardTitle className="text-sm font-semibold text-[#183b56]">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  )
}

function Analytics() {
  const [filters, setFilters] = React.useState<TicketFilters>(DEFAULT_FILTERS)
  const live = useAnalyticsLiveData()
  const { tickets, options, policy, now, isLoading, isRefreshing, error, lastUpdatedAt, refresh } = live

  const snapshot = React.useMemo(
    () => computeSnapshot(tickets, filters, now),
    [tickets, filters, now],
  )
  const insights = React.useMemo(() => buildInsights(snapshot), [snapshot])

  const { kpis, series, seriesPrevious, backlog, health } = snapshot

  const volumeSeries = series.map((point) => ({
    label: point.label,
    value: point.created,
    comparison: seriesPrevious.find((previous) => previous.label === point.label)?.created ?? null,
  }))

  if (isLoading) {
    return (
      <DashboardShell
        title={<h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">Analytics &amp; Monitoring</h1>}
        subtitle={
          <p className="mt-2 text-sm text-slate-500">
            Executive view of ticket flow, first-response SLA commitments, backlog and user satisfaction.
          </p>
        }
        actions={<KpiGuide />}
      >
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#e5eaf2] bg-white px-4 py-16 text-sm text-slate-500">
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          Loading live ticket activity…
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title={<h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">Analytics &amp; Monitoring</h1>}
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Executive view of ticket flow, first-response SLA commitments, backlog and user satisfaction.
        </p>
      }
      actions={<KpiGuide />}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5eaf2] bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="relative flex size-2" aria-hidden>
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                  error ? "bg-[#d64545]" : "bg-[#1f9d6b]",
                )}
              />
              <span
                className={cn("relative inline-flex size-2 rounded-full", error ? "bg-[#d64545]" : "bg-[#1f9d6b]")}
              />
            </span>
            <span className="font-semibold text-[#183b56]">Live</span>
            <span className="text-slate-500">
              {lastUpdatedAt !== null
                ? `Updated ${time.format(lastUpdatedAt)}`
                : "Waiting for the first read…"}
              {isRefreshing && <span className="ml-2 text-xs text-slate-400">refreshing…</span>}
            </span>
            {policy && (
              <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex" title="Response deadlines come from the active SLA policy.">
                Response SLA
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    policy.enabled ? "bg-[#ecfdf5] text-[#1f9d6b]" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {policy.enabled ? "On" : "Off"}
                </span>
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh} disabled={isRefreshing}>
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#fdecec] bg-[#fefafa] px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-[#b91c1c]">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        )}

        <AnalyticsFilters filters={filters} options={options} onChange={setFilters} />

        <ManagementSummary summary={insights.summary} />

        <section aria-label="Key indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            index="1"
            title="Total tickets"
            hint="Tickets created during the period, compared with the previous period of the same length."
            value={kpis.totalTickets.current}
            previous={kpis.totalTickets.previous}
            higherIsBetter={false}
          />
          <KpiCard
            index="2"
            title="Open backlog"
            hint="Tickets not yet resolved, whatever their creation date."
            value={kpis.openTickets.current}
            previous={kpis.openTickets.previous}
            higherIsBetter={false}
          />
          <KpiCard
            index="3"
            title="SLA compliance"
            hint="Share of tickets whose first response met the promised deadline set by the active policy."
            value={kpis.slaCompliance.current}
            previous={kpis.slaCompliance.previous}
            format={(value) => `${value.toFixed(1)}%`}
            target={92}
            alertBelow={90}
          />
          <KpiCard
            index="4"
            title="SLA breached"
            hint="First responses given after their deadline, plus open tickets already past theirs."
            value={kpis.breached.current}
            previous={kpis.breached.previous}
            higherIsBetter={false}
            alertBelow={1}
          />
          <KpiCard
            index="5"
            title="SLA at risk"
            hint="Open, not yet responded tickets entering the last 40% of their promised response window."
            value={kpis.atRisk.current}
            previous={kpis.atRisk.previous}
            higherIsBetter={false}
          />
          <KpiCard
            index="6"
            title="MTTA"
            hint="Mean time to acknowledge: creation to an agent taking the ticket in charge."
            value={kpis.mtta.current}
            previous={kpis.mtta.previous}
            format={minutes}
          />
          <KpiCard
            index="7"
            title="MTTR"
            hint="Mean time to resolve: creation to resolution, for resolved tickets only."
            value={kpis.mttr.current}
            previous={kpis.mttr.previous}
            format={hours}
          />
          <KpiCard
            index="8"
            title="First contact resolution"
            hint="Share of resolved tickets resolved without being returned to dispatch or reassigned."
            value={kpis.fcr.current}
            previous={kpis.fcr.previous}
            format={(value) => `${value.toFixed(1)}%`}
          />
          <KpiCard
            index="9"
            title="Reopen rate"
            hint="Share of resolved tickets reopened after resolution. No reopen mechanism exists in this system: it reads 0."
            value={kpis.reopenRate.current}
            previous={kpis.reopenRate.previous}
            format={(value) => `${value.toFixed(1)}%`}
            higherIsBetter={false}
          />
          <KpiCard
            index="10"
            title="Return / reassignment rate"
            hint="Share of tickets handed back to dispatch or re-assigned to another supervisor."
            value={kpis.escalationRate.current}
            previous={kpis.escalationRate.previous}
            format={(value) => `${value.toFixed(1)}%`}
            higherIsBetter={false}
          />
          <KpiCard
            index="11"
            title="CSAT"
            hint="Share of positive ratings among users who answered. Non-responses are excluded."
            value={kpis.csat.current}
            previous={kpis.csat.previous}
            format={(value) => `${value.toFixed(1)}%`}
          />
          <KpiCard
            index="12"
            title="Backlog pressure"
            hint="Difference between tickets created and tickets resolved during the period."
            value={backlog.createdInRange - backlog.resolvedInRange}
            previous={0}
            higherIsBetter={false}
            formatDelta={() => `${number.format(backlog.createdInRange - backlog.resolvedInRange)} vs ${number.format(backlog.resolvedInRange)} resolved`}
          />
        </section>

        <Panel>
          <SectionTitle
            icon={TrendingUp}
            title="Volume and backlog trend"
            description="Tickets created against the previous period, with resolution and closure."
          />
          <TrendChart data={volumeSeries} valueLabel="Tickets created" comparisonLabel="Previous period" />
          <div className="mt-4 flex flex-wrap gap-6 border-t border-[#edf0f5] pt-4 text-sm">
            <Legend color={CHART_COLORS.accent} label="Created" value={number.format(backlog.createdInRange)} />
            <Legend color={CHART_COLORS.success} label="Resolved" value={number.format(backlog.resolvedInRange)} />
            <Legend
              color={CHART_COLORS.warning}
              label="Net backlog movement"
              value={`${backlog.createdInRange - backlog.resolvedInRange > 0 ? "+" : ""}${number.format(backlog.createdInRange - backlog.resolvedInRange)}`}
            />
            <Legend color={CHART_COLORS.muted} label="Closed" value={number.format(series.reduce((total, point) => total + point.closed, 0))} />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel
            title="Service health"
            description="Operational verdict derived from the indicators below."
            className="lg:col-span-1"
          >
            <div className="flex items-center gap-3">
              <HealthBadge status={health.status} />
              <span className="text-sm text-slate-500">
                {health.criticalOpen} critical open · {health.atRisk} at risk
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {health.reasons.map((reason) => (
                <li key={reason} className="flex gap-2 text-sm text-slate-600">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#d97706]" aria-hidden />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-[#edf0f5] pt-4">
              <GaugeChart
                value={kpis.slaCompliance.current}
                target={kpis.slaCompliance.target ?? 0}
                label={`SLA compliance vs ${kpis.slaCompliance.target ?? 0}% target`}
              />
            </div>
          </Panel>

          <Panel title="Priority distribution" description="Share of tickets created, by priority." className="lg:col-span-1">
            <DonutChart
              data={snapshot.priorities.map((entry) => ({
                label: `${entry.key} · ${entry.label}`,
                value: entry.count,
                color: priorityColor(entry.key),
              }))}
              total={kpis.totalTickets.current}
              centerLabel="tickets"
            />
          </Panel>

          <Panel
            title="Resolution performance"
            description="Mean time from creation to resolution, by priority. Only tickets already resolved are counted."
            className="lg:col-span-1"
          >
            <ColumnChart
              data={snapshot.mttrByPriority.flatMap((entry) =>
                entry.hours === null
                  ? []
                  : [{ label: entry.key, value: entry.hours, color: priorityColor(entry.key) }],
              )}
              valueLabel="Mean time to resolve by priority, in hours"
              formatValue={hours}
            />
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <SectionTitle
              icon={Layers}
              title="Department performance"
              description="Volume, SLA compliance and resolution time, with the previous period in grey."
            />
            <RankedBars
              data={snapshot.departments.map((department) => ({
                label: department.name,
                value: department.tickets,
                secondary: department.previousTickets,
                color: CHART_COLORS.accent,
              }))}
              secondaryLabel="Previous period"
            />
            <table className="mt-5 w-full text-sm">
              <caption className="sr-only">Department performance detail</caption>
              <thead>
                <tr className="border-b border-[#edf0f5] text-left text-xs text-slate-400">
                  <th scope="col" className="py-2 font-medium">Department</th>
                  <th scope="col" className="py-2 text-right font-medium">Open</th>
                  <th scope="col" className="py-2 text-right font-medium">Breached</th>
                  <th scope="col" className="py-2 text-right font-medium">SLA</th>
                  <th scope="col" className="py-2 text-right font-medium">MTTR</th>
                  <th scope="col" className="py-2 text-right font-medium">CSAT</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.departments.map((department) => (
                  <tr key={department.name} className="border-b border-[#f5f7fa] last:border-0">
                    <th scope="row" className="py-2 text-left font-normal text-slate-700">{department.name}</th>
                    <td className="py-2 text-right tabular-nums text-slate-600">{department.open}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{department.breached}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={department.slaCompliance >= 92 ? "text-[#1f9d6b]" : "text-[#d64545]"}>
                        {department.slaCompliance}%
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{hours(department.mttrHours)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {department.csat === null ? "—" : `${department.csat}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel>
            <SectionTitle
              icon={Gauge}
              title="SLA monitoring"
              description="First-response compliance and exposure by priority, against the deadlines set by the active policy."
            />
            <ul className="flex flex-col gap-4">
              {snapshot.slaByPriority.map((entry) => (
                <li key={entry.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-[#183b56]">
                      <span className="size-2 rounded-full" style={{ backgroundColor: priorityColor(entry.key) }} />
                      {entry.key} · {entry.label}
                      <span className="font-normal text-slate-400">target {hours(entry.slaHours)}</span>
                    </span>
                    <span className="tabular-nums text-slate-600">
                      {entry.compliance}%
                      <span className="ml-2 text-xs text-slate-400">
                        {entry.breached} breached · {entry.atRisk} at risk
                      </span>
                    </span>
                  </div>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, entry.compliance)}%`,
                        backgroundColor: entry.compliance >= 92 ? CHART_COLORS.success : CHART_COLORS.danger,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-[#edf0f5] pt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#183b56]">
                <ShieldAlert className="size-4 text-[#d64545]" aria-hidden />
                Closest deadlines
              </h3>
              {snapshot.atRiskTickets.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  No open ticket is approaching its SLA deadline.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {snapshot.atRiskTickets.slice(0, 5).map((ticket) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge variant="outline" className="shrink-0" style={{ color: priorityColor(ticket.priority), borderColor: priorityColor(ticket.priority) }}>
                          {ticket.priority}
                        </Badge>
                        <span className="truncate text-slate-700">{ticket.subject}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {ticket.id} · {age(ticket, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <SectionTitle
              icon={CalendarClock}
              title="Backlog intelligence"
              description="Ageing of unresolved tickets. A backlog hidden under 7 days is a queue; beyond, it is a risk."
            />
            <ul className="flex flex-col gap-2">
              {snapshot.backlogAging.map((bucket) => (
                <li key={bucket.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-slate-600">{bucket.label}</span>
                  <span className="h-6 overflow-hidden rounded bg-slate-100">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${(bucket.count / Math.max(1, ...snapshot.backlogAging.map((entry) => entry.count))) * 100}%`,
                        backgroundColor:
                          bucket.status === "critical"
                            ? CHART_COLORS.danger
                            : bucket.status === "attention"
                              ? CHART_COLORS.warning
                              : CHART_COLORS.success,
                      }}
                    />
                  </span>
                  <span className="tabular-nums font-medium text-[#183b56]">{bucket.count}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-5 flex items-center gap-2 border-t border-[#edf0f5] pt-4 text-sm font-semibold text-[#183b56]">
              <Clock className="size-4 text-slate-400" aria-hidden />
              Oldest unresolved tickets
            </h3>
            {snapshot.oldestTickets.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No unresolved ticket for this selection.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {snapshot.oldestTickets.slice(0, 5).map((ticket) => (
                  <li key={ticket.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0" style={{ color: priorityColor(ticket.priority), borderColor: priorityColor(ticket.priority) }}>
                        {ticket.priority}
                      </Badge>
                      <span className="truncate text-slate-700">{ticket.subject}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {ticket.id} · {age(ticket, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <SectionTitle
              icon={Timer}
              title="Operational quality"
              description="Where the effort is going, and what it costs in rework."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-slate-400">Transfer and return flow</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {snapshot.escalationFlow.map((step) => (
                    <li key={`${step.from}-${step.to}`} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600">{step.from}</span>
                      <ArrowRight className="size-3 text-slate-300" aria-hidden />
                      <span className="text-slate-600">{step.to}</span>
                      <span className="ml-auto font-medium tabular-nums text-[#183b56]">{step.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-medium text-slate-400">Most returned / reassigned units</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {snapshot.topEscalated.slice(0, 5).map((entry) => (
                    <li key={entry.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-600">{entry.name}</span>
                      <span className="font-medium tabular-nums text-[#183b56]">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <h3 className="mt-5 border-t border-[#edf0f5] pt-4 text-xs font-medium text-slate-400">
              Categories with the highest reopen rate
            </h3>
            <RankedBars
              className="mt-2"
              data={snapshot.categories.slice(0, 6).map((category) => ({
                label: category.name,
                value: category.reopenRate,
                color: CHART_COLORS.warning,
              }))}
              formatValue={(value) => `${value.toFixed(1)}%`}
            />
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <SectionTitle
              icon={MessageSquare}
              title="User satisfaction"
              description={`${number.format(snapshot.csatResponses)} ratings collected during the period.`}
            />
            {snapshot.csatResponses === 0 ? (
              <p className="text-sm text-slate-500">No rating collected for this selection.</p>
            ) : (
              <>
                <RankedBars
                  data={snapshot.csatBreakdown.map((entry) => ({
                    label: entry.name,
                    value: entry.positive,
                    color: CHART_COLORS.success,
                  }))}
                  formatValue={(value) => `${value.toFixed(1)}%`}
                />
                <p className="mt-4 border-t border-[#edf0f5] pt-4 text-xs text-slate-500">
                  Share of positive ratings (4–5) per service. Neutral and negative answers are
                  excluded from the percentage, not counted as failures.
                </p>
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle
              icon={Users}
              title="What this means"
              description="Conclusions computed from the figures displayed above."
            />
            <ul className="flex flex-col gap-2">
              {insights.risks.map((insight) => (
                <li key={insight.label} className="flex gap-2 rounded-lg border border-[#fdecec] bg-[#fefafa] p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#d64545]" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-[#183b56]">{insight.label}</p>
                    <p className="text-xs text-slate-600">{insight.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#183b56]">
              <CheckCircle2 className="size-4 text-[#1f9d6b]" aria-hidden />
              What improved
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {insights.positives.map((insight) => (
                <li key={insight.label} className="text-sm text-slate-600">
                  <span className="font-medium text-[#183b56]">{insight.label}</span> — {insight.detail}
                </li>
              ))}
            </ul>

            <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#183b56]">
              <ThumbsUp className="size-4 text-[#2f80ed]" aria-hidden />
              Recommended actions
            </h3>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-sm text-slate-600">
              {insights.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </DashboardShell>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-[#183b56]">{value}</span>
    </span>
  )
}

export default function AnalyticsPage() {
  return (
    <AdminGuard>
      <Analytics />
    </AdminGuard>
  )
}

export type { AnalyticsSnapshot }
