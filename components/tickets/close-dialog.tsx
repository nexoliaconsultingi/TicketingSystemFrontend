"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, ticketApi, TICKET_STATUS_LABELS, type TicketResponse } from "@/lib/api"
import { getToken } from "@/lib/auth"

/**
 * Solde ou annulation d'un dossier.
 *
 * Le motif est obligatoire et le bouton reste désactivé tant qu'il est vide :
 * c'est la contrepartie du fait qu'un ticket peut être arrêté à tout moment.
 *
 * Un seul dialogue sert l'administrateur et le demandeur. Ce qui change n'est
 * pas l'opération — les deux aboutissent à `closed` — mais le lecteur du motif :
 * écrit par l'admin, il s'adresse au demandeur et au superviseur affecté ; écrit
 * par le demandeur, il s'adresse à l'admin. Dupliquer la fenêtre ferait
 * diverger la validation et les deux libellés.
 */
export function CloseDialog({
  ticket,
  mode = "admin",
  onClose,
  onClosed,
  onError,
}: {
  ticket: TicketResponse | null
  /**
   * `admin` : solder ou annuler un dossier à toute étape.
   * `requester` : retirer sa propre demande, avant la mise en traitement.
   */
  mode?: "admin" | "requester"
  onClose: () => void
  onClosed: () => Promise<void>
  onError: (message: string) => void
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ticket) setReason("")
  }, [ticket])

  if (!ticket) return null

  const tooShort = reason.trim().length < 10

  const submit = async () => {
    const token = getToken()
    if (!token || tooShort) return
    setSaving(true)
    try {
      await ticketApi.close(token, ticket._id, reason.trim())
      await onClosed()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to close the ticket.")
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return mode === "requester" ? (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title="Cancel this request"
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep it open
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving || tooShort}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Cancel my request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] leading-5 text-slate-600">
          Your request stops here ({TICKET_STATUS_LABELS[ticket.status]}) and no supervisor will
          work on it. Once it has been assigned and treated, cancelling is no longer possible: you
          would have to ask the platform manager to close it.
        </p>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Why are you cancelling?</span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="The problem was fixed by restarting the printer this morning."
            rows={4}
            maxLength={300}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            Read by the platform manager, who keeps the trace of the request. At least 10
            characters.
          </span>
        </label>
      </div>
    </Modal>
  ) : (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title="Close or cancel this ticket"
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep it open
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving || tooShort}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Close the ticket
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] leading-5 text-slate-600">
          This stops the ticket at its current step ({TICKET_STATUS_LABELS[ticket.status]}). The
          reason below is sent to the requester
          {ticket.assignedToName ? ` and to ${ticket.assignedToName}` : ""}.
        </p>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Reason</span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Declared twice by mistake; the real request is already tracked under TKT-0042."
            rows={4}
            maxLength={300}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            Written for the person who declared the ticket. At least 10 characters.
          </span>
        </label>
      </div>
    </Modal>
  )
}