"use client"

import { useEffect, useState, Suspense } from "react"
import { AlertOctagon, AlertTriangle, CheckCircle2, Loader2, Power } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITY_CLASSES,
  TICKET_PRIORITY_LABELS,
  formatSlaMinutes,
  slaApi,
  type SlaPolicy,
} from "@/lib/api"

/**
 * Politique SLA, en lecture.
 *
 * Chaque badge porté par les listes de tickets découle de ces quatre lignes :
 * cet écran les explique, sans permettre de les modifier — régler les délais
 * est une décision d'administration, la hiérarchie en est informée, pas juge
 * de paix.
 */
export default function SlaViewPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <SlaView />
      </Suspense>
    </AuthGuard>
  )
}

function SlaView() {
  const [policy, setPolicy] = useState<SlaPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const token = getToken()
      if (!token) return
      try {
        setPolicy(await slaApi.get(token))
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Unable to load the SLA policy.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <DashboardShell
      title="SLA response deadlines"
      subtitle="The deadlines behind the badges you see on tickets."
    >
      <div className="mx-auto w-full max-w-3xl">
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-[13px]">Loading policy…</span>
          </div>
        ) : !policy || !policy.enabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Power className="size-4 text-slate-400" />
                No active SLA policy
              </CardTitle>
              <CardDescription>
                No deadline is currently enforced: tickets waiting for a first review carry no SLA
                badge.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Response deadlines</CardTitle>
                <CardDescription>
                  Counted from the moment a ticket is declared. The clock stops as soon as it is
                  taken for review (Being reviewed): after that, the answer has already been given.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {policy.rules.map((rule) => (
                  <div
                    key={rule.priority}
                    className="flex items-center gap-3 rounded-lg border border-[#edf0f5] px-3 py-2.5"
                  >
                    <Badge variant="outline" className={TICKET_PRIORITY_CLASSES[rule.priority]}>
                      {TICKET_PRIORITY_LABELS[rule.priority]}
                    </Badge>
                    <p className="text-[13px] text-slate-500">
                      Alert after{" "}
                      <span className="font-medium text-[#183b56]">
                        {formatSlaMinutes(rule.warningMinutes)}
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      Respond within{" "}
                      <span className="font-medium text-[#183b56]">
                        {formatSlaMinutes(rule.responseMinutes)}
                      </span>
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>How the countdown works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <p className="flex items-start gap-2.5 text-[13px] leading-6 text-slate-600">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong className="font-medium text-[#183b56]">On time:</strong> the normal time
                    — the response delay is nowhere near its end, the badge stays green.
                  </span>
                </p>
                <p className="flex items-start gap-2.5 text-[13px] leading-6 text-slate-600">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>
                    <strong className="font-medium text-[#183b56]">At alert:</strong> the critical
                    time has begun — the ticket detail shows exactly how much time is left to answer
                    before the delay is missed.
                  </span>
                </p>
                <p className="flex items-start gap-2.5 text-[13px] leading-6 text-slate-600">
                  <AlertOctagon className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <span>
                    <strong className="font-medium text-[#183b56]">Breached:</strong> the response
                    delay has passed without an answer. The countdown flips to show by how much the
                    ticket is overdue.
                  </span>
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  )
}