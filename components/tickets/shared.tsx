import { AlertTriangle, CheckCircle2, CircleDot, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { activityLabel, statusLabel, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/tickets/types"
import type { ManagedTicket, TicketPriority, TicketStatus } from "@/lib/tickets/types"

const STATUS_CLASS: Record<TicketStatus, string> = {
  pending_dispatch: "border-amber-200 bg-amber-50 text-amber-700",
  assigned: "border-[#1aa6a6]/30 bg-[#edf8f8] text-[#147a7a]",
  in_progress: "border-[#1aa6a6]/30 bg-[#edf8f8] text-[#147a7a]",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-[#e5eaf2] bg-slate-50 text-slate-500",
}

const STATUS_ICON: Record<TicketStatus, typeof Clock> = {
  pending_dispatch: Clock,
  assigned: CircleDot,
  in_progress: CircleDot,
  resolved: CheckCircle2,
  closed: CheckCircle2,
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      <Icon className="size-3" />
      {statusLabel(status)}
    </Badge>
  )
}

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  P1: "border-red-200 bg-red-50 text-red-700",
  P2: "border-orange-200 bg-orange-50 text-orange-700",
  P3: "border-[#e5eaf2] bg-slate-50 text-slate-600",
  P4: "border-[#e5eaf2] bg-slate-50 text-slate-400",
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${PRIORITY_CLASS[priority]}`}>
      {TICKET_PRIORITIES.find((entry) => entry.key === priority)?.label ?? priority}
    </Badge>
  )
}

export function ActivityBadge({ activity }: { activity: ManagedTicket["activity"] }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[#f7f9fc] px-2 py-0.5 text-[11px] font-medium text-[#183b56] ring-1 ring-[#e5eaf2] ring-inset">
      {activityLabel(activity)}
    </span>
  )
}

/** Bloc d'alerte rouge : refus d'attribution, erreur de saisie. */
export function BlockingNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EmptyNotice({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#e5eaf2] bg-[#f7f9fc] px-4 py-6 text-center">
      <p className="text-[13px] font-medium text-[#183b56]">{title}</p>
      <p className="mt-1 text-[13px] text-slate-500">{hint}</p>
    </div>
  )
}

/** Tuile de statistique, alignée sur celles des pages d'administration. */
export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number
  tone?: "default" | "amber" | "teal"
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "teal"
        ? "text-[#147a7a]"
        : "text-[#183b56]"

  return (
    <div className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

export function formatTicketDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function relativeAge(value: string): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return "—"
  const hours = Math.floor((Date.now() - then) / 3600000)
  if (hours < 1) return "less than an hour ago"
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? "" : "s"} ago`
}

export { TICKET_STATUSES }
