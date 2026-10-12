"use client"

import Image from "next/image"
import { Loader2 } from "lucide-react"

export function AuthLoadingScreen() {
  return (
    <div className="auth-canvas relative flex min-h-svh items-center justify-center text-[#172033]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="auth-grid absolute inset-0" />
        <div className="auth-orb auth-orb-cyan -left-40 -top-40 size-[30rem]" />
        <div className="auth-orb auth-orb-magenta -right-32 bottom-0 size-[28rem]" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <div className="auth-logo-ring flex size-14 items-center justify-center rounded-full bg-white">
          <Image
            src="/nexoliaLogo/logo.png"
            alt="Nexolia Consulting"
            width={56}
            height={56}
            priority
            className="size-14 rounded-full object-cover"
          />
        </div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-[#1aa6a6]" />
          <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Loading your workspace
          </p>
        </div>
      </div>
    </div>
  )
}
