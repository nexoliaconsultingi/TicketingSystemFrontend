"use client"

import { useEffect, useState } from "react"
import { Gauge, Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials, getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITY_LABELS,
  ticketApi,
  type ServiceResponse,
  type TicketResponse,
} from "@/lib/api"

/**
 * Demande lancée depuis le catalogue de services.
 *
 * Tout est verrouillé par le service : titre, priorité, périmètre et
 * superviseur. Le demandeur n'ajoute que la description de son problème — le
 * « un clic » ne demande qu'un détail, pas une décision d'aiguillage.
 */
function ServiceRequestDialog({
  service,
  onClose,
  onRequested,
}: {
  service: ServiceResponse | null
  onClose: () => void
  onRequested: (ticket: TicketResponse) => Promise<void> | void
}) {
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Réinitialiser à l'ouverture, pas au rendu : `service` change à chaque clic,
  // et le garder rempli enverrait la description précédente au mauvais dossier.
  useEffect(() => {
    if (service) {
      setDescription("")
      setError(null)
    }
  }, [service])

  const tooShort = description.trim().length < 5

  const submit = async () => {
    const token = getToken()
    if (!token || !service || tooShort) return
    setSaving(true)
    setError(null)
    try {
      const created = await ticketApi.createFromCatalogue(token, {
        serviceId: service._id,
        description: description.trim(),
      })
      await onRequested(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send the request.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={service !== null}
      onClose={onClose}
      title={service ? `Request ${service.name}` : ""}
      description={
        service
          ? "The supervisor of this service receives the request directly. Only describe your situation."
          : undefined
      }
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || tooShort || !service}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send data-icon="inline-start" />}
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {service && (
          <>
            <div className="rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-4 py-3">
              <p className="text-sm font-semibold text-[#183b56]">{service.description}</p>
              <dl className="mt-3 grid gap-2.5 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                    Assigned to
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[#183b56]">
                    <Avatar className="size-5">
                      {service.supervisorPhoto ? (
                        <AvatarImage src={service.supervisorPhoto} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-[#d7eeee] text-[9px] font-semibold text-[#176b6b]">
                        {getInitials(service.supervisorName)}
                      </AvatarFallback>
                    </Avatar>
                    {service.supervisorName}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Priority</dt>
                  <dd className="mt-0.5 font-medium text-[#183b56]">
                    {TICKET_PRIORITY_LABELS[service.priority]}
                  </dd>
                </div>
                {(service.departmentName ?? service.unitName) && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">Scope</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[#183b56]">
                      <Gauge className="size-3.5" />
                      {service.departmentName ?? "No fixed department"}
                      {service.unitName ? ` · ${service.unitName}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[#183b56]">What is happening?</span>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the situation in your own words."
                rows={5}
                maxLength={2000}
                autoFocus
              />
              <span className="block text-[11.5px] text-slate-400">
                This is the only free field: it tells the supervisor what is happening now.
              </span>
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}

export { ServiceRequestDialog }