"use client"

import { useRef, useState } from "react"
import { AuthGuard } from "@/components/auth/auth-guard"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { BpmnDiagram, BpmnLegend, exportSvgAsPng } from "@/components/workflows/bpmn-diagram"
import type { WorkflowDefinition } from "@/components/workflows/workflow-data"
import { WORKFLOWS } from "@/components/workflows/workflow-data"

function WorkflowCard({ workflow, index }: { workflow: WorkflowDefinition; index: number }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  async function handleDownload() {
    const svg = containerRef.current?.querySelector("svg")
    if (!svg) return
    setExporting(true)
    setError(null)
    try {
      await exportSvgAsPng(svg, `workflow-${workflow.id}`, 2)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <article className="rounded-xl border border-[#e5eaf2] bg-white shadow-sm">
      <header className="border-b border-[#eef2f7] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#183b56] text-[11px] font-bold text-white">
              {index + 1}
            </span>
            <h2 className="text-base font-semibold text-[#183b56]">{workflow.title}</h2>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5eaf2] bg-white px-3 py-1.5 text-xs font-semibold text-[#183b56] shadow-sm transition hover:border-[#1aa6a6] hover:text-[#1aa6a6] disabled:cursor-wait disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Download PNG"}
          </button>
        </div>
        <p className="mt-2 pl-9 text-[13px] leading-6 text-slate-500">{workflow.subtitle}</p>
      </header>

      <div ref={containerRef} className="px-2 py-5 sm:px-4">
        <BpmnDiagram
          uid={`wf-${workflow.id}`}
          width={workflow.width}
          height={workflow.height}
          nodes={workflow.nodes}
          edges={workflow.edges}
        />
      </div>

      {error && (
        <p className="border-t border-[#ef4444]/30 bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c] sm:px-6">
          {error}
        </p>
      )}

      {workflow.notes.length > 0 && (
        <footer className="border-t border-[#eef2f7] bg-[#f7f9fc] px-4 py-4 sm:px-6">
          <ul className="space-y-1.5">
            {workflow.notes.map((note) => (
              <li key={note} className="flex gap-2 text-[12.5px] leading-5 text-slate-600">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#1aa6a6]" />
                {note}
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  )
}

export default function WorkflowsPage() {
  return (
    <AuthGuard>
      <DashboardShell
        title={
          <h1 className="text-2xl font-bold tracking-tight text-[#183b56] sm:text-3xl">
            Workflows
          </h1>
        }
        subtitle={
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            The main business processes of the ticketing system, drawn in BPMN. Every shape is
            wired to the actual code: each diagram shows what really happens, step by step, and
            who is responsible. Use <span className="font-semibold">Download PNG</span> to save a
            diagram as an image.
          </p>
        }
        breadcrumb="Organisation"
      >
        <section className="mb-7 rounded-xl border border-[#e5eaf2] bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Legend
          </h2>
          <BpmnLegend />
        </section>

        <div className="space-y-7">
          {WORKFLOWS.map((workflow, index) => (
            <WorkflowCard key={workflow.id} workflow={workflow} index={index} />
          ))}
        </div>
      </DashboardShell>
    </AuthGuard>
  )
}