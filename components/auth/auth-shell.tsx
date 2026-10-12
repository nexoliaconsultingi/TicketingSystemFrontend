"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { BriefcaseBusiness, Globe2, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react"

import { useCompanyProfile } from "@/lib/company"
import { cn } from "@/lib/utils"

/** Au-delà de ce nombre, le reste est résumé par une pastille pour ne pas déborder. */
const MAX_VISIBLE_SERVICES = 8

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: "Faster resolution",
    description: "Smart routing, continuously monitored SLAs and automated actions.",
  },
  {
    icon: Globe2,
    title: "Built for global scale",
    description: "Multi-entity, multi-currency and multi-timezone without friction.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance by design",
    description: "Full audit trail, encryption and strict per-tenant isolation.",
  },
]

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "TLS 1.3 encrypted" },
  { icon: Lock, label: "Two-step verification" },
  { icon: Sparkles, label: "SSO & MFA ready" },
]

interface AuthShellProps {
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AuthShell({ children, footer, className }: AuthShellProps) {
  // Identité de l'entreprise : lue sur l'API publique, donc disponible avant la connexion
  const { profile } = useCompanyProfile()
  const companyName = profile.name || "Nexolia"
  // Dédoublonne et retire les entrées vides
  const services = [
    ...new Set(profile.services.map((service) => service.trim()).filter(Boolean)),
  ]

  return (
    <div className="relative min-h-svh auth-canvas text-[#172033]">
      {/* Le rognage est posé ici, pas sur la racine : les halos débordants restent
          masqués tout en laissant la page défiler si le contenu dépasse la hauteur. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-grid absolute inset-0" />
        <div className="auth-orb auth-orb-cyan -left-40 -top-48 size-[34rem]" />
        <div className="auth-orb auth-orb-magenta -right-40 top-1/3 size-[30rem]" />
        <div className="auth-orb auth-orb-violet bottom-[-16rem] left-1/4 size-[32rem]" />
      </div>

      <div className="relative mx-auto flex min-h-svh w-full max-w-[1400px] flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <header className="flex items-center gap-3.5">
          <div className="auth-logo-ring flex size-12 shrink-0 items-center justify-center rounded-full bg-white">
            {profile.logo ? (
              <Image
                src={profile.logo}
                alt={`${companyName} logo`}
                width={48}
                height={48}
                priority
                unoptimized
                className="size-12 rounded-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-[#183b56]">
                {companyName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight tracking-[0.16em] text-[#183b56] uppercase">
              {companyName}
            </p>
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-[#1aa6a6]">
              Service Desk
            </p>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 lg:py-0">
          <div className="grid w-full items-center gap-14 lg:grid-cols-[1.05fr_minmax(26rem,32rem)] lg:gap-20">
            <section className="hidden lg:block">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cde6e6] bg-[#f2fbfb] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#147878]">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#1aa6a6] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#1aa6a6]" />
                </span>
                Operations platform
              </p>

              <h1 className="text-[2.75rem] font-bold leading-[1.08] tracking-tight text-[#183b56] xl:text-6xl">
                The next generation
                <br />
                <span className="auth-gradient-text">of the service desk</span>
              </h1>

              <p className="mt-6 max-w-lg text-[15px] leading-7 text-slate-500">
                {profile.description ||
                  "Bring your tickets, SLAs and teams into a single workspace, designed for organisations operating across borders."}
              </p>

              {services.length > 0 ? (
                <div className="mt-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Services delivered
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {services.slice(0, MAX_VISIBLE_SERVICES).map((service) => (
                      <li
                        key={service}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#cde6e6] bg-[#f2fbfb] px-3 py-1.5 text-[13px] font-medium text-[#147878]"
                      >
                        <BriefcaseBusiness className="size-3.5 shrink-0" />
                        {service}
                      </li>
                    ))}
                    {services.length > MAX_VISIBLE_SERVICES && (
                      <li className="inline-flex items-center rounded-full border border-[#e5eaf2] bg-white px-3 py-1.5 text-[13px] font-medium text-slate-500">
                        +{services.length - MAX_VISIBLE_SERVICES} more
                      </li>
                    )}
                  </ul>
                </div>
              ) : (
                <ul className="mt-10 space-y-5">
                  {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                    <li key={title} className="flex gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#cde6e6] bg-[#edf8f8] text-[#1aa6a6]">
                        <Icon className="size-[18px]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#183b56]">{title}</p>
                        <p className="mt-1 max-w-sm text-[13px] leading-6 text-slate-500">
                          {description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="w-full">
              <div
                className={cn(
                  "auth-glass relative overflow-hidden rounded-[1.75rem] p-7 sm:p-9",
                  className,
                )}
              >
                <div className="auth-sweep pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden" />
                {children}
              </div>
              {footer}
            </section>
          </div>
        </div>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-[#e5eaf2] pt-6 sm:flex-row">
          <p className="text-[11px] text-slate-400">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Icon className="size-3.5 text-[#1aa6a6]" />
                {label}
              </li>
            ))}
          </ul>
        </footer>
      </div>
    </div>
  )
}
