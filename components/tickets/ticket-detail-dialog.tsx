"use client"

import { useEffect, useState } from "react"
import { Package } from "lucide-react"

import { Modal } from "@/components/ui/modal"
import {
  RESPONSE_SLA_CLASSES,
  RESPONSE_SLA_LABELS,
  formatSlaDelay,
  formatSlaLateness,
  formatSlaRemaining,
  formatStockQuantity,
  type TicketResponse,
} from "@/lib/api"
import {
  TicketPriorityBadge,
  TicketSlaBadge,
  TicketStatusBadge,
  TicketTimeline,
} from "@/components/tickets/ticket-view"
import { TicketRating } from "@/components/tickets/ticket-rating"
import { UserAvatar } from "@/components/profile/user-avatar"
import { useSessionUser } from "@/lib/use-session"

/**
 * Fiche d'un ticket, en lecture.
 *
 * Partagée par les trois écrans : le demandeur, le superviseur et
 * l'administrateur lisent les mêmes informations, seul le pied de page propose
 * des actions différentes. Dupliquer la fiche aurait inevitably divergence —
 * un encadré de résolution visible d'un côté et oublié de l'autre.
 */
export function TicketDetailDialog({
  ticket,
  open,
  onClose,
  footer,
  onRated,
}: {
  ticket: TicketResponse | null
  open: boolean
  onClose: () => void
  /** Boutons d'action propres à l'écran appelant. */
  footer?: React.ReactNode
  /**
   * Après un avis posé, l'écran appelant relit sa liste.
   *
   * L'avis n'est pas un événement d'état : il ne fait pas partie des abonnés du
   * dossier, donc personne ne reçoit l'annonce et l'écran du demandeur ne se
   * rafraîchirait tout seul. Sans ce retour explicite, la fiche afficherait la note
   * d'avant le clic.
   */
  onRated?: () => void
}) {
  const user = useSessionUser()
  // Le contenu affiché suit le ticket sélectionné : sans cet état, ouvrir deux
  // dossiers successivement garderait le texte du premier pendant l'ouverture
  // du second.
  const [shown, setShown] = useState<TicketResponse | null>(ticket)
  // Le compte à rebours du délai de réponse doit avancer même si la fiche reste
  // ouverte : sans ce tic-tac, « 12 min left » mentirait douze minutes plus tard.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (open) setShown(ticket)
  }, [open, ticket])

  useEffect(() => {
    if (!open || !shown?.sla) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [open, shown?.sla?.deadlineAt])

  if (!shown) return null

  const scope = [shown.departmentName ?? shown.departmentCode, shown.unitName ?? shown.unitPath]
    .filter(Boolean)
    .join(" › ")

  /*
   * Les trois personnes qui ont fait avancer le dossier, dans l'ordre où il
   * les a traversées. Un ticket circule entre des mains, et une liste de noms
   * ne dit pas si « Marie Dupont » est celle qui l'a déclaré ou celle qui l'a
   * corrigé : le visage tranche sans avoir à comparer les noms.
   *
   * Le dispatcheur n'apparaît qu'une fois la revue commencée, et le superviseur
   * qu'une fois le dossier distribué. Un emplacement vide se dirait « personne
   * pour l'instant », pas « personne ».
   */
  const actors: Array<{ label: string; userId: string | null; name: string | null }> = [
    { label: "Declared by", userId: shown.createdBy, name: shown.createdByName },
    ...(shown.reviewedBy
      ? [{ label: "Dispatched by", userId: shown.reviewedBy, name: shown.reviewedByName }]
      : []),
    ...(shown.assignedTo
      ? [{ label: "Handled by", userId: shown.assignedTo, name: shown.assignedToName }]
      : []),
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      // Fiche longue : centrée sur téléphone, son bouton d'action resterait
      // sinon sous le pouce, hors de l'écran.
      centerOnMobile
      title={shown.title}
      description={`${shown.reference} · declared ${new Date(shown.createdAt).toLocaleDateString("en-GB")}`}
      footer={footer}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={shown.status} />
          <TicketPriorityBadge priority={shown.priority} />
        </div>

        {/* Le délai n'apparaît que sur un ticket en phase de réponse : une fois
            pris en charge, il n'y a plus de promesse à tenir, et l'annoncer
            serait un mensonge. Le compte à rebours est recalculé à chaque
            affichage — c'est lui, pas la date seule, qui indique l'urgence. */}
        {shown.sla && (
          <section className="rounded-lg border border-[#edf0f5] bg-[#f7f9fc] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TicketSlaBadge sla={shown.sla} />
              <p className="text-[12px] text-slate-500">
                Response due:&nbsp;
                <span className="font-medium text-[#183b56]">
                  {new Date(shown.sla.deadlineAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </p>
            </div>
            <p className="mt-1.5 text-[12px] text-slate-500">
              {shown.sla.state === "breached" ? "Overdue by:" : "Time left:"}&nbsp;
              <span
                className={
                  shown.sla.state === "breached"
                    ? "font-medium text-red-600"
                    : shown.sla.state === "warning"
                      ? "font-medium text-amber-600"
                      : "font-medium text-emerald-600"
                }
              >
                {formatSlaRemaining(shown.sla.deadlineAt, now)}
              </span>
            </p>
          </section>
        )}

        {/* Une fois la réponse donnée, le compte à rebours n'a plus lieu d'être :
            ce qui reste, c'est le verdict — la trace figée au moment de la
            réponse (`on_time`, `warning`, `overdue`), chiffrée sur l'échéance qui
            s'appliquait alors, et le temps de réaction depuis le dépôt. Un
            dossier pris en revue très en avance doit se lire comme une promesse
            tenue, pas comme un vide. Les tickets répondus avant cette trace
            retombent sur l'ancien jugement chiffré, sans perdre l'information. */}
        {shown.respondedAt && (
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#edf0f5] bg-[#f7f9fc] px-3 py-2.5 text-[12px]">
            <span className="text-slate-500">
              Responded:&nbsp;
              <span className="font-medium text-[#183b56]">
                {new Date(shown.respondedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </span>
            {shown.responseLateMinutes !== null && (
              <span
                className={
                  shown.responseSlaState
                    ? `rounded-full border px-2 py-0.5 text-[11px] font-medium ${RESPONSE_SLA_CLASSES[shown.responseSlaState]}`
                    : shown.responseLateMinutes > 0
                      ? "font-medium text-red-600"
                      : "font-medium text-emerald-600"
                }
              >
                {shown.responseSlaState ? (
                  <>
                    {RESPONSE_SLA_LABELS[shown.responseSlaState]}
                    {shown.responseDelayMinutes !== null && ` · in ${formatSlaDelay(shown.responseDelayMinutes)}`}
                  </>
                ) : (
                  formatSlaLateness(shown.responseLateMinutes)
                )}
              </span>
            )}
          </section>
        )}

        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Description
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-6 whitespace-pre-line text-slate-700">
            {shown.description}
          </p>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Routing</h3>

          {/* Les acteurs passent avant le périmètre : « qui s'en occupe » est la
              question que l'on se pose en ouvrant un dossier, « où » vient
              ensuite. */}
          <ul className="mt-2.5 space-y-2">
            {actors.map((actor) => (
              <li key={actor.label} className="flex items-center gap-3">
                <UserAvatar userId={actor.userId} name={actor.name} />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">{actor.label}</p>
                  <p className="truncate text-[13px] text-slate-700">
                    {actor.name ?? "Unknown user"}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1.5">
            <div className="flex gap-3 text-[13px]">
              <dt className="w-28 shrink-0 text-slate-400">Priority</dt>
              <dd className="min-w-0 text-slate-700">{shown.priority}</dd>
            </div>
            {scope && (
              <div className="flex gap-3 text-[13px]">
                <dt className="w-28 shrink-0 text-slate-400">Scope</dt>
                <dd className="min-w-0 text-slate-700">{scope}</dd>
              </div>
            )}
            {/* Tant que personne n'est affecté, la liste des acteurs s'arrête au
                demandeur : il faut malgré même dire que le dossier attend. */}
            {!shown.assignedTo && (
              <div className="flex gap-3 text-[13px]">
                <dt className="w-28 shrink-0 text-slate-400">Handled by</dt>
                <dd className="min-w-0 text-slate-500">Not yet assigned</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Le compte rendu du superviseur est la réponse au demandeur : sans
            lui, « traité » ne dit rien de ce qui a été fait. */}
        {shown.resolutionNote && (
          <section>
            <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Resolution
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-6 whitespace-pre-line text-slate-700">
              {shown.resolutionNote}
            </p>
          </section>
        )}

        {/* Produits du stock libérés par le superviseur au demandeur. Visible
            par les trois rôles : le déclarant sait ce qui lui est confié, le
            superviseur qui a répondu relit son choix, et l'admin suit la sortie
            de stock. */}
        {shown.releasedMaterial.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              <Package className="size-3.5" />
              Company material released
            </h3>
            <ul className="mt-2 space-y-1.5">
              {shown.releasedMaterial.map((material) => (
                <li
                  key={material._id}
                  className="flex items-center gap-2.5 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#183b56]">
                      {material.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-slate-400">
                      {material.code}
                      {material.reusable
                        ? material.returned >= material.quantity
                          ? " · returned"
                          : material.returned > 0
                            ? ` · ${material.returned} of ${material.quantity} returned`
                            : " · to be returned"
                        : " · consumed on use"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[12px] font-medium text-[#183b56] ring-1 ring-[#e5eaf2]">
                    {formatStockQuantity(material.quantity, material.unit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Un dossier jamais traité n'a rien à faire juger : l'avis porte sur un
            service rendu, pas sur un dossier arrêté. La condition porte donc sur la
            trace du traitement, et le composant affiche à lui seul l'avis déjà posé
            ou l'attente. */}
        {shown.resolvedAt && (
          <TicketRating
            ticket={shown}
            canRate={Boolean(user && shown.createdBy === user._id)}
            onRated={() => onRated?.()}
          />
        )}

        {/* Le motif de restitution reste affiché après une nouvelle distribution :
            c'est lui qui empêche de confier le dossier au même superviseur par
            automatisme. L'historique seul est trop bas dans la fiche. */}
        {shown.returnReason && (
          <section>
            <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Handed back
            </h3>
            {shown.returnedByName && (
              <p className="mt-1.5 text-[12px] text-slate-400">by {shown.returnedByName}</p>
            )}
            <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{shown.returnReason}</p>
          </section>
        )}

        {shown.closeReason && (
          <section>
            <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Closing reason
            </h3>
            <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{shown.closeReason}</p>
          </section>
        )}

        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            History
          </h3>
          <div className="mt-2.5">
            <TicketTimeline ticket={shown} />
          </div>
        </section>
      </div>
    </Modal>
  )
}