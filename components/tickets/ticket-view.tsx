"use client"

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  CornerUpLeft,
  Hourglass,
  Inbox,
  Loader2,
  Package,
  Pencil,
  PlayCircle,
  SearchX,
  Star,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/profile/user-avatar"
import {
  RESPONSE_SLA_CLASSES,
  RESPONSE_SLA_LABELS,
  TICKET_PRIORITY_CLASSES,
  TICKET_PRIORITY_LABELS,
  TICKET_SLA_CLASSES,
  TICKET_SLA_LABELS,
  TICKET_STATUS_CLASSES,
  TICKET_STATUS_LABELS,
  formatSlaDelay,
  type TicketHistoryEntry,
  type TicketPriority,
  type TicketResponse,
  type TicketSla,
  type TicketStatus,
} from "@/lib/api"

/** Icône d'étape, alignée sur le cycle de vie du ticket. */
const STATUS_ICON: Record<TicketStatus, typeof Inbox> = {
  new: Inbox,
  being_reviewed: SearchX,
  // Sablier, pas `Loader2` : le dossier n'est pas en train d'être traité, il
  // attend une réponse du superviseur. L'animation serait un mensonge.
  under_analysis: Hourglass,
  in_progress: Loader2,
  resolved: CheckCircle2,
  closed: BadgeCheck,
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge variant="outline" className={`gap-1.5 whitespace-nowrap ${TICKET_STATUS_CLASSES[status]}`}>
      {/* `in_progress` est la seule étape active : elle tourne, les autres
          sont des états stables et ne doivent pas suggérer une animation —
          `under_analysis` est une attente, pas une activité. */}
      <Icon className={`size-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  )
}

/**
 * Niveau d'urgence du ticket.
 *
 * Le vert soutient le calme (« ça peut attendre »), le rouge l'urgence : le
 * centre trie sur cette valeur, et un badge unique par niveau évite de lire
 * chaque fiche pour savoir ce qu'il faut traiter d'abord.
 */
export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${TICKET_PRIORITY_CLASSES[priority]}`}>
      {TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  )
}

const SLA_STATE_ICON: Record<TicketSla["state"], typeof CheckCircle2> = {
  // Le vert valide le calme : le dossier est sous son seuil, rien à faire.
  on_time: CheckCircle2,
  // Le triangle avertit sans paniquer : l'échéance approche, on surveille.
  warning: AlertTriangle,
  // L'octogone alerte : le délai est dépassé, quelqu'un doit lâcher ce qu'il fait.
  breached: AlertOctagon,
}

/**
 * Position SLA d'un ticket ouvert.
 *
 * Le badge dit « où en est ce dossier face à son échéance » d'un coup d'œil,
 * comme la priorité dit « à quel point c'est urgent » : le centre de
 * répartition et le superviseur trient sur les deux sans ouvrir chaque fiche.
 * `null` (politique désactivée, dossier clos) → aucun badge.
 */
export function TicketSlaBadge({ sla }: { sla: TicketSla | null }) {
  if (!sla) return null
  const Icon = SLA_STATE_ICON[sla.state]
  return (
    <Badge variant="outline" className={`gap-1 whitespace-nowrap ${TICKET_SLA_CLASSES[sla.state]}`}>
      <Icon className="size-3" />
      SLA · {TICKET_SLA_LABELS[sla.state]}
    </Badge>
  )
}

/**
 * Verdict d'une réponse au déclarant.
 *
 * C'est la trace figée au moment de la réponse : `on_time` (dans le délai),
 * `warning` (la phase d'alerte était déjà atteinte), `overdue` (le délai était
 * dépassé avant de répondre), assortie du temps de réaction depuis le dépôt.
 * Affiché dès que le ticket a reçu une réponse, même une fois passé plus loin
 * dans le cycle : c'est la trace d'un engagement tenu ou manqué, et le centre
 * de répartition juge la promesse faite au déclarant sur elle. Un ticket sans
 * réponse — ou dont la politique était désactivée alors — n'affiche rien.
 */
export function TicketResponseBadge({ ticket }: { ticket: TicketResponse }) {
  if (ticket.respondedAt === null || ticket.responseSlaState === null) return null
  const delay = ticket.responseDelayMinutes
  const extra = delay === null ? "" : ` · ${formatSlaDelay(delay)}`
  const Icon = ticket.responseSlaState === "on_time" ? CheckCircle2 : AlertOctagon
  return (
    <Badge variant="outline" className={`gap-1 whitespace-nowrap ${RESPONSE_SLA_CLASSES[ticket.responseSlaState]}`}>
      <Icon className="size-3" />
      {RESPONSE_SLA_LABELS[ticket.responseSlaState]}
      {extra}
    </Badge>
  )
}

const HISTORY_ICON: Record<TicketHistoryEntry["kind"], typeof Inbox> = {
  created: ClipboardList,
  review: SearchX,
  assigned: PlayCircle,
  reassigned: ArrowRightLeft,
  // Distinct de `assigned` : c'est le superviseur qui s'engage, pas
  // l'administrateur. `PlayCircle` reste la distribution, `ClipboardCheck` la
  // prise en charge.
  accepted: ClipboardCheck,
  // Flèche vers l'arrière : le dossier repart en amont, personne ne le traite
  // plus. C'est l'inverse de `reassigned`, qui le confie à quelqu'un d'autre.
  returned: CornerUpLeft,
  resolved: CheckCircle2,
  // Crayon plutôt qu'un second `ClipboardList` : l'historique doit montrer que
  // le demandeur a corrigé sa demande, pas qu'il l'a déclarée une seconde fois.
  edited: Pencil,
  closed: BadgeCheck,
  // L'étoile ferme la frise : elle dit au superviseur, dans l'ordre même du
  // dossier, qu'un retour est arrivé — et pas « un dossier s'est mis à jour ».
  rated: Star,
  // La libération de biens du stock accompagne l'acceptation : le superviseur
  // confie du matériel au demandeur. Un colis, pour dire qu'il y a un objet
  // physique derrière la décision.
  material_released: Package,
  // La montée d'un dossier vers une priorité supérieure : le système a agi,
  // sans acteur humain, et l'historique le raconte comme une étape à part.
  escalated: TrendingUp,
}

const formatDate = (value: string): string =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

/**
 * Ligne d'une file de tickets.
 *
 * Le périmètre s'affiche quand il est connu, et le superviseur quand il y en a
 * un : ces deux informations répondent à « où en est ma demande » et « qui
 * s'en occupe » sans avoir à ouvrir le dossier.
 *
 * `showRequester` n'est activé que côté répartition. Sur « My Tickets » le
 * demandeur est la personne qui regarde, l'afficher serait du bruit ; dans le
 * centre de répartition, c'est au contraire la première question à poser —
 * « qui a déclaré ça ? » — et elle ne doit pas coûter un clic.
 */
export function TicketRow({
  ticket,
  onOpen,
  showRequester = false,
  action,
}: {
  ticket: TicketResponse
  onOpen: () => void
  showRequester?: boolean
  /**
   * Action secondaire de la ligne — annuler sa propre demande.
   *
   * Rendue à côté du bouton et non à l'intérieur : un bouton dans un bouton
   * est du HTML invalide, et le clic ouvrirait la fiche au lieu d'annuler.
   */
  action?: React.ReactNode
}) {
  const scope = [ticket.departmentName ?? ticket.departmentCode, ticket.unitName ?? ticket.unitPath]
    .filter(Boolean)
    .join(" › ")

  return (
    <div className="flex items-stretch border-b border-[#edf0f5] last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-[#f7f9fc] sm:px-5"
      >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-slate-400">{ticket.reference}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <TicketSlaBadge sla={ticket.sla} />
        <TicketResponseBadge ticket={ticket} />
      </div>

      <p className="text-[13.5px] font-medium text-[#183b56]">{ticket.title}</p>
      <p className="line-clamp-2 text-[13px] leading-5 text-slate-500">{ticket.description}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" />
          {formatDate(ticket.createdAt)}
        </span>
        {scope && <span>{scope}</span>}
      </div>

      {/*
        Les visages des acteurs du dossier. Présents partout, demandeur compris :
        sur « My Tickets » le demandeur est la personne qui regarde, mais le
        supervisieur ne l'est pas — et c'est lui qu'on veut reconnaître d'un
        coup d'œil. Le nom reste écrit à côté : un visage ne dit pas qui est
        absent.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <UserAvatar userId={ticket.createdBy} name={ticket.createdByName} size="sm" />
          <span className="text-[12px] text-slate-500">
            {showRequester ? "Declared by " : "Declared "}
            {ticket.createdByName ?? "Unknown user"}
          </span>
        </span>

        {ticket.assignedTo && (
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar userId={ticket.assignedTo} name={ticket.assignedToName} size="sm" />
            <span className="text-[12px] text-slate-500">
              Handled by {ticket.assignedToName ?? "Unknown user"}
            </span>
          </span>
        )}
      </div>
      </button>

      {action && (
        <div className="flex shrink-0 items-center border-l border-[#edf0f5] px-3">{action}</div>
      )}
    </div>
  )
}

/**
 * Durée écoulée depuis la déclaration, exprimée en temps lisible.
 *
 * L'historique ne se contente pas de dire « quand » : il dit « combien de
 * temps après la déclaration ». Un ticket pris en revue après 4 minutes et un
 * ticket repris après trois jours ne demandent pas la même vigilance, et la
 * seule date absolue ne le montre pas.
 */
function elapsedSince(createdAt: string, at: string): string {
  const start = new Date(createdAt).getTime()
  const end = new Date(at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return ""

  const totalMinutes = Math.floor((end - start) / 60_000)
  if (totalMinutes < 1) return "immediately"

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const days = Math.floor(hours / 24)

  if (days >= 1) {
    const restHours = hours % 24
    // Les jours seuls masquent tout ce qui s'est passé dans la journée : deux
    // événements le même jour ressortiraient identiques, et l'historique
    // donnerait l'impression d'un calcul faux.
    return restHours > 0 ? `+${days} d ${restHours} h` : `+${days} day${days > 1 ? "s" : ""}`
  }

  // Les minutes sont conservées au-delà de l'heure. Un dossier âgé d'une heure
  // ne doit pas afficher « +1 h » pour deux mouvements dix minutes apart.
  if (hours >= 1) return minutes > 0 ? `+${hours} h ${minutes} min` : `+${hours} h`
  return `+${minutes} min`
}

/**
 * Historique du dossier.
 *
 * Chaque mouvement est écrit par le serveur au moment où il a eu lieu : cet
 * écran ne fait que le lire. Un dossier absorbé par la faute d'un acteur — distribué
 * à la mauvaise personne — se voit ici.
 */
export function TicketTimeline({ ticket }: { ticket: TicketResponse }) {
  return (
    <ol className="space-y-3">
      {ticket.history.map((entry, index) => {
        const Icon = HISTORY_ICON[entry.kind]
        const elapsed = elapsedSince(ticket.createdAt, entry.at)
        return (
          <li key={`${entry.at}-${index}`} className="flex gap-3">
            {/* Le visage plutôt qu'une icône d'étape : ce qui intéresse dans un
                historique, c'est qui a agi. L'icône du type de mouvement est
                conservée à côté de la date. */}
            <UserAvatar userId={entry.actor} name={entry.actorName} size="sm" className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12.5px] text-slate-600">
                <span className="font-medium text-[#183b56]">{entry.actorName}</span>{" "}
                {entry.detail ? `— ${entry.detail}` : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3" />
                  {formatDate(entry.at)}
                </span>
                {elapsed && (
                  <>
                    <span aria-hidden>·</span>
                    {/* Décalage par rapport à la déclaration, pas à l'événement
                        précédent : c'est la durée de vie du ticket qui
                        intéresse, pas l'écart entre deux actions. */}
                    <span title="Time since the ticket was declared">{elapsed}</span>
                  </>
                )}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function TicketEmptyState({
  title,
  hint,
}: {
  title: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#e5eaf2] bg-[#f7f9fc] px-4 py-6 text-center">
      <p className="text-[13px] font-medium text-[#183b56]">{title}</p>
      <p className="mt-1 text-[13px] text-slate-500">{hint}</p>
    </div>
  )
}