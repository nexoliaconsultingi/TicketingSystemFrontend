"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import { ArrowRightLeft, Eye, Loader2, Search, Trash2, UserX } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select } from "@/components/ui/select"
import { TicketDetailDialog } from "@/components/tickets/ticket-detail-dialog"
import { CloseDialog } from "@/components/tickets/close-dialog"
import { TicketEmptyState, TicketRow, TicketStatusBadge } from "@/components/tickets/ticket-view"
import { useUnseenBadge } from "@/components/realtime/unseen-badge-provider"
import { useTicketFeed } from "@/lib/use-ticket-feed"
import { useHighlightParam } from "@/lib/use-highlight"
import { getInitials, getToken } from "@/lib/auth"
import {
  ABSENCE_REASON_LABELS,
  ApiError,
  absenceLabel,
  isTicketStatus,
  ticketApi,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type AbsenceReason,
  type ResponseFilter,
  type SupervisorOption,
  type TicketResponse,
  type TicketStatus,
} from "@/lib/api"

type Filter = TicketStatus | "all"
type ResponseFilterChoice = ResponseFilter | "all"

/**
 * Un ticket passe-t-il le filtre de réponse ?
 *
 * « En attente » et « en dépassement » portent sur les tickets encore en phase
 * de réponse — l'état vient du serveur, calculé au chargement. « En retard » et
 * « à l'heure » portent sur les réponses déjà données, à l'aune du retard signé
 * renvoyé par le serveur.
 */
function matchesResponse(ticket: TicketResponse, choice: ResponseFilterChoice): boolean {
  switch (choice) {
    case "awaiting":
      return ticket.status === "new" && ticket.sla?.state !== "breached"
    case "overdue":
      return ticket.status === "new" && ticket.sla?.state === "breached"
    case "late":
      return ticket.responseLateMinutes !== null && ticket.responseLateMinutes > 0
    case "ontime":
      return ticket.responseLateMinutes !== null && ticket.responseLateMinutes <= 0
    default:
      return true
  }
}

/**
 * Centre de répartition.
 *
 * L'administrateur est le seul à décider qui traite quoi. Son travail se résumé
 * à deux gestes : ouvrir un ticket pour le comprendre, puis le distribuer. Les
 * deux écrans sont donc présentés dans cet ordre, et un ticket distribué
 * reste visible — le suivi ne disparaît pas une fois la décision prise.
 */
export default function DispatchCentrePage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <DispatchCentre />
      </Suspense>
    </AuthGuard>
  )
}

function DispatchCentre() {
  const [tickets, setTickets] = useState<TicketResponse[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [responseFilter, setResponseFilter] = useState<ResponseFilterChoice>("all")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<TicketResponse | null>(null)
  const [distributing, setDistributing] = useState<TicketResponse | null>(null)
  // Confirmation avant de réassigner : un dossier déjà confié à quelqu'un ne
  // change pas de main par un clic de trop. La sélection n'est ouverte qu'après
  // un « oui » explicite ; un « non » laisse le superviseur en place.
  const [confirmingReassign, setConfirmingReassign] = useState<TicketResponse | null>(null)
  const [closing, setClosing] = useState<TicketResponse | null>(null)
  const [deleting, setDeleting] = useState<TicketResponse | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const { markSeen } = useUnseenBadge("dispatch")

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [queue, staff] = await Promise.all([ticketApi.queue(token), ticketApi.supervisors(token)])
      setTickets(queue.tickets)
      setSupervisors(staff)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the ticket queue.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Cible de la recherche globale de l'en-tête : ouvrir la fiche de ce ticket.
  const highlight = useHighlightParam()
  const handledHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!highlight || handledHighlightRef.current === highlight) return
    if (loading || tickets.length === 0) return
    const ticket = tickets.find((candidate) => candidate._id === highlight)
    if (!ticket) return
    handledHighlightRef.current = highlight
    setSelected(ticket)
    markSeen()
  }, [highlight, tickets, loading, markSeen])

  /**
   * Relecture de la file, sans interruption visuelle.
   *
   * `load` reste le rechargement d'ouverture, qui a le droit d'afficher son
   * squelette. Ici la liste est déjà à l'écran : la remplacer par un vide ferait
   * clignoter toute la page à chaque dossier qui arrive, ce qui est plus
   * déroutant que de voir le nouveau ticket une demi-seconde plus tard.
   */
  const refreshQueue = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const queue = await ticketApi.queue(token)
      setTickets(queue.tickets)
      // Un dossier affiché dans une fiche ouverte peut avoir disparu — supprimé
      // par un autre administrateur. La laisser ouverte montrerait un ticket que
      // plus personne ne peut ouvrir ni distribuer.
      setSelected((current) =>
        current && !queue.tickets.some((ticket) => ticket._id === current._id) ? null : current,
      )
    } catch {
      // Une coupure réseau ne vide pas la file : ce qui est affiché reste vrai,
      // et le prochain événement la remettra à jour.
    }
  }, [])

  /**
   * La file se met à jour pendant qu'on la regarde.
   *
   * Sans cet abonnement, un ticket déclaré depuis un autre poste n'apparaît qu'au
   * rechargement — et l'administrateur qui a la page ouverte devant lui ne voit
   * pas le travail qui s'accumule. Or c'est précisément le cas d'usage : plusieurs
   * personnes déclarent en même temps qu'il distribue.
   *
   * La file est relue plutôt que corrigée sur place : elle est triée, filtrée et
   * susceptible d'être paginée, et un statut reconstruit sur trois champs ne
   * donnerait qu'un écran à moitié vrai.
   */
  useTicketFeed({ onRefresh: () => void refreshQueue() })

  // Recherche différée : une requête par frappe saturerait le serveur pour un
  // écran que l'on parcourt en appuyant sur Entrée ou après une pause.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const visible = useMemo(() => {
    const needle = query.toLowerCase()
    return tickets.filter((ticket) => {
      if (filter !== "all" && ticket.status !== filter) return false
      if (!matchesResponse(ticket, responseFilter)) return false
      if (!needle) return true
      return [ticket.reference, ticket.title, ticket.description, ticket.createdByName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [tickets, filter, responseFilter, query])

  const counts = useMemo(() => {
    const base = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<
      TicketStatus,
      number
    >
    for (const ticket of tickets) base[ticket.status] += 1
    return base
  }, [tickets])

  /**
   * Ouvre un ticket pour le prendre en revue.
   *
   * C'est une action, pas une lecture : c'est le moment où l'administrateur
   * commence à chercher qui pourrait traiter. Le serveur refuse toute
   * distribution tant que cette étape n'a pas eu lieu.
   */
  const startReview = async (ticket: TicketResponse) => {
    const token = getToken()
    if (!token) return
    setError(null)
    try {
      await ticketApi.startReview(token, ticket._id)
      // Le dossier quitte la file de ce qui attend une décision : le compteur
      // n'a plus à le rappeler.
      markSeen()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to take the ticket in review.")
    }
  }

  /**
   * Ouvre la fiche d'un dossier.
   *
   * Lire un ticket, c'est l'avoir traité : le compteur du « Dispatch centre »
   * cesse alors d'annoncer des dossiers que l'administrateur est en train de lire
   * sous ses yeux. Sans cela, rester sur la page afficherait en permanence un
   * « 1 » à côté d'un dossier déjà ouvert.
   */
  const openDetails = (ticket: TicketResponse) => {
    setSelected(ticket)
    markSeen()
  }

  /**
   * Retire le dossier de la file.
   *
   * Le serveur n'accepte la suppression que sur un ticket clos : une erreur
   * ici n'est donc pas un incident, c'est l'interface qui informait trop
   * tard. On la remonte telle quelle plutôt que d'inventer un message.
   */
  const confirmDelete = async () => {
    const token = getToken()
    if (!token || !deleting) return
    setDeletingBusy(true)
    setError(null)
    try {
      await ticketApi.remove(token, deleting._id)
      setDeleting(null)
      setSelected(null)
      markSeen()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete the ticket.")
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Dispatch centre" subtitle="Loading the ticket queue…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading the ticket queue…
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Dispatch centre"
      subtitle="Route each declared ticket to the right supervisor."
      breadcrumb="Support"
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TICKET_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(filter === status ? "all" : status)}
              className={
                filter === status
                  ? "rounded-lg border border-[#183b56] bg-[#183b56] px-3 py-2 text-left"
                  : "rounded-lg border border-[#e5eaf2] bg-white px-3 py-2 text-left hover:bg-[#f7f9fc]"
              }
            >
              <span
                className={
                  filter === status
                    ? "block text-[11px] text-white/70"
                    : "block text-[11px] text-slate-400"
                }
              >
                {TICKET_STATUS_LABELS[status]}
              </span>
              <span
                className={
                  filter === status ? "block text-lg font-semibold text-white" : "block text-lg font-semibold text-[#183b56]"
                }
              >
                {counts[status]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, title, requester…"
              className="pl-8"
            />
          </div>
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="w-auto"
          >
            <option value="all">All statuses</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TICKET_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select
            value={responseFilter}
            onChange={(event) => setResponseFilter(event.target.value as ResponseFilterChoice)}
            className="w-auto"
          >
            <option value="all">Any response</option>
            <option value="awaiting">Awaiting response</option>
            <option value="overdue">Response overdue</option>
            <option value="late">Replied late</option>
            <option value="ontime">Replied on time</option>
          </Select>
        </div>

        {visible.length === 0 ? (
          <TicketEmptyState
            title="No ticket to show"
            hint={tickets.length === 0 ? "No ticket has been declared yet." : "No ticket matches this filter."}
          />
        ) : (
          <div className="space-y-2">
            {visible.map((ticket) => (
              <div
                key={ticket._id}
                className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white"
              >
                <div>
              <TicketRow ticket={ticket} onOpen={() => openDetails(ticket)} showRequester />

              {/* Motif de restitution, hors de la ligne : l'administrateur doit
                  le voir sans ouvrir le dossier, et il reste affiché même
                  après une nouvelle distribution. */}
              {ticket.returnReason && (
                <p className="border-t border-[#edf0f5] bg-[#fffaf0] px-4 py-2 text-[12px] leading-5 text-amber-800 sm:px-5">
                  <span className="font-medium">
                    Handed back{ticket.returnedByName ? ` by ${ticket.returnedByName}` : ""}:
                  </span>{" "}
                  {ticket.returnReason}
                </p>
              )}
            </div>

                {/* Les actions dépendent de l'étape : distribuer un ticket pas
                    encore revu n'est pas possible, et un dossier soldé ne se
                    redistribue pas. */}
                <div className="flex flex-wrap items-center gap-2 border-t border-[#edf0f5] bg-[#f7f9fc] px-4 py-2.5 sm:px-5">
                  <TicketStatusBadge status={ticket.status} />

                  {/* Consulter et supprimer restent accessibles à toute étape :
                      lire ne change rien, et un dossier soldé doit pouvoir
                      quitter la file. Icône + libellé comme les autres actions :
                      « Trash » seul se devine, « Delete » se lit. */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#dce5ed] text-[#183b56]"
                    onClick={() => openDetails(ticket)}
                  >
                    <Eye data-icon="inline-start" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setDeleting(ticket)
                      setError(null)
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {ticket.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => void startReview(ticket)}>
                        Take in review
                      </Button>
                    )}

                    {(ticket.status === "being_reviewed" ||
                      ticket.status === "under_analysis" ||
                      ticket.status === "in_progress") && (
                      // Tant que le superviseur n'a pas accepté, ce n'est pas un
                      // « reassign » : personne n'a encore pris le dossier, et
                      // l'administrateur doit pouvoir revenir sur son choix.
                      // S'il y a déjà un titulaire, un clic de trop ne doit pas
                      // ouvrir la sélection : on demande d'abord confirmation.
                      <Button
                        size="sm"
                        onClick={() =>
                          ticket.assignedToName
                            ? setConfirmingReassign(ticket)
                            : setDistributing(ticket)
                        }
                      >
                        <ArrowRightLeft data-icon="inline-start" />
                        {ticket.assignedToName
                          ? ticket.status === "under_analysis"
                            ? "Assign someone else"
                            : "Reassign"
                          : "Assign a supervisor"}
                      </Button>
                    )}

                    {/* Solder est possible pendant le traitement : c'est ce que
                        le motif obligatoire justifie. En revanche un dossier
                        résolu attend sa clôture administrative — le travail est
                        fait, il ne manque plus que la décision de l'arrêter, et
                        un bouton « Close / cancel » à ce stade se lirait comme
                        un deuxième avis sur le résultat. */}
                    {ticket.status !== "closed" && ticket.status !== "resolved" && (
                      <Button size="sm" variant="ghost" onClick={() => setClosing(ticket)}>
                        Close / cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DistributeDialog
        ticket={distributing}
        supervisors={supervisors}
        onClose={() => setDistributing(null)}
        onDistributed={async () => {
          setDistributing(null)
          markSeen()
          await load()
        }}
      />

      {/* Confirmation de réassignation : le dossier a déjà un titulaire. Un
          « oui » ouvre la sélection d'un nouveau superviseur ; un « non » ne
          fait rien et laisse le dossier à celui qui le traite déjà. */}
      <Modal
        open={confirmingReassign !== null}
        title="Ticket already assigned"
        description={
          confirmingReassign
            ? `${confirmingReassign.reference} · ${confirmingReassign.title}`
            : undefined
        }
        onClose={() => setConfirmingReassign(null)}
        centerOnMobile
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setConfirmingReassign(null)}
            >
              No, keep it
            </Button>
            <Button
              type="button"
              onClick={() => {
                const ticket = confirmingReassign
                setConfirmingReassign(null)
                setDistributing(ticket)
              }}
            >
              <ArrowRightLeft data-icon="inline-start" />
              Yes, reassign
            </Button>
          </>
        }
      >
        {confirmingReassign && (
          <div className="space-y-3 text-[13px] leading-5 text-slate-600">
            <p>
              This ticket is already assigned to{" "}
              <strong className="text-[#183b56]">
                {confirmingReassign.assignedToName ?? "a supervisor"}
              </strong>
              . Are you sure you want to reassign it to someone else?
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
              Choosing <strong>No</strong> does nothing: the ticket stays with{" "}
              {confirmingReassign.assignedToName ?? "the current supervisor"} to resolve.
            </p>
          </div>
        )}
      </Modal>

      <CloseDialog
        ticket={closing}
        onClose={() => setClosing(null)}
        onClosed={async () => {
          setClosing(null)
          setSelected(null)
          markSeen()
          await load()
        }}
        onError={setError}
      />

      {/* Suppression : Unlike closing, the ticket leaves the queue for good. The
          dialog says so plainly, because there is no undo. */}
      <Modal
        open={deleting !== null}
        title="Delete this ticket?"
        description={
          deleting
            ? `${deleting.reference} · ${deleting.title} will be removed for good.`
            : undefined
        }
        onClose={() => setDeleting(null)}
        centerOnMobile
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deletingBusy}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
              onClick={() => void confirmDelete()}
            >
              {deletingBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete ticket
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-3 text-[13px] leading-5 text-slate-600">
            <p>
              The whole dossier disappears: description, history and resolution note. The requester
              is notified, but the ticket itself is no longer reachable.
            </p>
            {deleting.status !== "closed" && deleting.status !== "resolved" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
                This ticket is still <strong>{TICKET_STATUS_LABELS[deleting.status]}</strong> and has
                an active supervisor working on it. Deleting removes it from their queue without a
                trace — <strong>Close / cancel</strong> first if you want the history kept.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Aucune action dans la fiche : le solde se décide sur la ligne du ticket,
          où l'on voit déjà son étape et le reste de la file. Les y mettre aussi
          exposait deux boutons identiques au même endroit, et le second ne se
          savait pas du tout de quel ticket il parlait. */}
      <TicketDetailDialog
        ticket={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </DashboardShell>
  )
}

/**
 * Distribution d'un ticket.
 *
 * Seul le superviseur est choisi ici. Le périmètre n'est pas modifiable à cet
 * écran : c'était un formulaire de saisie de codes, et il demandait à
 * l'administrateur de connaître l'organigramme alors que les noms de
 * département et d'unité sont déjà affichés avec chaque ticket. Le rattachement
 * reste celui que le serveur a déduit du compte du déclarant.
 */
function DistributeDialog({
  ticket,
  supervisors,
  onClose,
  onDistributed,
}: {
  ticket: TicketResponse | null
  supervisors: SupervisorOption[]
  onClose: () => void
  onDistributed: () => Promise<void>
}) {
  const [assignedTo, setAssignedTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ticket) {
      setAssignedTo("")
      setError(null)
    }
  }, [ticket])

  if (!ticket) return null

  const submit = async () => {
    const token = getToken()
    if (!token || !assignedTo) return
    setSaving(true)
    setError(null)
    try {
      // Ni departmentCode ni unitPath : le serveur conserve le rattachement
      // existant, il ne faut donc rien envoyer pour les écraser.
      await ticketApi.assign(token, ticket._id, { assignedTo })
      await onDistributed()
    } catch (err) {
      // Message du serveur tel quel : il explique pourquoi le choix est refusé
      // (« Nadia est en vacances »), ce qu'un texte générique ne ferait pas.
      setError(err instanceof ApiError ? err.message : "Unable to distribute the ticket.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title={
        ticket.status === "under_analysis" && ticket.assignedToName
          ? "Choose another supervisor"
          : ticket.assignedToName
            ? "Reassign the ticket"
            : "Assign a supervisor"
      }
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !assignedTo}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft data-icon="inline-start" />}
            Confirm
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

        {/* Les superviseurs absents restent listés, avec leur motif : les
            masquer laisserait l'administrateur sans explication, et il ne
            saurait pas pourquoi un dossier reste sans traitement. */}
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Supervisor</span>
          {supervisors.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              No supervisor account exists yet. Create one with the Supervisor role before distributing.
            </p>
          ) : (
            <div className="space-y-1.5">
              {supervisors.map((supervisor) => (
                <label
                  key={supervisor._id}
                  className={
                    supervisor.available
                      ? "flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e5eaf2] px-3 py-2 hover:bg-[#f7f9fc]"
                      : "flex items-center gap-2.5 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3 py-2 opacity-70"
                  }
                >
                  <input
                    type="radio"
                    name="supervisor"
                    value={supervisor._id}
                    checked={assignedTo === supervisor._id}
                    disabled={!supervisor.available || saving}
                    onChange={() => setAssignedTo(supervisor._id)}
                    className="size-4"
                  />

                  {/* Photo ou initiales : distribuer à quelqu'un demande de le
                      reconnaître, pas seulement de lire son nom. La photo est
                      celle du compte, déjà réduite côté client à l'enregistrement. */}
                  <Avatar className="size-8">
                    {supervisor.photo ? <AvatarImage src={supervisor.photo} alt="" /> : null}
                    <AvatarFallback className="bg-[#d7eeee] text-[11px] font-semibold text-[#176b6b]">
                      {getInitials(supervisor.name)}
                    </AvatarFallback>
                  </Avatar>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[#183b56]">
                      {supervisor.name}
                    </span>

                    {/* Département et unité : choisis au nom du code du
                        déclarant, l'administrateur doit pouvoir vérifier d'un
                        coup d'œil que le superviseur proposé est bien du bon
                        périmètre. */}
                    <span className="block text-[11.5px] text-slate-400">
                      {[supervisor.departmentName ?? supervisor.departmentCode, supervisor.unitName ?? supervisor.unitPath]
                        .filter(Boolean)
                        .join(" · ") || "No department or unit set"}
                    </span>

                    {/* Points d'expertise, repris du référentiel « Experts &
                        problems ». Les points principaux sont distingués des
                        suppléances : c'est ce qui permet de repérer le référent
                        d'une simple présence dans la boucle. */}
                    <span className="mt-1 block text-[11.5px] text-slate-400">
                      {supervisor.expertise.length === 0 ? (
                        "No expertise declared"
                      ) : (
                        <>
                          {supervisor.primaryExpertiseCount} main
                          {supervisor.primaryExpertiseCount > 1 ? " areas" : " area"} ·{" "}
                          {supervisor.expertise
                            .slice(0, 3)
                            .map((point, index) => (
                              <span key={point.code}>
                                {index > 0 && ", "}
                                {point.problem}
                                {point.role === "substitute" ? " (backup)" : ""}
                              </span>
                            ))}
                          {supervisor.expertise.length > 3 &&
                            `, +${supervisor.expertise.length - 3} more`}
                        </>
                      )}
                    </span>

                    <span
                      className={
                        supervisor.available
                          ? "block text-[11.5px] text-slate-400"
                          : "flex items-center gap-1 text-[11.5px] text-amber-600"
                      }
                    >
                      {!supervisor.available && <UserX className="size-3" />}
                      {absenceLabel(supervisor.availability, supervisor.availabilityNote)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11.5px] text-slate-400">
          Only available supervisors can be selected. A supervisor who declared an absence is
          refused by the server, whatever this screen shows.
        </p>

        {/* Conséquence du clic, énoncée avant : distribuer ne met pas le dossier en
            traitement. Le superviseur doit confirmer qu'il le prend, et ce délai
            est précisément ce qui rend visible un dossier distribué à la
            mauvaise personne. */}
        <p className="text-[11.5px] leading-5 text-slate-400">
          The ticket will wait for this supervisor&rsquo;s decision: it becomes In Progress only
          once they accept it, or goes back to you if they decline.
        </p>
      </div>
    </Modal>
  )
}
