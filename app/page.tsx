'use client'

import { useMemo } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Headphones,
  ShieldCheck,
  Ticket,
  Users,
  Wrench,
  Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AuthGuard } from '@/components/auth/auth-guard'
import { DashboardShell, useDashboardToast } from '@/components/layout/dashboard-shell'
import { MetricsCard } from '@/components/dashboard/metrics-card'
import { TicketQueue } from '@/components/dashboard/ticket-queue'
import { ServiceCatalog } from '@/components/dashboard/service-catalog'
import { SLAStatus } from '@/components/dashboard/sla-status'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { EmployeeDashboard } from '@/components/dashboard/employee-dashboard'
import { useSessionUser } from '@/lib/use-session'

const tickets = [
  { id: '1', number: 'INC-10482', subject: 'Network outage — Tunis site', priority: 'P1' as const, service: 'Infrastructure', requester: 'Nadia Ben Ali', waitTime: '18 min ago', slaStatus: 'at-risk' as const },
  { id: '2', number: 'REQ-10481', subject: 'SAP access for new hire', priority: 'P2' as const, service: 'Access & Identity', requester: 'Karim Trabelsi', waitTime: '1 h 24 min ago', slaStatus: 'normal' as const },
  { id: '3', number: 'INC-10477', subject: 'CRM Europe sync failure', priority: 'P2' as const, service: 'Business applications', requester: 'Sophie Martin', waitTime: '2 h 08 min ago', slaStatus: 'breached' as const },
  { id: '4', number: 'REQ-10465', subject: 'Workstation request', priority: 'P3' as const, service: 'Equipment', requester: 'Omar Haddad', waitTime: '3 h 42 min ago', slaStatus: 'normal' as const },
]

const services = [
  { id: 'it', name: 'IT Support', description: 'Technical assistance', icon: <Headphones className="size-5" />, tickets: 86, team: '12 agents online', status: 'active' as const },
  { id: 'hr', name: 'HR Services', description: 'Employee requests', icon: <Users className="size-5" />, tickets: 34, team: '6 agents online', status: 'active' as const },
  { id: 'facilities', name: 'Facilities', description: 'Premises & maintenance', icon: <Building2 className="size-5" />, tickets: 21, team: '4 agents online', status: 'active' as const },
  { id: 'security', name: 'Security', description: 'Incidents & access', icon: <ShieldCheck className="size-5" />, tickets: 12, team: '3 agents online', status: 'active' as const },
]

const activities = [
  { id: '1', user: 'Leïla Mansour', userInitials: 'LM', action: 'resolved', details: 'INC-10472 — Singapore VPN access', timestamp: '4 min ago', type: 'resolution' as const },
  { id: '2', user: 'Thomas Bernard', userInitials: 'TB', action: 'picked up', details: 'REQ-10480 — Vendor account creation', timestamp: '12 min ago', type: 'assignment' as const },
  { id: '3', user: 'System', userInitials: 'SY', action: 'escalated', details: 'INC-10477 to the Service Manager', timestamp: '18 min ago', type: 'escalation' as const },
  { id: '4', user: 'Maya Khelifi', userInitials: 'MK', action: 'added a comment', details: 'REQ-10465 — Workstation', timestamp: '26 min ago', type: 'comment' as const },
]

export default function Home() {
  return (
    <AuthGuard>
      <HomeForRole />
    </AuthGuard>
  )
}

/**
 * Aiguille vers l'accueil correspondant au rôle.
 *
 * `useSessionUser` ne lit que le cache, qui est vide au premier rendu : la
 * session d'administration est donc affichée dans tous les cas. L'écran
 * employé ne contient aucune donnée sensible, l'inverse serait plus grave.
 */
function HomeForRole() {
  const user = useSessionUser()

  if (user?.access?.includes("employee") && !user.access.includes("admin") && !user.access.includes("manager")) {
    return <EmployeeDashboard user={user} />
  }

  return <Dashboard />
}

function Dashboard() {
  const user = useSessionUser()
  const userFirstName = user?.name?.split(' ')[0] ?? 'Amine'
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [],
  )

  return (
    <DashboardShell
      breadcrumb="Dashboard"
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Hello {userFirstName}, <span className="text-[#1aa6a6]">here is your activity.</span>
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          {today} <span className="mx-2 text-slate-300">•</span> Organisation-wide overview
        </p>
      }
      actions={
        <Badge
          variant="outline"
          className="gap-1.5 border-[#cde6e6] bg-[#f2fbfb] px-3 py-1.5 text-[#147878]"
        >
          <span className="size-1.5 rounded-full bg-[#1aa6a6]" />
          All systems operational
        </Badge>
      }
    >
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
        aria-label="Key metrics"
      >
        <MetricsCard label="Open tickets" value="248" metric="tickets" trend="up" trendValue="12.4% vs. last month" icon={<Ticket className="size-5" />} />
        <MetricsCard label="SLA at risk" value="18" metric="tickets" trend="down" trendValue="4.2% this week" icon={<Clock3 className="size-5" />} variant="warning" />
        <MetricsCard label="SLA compliance" value="96.8" metric="%" trend="up" trendValue="2.1% this month" icon={<CheckCircle2 className="size-5" />} variant="success" />
        <MetricsCard label="Mean time to resolve" value="4h 12" metric="hours" trend="down" trendValue="18 min vs. previous period" icon={<Activity className="size-5" />} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <TicketQueue tickets={tickets} maxHeight />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
          <SLAStatus
            metrics={[
              { name: 'P1 resolution — Critical', compliance: 97, target: 100, status: 'healthy' },
              { name: 'First response', compliance: 94, target: 100, status: 'healthy' },
              { name: 'P2 resolution — High', compliance: 82, target: 100, status: 'warning' },
            ]}
          />
          <div className="rounded-xl bg-[#183b56] p-5 text-white shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#a9dcdc]">
                  Control centre
                </p>
                <h2 className="mt-2 text-lg font-semibold">Everything looks under control</h2>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  No critical incident detected in the last 12 hours.
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                <ShieldCheck className="size-5 text-[#80d7d2]" />
              </div>
            </div>
            <Button
              className="mt-4 w-full border border-white/15 bg-white/10 text-white hover:bg-white/20"
            >
              View health report
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <ServiceCatalog services={services} />
        <ActivityFeed activities={activities} maxHeight />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <ShortcutCard
          icon={<BarChart3 className="size-5" />}
          iconClassName="bg-[#edf8f8] text-[#1aa6a6]"
          title="Custom reports"
          description="Analyse performance by service, team or region."
          message="Opening reports view"
        />
        <ShortcutCard
          icon={<BookOpen className="size-5" />}
          iconClassName="bg-[#f1effb] text-[#7868b8]"
          title="Knowledge base"
          description="418 active articles to speed up resolution."
          message="Opening knowledge base"
        />
        <ShortcutCard
          icon={<Wrench className="size-5" />}
          iconClassName="bg-[#fff5e8] text-[#d7953e]"
          title="Automations"
          description="27 active rules to route and escalate automatically."
          message="Opening workflow builder"
        />
      </div>
    </DashboardShell>
  )
}

function ShortcutCard({
  icon,
  iconClassName,
  title,
  description,
  message,
}: {
  icon: React.ReactNode
  iconClassName: string
  title: string
  description: string
  message: string
}) {
  const notify = useDashboardToast()

  return (
    <button
      className="group rounded-xl border border-[#e4eaf1] bg-white p-4 text-left transition-all hover:border-[#a8d9d8] hover:shadow-sm"
      onClick={() => notify(message)}
    >
      <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${iconClassName}`}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-[#183b56]">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </button>
  )
}