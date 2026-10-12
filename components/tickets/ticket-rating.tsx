"use client"

import { useEffect, useState } from "react"
import { Loader2, Pencil, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ticketApi } from "@/lib/api"
import type { TicketResponse } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { BlockingNotice, formatTicketDate } from "./shared"

/** Plafond aligné sur la validation du serveur : un commentaire refusé au dernier
 * moment, après avoir tout écrit, donne l'impression que c'est la note qui est
 * refusée. */
const COMMENT_LIMIT = 1000

const STAR_WORDS = ["One", "Two", "Three", "Four", "Five"]

/**
 * Étoiles en lecture seule.
 *
 * Le nombre d'étoiles est aussi écrit en toutes lettres à côté : cinq pictogrammes
 * alignés se comparent d'un coup d'œil, mais ne disent rien à qui navigue au
 * clavier ou utilise un lecteur d'écran, et « 4 » ne se distingue pas de « ★★★★ »
 * collé à une date.
 */
function RatingStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            className={`size-4 ${position <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
          />
        ))}
      </span>
      <span className="text-[13px] font-medium text-[#183b56] tabular-nums">{value}/5</span>
      <span className="sr-only">
        {value} out of 5
      </span>
    </span>
  )
}

/**
 * Avis du demandeur sur le service rendu.
 *
 * Un dossier résolu est une promesse tenue : quelqu'un a fait le travail, et
 * personne ne peut dire si c'était bien fait. Le demandeur est le seul à l'avoir
 * vécu, et le superviseur qui a résolu est le seul à qui ce retour serve : c'est
 * son travail que la note juge, et personne d'autre ne peut le dire à sa place.
 *
 * L'avis est donc proposé là où il a un sens — après une résolution, pas après
 * une simple clôture — et il reste modifiable : on se trompe d'étoile, et un avis
 * figé ne se corrige pas.
 */
export function TicketRating({
  ticket,
  canRate,
  onRated,
}: {
  ticket: TicketResponse
  /** Le demandeur, sur un dossier effectivement traité. */
  canRate: boolean
  /** Rappelle la liste appelante : l'avis affiché vient du serveur, jamais du clic. */
  onRated: () => void
}) {
  const rated = ticket.rating !== null
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<number>(ticket.rating ?? 0)
  const [comment, setComment] = useState(ticket.ratingComment ?? "")
  // Aperçu pendant la pose : on ne connaît la note choisie qu'après le clic, et un
  // rating figé jusqu'à l'enregistrement donne l'impression que le clic n'a rien
  // fait. L'aperçu ne part pas au serveur.
  const [hovered, setHovered] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le composant suit le dossier affiché : ouvrir un second dossier après en avoir
  // noté un premier repartirait avec la note du précédent.
  useEffect(() => {
    setEditing(false)
    setValue(ticket.rating ?? 0)
    setComment(ticket.ratingComment ?? "")
    setHovered(null)
    setError(null)
  }, [ticket._id, ticket.rating, ticket.ratingComment])

  // Un dossier traité mais encore sans avis n'affiche que l'attente : le silence
  // se lit sinon comme un oubli du demandeur, alors que personne n'a rien oublié.
  if (!rated && !canRate) {
    return (
      <section>
        <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Rating</h3>
        <p className="mt-1.5 text-[13px] text-slate-500">
          {ticket.resolvedByName
            ? `Waiting for ${ticket.createdByName ?? "the requester"}'s rating.`
            : "Waiting for the requester's rating."}
        </p>
      </section>
    )
  }

  const shown = hovered ?? value

  const submit = async () => {
    if (!value) {
      setError("Choose a rating first.")
      return
    }
    const token = getToken()
    if (!token) return

    setSaving(true)
    setError(null)
    try {
      await ticketApi.rate(token, ticket._id, value, comment.trim())
      setEditing(false)
      setHovered(null)
      onRated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The rating could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Rating</h3>

      <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 p-3.5">
        {rated && !editing ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <RatingStars value={ticket.rating as number} />
              {ticket.ratingComment && (
                <p className="mt-1.5 text-[13px] leading-6 whitespace-pre-line text-slate-700">
                  {ticket.ratingComment}
                </p>
              )}
              {ticket.ratedAt && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatTicketDate(ticket.ratedAt)}
                  {ticket.resolvedByName ? ` · service by ${ticket.resolvedByName}` : ""}
                </p>
              )}
            </div>

            {/* « Corriger » et non « Supprimer » : corriger un avis est le droit le
                plus banal du demandeur, et une note effacée à la place d'une note
                changée laisserait le superviseur sans rien. */}
            {canRate && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="shrink-0 gap-1.5 text-[12px] text-slate-500"
              >
                <Pencil className="size-3.5" />
                Change
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="flex flex-wrap items-center gap-1"
              onMouseLeave={() => setHovered(null)}
              role="group"
              aria-label="Rating, from one to five stars"
            >
              {[1, 2, 3, 4, 5].map((position) => {
                const active = position <= shown
                return (
                  <button
                    key={position}
                    type="button"
                    aria-pressed={value === position}
                    aria-label={`${STAR_WORDS[position - 1]} star${position > 1 ? "s" : ""}`}
                    disabled={saving}
                    onMouseEnter={() => setHovered(position)}
                    onFocus={() => setHovered(position)}
                    onBlur={() => setHovered(null)}
                    onClick={() => {
                      setValue(position)
                      setError(null)
                    }}
                    className={`rounded p-1 transition-colors hover:bg-amber-100/70 disabled:opacity-50 ${
                      value === position ? "ring-1 ring-amber-300" : ""
                    }`}
                  >
                    <Star
                      className={`size-6 ${
                        active ? "fill-amber-400 text-amber-400" : "text-slate-300"
                      }`}
                    />
                  </button>
                )
              })}

              <span className="ml-1 text-[12px] text-slate-500 tabular-nums">
                {value ? `${value}/5` : "Choose a rating"}
              </span>
            </div>

            {/* Le commentaire est facultatif et le restera : la note seule est déjà
                un avis complet, et un texte obligatoire ferait perdre les étoiles
                de ceux qui n'écrivent pas. */}
            <div>
              <label
                htmlFor={`rating-comment-${ticket._id}`}
                className="text-[12px] font-medium text-[#183b56]"
              >
                Comment <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id={`rating-comment-${ticket._id}`}
                rows={3}
                maxLength={COMMENT_LIMIT}
                value={comment}
                disabled={saving}
                onChange={(event) => setComment(event.target.value)}
                placeholder="What was the service like?"
                className="mt-1 w-full resize-y rounded-lg border border-[#e5eaf2] px-3 py-2 text-[13px] leading-6 text-slate-700 outline-none focus:border-[#1aa6a6] focus:ring-2 focus:ring-[#1aa6a6]/20 disabled:opacity-60"
              />
              {comment.length >= COMMENT_LIMIT && (
                <p className="mt-1 text-[11px] text-amber-600 tabular-nums">
                  {comment.length}/{COMMENT_LIMIT} — the server refuses anything longer.
                </p>
              )}
            </div>

            {error && <BlockingNotice>{error}</BlockingNotice>}

            <div className="flex items-center justify-end gap-2">
              {rated && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false)
                    setHovered(null)
                    setError(null)
                  }}
                  className="text-slate-500"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                disabled={saving || !value}
                onClick={() => void submit()}
                className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
                {rated ? "Save rating" : "Send rating"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
