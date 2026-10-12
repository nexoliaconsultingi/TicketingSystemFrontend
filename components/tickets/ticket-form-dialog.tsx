"use client"

import { useMemo, useState } from "react"
import { Loader2, Plus, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useExpertSuggestions } from "@/lib/expertise"
import { respondersFor } from "@/lib/tickets/eligibility"
import type { DemoDepartment } from "@/lib/tickets/store"
import {
  ACTIVITIES,
  TICKET_PRIORITIES,
  type ActivityKey,
  type ResponderRecord,
  type StaffMember,
  type TicketPriority,
} from "@/lib/tickets/types"
import { BlockingNotice, EmptyNotice } from "./shared"

interface TicketFormDialogProps {
  open: boolean
  departments: ReadonlyArray<DemoDepartment>
  staff: StaffMember[]
  responders: ResponderRecord[]
  /** `true` quand l'utilisateur courant est le dispatcher, pas un responsable de zone. */
  isDispatcher: boolean
  onClose: () => void
  onCreate: (input: {
    title: string
    description: string
    activity: ActivityKey
    priority: TicketPriority
    departmentCode: string
    unitPath: string
    unitName: string
    origin: "zone_head" | "dispatcher"
    /** Expert proposé par le référentiel, repris dans l'historique du ticket */
    expertHint: string | null
  }) => void
  saving: boolean
}

interface FormState {
  title: string
  description: string
  activity: ActivityKey
  priority: TicketPriority
  departmentCode: string
  unitPath: string
}

const EMPTY: FormState = {
  title: "",
  description: "",
  activity: ACTIVITIES[0].key,
  priority: "P2",
  departmentCode: "",
  unitPath: "",
}

const TITLE_LIMIT = 120
const DESCRIPTION_LIMIT = 800

export function TicketFormDialog({
  open,
  departments,
  staff,
  responders,
  isDispatcher,
  onClose,
  onCreate,
  saving,
}: TicketFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)

  const department = departments.find((entry) => entry.code === form.departmentCode)
  const zones = department?.zones ?? []
  const unitName = zones.find((zone) => zone.path === form.unitPath)?.name ?? null

  // Aperçu des personnes qui pourront prendre ce ticket : montrer le compteur
  // avant l'enregistrement évite de créer un ticket impossible à répartir.
  const available = useMemo(() => {
    if (!form.departmentCode || form.unitPath === "") return []
    return respondersFor(
      { departmentCode: form.departmentCode, unitPath: form.unitPath },
      form.activity,
      responders,
      staff,
    )
  }, [departments, form.departmentCode, form.unitPath, form.activity, responders, staff])

  // Référentiel experts : la saisie en cours est confrontée aux problèmes
  // déclarés, pour nommer la personne compétente avant même l'enregistrement.
  const suggestions = useExpertSuggestions(
    {
      q: `${form.title} ${form.description}`,
      departmentCode: form.departmentCode,
      unitPath: form.unitPath,
    },
    Boolean(form.departmentCode) && form.unitPath !== "",
  )

  const reset = () => {
    setForm(EMPTY)
    setFormError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = form.title.trim()
    if (title.length === 0) {
      setFormError("A short title is required.")
      return
    }
    if (!form.departmentCode) {
      setFormError("Select the department concerned.")
      return
    }
    if (unitName === null) {
      setFormError("Select the zone concerned: a competency list is held at zone level.")
      return
    }

    setFormError(null)
    const top = suggestions.results[0]
    const hinted = top?.experts[0]
    onCreate({
      title,
      description: form.description.trim(),
      activity: form.activity,
      priority: form.priority,
      departmentCode: form.departmentCode,
      unitPath: form.unitPath,
      unitName,
      origin: isDispatcher ? "dispatcher" : "zone_head",
      expertHint: hinted ? `${top.problem}: ${hinted.name ?? hinted.email} (${top.code})` : null,
    })
  }

  return (
    <Modal
      open={open}
      title="Report a problem"
      description={
        isDispatcher
          ? "The ticket is created and dispatched straight away."
          : "The ticket goes to the dispatcher, who will hand it to the right person."
      }
      onClose={handleClose}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" className="text-slate-500" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="ticket-form"
            disabled={saving}
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create ticket
          </Button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={handleSubmit} className="space-y-5">
        {formError && <BlockingNotice>{formError}</BlockingNotice>}

        <div className="space-y-2">
          <label htmlFor="ticket-title" className="text-[13px] font-medium text-[#183b56]">
            Title
          </label>
          <Input
            id="ticket-title"
            value={form.title}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            className="h-10"
            maxLength={TITLE_LIMIT}
            placeholder="VPN unreachable for the whole floor"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="ticket-description" className="text-[13px] font-medium text-[#183b56]">
              What is happening?
            </label>
            <span className="text-[11px] tabular-nums text-slate-400">
              {form.description.length}/{DESCRIPTION_LIMIT}
            </span>
          </div>
          <Textarea
            id="ticket-description"
            rows={4}
            value={form.description}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            maxLength={DESCRIPTION_LIMIT}
            placeholder="Since when, who is affected, what has already been tried."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="ticket-department" className="text-[13px] font-medium text-[#183b56]">
              Department
            </label>
            <Select
              id="ticket-department"
              value={form.departmentCode}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setForm((current) => ({
                  ...current,
                  departmentCode: event.target.value,
                  unitIndex: "",
                }))
              }
              className="h-10"
            >
              <option value="">Select a department...</option>
              {departments.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ticket-zone" className="text-[13px] font-medium text-[#183b56]">
              Zone
            </label>
              <Select
                id="ticket-zone"
                value={form.unitPath}
                disabled={zones.length === 0}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  setForm((current) => ({ ...current, unitPath: event.target.value }))
                }
                className="h-10"
              >
                <option value="">
                  {zones.length === 0 ? "Select a department first" : "Select a zone..."}
                </option>
                {zones.map((zone) => (
                  <option key={zone.path} value={zone.path}>
                    {zone.path} · {zone.name}
                  </option>
                ))}
              </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="ticket-activity" className="text-[13px] font-medium text-[#183b56]">
              Activity
            </label>
            <Select
              id="ticket-activity"
              value={form.activity}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setForm((current) => ({
                  ...current,
                  activity: event.target.value as ActivityKey,
                }))
              }
              className="h-10"
            >
              {ACTIVITIES.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ticket-priority" className="text-[13px] font-medium text-[#183b56]">
              Priority
            </label>
            <Select
              id="ticket-priority"
              value={form.priority}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as TicketPriority,
                }))
              }
              className="h-10"
            >
              {TICKET_PRIORITIES.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {form.departmentCode && unitName !== null && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[#183b56]">
              Who is competent for this activity in {unitName}?
            </p>
            {available.length === 0 ? (
              <BlockingNotice>
                Nobody is declared competent for this activity in {unitName}. The dispatcher will
                not be able to hand this ticket over. Add someone to the competency list for this
                zone first.
              </BlockingNotice>
            ) : (
              <p className="text-[12px] text-slate-500">
                {available.length} person{available.length === 1 ? "" : "s"}:{" "}
                {available.map((person) => person.name).join(", ")}
              </p>
            )}
          </div>
        )}

        {suggestions.reachable && (suggestions.loading || suggestions.results.length > 0) && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[#183b56]">
              Expert designated for this problem
            </p>
            {suggestions.loading && suggestions.results.length === 0 ? (
              <p className="flex items-center gap-2 text-[12px] text-slate-400">
                <Loader2 className="size-3.5 animate-spin" />
                Looking into the referential...
              </p>
            ) : (
              <ul className="space-y-2">
                {suggestions.results.slice(0, 3).map((result) => {
                  const primary = result.experts[0]
                  const backups = result.experts.slice(1)
                  return (
                    <li
                      key={result.code}
                      className="rounded-lg border border-[#d8ecec] bg-[#f2fafa] px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {primary && <Star className="size-3.5 shrink-0 fill-[#1aa6a6] text-[#1aa6a6]" />}
                        <span className="text-[13px] font-semibold text-[#183b56]">{result.problem}</span>
                        <span className="font-mono text-[11px] text-slate-400">{result.code}</span>
                        <span className="font-mono text-[11px] text-[#147878]">{result.unitPath}</span>
                      </div>
                      {primary && (
                        <p className="mt-1.5 text-[13px] text-[#183b56]">
                          {primary.name ?? primary.email}
                          {backups.length > 0 && (
                            <span className="font-normal text-slate-500">
                              {" "}
                              · backups: {backups.map((expert) => expert.name ?? expert.email).join(", ")}
                            </span>
                          )}
                        </p>
                      )}
                      {result.reasons.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {result.reasons.join(" · ")}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="text-[11px] leading-5 text-slate-400">
              Taken from the referential declared per unit. The dispatcher remains free to hand the
              ticket to somebody else.
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
