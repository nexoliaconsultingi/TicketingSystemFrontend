"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import {
  ArrowDownToLine,
  Armchair,
  Boxes,
  Check,
  Droplet,
  Eye,
  Keyboard,
  Laptop,
  Loader2,
  Monitor,
  Mouse,
  Network,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Repeat,
  Search,
  Table as TableIcon,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react"

import { AdminGuard } from "@/components/auth/admin-guard"
import { MaterialImagePicker } from "@/components/assets/material-image-picker"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_UNITS,
  MATERIAL_UNIT_LABELS,
  formatStockQuantity,
  materialApi,
  type CreateMaterialInput,
  type MaterialCategory,
  type MaterialItemResponse,
  type MaterialReturnLine,
  type MaterialUnit,
  type UpdateMaterialInput,
} from "@/lib/api"
import { getInitials, getToken } from "@/lib/auth"
import { connectRealtime } from "@/lib/realtime"
import { useSessionUser } from "@/lib/use-session"

/**
 * « Assets & CMDB » : le module stockMateriel.
 *
 * L'inventaire des produits de l'entreprise — ordinateurs, écrans, claviers,
 * cartouches… Un enregistrement décrit une RÉFÉRENCE, pas un objet : le nom,
 * la photo et l'unité décrivent le produit, `stockQuantity` dit combien
 * d'unités sont disponibles. Seul l'administrateur ajoute ou retire un produit.
 *
 * La sortie de stock naît de la réponse à un ticket : quand le superviseur
 * accepte un dossier, il libère des produits (avec leur quantité) et le stock
 * décroît. La seconde section, « Returns », rend au stock les articles
 * réutilisables rapportés par les employés.
 */

const CATEGORY_ICONS: Record<MaterialCategory, typeof Package> = {
  computer: Laptop,
  monitor: Monitor,
  keyboard: Keyboard,
  mouse: Mouse,
  printer: Printer,
  phone: Phone,
  consumable: Droplet,
  desk: TableIcon,
  chair: Armchair,
  network: Network,
  other: Package,
}

interface MaterialDraft {
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  stockQuantity: string
  reusable: boolean
  description: string
  brand: string
  model: string
  image: string
}

const EMPTY_DRAFT: MaterialDraft = {
  name: "",
  category: "other",
  unit: "piece",
  stockQuantity: "",
  reusable: true,
  description: "",
  brand: "",
  model: "",
  image: "",
}

export default function AssetsPage() {
  return (
    <AdminGuard includeManager>
      <Suspense fallback={null}>
        <Assets />
      </Suspense>
    </AdminGuard>
  )
}

function Assets() {
  const user = useSessionUser()
  // Seul l'administrateur écrit dans l'inventaire : le superviseur consulte.
  const isAdmin = user?.access.includes("admin") ?? false

  const [tab, setTab] = useState<"inventory" | "returns">("inventory")

  const [items, setItems] = useState<MaterialItemResponse[]>([])
  const [returns, setReturns] = useState<MaterialReturnLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("")

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<MaterialItemResponse | null>(null)
  const [deleting, setDeleting] = useState<MaterialItemResponse | null>(null)
  const [draft, setDraft] = useState<MaterialDraft>(EMPTY_DRAFT)

  const [returning, setReturning] = useState<MaterialReturnLine | null>(null)
  const [returnQuantity, setReturnQuantity] = useState("")
  const [returnError, setReturnError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState<MaterialItemResponse | null>(null)
  const [selectedReturn, setSelectedReturn] = useState<MaterialReturnLine | null>(null)

  const load = async (options?: { silent?: boolean }) => {
    const token = getToken()
    if (!token) return
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [list, returnsList] = await Promise.all([
        materialApi.list(token),
        materialApi.returns(token),
      ])
      setItems(list)
      setReturns(returnsList)
    } catch (cause) {
      if (silent) return
      setError(cause instanceof ApiError ? cause.message : "Unable to load the company assets.")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Temps réel : un produit ajouté, corrigé, retiré, libéré par un ticket ou
  // rendu arrive par `material:updated` — l'écran se met à jour sans recharger.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const socket = connectRealtime(token)
    let timer: ReturnType<typeof setTimeout> | undefined
    const onUpdated = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void load({ silent: true })
      }, 400)
    }
    const onReconnect = () => void load({ silent: true })
    socket.on("material:updated", onUpdated)
    socket.io.on("reconnect", onReconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off("material:updated", onUpdated)
      socket.io.off("reconnect", onReconnect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Les filtres travaillent en local sur la liste complète, l'API renvoyant
  // tout l'inventaire : aucun aller-retour supplémentaire au fil de la frappe.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (category && item.category !== category) return false
      if (!q) return true
      return [item.code, item.name, item.brand, item.model, item.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [items, search, category])

  const summary = useMemo(() => {
    let units = 0
    let out = 0
    let reusable = 0
    for (const item of items) {
      units += item.stockQuantity
      if (item.stockQuantity <= 0) out += 1
      if (item.reusable) reusable += 1
    }
    return { products: items.length, units, out, reusable }
  }, [items])

  const openCreate = () => {
    setFormMode("create")
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const openEdit = (item: MaterialItemResponse) => {
    setFormMode("edit")
    setEditing(item)
    setDraft({
      name: item.name,
      category: item.category,
      unit: item.unit,
      stockQuantity: String(item.stockQuantity),
      reusable: item.reusable,
      description: item.description,
      brand: item.brand,
      model: item.model,
      image: item.image,
    })
    setFormError(null)
  }

  const closeForm = () => {
    setFormMode(null)
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const handleSubmit = async () => {
    const quantity = Number(draft.stockQuantity)
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFormError("Stock quantity must be a whole number, zero or more.")
      return
    }

    const input: UpdateMaterialInput = {
      name: draft.name.trim(),
      category: draft.category,
      unit: draft.unit,
      stockQuantity: quantity,
      reusable: draft.reusable,
      description: draft.description.trim(),
      brand: draft.brand.trim(),
      model: draft.model.trim(),
      image: draft.image,
    }

    setSaving(true)
    setFormError(null)
    try {
      const token = getToken()
      if (!token) throw new Error("no token")
      if (formMode === "edit" && editing) {
        const updated = await materialApi.update(token, editing._id, input)
        setItems((current) => current.map((item) => (item._id === updated._id ? updated : item)))
      } else {
        const created = await materialApi.create(token, input as CreateMaterialInput)
        setItems((current) => [...current, created])
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "The product could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    setFormError(null)
    try {
      const token = getToken()
      if (!token) throw new Error("no token")
      await materialApi.remove(token, deleting._id)
      setItems((current) => current.filter((item) => item._id !== deleting._id))
      setDeleting(null)
      if (editing?._id === deleting._id) closeForm()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "The product could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const openReturn = (line: MaterialReturnLine) => {
    setReturning(line)
    setReturnQuantity(String(line.remaining))
    setReturnError(null)
  }

  const handleReturn = async () => {
    if (!returning) return
    const quantity = Number(returnQuantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > returning.remaining) {
      setReturnError(
        `Enter a whole number between 1 and ${returning.remaining}.`,
      )
      return
    }
    setSaving(true)
    setReturnError(null)
    try {
      const token = getToken()
      if (!token) throw new Error("no token")
      await materialApi.returnUnits(token, {
        ticketId: returning.ticketId,
        materialId: returning.materialId,
        quantity,
      })
      setReturning(null)
      await load({ silent: true })
    } catch (cause) {
      setReturnError(cause instanceof ApiError ? cause.message : "The return could not be registered.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardShell
      title="Assets & CMDB"
      subtitle="The products the company keeps in stock — computers, screens, peripherals, consumables. Each product carries a stock quantity; supervisors release it when answering a ticket and register returns here."
      actions={
        isAdmin ? (
          <Button
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            onClick={openCreate}
            disabled={loading}
          >
            <Plus className="size-4" />
            New product
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="inline-flex rounded-xl border border-[#e5eaf2] bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("inventory")}
            className={
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
              (tab === "inventory" ? "bg-[#183b56] text-white" : "text-slate-500 hover:bg-slate-100")
            }
          >
            <Boxes className="size-4" />
            Inventory
          </button>
          <button
            type="button"
            onClick={() => setTab("returns")}
            className={
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
              (tab === "returns" ? "bg-[#183b56] text-white" : "text-slate-500 hover:bg-slate-100")
            }
          >
            <Undo2 className="size-4" />
            Returns
            {returns.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d97706] px-1 text-[10px] font-semibold text-white">
                {returns.length}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {error}
          </div>
        )}

        {tab === "inventory" ? (
          <InventoryTab
            items={items}
            filtered={filtered}
            summary={summary}
            loading={loading}
            isAdmin={isAdmin}
            search={search}
            category={category}
            onSearch={setSearch}
            onCategory={setCategory}
            onEdit={openEdit}
            onViewDetails={setSelectedItem}
            onDelete={(item) => {
              setDeleting(item)
              setFormError(null)
            }}
          />
        ) : (
          <ReturnsTab
            returns={returns}
            loading={loading}
            onReturn={openReturn}
            onViewDetails={setSelectedReturn}
            onRefresh={() => void load({ silent: true })}
          />
        )}
      </div>

      {/* Nouveau produit / modification */}
      <Modal
        open={formMode !== null}
        title={formMode === "edit" && editing ? `Edit ${editing.name}` : "Add a product to stock"}
        description={
          formMode === "edit"
            ? "Update this product. Releases made by tickets stay untouched."
            : "One record per product reference. The stock quantity says how many units are available."
        }
        onClose={closeForm}
        size="lg"
        centerOnMobile
        footer={
          <>
            <Button type="button" variant="ghost" className="text-slate-500" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={handleSubmit}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {formMode === "edit" ? "Save product" : "Add product"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="material-name" className="text-[13px] font-medium text-[#183b56]">
              Product name <span className="text-red-500">*</span>
            </label>
            <Input
              id="material-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="h-10"
              maxLength={140}
              placeholder="Dell Latitude 7440"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="material-category" className="text-[13px] font-medium text-[#183b56]">
              Category
            </label>
            <Select
              id="material-category"
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value as MaterialCategory,
                }))
              }
            >
              {MATERIAL_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {MATERIAL_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="material-quantity" className="text-[13px] font-medium text-[#183b56]">
                Stock quantity <span className="text-red-500">*</span>
              </label>
              <Input
                id="material-quantity"
                type="number"
                min={0}
                value={draft.stockQuantity}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, stockQuantity: event.target.value }))
                }
                className="h-10"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="material-unit" className="text-[13px] font-medium text-[#183b56]">
                Unit
              </label>
              <Select
                id="material-unit"
                value={draft.unit}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, unit: event.target.value as MaterialUnit }))
                }
              >
                {MATERIAL_UNITS.map((key) => (
                  <option key={key} value={key}>
                    {MATERIAL_UNIT_LABELS[key]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[13px] font-medium text-[#183b56]">Usage</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDraft((current) => ({ ...current, reusable: true }))}
                className={
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors " +
                  (draft.reusable
                    ? "border-[#1aa6a6] bg-[#edf8f8]"
                    : "border-[#e4eaf1] bg-white hover:border-[#a8d9d8]")
                }
              >
                <Repeat className="mt-0.5 size-4 shrink-0 text-[#1a6a9c]" />
                <span>
                  <span className="block text-[13px] font-medium text-[#183b56]">
                    Reusable
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-slate-500">
                    Lent and expected back after use.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDraft((current) => ({ ...current, reusable: false }))}
                className={
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors " +
                  (!draft.reusable
                    ? "border-[#d97706] bg-amber-50"
                    : "border-[#e5eaf2] hover:border-[#a8d9d8]")
                }
              >
                <ArrowDownToLine className="mt-0.5 size-3.5 shrink-0 text-[#d97706]" />
                <span>
                  <span className="block text-[13px] font-medium text-[#183b56]">
                    Consumed on use
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-slate-500">
                    Used once and gone — ink, paper, screws. Never comes back.
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="material-brand" className="text-[13px] font-medium text-[#183b56]">
                Brand
              </label>
              <Input
                id="material-brand"
                value={draft.brand}
                onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
                className="h-10"
                maxLength={120}
                placeholder="Dell"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="material-model" className="text-[13px] font-medium text-[#183b56]">
                Model
              </label>
              <Input
                id="material-model"
                value={draft.model}
                onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                className="h-10"
                maxLength={120}
                placeholder="Latitude 7440"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="material-description" className="text-[13px] font-medium text-[#183b56]">
              Description
              <span className="ml-1.5 font-normal text-slate-400">optional</span>
            </label>
            <Textarea
              id="material-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              maxLength={2000}
              placeholder="Storage location, condition, anything useful about this product."
            />
          </div>

          <MaterialImagePicker
            value={draft.image}
            onChange={(image) => setDraft((current) => ({ ...current, image }))}
            disabled={saving}
          />
        </div>
      </Modal>

      {/* Suppression */}
      <Modal
        open={deleting !== null}
        title="Remove this product?"
        description={
          deleting
            ? `${deleting.name} (${deleting.code}) will be removed from the inventory.`
            : undefined
        }
        onClose={() => setDeleting(null)}
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
              variant="destructive"
              disabled={saving}
              onClick={handleDelete}
              className="gap-2"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remove product
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-slate-600">
          A product can only be removed once every reusable unit released from it has come back to
          stock. Products consumed on use never return, so they never block removal.
        </p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {formError}
          </div>
        )}
      </Modal>

      {/* Retour d'unités au stock */}
      <Modal
        open={returning !== null}
        title={returning ? `Return ${returning.name}` : "Return to stock"}
        description={
          returning
            ? `Released to ${returning.employeeName || "an employee"} via ${returning.ticketReference}. ${returning.remaining} of ${returning.quantity} unit${returning.quantity === 1 ? "" : "s"} still outside.`
            : undefined
        }
        onClose={() => setReturning(null)}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500"
              onClick={() => setReturning(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={handleReturn}
              className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              Return to stock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="return-quantity" className="text-[13px] font-medium text-[#183b56]">
              Units returned
            </label>
            <Input
              id="return-quantity"
              type="number"
              min={1}
              max={returning?.remaining}
              value={returnQuantity}
              onChange={(event) => setReturnQuantity(event.target.value)}
              className="h-10"
              autoFocus
            />
            <span className="block text-[11.5px] text-slate-400">
              {returning
                ? `Between 1 and ${returning.remaining}. The quantity goes back into the stock of ${returning.name}.`
                : null}
            </span>
          </div>

          {returnError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
            >
              {returnError}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={selectedItem !== null}
        title={selectedItem ? selectedItem.name : "Product details"}
        description={selectedItem ? `Code: ${selectedItem.code}` : undefined}
        onClose={() => setSelectedItem(null)}
        size="md"
        centerOnMobile
        footer={
          <Button
            type="button"
            variant="ghost"
            className="text-slate-500"
            onClick={() => setSelectedItem(null)}
          >
            Close
          </Button>
        }
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                {selectedItem.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedItem.image} alt={selectedItem.name} className="size-full object-cover" />
                ) : (
                  <Package className="size-6" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
                  >
                    {selectedItem.code}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      selectedItem.stockQuantity > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    {formatStockQuantity(selectedItem.stockQuantity, selectedItem.unit)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      selectedItem.reusable
                        ? "border-[#cde8e8] bg-[#edf8f8] text-[#1a6a9c]"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {selectedItem.reusable ? "Reusable" : "Consumed on use"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="size-3.5" />
                    {MATERIAL_CATEGORY_LABELS[selectedItem.category]}
                  </span>
                  {[selectedItem.brand, selectedItem.model].filter(Boolean).length > 0 && (
                    <span>{[selectedItem.brand, selectedItem.model].filter(Boolean).join(" · ")}</span>
                  )}
                </div>
              </div>
            </div>

            {selectedItem.description && (
              <div>
                <p className="text-[12px] font-medium text-[#183b56]">Description</p>
                <p className="mt-1.5 text-[13px] leading-5 whitespace-pre-wrap text-slate-600">
                  {selectedItem.description}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
              {selectedItem.createdByName && (
                <span className="inline-flex items-center gap-1">
                  <Avatar className="size-10">
                    {selectedItem.createdByPhoto ? (
                      <AvatarImage src={selectedItem.createdByPhoto} alt="" />
                    ) : null}
                    <AvatarFallback className="bg-[#d7eeee] text-[13px] font-semibold text-[#176b6b]">
                      {getInitials(selectedItem.createdByName)}
                    </AvatarFallback>
                  </Avatar>
                  added by {selectedItem.createdByName}
                </span>
              )}
              <span>
                Added {new Date(selectedItem.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {selectedItem.updatedAt !== selectedItem.createdAt && (
                <span>
                  Updated {new Date(selectedItem.updatedAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={selectedReturn !== null}
        title={selectedReturn ? `Return details — ${selectedReturn.name}` : "Return details"}
        description={selectedReturn ? `${selectedReturn.remaining} of ${selectedReturn.quantity} unit${selectedReturn.quantity === 1 ? "" : "s"} still outstanding` : undefined}
        onClose={() => setSelectedReturn(null)}
        size="md"
        centerOnMobile
        footer={
          <Button
            type="button"
            variant="ghost"
            className="text-slate-500"
            onClick={() => setSelectedReturn(null)}
          >
            Close
          </Button>
        }
      >
        {selectedReturn && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
              >
                {selectedReturn.code}
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {selectedReturn.remaining} of {selectedReturn.quantity} out
              </Badge>
              <Badge variant="outline" className="border-[#cde8e8] bg-[#edf8f8] text-[#1a6a9c]">
                {MATERIAL_CATEGORY_LABELS[selectedReturn.category]}
              </Badge>
              <Badge variant="outline" className="border-[#e5eaf2] bg-slate-50 text-slate-500">
                {selectedReturn.unit}
              </Badge>
            </div>

            <div className="space-y-2 text-[13px] text-slate-600">
              {selectedReturn.employeeName && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Held by</span>
                  <span className="inline-flex items-center gap-1 font-medium text-[#1a6a9c]">
                    <Avatar className="size-10">
                      {selectedReturn.employeePhoto ? (
                        <AvatarImage src={selectedReturn.employeePhoto} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-[#d7eeee] text-[13px] font-semibold text-[#176b6b]">
                        {getInitials(selectedReturn.employeeName)}
                      </AvatarFallback>
                    </Avatar>
                    {selectedReturn.employeeName}
                  </span>
                </div>
              )}
              {selectedReturn.ticketReference && (
                <div>
                  <span className="text-slate-500">Ticket</span>{" "}
                  <span className="font-medium text-[#183b56]">{selectedReturn.ticketReference}</span>
                </div>
              )}
              {selectedReturn.releasedByName && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Released by</span>
                  <span className="inline-flex items-center gap-1 font-medium text-[#183b56]">
                    <Avatar className="size-10">
                      {selectedReturn.releasedByPhoto ? (
                        <AvatarImage src={selectedReturn.releasedByPhoto} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-[#d7eeee] text-[13px] font-semibold text-[#176b6b]">
                        {getInitials(selectedReturn.releasedByName)}
                      </AvatarFallback>
                    </Avatar>
                    {selectedReturn.releasedByName}
                  </span>
                </div>
              )}
              {selectedReturn.releasedAt && (
                <div>
                  <span className="text-slate-500">Released</span>{" "}
                  <span className="font-medium text-[#183b56]">
                    {new Date(selectedReturn.releasedAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Returned</span>{" "}
                <span className="font-medium text-[#183b56]">
                  {selectedReturn.returned} / {selectedReturn.quantity}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  )
}

function InventoryTab({
  items,
  filtered,
  summary,
  loading,
  isAdmin,
  search,
  category,
  onSearch,
  onCategory,
  onEdit,
  onViewDetails,
  onDelete,
}: {
  items: MaterialItemResponse[]
  filtered: MaterialItemResponse[]
  summary: { products: number; units: number; out: number; reusable: number }
  loading: boolean
  isAdmin: boolean
  search: string
  category: string
  onSearch: (value: string) => void
  onCategory: (value: string) => void
  onEdit: (item: MaterialItemResponse) => void
  onViewDetails: (item: MaterialItemResponse) => void
  onDelete: (item: MaterialItemResponse) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Products" value={summary.products} />
        <SummaryCard label="Units in stock" value={summary.units} />
        <SummaryCard label="Out of stock" value={summary.out} tone="warn" />
        <SummaryCard label="Reusable" value={summary.reusable} />
      </div>

      <div className="rounded-2xl border border-[#e5eaf2] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#edf0f5] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#183b56]">Stock inventory</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {items.length} product{items.length === 1 ? "" : "s"} tracked
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                className="h-9 pl-9"
                placeholder="Search a product"
                aria-label="Search a product"
              />
            </div>
            <Select
              value={category}
              onChange={(event) => onCategory(event.target.value)}
              className="h-9 sm:w-44"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {MATERIAL_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {MATERIAL_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading the inventory...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Package className="size-5" />
            </div>
            <p className="text-sm font-medium text-[#183b56]">
              {items.length === 0 ? "No product recorded yet" : "No product matches these filters"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {items.length === 0
                ? isAdmin
                  ? "Add your first product so the team knows what the company keeps in stock."
                  : "The administrator adds products here as soon as they are acquired."
                : "Try another keyword or clear the category filter."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#edf0f5]">
            {filtered.map((item) => {
              const Icon = CATEGORY_ICONS[item.category] ?? Package
              return (
                <li key={item._id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#edf8f8] text-[#1aa6a6]">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.name} className="size-full object-cover" />
                      ) : (
                        <Icon className="size-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#183b56]">{item.name}</p>
                        <Badge
                          variant="outline"
                          className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
                        >
                          {item.code}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            item.stockQuantity > 0
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }
                        >
                          {formatStockQuantity(item.stockQuantity, item.unit)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            item.reusable
                              ? "border-[#cde8e8] bg-[#edf8f8] text-[#1a6a9c]"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {item.reusable ? "Reusable" : "Consumed on use"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
                        {[item.brand, item.model].filter(Boolean).length > 0
                          ? [item.brand, item.model].filter(Boolean).join(" · ")
                          : item.description || MATERIAL_CATEGORY_LABELS[item.category]}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Wrench className="size-3.5" />
                          {MATERIAL_CATEGORY_LABELS[item.category]}
                        </span>
                        {item.createdByName && (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar className="size-8">
                              {item.createdByPhoto ? (
                                <AvatarImage src={item.createdByPhoto} alt="" />
                              ) : null}
                              <AvatarFallback className="bg-[#d7eeee] text-[11px] font-semibold text-[#176b6b]">
                                {getInitials(item.createdByName)}
                              </AvatarFallback>
                            </Avatar>
                            added by {item.createdByName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-[#dce5ed] text-[#183b56]"
                        onClick={() => onViewDetails(item)}
                      >
                        <Eye className="size-3.5" />
                        View details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-[#dce5ed] text-[#183b56]"
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => onDelete(item)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                  {!isAdmin && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-[#dce5ed] text-[#183b56]"
                        onClick={() => onViewDetails(item)}
                      >
                        <Eye className="size-3.5" />
                        View details
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function ReturnsTab({
  returns,
  loading,
  onReturn,
  onViewDetails,
  onRefresh,
}: {
  returns: MaterialReturnLine[]
  loading: boolean
  onReturn: (line: MaterialReturnLine) => void
  onViewDetails: (line: MaterialReturnLine) => void
  onRefresh: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#e5eaf2] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf0f5] p-5">
        <div>
          <h2 className="text-sm font-semibold text-[#183b56]">Outstanding returns</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Reusable products released to an employee and not yet returned. Returning them raises the
            stock again.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 border-[#dce5ed] text-[#183b56]"
          onClick={onRefresh}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {loading && returns.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading outstanding returns...
        </div>
      ) : returns.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Boxes className="size-5" />
          </div>
          <p className="text-sm font-medium text-[#183b56]">Everything is back</p>
          <p className="mt-1 text-sm text-slate-500">
            No reusable product is out of stock right now.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#edf0f5]">
          {returns.map((line) => (
            <li key={line.lineId} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#183b56]">{line.name}</p>
                  <Badge
                    variant="outline"
                    className="border-[#e5eaf2] bg-slate-50 font-mono text-[11px] text-slate-500"
                  >
                    {line.code}
                  </Badge>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    {line.remaining} of {line.quantity} out
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Repeat className="size-3.5" />
                    {MATERIAL_CATEGORY_LABELS[line.category]}
                  </span>
                  {line.employeeName && (
                    <span className="inline-flex items-center gap-1.5 text-[#1a6a9c]">
                      <Avatar className="size-8">
                        {line.employeePhoto ? (
                          <AvatarImage src={line.employeePhoto} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-[#d7eeee] text-[11px] font-semibold text-[#176b6b]">
                          {getInitials(line.employeeName)}
                        </AvatarFallback>
                      </Avatar>
                      {line.employeeName}
                      {line.ticketReference ? ` · ${line.ticketReference}` : ""}
                    </span>
                  )}
                  {line.releasedByName && (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar className="size-8">
                        {line.releasedByPhoto ? (
                          <AvatarImage src={line.releasedByPhoto} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-[#d7eeee] text-[11px] font-semibold text-[#176b6b]">
                          {getInitials(line.releasedByName)}
                        </AvatarFallback>
                      </Avatar>
                      released by {line.releasedByName}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[#cde8e8] text-[#176b6b] hover:bg-[#edf8f8]"
                  onClick={() => onViewDetails(line)}
                >
                  <Eye className="size-3.5" />
                  View return details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[#cde8e8] text-[#176b6b] hover:bg-[#edf8f8]"
                  onClick={() => onReturn(line)}
                >
                  <Undo2 className="size-3.5" />
                  Return
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number
  tone?: "default" | "warn"
}) {
  return (
    <div className="rounded-2xl border border-[#e5eaf2] bg-white p-4">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{label}</p>
      <p
        className={
          "mt-1.5 text-2xl font-semibold " +
          (tone === "warn" ? "text-[#d97706]" : "text-[#183b56]")
        }
      >
        {value}
      </p>
    </div>
  )
}
