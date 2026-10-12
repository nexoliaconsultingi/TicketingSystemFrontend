"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ImageDown, Loader2, Minus, Plus, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  buildOrgTree,
  layoutOrgTree,
  truncate,
  CHART_TOP_PADDING,
  HEADER_HEIGHT,
  LEGEND_HEIGHT,
  LOGO_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
  type OrgDepartmentInput,
  type OrgUnitInput,
  type PositionedNode,
} from "@/lib/org-chart"

const TITLE_CHARS = 24
const SUBTITLE_CHARS = 28
const SAFE = 40
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "organigramme"
  )
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export interface OrgChartProps {
  companyName: string
  companyDomain: string
  companyLogo?: string
  departments: OrgDepartmentInput[]
  unitTree: OrgUnitInput[]
  loading?: boolean
}

export function OrgChart({
  companyName,
  companyDomain,
  companyLogo,
  departments,
  unitTree,
  loading = false,
}: OrgChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [exporting, setExporting] = useState(false)
  const userZoomed = useRef(false)

  const layout = useMemo(() => {
    const tree = buildOrgTree({ companyName, companyDomain, departments, unitTree })
    return layoutOrgTree(tree)
  }, [companyName, companyDomain, departments, unitTree])

  const fileBase = `${slug(companyName)}-organisational-chart`
  const generatedOn = useMemo(
    () =>
      new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    // Une fois par montage : la date reste celle du rendu courant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyName, departments, unitTree],
  )

  const exportPng = async () => {
    const svg = svgRef.current
    if (!svg) return
    setExporting(true)
    try {
      const scale = 2
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
      clone.setAttribute("width", String(layout.width))
      clone.setAttribute("height", String(layout.height))
      const markup = new XMLSerializer().serializeToString(clone)

      const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }))
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("The chart could not be rasterised."))
        image.src = url
      })

      const canvas = document.createElement("canvas")
      canvas.width = layout.width * scale
      canvas.height = layout.height * scale
      const context = canvas.getContext("2d")
      if (!context) throw new Error("The canvas is not available in this browser.")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)

      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!png) throw new Error("The PNG could not be generated.")
      download(png, `${fileBase}.png`)
    } catch (cause) {
      console.error(cause)
    } finally {
      setExporting(false)
    }
  }

  // `rootUnits` est un tableau : une liste vide est vraie en JavaScript, le
  // nombre d'éléments est donc indispensable pour compter les départements.
  const linked = departments.filter((department) => (department.rootUnits?.length ?? 0) > 0).length
  const empty = departments.length - linked

  // Le diagramme est ajusté à la largeur disponible pour rester entièrement visible.
  // Dès que l'utilisateur zoome manuellement, l'ajustement automatique est suspendu
  // pour ne pas écraser son choix lors des redimensionnements de la fenêtre.
  const applyFit = useCallback(() => {
    const box = scrollRef.current
    if (!box || layout.width === 0) return
    const available = box.clientWidth - 32
    const next = Math.max(0.3, Math.min(1, available / layout.width))
    setZoom(Math.round(next * 100) / 100)
  }, [layout.width])

  useEffect(() => {
    userZoomed.current = false
    applyFit()
  }, [applyFit])

  useEffect(() => {
    const box = scrollRef.current
    if (!box || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (!userZoomed.current) applyFit()
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [applyFit])

  const setManualZoom = (next: (value: number) => number) => {
    userZoomed.current = true
    setZoom((value) => Math.max(0.3, Math.min(2, next(value))))
  }

  return (
    <section className="rounded-xl border border-[#e5eaf2] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#183b56]">Organisational chart</h2>
          <p className="mt-1 text-sm text-slate-500">
            Company, departments and the units attached to each department, generated from the live
            data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#dce5ed]">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              className="text-slate-500"
              onClick={() => setManualZoom((value) => Math.round((value - 0.2) * 10) / 10)}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-slate-500">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              className="text-slate-500"
              onClick={() => setManualZoom((value) => Math.round((value + 0.2) * 10) / 10)}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Reset zoom"
              className="text-slate-500"
              onClick={() => {
                userZoomed.current = false
                applyFit()
              }}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>

          <Button
            type="button"
            className="gap-2 bg-[#183b56] text-white hover:bg-[#1c4a6b]"
            onClick={() => void exportPng()}
            disabled={loading || departments.length === 0 || exporting}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <ImageDown className="size-4" />}
            {exporting ? "Preparing" : "Download PNG"}
          </Button>
        </div>
      </div>

      {departments.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-400">
          {linked} of {departments.length} departments attached to a unit
          {empty > 0 ? ` · ${empty} without any unit and therefore not represented` : ""}
        </p>
      )}

      <div ref={scrollRef} className="mt-5 overflow-auto rounded-lg border border-[#edf0f5] bg-[#f7f9fc] p-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Building the chart…
          </p>
        ) : departments.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No department to display yet.</p>
        ) : (
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            width={layout.width * zoom}
            height={layout.height * zoom}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Organisational chart of ${companyName}`}
            style={{ maxWidth: "none" }}
            className="mx-auto block"
          >
            <defs>
              <linearGradient id="orgHeader" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#183b56" />
                <stop offset="100%" stopColor="#1f5573" />
              </linearGradient>
              <linearGradient id="orgRoot" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1aa6a6" />
                <stop offset="100%" stopColor="#148c8c" />
              </linearGradient>
              <filter id="orgShadow" x="-20%" y="-30%" width="140%" height="170%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f2a3d" floodOpacity="0.16" />
              </filter>
            </defs>

            <rect width={layout.width} height={layout.height} fill="#ffffff" />

            {/* Bandeau de titre */}
            <rect x="0" y="0" width={layout.width} height={layout.headerHeight} fill="url(#orgHeader)" />
            <CompanyHeader
              name={companyName}
              domain={companyDomain}
              logo={companyLogo}
              width={layout.width}
              departments={departments.length}
              units={countUnits(unitTree)}
              generatedOn={generatedOn}
            />

            {/* Connecteurs */}
            <g fill="none" stroke="#bfd0dd" strokeWidth={1.4} strokeLinecap="round">
              {layout.edges.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </g>

            {/* Nœuds */}
            <g>
              {layout.nodes.map((node) => (
                <ChartNode key={node.id} node={node} />
              ))}
            </g>

            {/* Légende */}
            <g transform={`translate(0 ${layout.height - LEGEND_HEIGHT + 14})`}>
              <line
                x1={SAFE}
                y1={0}
                x2={layout.width - SAFE}
                y2={0}
                stroke="#e4eaf1"
                strokeWidth={1}
              />
              <LegendItem x={SAFE} label="Company" fill="#1aa6a6" />
              <LegendItem x={SAFE + 150} label="Department" fill="#ffffff" stroke="#c3d2de" />
              <LegendItem x={SAFE + 320} label="Unit" fill="#ffffff" stroke="#c3d2de" accent="#1aa6a6" />
            </g>
          </svg>
        )}
      </div>
    </section>
  )
}

function CompanyHeader({
  name,
  domain,
  logo,
  width,
  departments,
  units,
  generatedOn,
}: {
  name: string
  domain: string
  logo?: string
  width: number
  departments: number
  units: number
  generatedOn: string
}) {
  const labelX = SAFE + LOGO_SIZE + 18
  return (
    <g>
      {logo ? (
        <>
          <rect
            x={SAFE}
            y={(HEADER_HEIGHT - LOGO_SIZE) / 2}
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            rx={12}
            fill="#ffffff"
          />
          <clipPath id="orgLogoClip">
            <rect
              x={SAFE + 4}
              y={(HEADER_HEIGHT - LOGO_SIZE) / 2 + 4}
              width={LOGO_SIZE - 8}
              height={LOGO_SIZE - 8}
              rx={8}
            />
          </clipPath>
          <image
            href={logo}
            x={SAFE + 4}
            y={(HEADER_HEIGHT - LOGO_SIZE) / 2 + 4}
            width={LOGO_SIZE - 8}
            height={LOGO_SIZE - 8}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#orgLogoClip)"
          />
        </>
      ) : (
        <>
          <rect
            x={SAFE}
            y={(HEADER_HEIGHT - LOGO_SIZE) / 2}
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            rx={12}
            fill="#1aa6a6"
          />
          <text
            x={SAFE + LOGO_SIZE / 2}
            y={(HEADER_HEIGHT - LOGO_SIZE) / 2 + LOGO_SIZE / 2 + 7}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={22}
            fontWeight={700}
            fill="#ffffff"
          >
            {initials(name)}
          </text>
        </>
      )}

      <text x={labelX} y={44} fontFamily={FONT} fontSize={19} fontWeight={700} fill="#ffffff">
        {truncate(name || "Unnamed company", 30)}
      </text>
      <text x={labelX} y={65} fontFamily={FONT} fontSize={11.5} letterSpacing={1.1} fill="#8fbcd8">
        {truncate(domain.toUpperCase(), 30)}
      </text>

      <text
        x={width - SAFE}
        y={44}
        textAnchor="end"
        fontFamily={FONT}
        fontSize={12}
        fontWeight={600}
        fill="#d7e7f2"
      >
        Organisational chart
      </text>
      <text
        x={width - SAFE}
        y={65}
        textAnchor="end"
        fontFamily={FONT}
        fontSize={11}
        fill="#8fbcd8"
      >
        {departments} departments · {units} units · {generatedOn}
      </text>
    </g>
  )
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

function countUnits(nodes: OrgUnitInput[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countUnits(node.children ?? []), 0)
}

function LegendItem({
  x,
  label,
  fill,
  stroke,
  accent,
}: {
  x: number
  label: string
  fill: string
  stroke?: string
  accent?: string
}) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={0} y={16} width={18} height={18} rx={4} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {accent && <rect x={0} y={16} width={4} height={18} rx={2} fill={accent} />}
      <text x={26} y={29} fontFamily={FONT} fontSize={11.5} fill="#64748b">
        {label}
      </text>
    </g>
  )
}

function ChartNode({ node }: { node: PositionedNode }) {
  const isCompany = node.kind === "company"
  const isDepartment = node.kind === "department"

  const fill = isCompany ? "url(#orgRoot)" : isDepartment ? node.accent : "#ffffff"
  const titleFill = isCompany || isDepartment ? "#ffffff" : "#183b56"
  const subtitleFill = isCompany || isDepartment ? "rgba(255,255,255,0.82)" : "#8494a5"
  const stroke = isCompany || isDepartment ? "rgba(0,0,0,0.10)" : "#d3dee8"

  // La boîte est centrée dans l'emprise du nœud, elle-même centrée sur ses enfants.
  const boxX = node.x + (node.width - NODE_WIDTH) / 2
  const labelX = NODE_WIDTH / 2 + (isCompany || isDepartment ? 0 : 5)

  return (
    <g transform={`translate(${boxX} ${node.y})`} filter="url(#orgShadow)">
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={isCompany ? 12 : 9}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
      />
      {!isCompany && !isDepartment && (
        <path d={`M 0 9 A 9 9 0 0 1 9 0 L 9 ${NODE_HEIGHT} A 9 9 0 0 1 0 ${NODE_HEIGHT - 9} Z`} fill={node.accent} />
      )}

      <text
        x={labelX}
        y={isCompany || isDepartment ? 28 : 27}
        textAnchor="middle"
        fontFamily={FONT}
        fontSize={isCompany ? 14.5 : 13}
        fontWeight={isCompany ? 700 : 600}
        fill={titleFill}
      >
        {truncate(node.title, TITLE_CHARS)}
      </text>
      <text
        x={labelX}
        y={isCompany || isDepartment ? 46 : 45}
        textAnchor="middle"
        fontFamily={FONT}
        fontSize={10.5}
        letterSpacing={isDepartment ? 0.9 : 0.3}
        fill={subtitleFill}
      >
        {truncate(node.subtitle, SUBTITLE_CHARS)}
      </text>
    </g>
  )
}
