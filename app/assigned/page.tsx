"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Package, PlayCircle, Search, Undo2 } from "lucide-react"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import { TicketDetailDialog } from "@/components/tickets/ticket-detail-dialog"
import { TicketEmptyState, TicketRow } from "@/components/tickets/ticket-view"
import { getToken } from "@/lib/auth"
import {
  ApiError,
  materialApi,
  ticketApi,
  type MaterialItemResponse,
  type TicketResponse,
} from "@/lib/api"
import { useTicketFeed } from "@/lib/use-ticket-feed"
import { useUnseenBadge } from "@/components/realtime/unseen-badge-provider"
import { useSessionUser } from "@/lib/use-session"

/**
 * Tickets reçus.
 *
 * Le superviseur n'y trouve que ce qui lui a été distribué : c'est le seul
 * écran où une action de traitement est possible, et il n'affiche rien qui
 * n'est pas de lui. Un ticket soldé reste visible — un dossier ne disparaît
 * pas de l'historique de celui qui l'a traité.
 *
 * Deux moments s'y distinguent, et l'écran les sépare : le dossier distribué
 * qui attend une décision, puis le dossier accepté, dont il faut rendre compte.
 * Les confondre en « en cours » dès la distribution donnait à l'administrateur
 * l'impression qu'un travail avait commencé alors que personne n'avait dit oui.
 */
export default function AssignedTicketsPage() {
  return (
    <AuthGuard>
      <AssignedTickets />
    </AuthGuard>
  )
}

function AssignedTickets() {
  const session = useSessionUser()
  const [tickets, setTickets] = useState<TicketResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketResponse | null>(null)
  const [accepting, setAccepting] = useState<TicketResponse | null>(null)
  const [resolving, setResolving] = useState<TicketResponse | null>(null)
  const [returning, setReturning] = useState<TicketResponse | null>(null)

  const isSupervisor = session?.access.includes("manager") ?? false
  const { markSeen } = useUnseenBadge("assigned")

  /**
   * L'arrivée sur l'écran vaut consultation.
   *
   * Le compteur annonce ce qui attend le superviseur ; la liste qu'il vient d'ouvrir
   * est cette attente, ligne à ligne. Le garder afficherait un « 1 » à côté d'un
   * dossier déjà devant les yeux — et le superviseur partirait du principe que le
   * compteur annonce autre chose que ce qu'il vient de regarder.
   *
   * L'effacement est déclenché par le fournisseur sur le chemin `/assigned`, et
   * l'initialisation de l'écran l'est ici pour la première venue : entre le montage
   * et le premier rendu de la liste, le chemin n'a pas encore changé.
   */
  useEffect(() => {
    markSeen()
  }, [markSeen])

  /**
   * Ouvre la fiche d'un dossier.
   *
   * Lire un dossier, c'est l'avoir traité : le compteur cesse alors d'annoncer un
   * dossier que le superviseur est en train de lire sous ses yeux. Sans cela, rester
   * sur la page afficherait en permanence un « 1 » à côté d'un dossier déjà ouvert.
   */
  const openDetails = (ticket: TicketResponse) => {
    setSelected(ticket)
    markSeen()
  }

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await ticketApi.mine(token)
      setTickets(data.received)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the tickets assigned to you.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Relecture discrète de la liste, pour un changement arrivé d'ailleurs.
   *
   * `load` porte le squelette : il a le droit, c'est la première lecture. Ici la
   * liste est déjà à l'écran et le superviseur n'a rien demandé — c'est
   * l'administration qui distribue, qui reprend le dossier à son compte, ou qui le
   * supprime. Remettre un squelette ferait clignoter la page entière pour une
   * information qui tient en une ligne.
   *
   * Elle ne corrige pas le statut sur le triplet reçu : elle relit. Le statut
   * emporte avec lui des champs qu'un écran ne peut pas inventer — la résolution,
   * le motif de retour, l'historique — et les reconstruire à partir de trois
   * champs donnerait une ligne à moitié vraie, plus trompeuse qu'une absence.
   */
  const refreshHandled = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const data = await ticketApi.mine(token)
      setTickets(data.received)
      // La fiche ouverte suit le dossier qu'elle montre : sans cela, on y lirait
      // l'état d'avant la décision. Elle se referme si le dossier n'est plus à
      // traiter — rendu au centre, supprimé, ou repris par un autre.
      setSelected((current) => {
        if (!current) return current
        return data.received.find((ticket) => ticket._id === current._id) ?? null
      })
    } catch {
      // Une coupure réseau ne vide pas la liste : ce qui est affiché reste vrai,
      // et la prochaine décision la remettra à jour.
    }
  }, [])

  /**
   * La liste et ses dialogues suivent l'état réel des dossiers, sans rechargement.
   *
   * Un dossier distribué change d'état sous les yeux du superviseur : l'acceptation
   * le lui retire des mains, une résolution le fait disparaître, un retour le
   * renvoie au centre, une suppression l'efface. Sans signal, il continuerait de
   * traiter une étape déjà franchie et n'y comprendrait rien : le serveur refuse
   * alors une action dont personne ne lui a dit qu'elle était devenue impossible.
   *
   * Les dialogues se ferment dès que le statut change : ils portent sur une étape
   * précise — prendre en charge, résoudre, rendre — et celle-ci n'est plus celle en
   * cours. Les laisser ouverts proposerait une action que le serveur refusera.
   */
  useTicketFeed({
    onEvent: (payload) => {
      // Un dossier distribué pendant que le superviseur regarde cette page entre
      // dans la liste sans qu'il ait rien demandé, et la ligne s'y ajoute sous ses
      // yeux : le compteur n'a donc plus lieu de l'annoncer.
      //
      // C'est l'inverse du centre de répartition, où la file ne se met pas à jour
      // d'elle-même et où un « 1 » prévient justement d'un dossier invisible. La
      // différence ne vient pas du rôle, mais du fait que cette liste, elle, sait
      // se rafraîchir.
      if (payload.action === "assign") markSeen()

      // Un dossier supprimé ne peut plus être ouvert ni traité. Les statuts
      // concordent encore, puisque l'événement voyage avec l'ancien : c'est
      // l'action qui distingue la disparition d'un simple changement d'étape.
      if (payload.action === "delete") {
        setSelected((current) => (current?._id === payload.id ? null : current))
        setAccepting((current) => (current?._id === payload.id ? null : current))
        setResolving((current) => (current?._id === payload.id ? null : current))
        setReturning((current) => (current?._id === payload.id ? null : current))
        return
      }

      const staleIfChanged = (current: TicketResponse | null) =>
        current && current._id === payload.id && current.status !== payload.status ? null : current

      setAccepting(staleIfChanged)
      setResolving(staleIfChanged)
      setReturning(staleIfChanged)
    },
    onRefresh: () => void refreshHandled(),
  })

  if (loading) {
    return (
      <DashboardShell title="Tickets to handle" subtitle="Loading the tickets assigned to you…">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </p>
      </DashboardShell>
    )
  }

  // Une décision en attente, ou un dossier dont il faut rendre compte : les deux
  // exigent le superviseur, et les deux doivent rester visibles. Ni l'un ni l'autre
  // n'est « traité ».
  const pending = tickets.filter(
    (ticket) => ticket.status === "under_analysis" || ticket.status === "in_progress",
  )
  const awaitingDecision = tickets.filter((ticket) => ticket.status === "under_analysis").length

  return (
    <DashboardShell
      title="Tickets to handle"
      subtitle={
        isSupervisor
          ? "Tickets distributed to you. Accept what you can handle, hand back what you cannot."
          : "Only supervisors receive tickets."
      }
      breadcrumb="Support"
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}

        {pending.length > 0 && (
          <p className="text-[13px] text-slate-500">
            {pending.length === 1
              ? "One ticket is waiting for you."
              : `${pending.length} tickets are waiting for you.`}
            {awaitingDecision > 0 && (
              <span className="text-slate-400">
                {" "}
                {awaitingDecision === 1
                  ? "One of them still needs your decision."
                  : `${awaitingDecision} of them still need your decision.`}
              </span>
            )}
          </p>
        )}

        {tickets.length === 0 ? (
          <TicketEmptyState
            title="No ticket assigned to you"
            hint={
              isSupervisor
                ? "The dispatch centre distributes tickets to you. Nothing is waiting for now."
                : "Receiving a ticket requires the Supervisor role."
            }
          />
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div
                key={ticket._id}
                className="overflow-hidden rounded-xl border border-[#e5eaf2] bg-white"
              >
                <TicketRow ticket={ticket} onOpen={() => openDetails(ticket)} />

                {/* Deux moments, deux questions. « under_analysis » demande une décision :
                    accepter de traiter, ou rendre le dossier avant d'avoir
                    commencé. « in_progress » ne demande plus qu'un compte rendu.
                    Un ticket résolu attend la clôture par l'administration, et
                    un dossier soldé est terminé. */}
                {(ticket.status === "under_analysis" || ticket.status === "in_progress") && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#edf0f5] bg-[#f7f9fc] px-4 py-2.5 sm:px-5">
                    {ticket.status === "under_analysis" && (
                      /* Les deux issues s'opposent et sont proposées ensemble :
                         « je m'en occupe » et « ce n'est pas pour moi » sont les
                         deux réponses honnêtes à une distribution. N'en montrer
                         qu'une obligerait le superviseur à laisser un dossier en
                         attente plutôt qu'à le dire. */
                      <p className="mr-auto text-[12px] leading-5 text-slate-500">
                        Waiting for you: accept to start, or hand it back with a reason.
                      </p>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReturning(ticket)}
                    >
                      <Undo2 data-icon="inline-start" />
                      Hand back to dispatch
                    </Button>

                    {ticket.status === "under_analysis" ? (
                      <Button size="sm" onClick={() => setAccepting(ticket)}>
                        <PlayCircle data-icon="inline-start" />
                        Accept and start
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setResolving(ticket)}>
                        <CheckCircle2 data-icon="inline-start" />
                        Mark as handled
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AcceptDialog
        ticket={accepting}
        onClose={() => setAccepting(null)}
        onAccepted={async () => {
          setAccepting(null)
          // Le dossier a été vu et tranché : le compteur n'a plus à le rappeler.
          markSeen()
          await load()
        }}
      />

      <ResolveDialog
        ticket={resolving}
        onClose={() => setResolving(null)}
        onResolved={async () => {
          setResolving(null)
          markSeen()
          await load()
        }}
      />

      <ReturnDialog
        ticket={returning}
        onClose={() => setReturning(null)}
        onReturned={async () => {
          setReturning(null)
          setSelected(null)
          markSeen()
          await load()
        }}
      />

      <TicketDetailDialog
        ticket={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </DashboardShell>
  )
}

/**
 * Acceptation du dossier.
 *
 * Aucun texte à saisir : accepter ne décrit rien, et un champ à remplir
 * demanderait de l'inventer. La confirmation sert seulement à montrer ce que
 * l'acceptation déclenche — le passage en « In Progress » et l'information du
 * demandeur — parce qu'un clic unique et définitif est celui qu'on peut faire
 * sans y penser.
 */
function AcceptDialog({
  ticket,
  onClose,
  onAccepted,
}: {
  ticket: TicketResponse | null
  onClose: () => void
  onAccepted: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Libération de matériel : optionnelle, ouverte par une case. Le superviseur
  // choisit parmi les produits du stock (stockMateriel), fixe pour chacun la
  // quantité donnée et l'usage — prêté et à rendre, ou consommé en une fois.
  // Le stock décroît d'autant à la prise en charge.
  const [releaseMaterial, setReleaseMaterial] = useState(false)
  const [stock, setStock] = useState<MaterialItemResponse[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [materialSearch, setMaterialSearch] = useState("")
  const [selection, setSelection] = useState<
    Record<string, { quantity: number; reusable: boolean }>
  >({})

  useEffect(() => {
    if (ticket) setError(null)
  }, [ticket])

  useEffect(() => {
    // La liste des produits n'est chargée que si le superviseur ouvre la
    // libération : un écran qui ne demande pas de matériel n'a que faire du
    // stock entier.
    if (!ticket || !releaseMaterial) return
    let active = true
    const token = getToken()
    if (!token) return
    setStockLoading(true)
    void materialApi
      .list(token)
      .then((items) => {
        if (active) setStock(items)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : "Unable to load the stock.")
      })
      .finally(() => {
        if (active) setStockLoading(false)
      })
    return () => {
      active = false
    }
  }, [ticket, releaseMaterial])

  useEffect(() => {
    if (!ticket) return
    setReleaseMaterial(false)
    setMaterialSearch("")
    setSelection({})
  }, [ticket])

  const toggle = (item: MaterialItemResponse) => {
    setSelection((current) => {
      if (current[item._id]) {
        const next = { ...current }
        delete next[item._id]
        return next
      }
      return { ...current, [item._id]: { quantity: 1, reusable: item.reusable } }
    })
  }

  const setQuantity = (id: string, quantity: number) => {
    setSelection((current) =>
      current[id] ? { ...current, [id]: { ...current[id], quantity } } : current,
    )
  }

  const setReusable = (id: string, reusable: boolean) => {
    setSelection((current) =>
      current[id] ? { ...current, [id]: { ...current[id], reusable } } : current,
    )
  }

  const selectedCount = Object.keys(selection).length

  // Même recherche que l'inventaire : nom, code, marque, modèle. Tous les
  // produits sont proposés — le superviseur peut les voir tous — mais ceux dont
  // le stock est épuisé ne peuvent pas être libérés.
  const filterable = useMemo(
    () =>
      stock.map((item) => ({
        item,
        name: item.name,
        code: item.code,
        brand: item.brand,
        model: item.model,
      })),
    [stock],
  )
  const visibleStock = useMemo(() => {
    const q = materialSearch.trim().toLowerCase()
    if (!q) return filterable
    return filterable.filter((entry) =>
      [entry.name, entry.code, entry.brand, entry.model]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [filterable, materialSearch])

  if (!ticket) return null

  const submit = async () => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const materials = Object.entries(selection).map(([materialId, line]) => ({
        materialId,
        quantity: line.quantity,
        reusable: line.reusable,
      }))
      await ticketApi.accept(token, ticket._id, materials.length > 0 ? materials : undefined)
      await onAccepted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to accept this ticket.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title="Take this ticket in hand"
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle data-icon="inline-start" />
            )}
            Accept and start
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

        <p className="text-[13px] leading-5 text-slate-600">{ticket.description}</p>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#e5eaf2] bg-[#f7f9fc] px-3.5 py-3">
          <input
            type="checkbox"
            checked={releaseMaterial}
            onChange={(event) => {
              setReleaseMaterial(event.target.checked)
              if (!event.target.checked) setSelection({})
            }}
            className="mt-0.5 size-4 accent-[#1aa6a6]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#183b56]">
              <Package className="size-4 text-[#1aa6a6]" />
              Release products from stock for {ticket.createdByName}
            </span>
            <span className="mt-0.5 block text-[12px] leading-4 text-slate-500">
              Pick products, set the quantity and whether each is reusable or consumed once. The
              stock is decremented the moment this ticket is taken in hand.
            </span>
          </span>
        </label>

        {releaseMaterial &&
          (stockLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[#e5eaf2] px-3 py-6 text-[13px] text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading the stock...
            </div>
          ) : stock.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
              The stock is empty right now. You can still accept the ticket and handle the request
              without releasing material.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={materialSearch}
                  onChange={(event) => setMaterialSearch(event.target.value)}
                  className="h-9 pl-8"
                  placeholder={`${stock.length} products — search a product`}
                  aria-label="Search products to release"
                />
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-[#e5eaf2] p-2">
                {visibleStock.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[12px] text-slate-500">
                    No product matches this search.
                  </p>
                ) : (
                  visibleStock.map(({ item }) => {
                    const line = selection[item._id]
                    const checked = Boolean(line)
                    const out = item.stockQuantity <= 0
                    return (
                      <div
                        key={item._id}
                        className={
                          checked
                            ? "rounded-lg border border-[#1aa6a6] bg-[#f2fbfb] px-3 py-2"
                            : "rounded-lg border border-[#e5eaf2] px-3 py-2"
                        }
                      >
                        <label
                          className={
                            out
                              ? "flex items-center gap-2.5 opacity-50"
                              : "flex cursor-pointer items-center gap-2.5"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={out}
                            onChange={() => toggle(item)}
                            className="size-4 accent-[#1aa6a6]"
                          />
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#edf8f8] text-[#1aa6a6]">
                            {item.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image} alt={item.name} className="size-full object-cover" />
                            ) : (
                              <Package className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-medium text-[#183b56]">
                                {item.name}
                              </span>
                              <span className="shrink-0 font-mono text-[11px] text-slate-400">
                                {item.code}
                              </span>
                            </span>
                            <span className="block truncate text-[11.5px] text-slate-400">
                              {out
                                ? "Out of stock"
                                : `${item.stockQuantity} in stock${
                                    item.brand || item.model
                                      ? ` · ${[item.brand, item.model].filter(Boolean).join(" ")}`
                                      : ""
                                  }`}
                            </span>
                          </span>
                        </label>

                        {checked && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#d6eded] pt-2">
                            <Input
                              type="number"
                              min={1}
                              max={item.stockQuantity}
                              value={line.quantity}
                              onChange={(event) =>
                                setQuantity(
                                  item._id,
                                  Math.min(
                                    item.stockQuantity,
                                    Math.max(1, Number(event.target.value) || 1),
                                  ),
                                )
                              }
                              className="h-8 w-20"
                              aria-label={`Quantity of ${item.name}`}
                            />
                            <div className="inline-flex overflow-hidden rounded-lg border border-[#dce5ed]">
                              <button
                                type="button"
                                onClick={() => setReusable(item._id, true)}
                                className={
                                  "px-2.5 py-1.5 text-[11.5px] font-medium transition-colors " +
                                  (line.reusable
                                    ? "bg-[#183b56] text-white"
                                    : "bg-white text-slate-500 hover:bg-slate-50")
                                }
                              >
                                Reusable
                              </button>
                              <button
                                type="button"
                                onClick={() => setReusable(item._id, false)}
                                className={
                                  "px-2.5 py-1.5 text-[11.5px] font-medium transition-colors " +
                                  (!line.reusable
                                    ? "bg-[#183b56] text-white"
                                    : "bg-white text-slate-500 hover:bg-slate-50")
                                }
                              >
                                Consumed
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              <p className="text-[12px] text-slate-400">
                {selectedCount === 0
                  ? "No product selected."
                  : `${selectedCount} product${selectedCount === 1 ? "" : "s"} will be released to ${ticket.createdByName}.`}
              </p>
            </div>
          ))}

        <p className="text-[13px] leading-5 text-slate-600">
          The ticket becomes In Progress and the requester is told work has started. From there
          the only two ways out are describing what you did, or handing it back with a reason.
        </p>
      </div>
    </Modal>
  )
}

/**
 * Restitution du dossier au centre de répartition.
 *
 * Le motif est obligatoire, pour les mêmes raisons qu'à la clôture : c'est lui
 * que lira l'administrateur pour redistribuer, et il ne dispose d'aucun autre
 * contexte. Le texte est orienté vers ce que ça bloque et ce qui serait utile,
 * pas vers une justification de soi : « la qualité RZOR n'est pas définie dans
 * le système » indique le besoin, « je n'ai pas le profil » ne dit rien.
 */
function ReturnDialog({
  ticket,
  onClose,
  onReturned,
}: {
  ticket: TicketResponse | null
  onClose: () => void
  onReturned: () => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ticket) {
      setReason("")
      setError(null)
    }
  }, [ticket])

  if (!ticket) return null

  const tooShort = reason.trim().length < 10
  // Refuser avant d'avoir commencé et abandonner en cours ne se distinguent que
  // par le moment ; l'écran doit le dire, sinon le superviseur qui n'a pas
  // encore accepté lit « hand back » comme s'il abandonnait un dossier
  // commencé.
  const beforeStart = ticket.status === "under_analysis"

  const submit = async () => {
    const token = getToken()
    if (!token || tooShort) return
    setSaving(true)
    setError(null)
    try {
      await ticketApi.returnToDispatch(token, ticket._id, reason.trim())
      await onReturned()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to hand this ticket back.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title={beforeStart ? "Decline this ticket" : "Hand this ticket back to dispatch"}
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving || tooShort}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Undo2 data-icon="inline-start" />}
            {beforeStart ? "Decline it" : "Hand it back"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <p className="text-[13px] leading-5 text-slate-600">
          {beforeStart
            ? "You have not started on this ticket. Declining it takes it off your list and sends it straight back to the dispatch centre, which will give it to someone else — with your reason attached."
            : "This leaves your list and goes back to the dispatch centre, which will assign it to someone else. Use it when the problem is not yours to handle, or when you could not find a solution on your own."}
        </p>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">
            {beforeStart ? "Why are you declining it?" : "Why are you handing it back?"}
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="RZOR quality is not defined in the system; this needs a referent for the product reference, which is not my area."
            rows={4}
            maxLength={300}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            The dispatch centre reads this to choose who takes over. Say what blocks you, not who you
            are.
          </span>
        </label>
      </div>
    </Modal>
  )
}

/**
 * Compte rendu de traitement.
 *
 * Le champ est obligatoire et le serveur refuse un texte d'un seul mot : un
 * ticket soldé sans description du travail effectué n'apporte rien au
 * demandeur, et donne l'impression d'un traitement bâclé. « Traité » ne
 * suffit pas.
 */
function ResolveDialog({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: TicketResponse | null
  onClose: () => void
  onResolved: () => Promise<void>
}) {
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ticket) {
      setNote("")
      setError(null)
    }
  }, [ticket])

  if (!ticket) return null

  const tooShort = note.trim().length < 5

  const submit = async () => {
    const token = getToken()
    if (!token || tooShort) return
    setSaving(true)
    setError(null)
    try {
      await ticketApi.resolve(token, ticket._id, note.trim())
      await onResolved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to resolve the ticket.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(ticket)}
      onClose={onClose}
      title="Describe what you did"
      description={`${ticket.reference} — ${ticket.title}`}
      centerOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || tooShort}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
            Mark as handled
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <p className="text-[13px] leading-5 text-slate-600">{ticket.description}</p>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#183b56]">What was done</span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Replaced the toner cartridge and reset the print queue; test page came out correctly."
            rows={4}
            maxLength={2000}
            autoFocus
          />
          <span className="block text-[11.5px] text-slate-400">
            The requester reads this sentence: say what you changed and what you verified.
          </span>
        </label>
      </div>
    </Modal>
  )
}
