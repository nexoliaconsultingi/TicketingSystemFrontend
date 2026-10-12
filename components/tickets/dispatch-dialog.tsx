"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, Loader2, UserCheck, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { assignmentBlock, candidatesFor } from "@/lib/tickets/eligibility"
import { activityLabel } from "@/lib/tickets/types"
import type { ManagedTicket, ResponderRecord, StaffMember } from "@/lib/tickets/types"
import { BlockingNotice, EmptyNotice } from "./shared"

interface DispatchDialogProps {
  ticket: ManagedTicket | null
  staff: StaffMember[]
  responders: ResponderRecord[]
  onClose: () => void
  onAssign: (ticketId: string, personId: string, personName: string) => void
  saving: boolean
}

/**
 * Répartition d'un ticket vers un intervenant.
 *
 * Le refus est le cœur de cet écran : les personnes non compétentes restent
 * sélectionnables puis rejetées à la validation, avec la raison. Les
 * supprimer de la liste rendrait la sélection plus agréable, mais
 * l'utilisateur verrait un choix vide sans comprendre pourquoi.
 */
export function DispatchDialog({
  ticket,
  staff,
  responders,
  onClose,
  onAssign,
  saving,
}: DispatchDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [blockMessage, setBlockMessage] = useState<string | null>(null)

  const candidates = useMemo(
    () => (ticket ? candidatesFor(ticket, staff, responders) : []),
    [ticket, staff, responders],
  )

  const eligibleCount = candidates.filter((entry) => entry.eligibility.eligible).length
  const selected = candidates.find((entry) => entry.person.id === selectedId)?.person ?? null

  // Le message de refus est recalculé à l'ouverture plutôt que mémorisé dans
  // l'état : competencies et absences peuvent avoir changé entre deux rendus.
  const liveBlock = ticket ? assignmentBlock(selected, ticket, responders) : "Select a person."

  const handleSubmit = () => {
    if (!ticket) return

    if (!selectedId) {
      setBlockMessage("Select the person who will handle this ticket.")
      return
    }

    const reason = assignmentBlock(selected, ticket, responders)
    if (reason) {
      setBlockMessage(reason)
      return
    }

    setBlockMessage(null)
    onAssign(ticket.id, selectedId, selected?.name ?? "")
  }

  const handleClose = () => {
    setSelectedId(null)
    setBlockMessage(null)
    onClose()
  }

  return (
    <Modal
      open={ticket !== null}
      title={ticket ? `Dispatch ${ticket.reference}` : "Dispatch ticket"}
      description={
        ticket
          ? `“${activityLabel(ticket.activity)}” · ${ticket.unitName ?? ticket.departmentCode}. Only people declared competent for this activity can take it.`
          : undefined
      }
      onClose={handleClose}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" className="text-slate-500" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || eligibleCount === 0}
            onClick={handleSubmit}
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Assign ticket
          </Button>
        </>
      }
    >
      {ticket && (
        <div className="space-y-5">
          {eligibleCount === 0 && (
            <BlockingNotice>
              No person is declared competent for “{activityLabel(ticket.activity)}” in this scope.
              Add someone to the competency list for this zone, or create the ticket against
              another zone.
            </BlockingNotice>
          )}

          {ticket.unitPath === null && (
            <BlockingNotice>
              This ticket is not attached to a zone, so no competency list can match it. Attach it
              to a zone before dispatching.
            </BlockingNotice>
          )}

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-medium text-[#183b56]">
                Who can handle this ticket?
              </h3>
              <span className="text-[11px] tabular-nums text-slate-400">
                {eligibleCount} of {candidates.length} eligible
              </span>
            </div>

            {candidates.length === 0 ? (
              <EmptyNotice
                title="No one to choose from"
                hint="Build the competency list for this zone first."
              />
            ) : (
              <ul className="divide-y divide-[#edf0f5] overflow-hidden rounded-lg border border-[#e5eaf2]">
                {candidates.map(({ person, eligibility }) => {
                  const isSelected = selectedId === person.id
                  return (
                    <li key={person.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                          isSelected ? "bg-[#edf8f8]" : "hover:bg-[#f7f9fc]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="dispatch-candidate"
                          value={person.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedId(person.id)
                            setBlockMessage(null)
                          }}
                          className="mt-1 size-4 accent-[#1aa6a6]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-[#183b56]">
                              {person.name}
                            </span>
                            {eligibility.eligible ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                <Check className="size-3" />
                                Competent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                                <AlertTriangle className="size-3" />
                                {eligibility.code === "unavailable" ? "Unavailable" : "Not competent"}
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-[12px] leading-5 text-slate-500">
                            {person.unitName ?? person.departmentName ?? "No scope"}
                          </span>
                          {!eligibility.eligible && eligibility.reason && (
                            <span className="mt-1 block text-[12px] leading-5 text-slate-400">
                              {eligibility.reason}
                            </span>
                          )}
                        </span>
                        <UserX
                          className={`mt-1 size-4 shrink-0 ${
                            eligibility.eligible ? "text-emerald-500" : "text-slate-300"
                          }`}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {blockMessage && (
            <BlockingNotice>
              <span className="font-medium">Assignment refused.</span> {blockMessage}
            </BlockingNotice>
          )}

          {!blockMessage && liveBlock && selectedId === null && (
            <p className="text-[12px] text-slate-400">{liveBlock}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
