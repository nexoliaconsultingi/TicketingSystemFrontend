"use client"

import { useMemo, useState } from "react"
import { CalendarOff, Loader2, Plus, Trash2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  ACTIVITIES,
  scopeKey,
  type ActivityKey,
  type ResponderRecord,
  type StaffMember,
} from "@/lib/tickets/types"
import type { DemoDepartment } from "@/lib/tickets/store"
import { BlockingNotice, EmptyNotice } from "./shared"

interface CompetencyPanelProps {
  departments: ReadonlyArray<DemoDepartment>
  staff: StaffMember[]
  responders: ResponderRecord[]
  /**
   * Périmètre que l'utilisateur courant peut modifier, ou `null` s'il n'a
   * aucun droit d'écriture. Le dispatcher passe `"all"` : il administre toutes
   * les zones, ce que la comparaison de périmètre ne peut pas exprimer.
   */
  editableScope: { departmentCode: string; unitPath: string | null } | "all" | null
  onUpsert: (record: ResponderRecord) => void
  onRemove: (userId: string, scope: { departmentCode: string; unitPath: string | null }) => void
  saving: boolean
}

const REASON_LIMIT = 160

/**
 * Registre des personnes compétentes, par zone et par activité.
 *
 * C'est la source de vérité du refus d'attribution : sans déclaration, une
 * personne est refusée partout. L'écran le dit explicitement pour que la règle
 * ne soit pas perçue comme un bug.
 */
export function CompetencyPanel({
  departments,
  staff,
  responders,
  editableScope,
  onUpsert,
  onRemove,
  saving,
}: CompetencyPanelProps) {
  const [departmentCode, setDepartmentCode] = useState(
    editableScope && editableScope !== "all"
      ? editableScope.departmentCode
      : (departments[0]?.code ?? ""),
  )
  const [unitPath, setUnitPath] = useState(
    editableScope && editableScope !== "all"
      ? (editableScope.unitPath ?? departments[0]?.zones[0]?.path ?? "")
      : (departments[0]?.zones[0]?.path ?? ""),
  )
  const [adding, setAdding] = useState(false)
  const [absenceFor, setAbsenceFor] = useState<ResponderRecord | null>(null)

  const department = departments.find((entry) => entry.code === departmentCode)
  const zones = department?.zones ?? []

  const scope = { departmentCode, unitPath: unitPath || null }
  const inScope = useMemo(
    () => responders.filter((entry) => scopeKey(entry) === scopeKey(scope)),
    [responders, departmentCode, unitPath],
  )

  // Les personnes rattachées au département mais à une autre zone restent
  // sélectionnables : un responsable peut déclarer un collègue d'une zone
  // voisine, à condition de le faire pour SA zone.
  const assignable = useMemo(
    () => staff.filter((person) => person.role === "employee" && person.departmentCode === departmentCode),
    [staff, departmentCode],
  )

  // Le dispatcher édite n'importe quelle zone ; un responsable de zone
  // n'édite que la sienne. Comparer les deux par égalité de périmètre évite
  // d'avoir à dupliquer le panneau.
  const canEdit = editableScope === "all" || (editableScope !== null && scopeKey(editableScope) === scopeKey(scope))
  const zoneName = zones.find((zone) => zone.path === unitPath)?.name ?? unitPath

  return (
    <div className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#183b56]">Competency list</h2>
          <p className="mt-1 text-sm text-slate-500">
            People declared competent per zone. A person not listed here cannot receive a ticket of
            this zone.
          </p>
        </div>
        {canEdit && (
          <Button
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            onClick={() => setAdding(true)}
            disabled={assignable.length === 0}
          >
            <UserPlus className="size-4" />
            Add a person
          </Button>
        )}
      </div>

      <div className="grid gap-4 border-b border-[#edf0f5] p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="competency-department" className="text-[13px] font-medium text-[#183b56]">
            Department
          </label>
          <Select
            id="competency-department"
            value={departmentCode}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              setDepartmentCode(event.target.value)
              const next = departments.find((entry) => entry.code === event.target.value)
              setUnitPath(next?.zones[0]?.path ?? "")
            }}
            className="h-10"
          >
            {departments.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.code} · {entry.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="competency-zone" className="text-[13px] font-medium text-[#183b56]">
            Zone
          </label>
          <Select
            id="competency-zone"
            value={unitPath}
            disabled={zones.length === 0}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setUnitPath(event.target.value)
            }
            className="h-10"
          >
            {zones.map((zone) => (
              <option key={zone.path} value={zone.path}>
                {zone.path} · {zone.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {editableScope === null && (
        <div className="p-5">
          <EmptyNotice
            title="Read-only"
            hint="Competency lists are maintained by the zone manager and the platform administrator."
          />
        </div>
      )}

      {editableScope !== null && editableScope !== "all" && !canEdit && (
        <div className="p-5">
          <EmptyNotice
            title={`You can only edit your own zone (${editableScope.departmentCode} · ${editableScope.unitPath ?? "department"})`}
            hint="Switch to your zone to declare competencies."
          />
        </div>
      )}

      {inScope.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-sm font-medium text-[#183b56]">
            Nobody is declared competent in {zoneName} yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Until someone is registered, the dispatcher will not be able to hand over any ticket of
            this zone.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#edf0f5]">
          {inScope.map((record) => {
            const person = staff.find((entry) => entry.id === record.userId)
            return (
              <li
                key={record.userId}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#183b56]">
                      {person?.name ?? record.userId}
                    </p>
                    {record.unavailability && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        <CalendarOff className="size-3" />
                        Unavailable
                      </span>
                    )}
                  </div>
                  {record.unavailability && (
                    <p className="mt-1 text-[12px] leading-5 text-amber-700">
                      {record.unavailability.reason}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {record.activities.length === 0 ? (
                      <span className="text-[12px] text-slate-400">No activity declared</span>
                    ) : (
                      record.activities.map((key) => (
                        <ActivityChip key={key} activityKey={key} />
                      ))
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-[#dce5ed] text-[#183b56]"
                      onClick={() => setAbsenceFor(record)}
                    >
                      <CalendarOff className="size-3.5" />
                      {record.unavailability ? "Change absence" : "Mark unavailable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${person?.name ?? record.userId}`}
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => onRemove(record.userId, scope)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AddCompetencyDialog
        open={adding}
        candidates={assignable}
        alreadyDeclared={inScope.map((record) => record.userId)}
        onClose={() => setAdding(false)}
        onAdd={(userId, activities) => {
          onUpsert({
            userId,
            departmentCode,
            unitPath: unitPath || null,
            activities,
            unavailability: null,
          })
          setAdding(false)
        }}
        saving={saving}
      />

      <AbsenceDialog
        record={absenceFor}
        personName={
          absenceFor ? (staff.find((entry) => entry.id === absenceFor.userId)?.name ?? absenceFor.userId) : ""
        }
        onClose={() => setAbsenceFor(null)}
        onSave={(unavailability) => {
          if (absenceFor) {
            onUpsert({ ...absenceFor, unavailability })
          }
          setAbsenceFor(null)
        }}
        saving={saving}
      />
    </div>
  )
}

function ActivityChip({ activityKey, muted = false }: { activityKey: ActivityKey; muted?: boolean }) {
  const label = ACTIVITIES.find((entry) => entry.key === activityKey)?.label ?? activityKey
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        muted
          ? "bg-slate-50 text-slate-400 ring-[#e5eaf2]"
          : "bg-[#f7f9fc] text-[#183b56] ring-[#e5eaf2]",
      )}
    >
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */

function AddCompetencyDialog({
  open,
  candidates,
  alreadyDeclared,
  onClose,
  onAdd,
  saving,
}: {
  open: boolean
  candidates: StaffMember[]
  alreadyDeclared: string[]
  onClose: () => void
  onAdd: (userId: string, activities: ActivityKey[]) => void
  saving: boolean
}) {
  const [selectedId, setSelectedId] = useState<string>("")
  const [activities, setActivities] = useState<ActivityKey[]>([])
  const [error, setError] = useState<string | null>(null)

  const available = candidates.filter((person) => !alreadyDeclared.includes(person.id))

  const reset = () => {
    setSelectedId("")
    setActivities([])
    setError(null)
  }

  const toggle = (key: ActivityKey) => {
    setActivities((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }

  return (
    <Modal
      open={open}
      title="Declare a person competent"
      description="Choose the person, then the activities they are responsible for unblocking."
      onClose={() => {
        reset()
        onClose()
      }}
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-slate-500"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!selectedId) {
                setError("Select a person.")
                return
              }
              if (activities.length === 0) {
                setError("Select at least one activity, otherwise the person will never be eligible.")
                return
              }
              setError(null)
              onAdd(selectedId, activities)
            }}
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Declare
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <BlockingNotice>{error}</BlockingNotice>}

        {available.length === 0 ? (
          <EmptyNotice
            title="Nobody left to declare"
            hint="Every employee of this department already has a competency list in this zone."
          />
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="competency-person" className="text-[13px] font-medium text-[#183b56]">
                Person
              </label>
              <Select
                id="competency-person"
                value={selectedId}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setSelectedId(event.target.value)
                  setError(null)
                }}
                className="h-10"
              >
                <option value="">Select a person...</option>
                {available.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.unitName ? ` · ${person.unitName}` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-[#183b56]">
                Activities they can unblock
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTIVITIES.map((entry) => {
                  const checked = activities.includes(entry.key)
                  return (
                    <label
                      key={entry.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
                        checked
                          ? "border-[#1aa6a6] bg-[#edf8f8] text-[#183b56]"
                          : "border-[#e5eaf2] text-slate-600 hover:bg-[#f7f9fc]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(entry.key)}
                        className="size-4 accent-[#1aa6a6]"
                      />
                      {entry.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function AbsenceDialog({
  record,
  personName,
  onClose,
  onSave,
  saving,
}: {
  record: ResponderRecord | null
  personName: string
  onClose: () => void
  onSave: (unavailability: ResponderRecord["unavailability"]) => void
  saving: boolean
}) {
  const [reason, setReason] = useState("")
  const [until, setUntil] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Le formulaire est réamorcé à chaque ouverture pour ne pas garder les
  // valeurs de la personne précédente.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (record && seededFor !== record.userId) {
    setSeededFor(record.userId)
    setReason(record.unavailability?.reason ?? "")
    setUntil(record.unavailability?.until ? record.unavailability.until.slice(0, 10) : "")
    setError(null)
  }
  if (!record && seededFor !== null) setSeededFor(null)

  const handleSave = (withAbsence: boolean) => {
    if (!record) return
    if (withAbsence && reason.trim().length === 0) {
      setError("Give a reason: it is shown to whoever tries to assign a ticket to this person.")
      return
    }
    setError(null)
    if (!withAbsence) {
      onSave(null)
      return
    }
    onSave({
      reason: reason.trim(),
      // Une date vide = absence indéterminée, ce que la règle de compétence
      // traite comme permanant tant qu'aucune date n'est fournie.
      until: until === "" ? null : new Date(`${until}T23:59:59`).toISOString(),
    })
  }

  return (
    <Modal
      open={record !== null}
      title={record?.unavailability ? "Change unavailability" : "Mark as unavailable"}
      description={
        record
          ? `${personName} will be refused any ticket of this zone while the absence lasts.`
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" className="text-slate-500" onClick={onClose}>
            Cancel
          </Button>
          {record?.unavailability && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="text-[#183b56]"
            >
              Mark as available
            </Button>
          )}
          <Button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarOff className="size-4" />}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <BlockingNotice>{error}</BlockingNotice>}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="absence-reason" className="text-[13px] font-medium text-[#183b56]">
              Reason
            </label>
            <span className="text-[11px] tabular-nums text-slate-400">
              {reason.length}/{REASON_LIMIT}
            </span>
          </div>
          <Input
            id="absence-reason"
            value={reason}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setReason(event.target.value)
              setError(null)
            }}
            maxLength={REASON_LIMIT}
            className="h-10"
            placeholder="Medical leave, training, field intervention..."
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="absence-until" className="text-[13px] font-medium text-[#183b56]">
            Until
          </label>
          <Input
            id="absence-until"
            type="date"
            value={until}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setUntil(event.target.value)
            }
            className="h-10"
          />
          <p className="text-[12px] text-slate-500">
            Leave empty for an absence of indefinite duration. The person becomes eligible again
            automatically on the chosen date.
          </p>
        </div>
      </div>
    </Modal>
  )
}
