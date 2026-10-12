import type { ReactNode } from "react"

import type { CalloutKind, ManualBlock, ManualAudience, ManualChapter } from "@/components/manual/manual-content"
import { AUDIENCE_LABELS } from "@/components/manual/manual-content"

const AUDIENCE_CLASSES: Record<ManualAudience, string> = {
  all: "border-slate-200 bg-slate-100 text-slate-600",
  employee: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  supervisor: "border-[#a7f3d0] bg-[#ecfdf5] text-[#0f766e]",
  admin: "border-[#cdd8e3] bg-[#eef2f7] text-[#183b56]",
}

const CALLOUT_CLASSES: Record<CalloutKind, { border: string; bg: string; label: string }> = {
  note: { border: "border-[#c9dbef]", bg: "bg-[#f5f9ff]", label: "text-[#2b6cb0]" },
  tip: { border: "border-[#b9e2e2]", bg: "bg-[#f2fbfb]", label: "text-[#147878]" },
  important: { border: "border-[#ecd3a7]", bg: "bg-[#fffaf0]", label: "text-[#92400e]" },
  warning: { border: "border-[#f0bfbf]", bg: "bg-[#fff1f1]", label: "text-[#b91c1c]" },
}

const CALLOUT_TITLES: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
}

/** Renders **bold** and `code` markers inside a plain string. */
export function Inline({ children }: { children: ReactNode }) {
  if (typeof children !== "string") return <>{children}</>
  const parts = children.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={index} className="font-semibold text-[#183b56]">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-[#0d5a5a]"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

export function AudienceBadge({ audience }: { audience: ManualAudience }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${AUDIENCE_CLASSES[audience]}`}
    >
      {AUDIENCE_LABELS[audience]}
    </span>
  )
}

function Callout({ kind, title, children }: { kind: CalloutKind; title?: string; children: ReactNode }) {
  const style = CALLOUT_CLASSES[kind]
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${style.label}`}>
        <span className="size-2 rounded-full bg-current opacity-70" />
        {title ?? CALLOUT_TITLES[kind]}
      </p>
      <div className="mt-1 text-[13px] leading-6 text-slate-600">
        <Inline>{children}</Inline>
      </div>
    </div>
  )
}

function BlockView({ block }: { block: ManualBlock }) {
  if (block.type === "p") {
    return (
      <p className="text-[13.5px] leading-6 text-slate-600">
        <Inline>{block.children}</Inline>
      </p>
    )
  }

  if (block.type === "callout") {
    return <Callout kind={block.kind} title={block.title} children={block.children} />
  }

  if (block.type === "steps") {
    return (
      <div>
        {block.title && (
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {block.title}
          </p>
        )}
        <ol className="space-y-2.5">
          {block.steps.map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1aa6a6]/10 text-[11px] font-bold text-[#147878]">
                {index + 1}
              </span>
              <span className="min-w-0 text-[13.5px] leading-6 text-slate-600">
                <Inline>{step}</Inline>
              </span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (block.type === "list") {
    return (
      <ul className="space-y-1.5">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-2 text-[13.5px] leading-6 text-slate-600">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#1aa6a6]" />
            <span className="min-w-0">
              <Inline>{item}</Inline>
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full overflow-hidden rounded-lg border border-[#e5eaf2] bg-white">
        <thead>
          <tr className="bg-[#f7f9fc] text-left">
            {block.columns.map((column, index) => (
              <th
                key={index}
                className="border-b border-[#e5eaf2] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 1 ? "bg-[#fbfcfe]" : "bg-white"}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`border-b border-[#edf0f5] px-3 py-2.5 text-[13px] leading-5 text-slate-600 ${
                    cellIndex === 0 ? "font-medium text-[#183b56]" : ""
                  }`}
                >
                  <Inline>{cell}</Inline>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChapterView({ chapter }: { chapter: ManualChapter }) {
  return (
    <article
      id={chapter.id}
      className="scroll-mt-24 rounded-xl border border-[#e5eaf2] bg-white shadow-sm"
    >
      <header className="border-b border-[#eef2f7] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-[#183b56]">{chapter.title}</h2>
          <AudienceBadge audience={chapter.audience} />
        </div>
        {chapter.intro && <p className="mt-2 max-w-4xl text-[13.5px] leading-6 text-slate-500">{chapter.intro}</p>}
      </header>
      <div className="space-y-8 px-5 py-6 sm:px-7">
        {chapter.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h3 className="mb-3 border-b border-[#eef2f7] pb-2 text-[15px] font-semibold text-[#183b56]">
              {section.title}
            </h3>
            <div className="space-y-4">
              {section.blocks.map((block, index) => (
                <BlockView key={index} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}