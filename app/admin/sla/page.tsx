"use client"

import { useEffect, useState, Suspense } from "react"
import { CalendarClock, Loader2, Power, Save, TrendingUp } from "lucide-react"

import { AdminGuard } from "@/components/auth/admin-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITY_CLASSES,
  TICKET_PRIORITY_LABELS,
  formatSlaMinutes,
  slaApi,
  type SlaRule,
  type SlaStats,
  type TicketPriority,
} from "@/lib/api"

/**
 * Saisie d'une durée en heures + minutes.
 *
 * La valeur est stockée en minutes (15, 30, 90…) : le serveur et le calcul
 * n'en manipulent qu'une seule unité, et c'est ici qu'on la décompose pour la
 * lecture. Deux champs plutôt qu'un : « 1 h 30 » se lit plus vite en deux
 * cases qu'en « 90 » qui demande un calcul mental.
 */
function DurationInputs({
  label,
  totalMinutes,
  onChange,
}: {
  label: string
  totalMinutes: number
  onChange: (hours: string, minutes: string) => void
}) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
      {label}
      <Input
        type="number"
        min={0}
        max={8760}
        value={hours}
        onChange={(event) => onChange(event.target.value, String(minutes))}
        className="w-16 text-center"
        aria-label={`${label} hours`}
      />
      <span>h</span>
      <Input
        type="number"
        min={0}
        max={59}
        value={minutes}
        onChange={(event) => onChange(String(hours), event.target.value)}
        className="w-14 text-center"
        aria-label={`${label} minutes`}
      />
      <span>min</span>
    </label>
  )
}

/**
 * Une mesure de ponctualité, en gros chiffre et une ligne d'explication.
 *
 * Le ton colore le chiffre sans en faire un feu tricolore : vert quand tout va
 * bien, rouge quand il y a du retard, neutre pour un décompte qui n'appelle
 * aucun jugement.
 */
function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string
  value: string
  hint: string
  tone?: "neutral" | "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-[#183b56]"
  return (
    <div className="rounded-lg border border-[#edf0f5] px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11.5px] leading-4 text-slate-400">{hint}</p>
    </div>
  )
}

/**
 * Réglage de la politique SLA.
 *
 * Une politique globale par priorité : l'administration fixe, pour chaque
 * niveau d'urgence, le délai de réponse promis au déclarant et le seuil
 * d'alerte qui l'annonce. L'horloge court depuis le dépôt du ticket et
 * s'arrête quand le centre de répartition prend le dossier en révision — on
 * mesure le temps d'attente avant la première réponse, rien d'autre.
 */
export default function SlaAdminPage() {
  return (
    <AdminGuard>
      <Suspense fallback={null}>
        <SlaAdmin />
      </Suspense>
    </AdminGuard>
  )
}

function SlaAdmin() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Brouillon local : la politique téléchargée n'est pas modifiée tant que
  // « Save policy » n'est pas confirmé, pour pouvoir tout corriger avant
  // d'engager le balayage.
  const [enabled, setEnabled] = useState(false)
  const [rules, setRules] = useState<SlaRule[]>([])
  const [lastUpdatedByName, setLastUpdatedByName] = useState("")
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  // Mesures de ponctualité : chargées à part de la politique. Une lecture qui
  // échoue ne doit pas masquer le réglage — on préfère la politique sans les
  // chiffres que l'inverse.
  const [stats, setStats] = useState<SlaStats | null>(null)

  const load = async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const policy = await slaApi.get(token)
      setEnabled(policy.enabled)
      setRules(policy.rules)
      setLastUpdatedByName(policy.updatedByName)
      setLastUpdatedAt(policy.updatedAt)
      try {
        setStats(await slaApi.stats(token))
      } catch {
        setStats(null)
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load the SLA policy.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setDuration = (
    priority: TicketPriority,
    field: "responseMinutes" | "warningMinutes",
    hours: string,
    minutes: string,
  ) => {
    const h = Math.max(0, Math.min(8760, Number.parseInt(hours, 10) || 0))
    const m = Math.max(0, Math.min(59, Number.parseInt(minutes, 10) || 0))
    const totalMinutes = Math.max(1, h * 60 + m)
    setRules((current) =>
      current.map((rule) => (rule.priority === priority ? { ...rule, [field]: totalMinutes } : rule))
    )
  }

  // Une alerte postérieure au délai de réponse serait un non-sens : on
  // prévient d'un dépassement déjà consommé. Le bouton d'enregistrement reste
  // donc fermé tant qu'une ligne enfreint la règle d'ordre.
  const invalidRows = rules.filter((rule) => rule.warningMinutes >= rule.responseMinutes)
  const invalid = rules.length !== 4 || invalidRows.length > 0

  const save = async () => {
    const token = getToken()
    if (!token || invalid) return
    setSaving(true)
    setMessage(null)
    try {
      const policy = await slaApi.update(token, { enabled, rules })
      setEnabled(policy.enabled)
      setRules(policy.rules)
      setLastUpdatedByName(policy.updatedByName)
      setLastUpdatedAt(policy.updatedAt)
      setMessage("Policy saved. The watchdog applies it from the next sweep.")
      window.setTimeout(() => setMessage(null), 4000)
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : "Unable to save the SLA policy.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardShell
      title="SLA response deadlines"
      subtitle="Response deadlines per priority, from declaration to first review."
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
        ) : (
          <>
            {stats && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Response punctuality</CardTitle>
                  <CardDescription>
                    All tickets, all time. Punctuality only judges replies already given; the queue
                    below counts what is still waiting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="On-time rate"
                    value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`}
                    hint={
                      stats.responded
                        ? `${stats.onTime} of ${stats.responded} replies on time`
                        : "No reply given yet"
                    }
                    tone={stats.onTimeRate === null ? "neutral" : stats.onTimeRate >= 90 ? "good" : "warn"}
                  />
                  <Stat
                    label="Late replies"
                    value={String(stats.late)}
                    hint={
                      stats.late
                        ? `average ${formatSlaMinutes(stats.avgLateMinutes)} past the deadline`
                        : "None past the deadline"
                    }
                    tone={stats.late ? "bad" : "good"}
                  />
                  <Stat
                    label="Awaiting response"
                    value={String(stats.awaiting)}
                    hint={
                      stats.atAlert
                        ? `${stats.atAlert} at alert, deadline approaching`
                        : "All within their deadline"
                    }
                    tone={stats.atAlert ? "warn" : "neutral"}
                  />
                  <Stat
                    label="Overdue now"
                    value={String(stats.overdue)}
                    hint="Still unanswered past the deadline"
                    tone={stats.overdue ? "bad" : "good"}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Policy</CardTitle>
                    <CardDescription>
                      When enabled, every ticket waiting for its first review is measured against
                      these deadlines, and its badge (On time / At alert / Breached) follows the
                      countdown.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant={enabled ? "default" : "outline"}
                    onClick={() => setEnabled((value) => !value)}
                  >
                    <Power className="size-3.5" />
                    {enabled ? "Active" : "Inactive"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.priority}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-[#edf0f5] px-3 py-3"
                  >
                    <Badge variant="outline" className={TICKET_PRIORITY_CLASSES[rule.priority]}>
                      {TICKET_PRIORITY_LABELS[rule.priority]}
                    </Badge>

                    <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                      <DurationInputs
                        label="Alert after"
                        totalMinutes={rule.warningMinutes}
                        onChange={(hours, minutes) =>
                          setDuration(rule.priority, "warningMinutes", hours, minutes)
                        }
                      />

                      <DurationInputs
                        label="Response within"
                        totalMinutes={rule.responseMinutes}
                        onChange={(hours, minutes) =>
                          setDuration(rule.priority, "responseMinutes", hours, minutes)
                        }
                      />
                    </div>

                    {rule.warningMinutes >= rule.responseMinutes && (
                      <p className="w-full basis-full text-[11.5px] text-red-600">
                        The alert threshold must stay below the response delay.
                      </p>
                    )}
                  </div>
                ))}

                <div className="flex items-start gap-2 rounded-lg bg-[#f7f9fc] px-3 py-2.5 text-[12.5px] leading-5 text-slate-500">
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-[#1d6fb8]" />
                  <p>
                    The clock starts when the ticket is declared and stops as soon as it is taken for
                    review (Being reviewed). Past the alert threshold the badge turns amber, past the
                    response delay it turns red and the countdown shows how much time is overdue. No
                    priority change, no automatic move: this is a measure, not an action.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-slate-400">
                  {enabled ? (
                    <>
                      {lastUpdatedByName
                        ? `Updated by ${lastUpdatedByName}`
                        : "Policy active"}
                      {lastUpdatedAt
                        ? ` · ${new Date(lastUpdatedAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </>
                  ) : (
                    "Policy inactive: no badge, no countdown."
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {message && (
                    <span
                      className={`text-[12.5px] ${message.startsWith("Unable") ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {message}
                    </span>
                  )}
                  <Button type="button" onClick={save} disabled={saving || invalid}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Save policy
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <div className="mt-4 flex items-start gap-2 text-[12.5px] text-slate-500">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-[#1d6fb8]" />
              <p>
                The SLA shows up on every ticket waiting for its first review as a badge (On time /
                At alert / Breached) and as a live countdown in the ticket detail — how much time is
                left, or by how much the response is overdue. Taking the ticket for review stops the
                clock.
              </p>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}