"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Check, ImageUp, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react"

import { AdminGuard } from "@/components/auth/admin-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgChart } from "@/components/organization/org-chart"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  BUSINESS_DOMAIN_DESCRIPTIONS,
  BUSINESS_DOMAIN_LABELS,
  BUSINESS_DOMAINS,
  useCompanyAdmin,
  type BusinessDomain,
  type CompanyProfile,
} from "@/lib/company"
import { useUnits } from "@/lib/units"

const DESCRIPTION_LIMIT = 480
const MAX_LOGO_BYTES = 512 * 1024
const MAX_SERVICES = 50

export default function CompanyInformationPage() {
  return (
    <AdminGuard>
      <CompanyInformation />
    </AdminGuard>
  )
}

function CompanyInformation() {
  const { profile, updateProfile, loading } = useCompanyAdmin()
  const { tree, departments, loading: unitsLoading } = useUnits()
  const [draft, setDraft] = useState<CompanyProfile>(profile)
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState<string | null>(null)
  const [serviceInput, setServiceInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const update = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setStatus("idle")
  }

  const addService = () => {
    const value = serviceInput.trim()
    if (value.length === 0) return

    const exists = draft.services.some(
      (service) => service.toLowerCase() === value.toLowerCase(),
    )
    if (exists) {
      setError(`"${value}" is already listed as a service.`)
      return
    }
    if (draft.services.length >= MAX_SERVICES) {
      setError(`A company cannot list more than ${MAX_SERVICES} services.`)
      return
    }

    update("services", [...draft.services, value])
    setServiceInput("")
    setError(null)
  }

  const removeService = (service: string) => {
    update(
      "services",
      draft.services.filter((item) => item !== service),
    )
  }

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("The selected file is not an image.")
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("The logo must be smaller than 512 KB.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update("logo", reader.result)
        setError(null)
      }
    }
    reader.onerror = () => setError("The logo could not be read. Please try another file.")
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (draft.name.trim().length === 0) {
      setError("The company name is required.")
      return
    }

    setStatus("saving")
    setError(null)
    try {
      await updateProfile({ ...draft, name: draft.name.trim() })
      setStatus("saved")
      window.setTimeout(() => setStatus("idle"), 1200)
    } catch (cause) {
      setStatus("idle")
      setError(cause instanceof Error ? cause.message : "The company could not be saved.")
    }
  }

  return (
    <DashboardShell
      title={
        <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
          Company information
        </h1>
      }
      subtitle={
        <p className="mt-2 text-sm text-slate-500">
          Identity of the tenant displayed across the platform, tickets and customer communications.
        </p>
      }
    >
      {loading ? (
        <CompanySkeleton />
      ) : (
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"
      >
        {/*
          Sur mobile, le logo passe avant le nom : c'est l'identité visuelle
          qu'on cherche en premier quand l'écran est étroit. Sur grand écran,
          la colonne de droite garde sa place, d'où le placement explicite.
        */}
        <div className="order-2 space-y-6 xl:order-none xl:col-start-1 xl:row-start-1">
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-[#183b56]">Profile</h2>
            <p className="mt-1 text-sm text-slate-500">
              These details identify your organisation inside the Nexolia platform.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
              >
                {error}
              </div>
            )}

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label htmlFor="company-name" className="text-[13px] font-medium text-[#183b56]">
                  Company name
                </label>
                <Input
                  id="company-name"
                  value={draft.name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    update("name", event.target.value)
                  }
                  className="h-10"
                  maxLength={80}
                  placeholder="Global Industries"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-medium text-[#183b56]">Business domain</span>
                <Select
                  value={draft.domain}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    update("domain", event.target.value as BusinessDomain)
                  }
                  className="h-10"
                  aria-label="Business domain"
                >
                  {BUSINESS_DOMAINS.map((domain) => (
                    <option key={domain} value={domain}>
                      {BUSINESS_DOMAIN_LABELS[domain]}
                    </option>
                  ))}
                </Select>
                <p className="text-xs leading-5 text-slate-500">
                  {BUSINESS_DOMAIN_DESCRIPTIONS[draft.domain]}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="company-description" className="text-[13px] font-medium text-[#183b56]">
                    Description
                  </label>
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {draft.description.length}/{DESCRIPTION_LIMIT}
                  </span>
                </div>
                <Textarea
                  id="company-description"
                  value={draft.description}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    update("description", event.target.value)
                  }
                  rows={6}
                  maxLength={DESCRIPTION_LIMIT}
                  placeholder="Present the activity, the markets and the positioning of your organisation."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-[#183b56]">Services delivered</span>
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {draft.services.length}/{MAX_SERVICES}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Input
                    id="company-service"
                    value={serviceInput}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setServiceInput(event.target.value)
                    }
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addService()
                      }
                    }}
                    className="h-10"
                    maxLength={80}
                    placeholder="Managed IT support"
                    aria-label="Add a service"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 gap-2 border-[#dce5ed] text-[#183b56]"
                    onClick={addService}
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>

                {draft.services.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No service listed yet. Add the offerings your company delivers to its clients.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[#edf0f5] rounded-lg border border-[#e5eaf2]">
                    {draft.services.map((service) => (
                      <li
                        key={service}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <span className="min-w-0 truncate text-[13px] text-[#183b56]">{service}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${service}`}
                          className="shrink-0 text-slate-400 hover:text-red-600"
                          onClick={() => removeService(service)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] leading-5 text-slate-400">
                  These services are shown on the platform and used to route incoming requests.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#edf0f5] pt-5">
              <Button
                type="submit"
                disabled={!dirty || status === "saving" || loading}
                className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
              >
                {status === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : status === "saved" ? (
                  <Check className="size-4" />
                ) : null}
                {status === "saved" ? "Saved" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty}
                className="gap-2 text-slate-500"
                onClick={() => {
                  setDraft(profile)
                  setStatus("idle")
                  setError(null)
                }}
              >
                <RotateCcw className="size-4" />
                Discard
              </Button>
              {!dirty && status !== "saved" && (
                <span className="text-xs text-slate-400">No pending changes</span>
              )}
            </div>
          </div>
        </div>

        <div className="order-1 space-y-6 xl:order-none xl:col-start-2 xl:row-start-1">
          <div className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#183b56]">Company logo</h2>
            <p className="mt-1 text-sm text-slate-500">
              Displayed in the sidebar, on tickets and in customer communications.
            </p>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e5eaf2] bg-[#f7f9fc]">
                {draft.logo ? (
                  <Image
                    src={draft.logo}
                    alt={`${draft.name || "Company"} logo`}
                    width={80}
                    height={80}
                    unoptimized
                    className="size-20 object-cover"
                  />
                ) : (
                  <span className="text-[11px] text-slate-400">No logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#183b56]">
                  {draft.name || "Unnamed company"}
                </p>
                <Badge
                  variant="outline"
                  className="mt-1.5 border-[#cde6e6] bg-[#f2fbfb] text-[#147878]"
                >
                  {BUSINESS_DOMAIN_LABELS[draft.domain]}
                </Badge>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0]
                if (file) handleLogoFile(file)
                event.target.value = ""
              }}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-[#dce5ed] text-[#183b56]"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageUp className="size-4" />
                Upload logo
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-slate-500"
                disabled={!draft.logo}
                onClick={() => update("logo", "")}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              PNG, JPG or SVG up to 512 KB. A square image gives the best result in the circular
              frame.
            </p>
          </div>

          <div className="rounded-xl border border-[#e5eaf2] bg-[#edf8f8] p-5">
            <h2 className="text-sm font-semibold text-[#183b56]">How this data is used</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
              <li>The company name labels the tenant in the workspace switcher.</li>
              <li>The logo is printed on generated reports and exported tickets.</li>
              <li>The business domain tailors the wording of the request forms.</li>
              <li>The description is used in automatic replies and email templates.</li>
              <li>The services list pre-fills the request type offered to employees.</li>
            </ul>
          </div>
        </div>
      </form>
      )}

      <div className="mt-6">
        <OrgChart
          companyName={profile.name}
          companyDomain={BUSINESS_DOMAIN_LABELS[profile.domain]}
          companyLogo={profile.logo}
          departments={departments.map((department) => ({
            id: department.id,
            code: department.id,
            name: department.name,
            rootUnits: department.rootUnits ?? [],
          }))}
          unitTree={tree}
          loading={unitsLoading}
        />
      </div>
    </DashboardShell>
  )
}

function CompanySkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm sm:p-6">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 space-y-5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm">
          <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 flex items-center gap-4">
            <div className="size-20 shrink-0 animate-pulse rounded-full bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e5eaf2] bg-[#edf8f8] p-5">
          <div className="h-3.5 w-40 animate-pulse rounded bg-[#d8ecec]" />
          <div className="mt-4 space-y-2.5">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-3 w-full animate-pulse rounded bg-[#d8ecec]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
