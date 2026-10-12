"use client"

import Link from "next/link"

import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { MANUAL_CHAPTERS } from "@/components/manual/manual-content"
import { AudienceBadge, ChapterView } from "@/components/manual/manual-renderer"

export default function ManualPage() {
  return (
    <AuthGuard>
      <DashboardShell
        title={
          <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">User manual</h1>
        }
        subtitle={
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Nexolia Service Desk, documented section by section for every profile: employees,
            supervisors and administrators. This manual mirrors the screens — use it to learn a
            screen or to find the exact rule behind an operation.
          </p>
        }
        breadcrumb="Organisation"
      >
        <section className="rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            On this page
          </h2>
          <nav className="flex flex-wrap gap-2">
            {MANUAL_CHAPTERS.map((chapter) => (
              <Link
                key={chapter.id}
                href={`#${chapter.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#dce5ed] bg-white px-3 py-1.5 text-xs font-semibold text-[#183b56] transition hover:border-[#1aa6a6] hover:text-[#1aa6a6]"
              >
                {chapter.title}
                <AudienceBadge audience={chapter.audience} />
              </Link>
            ))}
          </nav>
        </section>

        <div className="space-y-7">
          {MANUAL_CHAPTERS.map((chapter) => (
            <ChapterView key={chapter.id} chapter={chapter} />
          ))}
        </div>

        <p className="text-[12.5px] leading-5 text-slate-400">
          Terms: “Supervisor” is the role <code className="font-mono">manager</code> (displayed as
          Supervisor (Responsable)); “Administrator” is the role <code className="font-mono">admin</code>{" "}
          (displayed as Manager (Gérant)). This manual is kept in sync with the application: if a
          screen behaves differently, prefer the live workflow diagrams on the{" "}
          <Link href="/workflows" className="font-semibold text-[#1aa6a6] hover:underline">
            Workflows
          </Link>{" "}
          page.
        </p>
      </DashboardShell>
    </AuthGuard>
  )
}