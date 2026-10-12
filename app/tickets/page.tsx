"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import {
  Eye,
  Loader2,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { TicketDetailDialog } from "@/components/tickets/ticket-detail-dialog"
import { CloseDialog } from "@/components/tickets/close-dialog"
import { TicketEmptyState, TicketRow } from "@/components/tickets/ticket-view"
import { getToken } from "@/lib/auth"
import {
  ApiError,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  ticketApi,
  type TicketPriority,
  type TicketResponse,
} from "@/lib/api"
import { useTicketFeed } from "@/lib/use-ticket-feed"
import { useHighlightParam } from "@/lib/use-highlight"

/**
 * Étapes où le demandeur peut encore retirer sa demande.
 *
 * Doit refléter `CANCELLABLE_BY_REQUESTER` côté serveur : afficher un bouton
 * qui répond 409, ou cacher un bouton qui fonctionne, mettrait l'écran en
 * contradiction avec la règle. Redondance volontaire — l'écran peut évoluer
 * indépendamment du serveur.
 */
const CANCELLABLE = ["new", "being_reviewed"]

/**
 * Étapes où le demandeur peut encore corriger sa demande.
 *
 * `new` seul, contre `["new", "being_reviewed"]` pour l'annulation : les deux
 * gestes se ressemblent mais ne se valent pas. Retirer une demande ne gêne
 * personne ; la réécrire, si — dès qu'un encadrant l'a prise en charge, il va la
 * distribuer en fonction de ce qui est écrit, et modifier le texte sous ses yeux
 * changerait la question après la réponse. Reflète `MUTABLE_BY_REQUESTER`.
 */
const EDITABLE = ["new"]

/**
 * « My Tickets » : ce que j'ai déclaré.
 *
 * Une seule file, celle des demandes qu'on a soi-même déposées. Les tickets
 * distribués à la personne ne figurent pas ici : ils se gèrent sur « Tickets to
 * handle », où se trouvent aussi les actions qui les concernent — accepter,
 * rendre, rendre compte. Les dupliquer ici obligeait à choisir un onglet selon
 * le rôle, et la moitié des boutons disparaissaient selon cet onglet.
 */
export default function MyTicketsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <MyTickets />
      </Suspense>
    </AuthGuard>
  )
}

function MyTickets() {
  const [submitted, setSubmitted] = useState<TicketResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketResponse | null>(null)
  const [declaring, setDeclaring] = useState(false)
  // Demande en cours de correction. Distincte de `declaring` : les deux partagent
  // les mêmes champs, mais l'une crée un dossier et l'autre corrige un dossier
  // existant — l'historique doit montrer qu'il y a eu une version antérieure.
  const [editing, setEditing] = useState<TicketResponse | null>(null)
  // Demande en cours d'annulation : le dialogue porte le motif et le serveur
  // l'applique. `null` signifie « aucune annulation demandée ».
  const [cancelling, setCancelling] = useState<TicketResponse | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await ticketApi.mine(token)
      setSubmitted(data.submitted)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load your tickets.")
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
    if (loading || submitted.length === 0) return
    const ticket = submitted.find((candidate) => candidate._id === highlight)
    if (!ticket) return
    handledHighlightRef.current = highlight
    setSelected(ticket)
  }, [highlight, submitted, loading])

  /**
   * Relecture discrète de la liste, pour un changement arrivé d'ailleurs.
   *
   * `load` porte le squelette : il a le droit, c'est la première lecture. Ici la
   * liste est déjà à l'écran et la personne n'a rien demandé — un dossier qu'elle
   * vient de déclarer entre dans la liste par son propre geste, un dossier clos
   * par l'administration en sort pendant qu'elle regarde. Remettre un squelette
   * ferait clignoter la page entière pour une information qui tient en une ligne.
   *
   * Elle ne corrige donc pas le statut sur le triplet reçu : elle relit. Le statut
   * emporte avec lui des champs qu'un écran ne peut pas inventer — la résolution
   * d'un dossier, son motif de clôture, l'historique — et les reconstruire à
   * partir de trois champs donnerait une ligne à moitié vraie, plus trompeuse
   * qu'une absence.
   */
  const refreshMine = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const data = await ticketApi.mine(token)
      setSubmitted(data.submitted)
      // La fiche ouverte suit le dossier qu'elle montre : sans cela, on y
      // lirait l'état d'avant la décision, sur un dossier qui a changé d'étape.
      // Elle se referme si le dossier n'est plus dans la liste — supprimé entre-temps.
      setSelected((current) => {
        if (!current) return current
        return data.submitted.find((ticket) => ticket._id === current._id) ?? null
      })
    } catch {
      // Une coupure réseau ne vide pas la liste : ce qui est affiché reste vrai,
      // et la prochaine décision la remettra à jour.
    }
  }, [])

  /**
   * La liste et ses dialogues suivent l'état réel des dossiers, sans rechargement.
   *
   * Une demande est déposée par son auteur, mais c'est l'administration qui la
   * distribue, la supervise, la résout ou la clôture. Chacune de ces décisions
   * arrive sur un écran ouvert, et l'écran doit la refléter : sinon la personne
   * continue d'agir sur une étape finie — corriger un dossier déjà pris en
   * charge, annuler une demande que le service traite, et lire un refus dans un
   * serveur sans explication.
   *
   * Les dialogues se ferment dès que le statut change : ils portent sur une étape
   * précise (« prendre en charge », « résoudre », « annuler »), et celle-ci n'est
   * plus celle en cours. Les laisser ouverts proposerait une action que le serveur
   * refusera, avec un message que personne ne saurait expliquer.
   */
  useTicketFeed({
    onEvent: (payload) => {
      // Un dossier supprimé ne peut plus être ouvert ni modifié. Les statuts
      // concordent encore, puisque l'événement voyage avec l'ancien : c'est
      // l'action qui distingue la disparition d'un simple changement d'étape.
      if (payload.action === "delete") {
        setSelected((current) => (current?._id === payload.id ? null : current))
        setEditing((current) => (current?._id === payload.id ? null : current))
        setCancelling((current) => (current?._id === payload.id ? null : current))
        return
      }

      const staleIfChanged = (current: TicketResponse | null) =>
        current && current._id === payload.id && current.status !== payload.status ? null : current

      setEditing(staleIfChanged)
      setCancelling(staleIfChanged)
    },
    onRefresh: () => void refreshMine(),
  })

  // Le temps de réponse du serveur laisse l'écran vide ; on le dit plutôt que
  // d'afficher « aucun ticket », qui ferait croire que la demande est perdue.
  if (loading) {
    return (
      <DashboardShell title="My Tickets" subtitle="Loading your tickets…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your tickets…
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="My Tickets"
      subtitle="Declare a problem, then follow who is handling it."
      breadcrumb="Support"
      actions={
        <Button onClick={() => setDeclaring(true)}>
          <Plus data-icon="inline-start" />
          New ticket
        </Button>
      }
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {submitted.length > 0 && (
          <p className="text-[13px] text-slate-500">
            {submitted.length === 1
              ? "One ticket declared."
              : `${submitted.length} tickets declared.`}
          </p>
        )}

        {submitted.length === 0 ? (
          <TicketEmptyState
            title="No ticket declared yet"
            hint="Declare a problem and the support centre will route it to the right supervisor."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white">
            {submitted.map((ticket) => (
              <TicketRow
                key={ticket._id}
                ticket={ticket}
                onOpen={() => setSelected(ticket)}
/*
                  Trois gestes, trois moments. « Details » toujours — c'est une
                  lecture. « Edit » tant que la demande est `new` seulement :
                  passé la prise en charge, un encadrant va la distribuer en
                  fonction de ce qui est écrit, et la réécrire changerait la
                  question après la réponse. « Cancel » jusqu'à `being_reviewed`
                  inclus : retirer ne gêne personne, contrairement à réécrire.

                  Les deux listes reflètent `MUTABLE_BY_REQUESTER` et
                  `CANCELLABLE_BY_REQUESTER` côté serveur. Un bouton qui
                  répondrait 409 serait pire qu'un bouton absent : il laisserait
                  croire que la correction est possible jusqu'au bout.
                */
                action={
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-2 text-slate-400 hover:bg-[#f0f4f9] hover:text-[#183b56]"
                      onClick={() => setSelected(ticket)}
                    >
                      <Eye className="size-3.5" />
                      Details
                    </Button>

                    {EDITABLE.includes(ticket.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-slate-400 hover:bg-[#f0f4f9] hover:text-[#183b56]"
                        onClick={() => setEditing(ticket)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    )}

                    {CANCELLABLE.includes(ticket.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setCancelling(ticket)}
                      >
                        <X className="size-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>

      <DeclareDialog
        open={declaring}
        onClose={() => setDeclaring(false)}
        onDeclared={async () => {
          setDeclaring(false)
          await load()
        }}
      />

      <EditDialog
        ticket={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          // La fiche éventuellement ouverte montre encore l'ancien texte : la refermer
          // évite d'afficher deux versions du même dossier côte à côte.
          setSelected(null)
          await load()
        }}
      />

      <TicketDetailDialog
        ticket={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        // Seul cet écran a besoin de la relecture : poser un avis ne fait pas partie
        // des annonces de dossier, donc personne d'autre — pas même la fiche ouverte
        // ici — ne reçoit l'événement qui le ferait rafraîchir.
        onRated={() => void refreshMine()}
      />

      <CloseDialog
        ticket={cancelling}
        mode="requester"
        onClose={() => setCancelling(null)}
        onClosed={async () => {
          setCancelling(null)
          setSelected(null)
          await load()
        }}
        onError={setError}
      />
    </DashboardShell>
  )
}

/**
 * Correction d'une demande existante.
 *
 * Mêmes champs que la déclaration, et pour la même raison : le déclarant décrit
 * un problème vécu, il n'a rien à dire du périmètre ni du traitement. Seule la
 * préremplissage change — le formulaire s'ouvre sur le texte déjà déposé, sinon
 * le corriger obligerait à le recopier.
 *
 * Le serveur est l'arbitre : si le dossier est passé `being_reviewed` entre le
 * clic et l'enregistrement, il répond 409 et le message est affiché tel quel.
 */
function EditDialog({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: TicketResponse | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TicketPriority>("medium")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le formulaire se remplit à l'ouverture, pas au rendu : `ticket` change à
  // chaque rechargement de la liste, et le ressaisir effacerait ce que le
  // demandeur est en train de corriger.
  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title)
      setDescription(ticket.description)
      setPriority(ticket.priority)
      setError(null)
    }
  }, [ticket])

  const tooShort = title.trim().length < 3 || description.trim().length < 5
  // Rien à enregistrer : le bouton reste inactif plutôt que d'appeler le serveur
  // pour lui renvoyer la même chose.
  const unchanged =
    ticket !== null &&
    title.trim() === ticket.title &&
    description.trim() === ticket.description &&
    priority === ticket.priority

  const submit = async () => {
    const token = getToken()
    if (!token || !ticket || tooShort) return
    setSaving(true)
    setError(null)
    try {
      await ticketApi.update(token, ticket._id, {
        title: title.trim(),
        description: description.trim(),
        priority,
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update the ticket.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={ticket !== null}
      onClose={onClose}
      title="Edit your ticket"
      description={
        ticket
          ? `${ticket.reference} · change the wording while it has not been taken in charge yet.`
          : undefined
      }
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || tooShort || unchanged}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            Save changes
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

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Title</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            A short summary, in one line. At least 3 characters.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={2000}
          />
          <span className="block text-[11.5px] text-slate-400">
            The more context, the faster it is handled. At least 5 characters.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Priority</span>
          <Select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
            {TICKET_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {TICKET_PRIORITY_LABELS[key]}
              </option>
            ))}
          </Select>
          <span className="block text-[11.5px] text-slate-400">
            How urgent is it? Critical first, Low when it can wait.
          </span>
        </label>
      </div>
    </Modal>
  )
}

/**
 * Déclaration d'un ticket.
 *
 * Deux champs, titre et description. Le déclarant décrit un problème vécu, il
 * ne connaît pas l'organigramme et n'a rien à dire du périmètre ni du
 * traitement : tout le reste est déduit de son compte ou décidé par le
 * support. Lui demander davantage produirait des tickets vides.
 */
function DeclareDialog({
  open,
  onClose,
  onDeclared,
}: {
  open: boolean
  onClose: () => void
  onDeclared: () => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  // Aucune valeur par défaut : la personne doit choisir le niveau d'urgence
  // elle-même. Le centre trie sur cette valeur, un ticket déclaré sans elle
  // attendrait une décision qui ne lui a pas été donnée.
  const [priority, setPriority] = useState<TicketPriority | "">("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Réinitialiser à la fermeture : rouvrir le formulaire doit présenter une
  // fiche vierge, pas la déclaration précédente.
  useEffect(() => {
    if (open) {
      setTitle("")
      setDescription("")
      setPriority("")
      setError(null)
    }
  }, [open])

  const tooShort = title.trim().length < 3 || description.trim().length < 5 || priority === ""

  const submit = async () => {
    const token = getToken()
    if (!token || tooShort) return
    setSaving(true)
    setError(null)
    try {
      await ticketApi.create(token, {
        title: title.trim(),
        description: description.trim(),
        priority,
      })
      await onDeclared()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to declare the ticket.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Declare a ticket"
      description="Describe the problem you are facing. The support centre will route it."
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || tooShort}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send data-icon="inline-start" />}
            Submit
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

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Title</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="The printer on floor 2 no longer prints"
            maxLength={140}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            A short summary, in one line. At least 3 characters.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What happened, what you expected, and anything you already tried."
            rows={5}
            maxLength={2000}
          />
          <span className="block text-[11.5px] text-slate-400">
            The more context, the faster it is handled. At least 5 characters.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">Priority level</span>
          <Select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
            <option value="">Select a priority...</option>
            {TICKET_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {TICKET_PRIORITY_LABELS[key]}
              </option>
            ))}
          </Select>
          <span className="block text-[11.5px] text-slate-400">
            How urgent is it? Critical blocks everyone, Low can wait until the end of the week.
          </span>
        </label>
      </div>
    </Modal>
  )
}