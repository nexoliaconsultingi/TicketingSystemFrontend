"use client"

/**
 * Lightweight BPMN rendering, with no dependency.
 *
 * The project does not ship a diagram engine: workflows are described as data
 * (nodes + transitions) and drawn in SVG. Each node carries an actor, mapped to
 * a color, so the eye finds "who does what" without reading every label. Edges
 * are routed at right angles, the BPMN way.
 */

export type Actor = "requester" | "dispatch" | "supervisor" | "system"

export type NodeKind = "start" | "end" | "event" | "task" | "gateway"

export type Side = "l" | "r" | "t" | "b"

export interface BpmnNode {
  id: string
  kind: NodeKind
  /** Top-left corner of the node, in viewBox units. */
  x: number
  y: number
  w?: number
  h?: number
  label: string
  /** Secondary, more discreet line: reached state or precision. */
  sub?: string
  actor?: Actor
}

export interface BpmnEdge {
  from: string
  to: string
  fromSide?: Side
  toSide?: Side
  label?: string
  /** Dashed stroke: exception transition or backward jump. */
  dashed?: boolean
  /** Imposed passage points (absolute coordinates) for a clean routing. */
  waypoints?: [number, number][]
}

interface BpmnDiagramProps {
  /** Unique id: prefixes the SVG markers (several diagrams per page). */
  uid: string
  width: number
  height: number
  nodes: BpmnNode[]
  edges: BpmnEdge[]
}

/**
 * Actor palette. The tint is carried by the stroke and the node fill, never by
 * a saturated flat color: the diagram must stay readable when printed.
 */
export const ACTOR_STYLE: Record<Actor, { stroke: string; fill: string; text: string; solid: string }> = {
  requester: { stroke: "#2563eb", fill: "#eff6ff", text: "#1d4ed8", solid: "#2563eb" },
  dispatch: { stroke: "#183b56", fill: "#eef2f7", text: "#183b56", solid: "#183b56" },
  supervisor: { stroke: "#0d9488", fill: "#ecfdf5", text: "#0f766e", solid: "#0d9488" },
  system: { stroke: "#7c3aed", fill: "#f5f3ff", text: "#6d28d9", solid: "#7c3aed" },
}

export const ACTOR_LABELS: Record<Actor, string> = {
  requester: "Requester (employee)",
  dispatch: "Dispatch (admin)",
  supervisor: "Supervisor",
  system: "System",
}

const STUB = 18
const TASK_LINE = 15
const SUB_LINE = 12

function dims(node: BpmnNode): { w: number; h: number } {
  if (node.kind === "task") return { w: node.w ?? 184, h: node.h ?? 66 }
  if (node.kind === "gateway") return { w: node.w ?? 104, h: node.h ?? 72 }
  return { w: node.w ?? 46, h: node.h ?? 46 }
}

function center(node: BpmnNode): [number, number] {
  const d = dims(node)
  return [node.x + d.w / 2, node.y + d.h / 2]
}

function anchor(node: BpmnNode, side: Side): [number, number] {
  const d = dims(node)
  const cx = node.x + d.w / 2
  const cy = node.y + d.h / 2
  if (side === "l") return [node.x, cy]
  if (side === "r") return [node.x + d.w, cy]
  if (side === "t") return [cx, node.y]
  return [cx, node.y + d.h]
}

function offset([x, y]: [number, number], side: Side, d: number): [number, number] {
  if (side === "l") return [x - d, y]
  if (side === "r") return [x + d, y]
  if (side === "t") return [x, y - d]
  return [x, y + d]
}

const isHorizontal = (side: Side) => side === "l" || side === "r"

function autoSource(a: BpmnNode, b: BpmnNode): Side {
  const [ax, ay] = center(a)
  const [bx, by] = center(b)
  const dx = bx - ax
  const dy = by - ay
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "r" : "l"
  return dy >= 0 ? "b" : "t"
}

function opposite(side: Side): Side {
  if (side === "r") return "l"
  if (side === "l") return "r"
  if (side === "b") return "t"
  return "b"
}

function route(
  p1: [number, number],
  s1: Side,
  p2: [number, number],
  s2: Side,
  waypoints?: [number, number][],
): [number, number][] {
  if (waypoints && waypoints.length > 0) return waypoints
  const h1 = isHorizontal(s1)
  const h2 = isHorizontal(s2)
  if (h1 && h2) {
    const mx = (p1[0] + p2[0]) / 2
    return [
      [mx, p1[1]],
      [mx, p2[1]],
    ]
  }
  if (!h1 && !h2) {
    const my = (p1[1] + p2[1]) / 2
    return [
      [p1[0], my],
      [p2[0], my],
    ]
  }
  if (h1 && !h2) return [[p2[0], p1[1]]]
  return [[p1[0], p2[1]]]
}

function dedupe(points: [number, number][]): [number, number][] {
  return points.filter(
    (point, index) =>
      index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1],
  )
}

function toPath(points: [number, number][]): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ")
}

/** Point at mid-course of a polyline, to position a label. */
function midpoint(points: [number, number][]): [number, number] {
  const segments: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    segments.push(length)
    total += length
  }
  let target = total / 2
  for (let i = 0; i < segments.length; i += 1) {
    if (target <= segments[i]) {
      const ratio = segments[i] === 0 ? 0 : target / segments[i]
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
        points[i][1] + (points[i + 1][1] - points[i][1]) * ratio,
      ]
    }
    target -= segments[i]
  }
  return points[points.length - 1]
}

/** Splits a text into lines of about `maxChars` characters, without cutting words. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if ((current + " " + word).length <= maxChars) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function NodeShape({ node, uid }: { node: BpmnNode; uid: string }) {
  const d = dims(node)
  const actor = node.actor ?? "system"
  const style = ACTOR_STYLE[actor]
  const cx = node.x + d.w / 2
  const cy = node.y + d.h / 2

  if (node.kind === "task") {
    const maxChars = Math.max(12, Math.floor((d.w - 18) / 7.4))
    const labelLines = wrap(node.label, maxChars)
    const subLines = node.sub ? wrap(node.sub, maxChars + 2) : []
    const totalH = labelLines.length * TASK_LINE + (subLines.length ? subLines.length * SUB_LINE + 4 : 0)
    let y = cy - totalH / 2 + TASK_LINE * 0.82
    return (
      <g>
        <rect
          x={node.x}
          y={node.y}
          width={d.w}
          height={d.h}
          rx={12}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={1.6}
        />
        {labelLines.map((line, index) => (
          <text
            key={`l${index}`}
            x={cx}
            y={y + index * TASK_LINE}
            textAnchor="middle"
            fontSize={12.5}
            fontWeight={600}
            fill={style.text}
          >
            {line}
          </text>
        ))}
        {subLines.map((line, index) => (
          <text
            key={`s${index}`}
            x={cx}
            y={y + labelLines.length * TASK_LINE + 4 + index * SUB_LINE}
            textAnchor="middle"
            fontSize={10.5}
            fill="#64748b"
          >
            {line}
          </text>
        ))}
      </g>
    )
  }

  if (node.kind === "gateway") {
    const points = [
      [cx, node.y],
      [node.x + d.w, cy],
      [cx, node.y + d.h],
      [node.x, cy],
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(" ")
    const lines = wrap(node.label, 16)
    return (
      <g>
        <polygon points={points} fill="#fffbeb" stroke="#d97706" strokeWidth={1.6} />
        {lines.map((line, index) => (
          <text
            key={index}
            x={cx}
            y={cy - (lines.length - 1) * 6 + index * 13 + 4}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={600}
            fill="#92400e"
          >
            {line}
          </text>
        ))}
      </g>
    )
  }

  // Start / end / intermediate events.
  const r = d.w / 2
  const strokeWidth = node.kind === "end" ? 4 : node.kind === "start" ? 3 : 2
  const fill = node.kind === "end" ? "#fee2e2" : "#ffffff"
  const stroke = node.kind === "end" ? "#dc2626" : node.kind === "start" ? "#16a34a" : "#475569"
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <text
        x={cx}
        y={node.y + d.h + 15}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#334155"
      >
        {node.label}
      </text>
      {node.sub && (
        <text x={cx} y={node.y + d.h + 29} textAnchor="middle" fontSize={10} fill="#64748b">
          {node.sub}
        </text>
      )}
      <title>{`${node.kind} ${uid}`}</title>
    </g>
  )
}

/** Resolves the full polyline of an edge (stubs + routing + waypoints). */
function edgePoints(edge: BpmnEdge, nodeMap: Map<string, BpmnNode>): [number, number][] | null {
  const a = nodeMap.get(edge.from)
  const b = nodeMap.get(edge.to)
  if (!a || !b) return null
  const fromSide = edge.fromSide ?? autoSource(a, b)
  const toSide = edge.toSide ?? opposite(fromSide)
  const p0 = anchor(a, fromSide)
  const p3 = anchor(b, toSide)
  const p1 = offset(p0, fromSide, STUB)
  const p2 = offset(p3, toSide, STUB)
  return dedupe([p0, p1, ...route(p1, fromSide, p2, toSide, edge.waypoints), p2, p3])
}

const PAD = 28

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Computes the box that really contains the diagram (shapes, their labels,
 * edges and the edge badges). The viewBox is derived from it, so a diagram
 * never clips nor overflows its frame, whatever its declared dimensions.
 */
function contentBounds(
  nodes: BpmnNode[],
  edges: BpmnEdge[],
  nodeMap: Map<string, BpmnNode>,
  fallback: Pick<BpmnDiagramProps, "width" | "height">,
): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (const node of nodes) {
    const d = dims(node)
    add(node.x, node.y)
    add(node.x + d.w, node.y + d.h)
    if (node.kind !== "task" && node.kind !== "gateway") {
      const cx = node.x + d.w / 2
      const base = node.y + d.h + 15
      const labelHalf = node.label.length * 3.1 + 6
      add(cx - labelHalf, base)
      add(cx + labelHalf, base + 8)
      if (node.sub) {
        const subHalf = node.sub.length * 2.9 + 6
        add(cx - subHalf, base + 14)
        add(cx + subHalf, base + 22)
      }
    }
  }

  for (const edge of edges) {
    const points = edgePoints(edge, nodeMap)
    if (!points) continue
    for (const point of points) add(point[0], point[1])
    if (edge.label) {
      const [lx, ly] = midpoint(points)
      const half = (edge.label.length * 6.1 + 12) / 2
      add(lx - half, ly - 11)
      add(lx + half, ly + 11)
    }
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return { minX: 0, minY: 0, maxX: fallback.width, maxY: fallback.height }
  }
  return {
    minX: Math.floor(minX - PAD),
    minY: Math.floor(minY - PAD),
    maxX: Math.ceil(maxX + PAD),
    maxY: Math.ceil(maxY + PAD),
  }
}

export function BpmnDiagram({ uid, width, height, nodes, edges }: BpmnDiagramProps) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const actors: Actor[] = ["requester", "dispatch", "supervisor", "system"]
  const bounds = contentBounds(nodes, edges, nodeMap, { width, height })

  return (
    <div className="flex w-full justify-center">
      <svg
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full max-w-full"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        <defs>
          {actors.map((actor) => (
            <marker
              key={actor}
              id={`${uid}-arrow-${actor}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={ACTOR_STYLE[actor].solid} />
            </marker>
          ))}
        </defs>

        {edges.map((edge, index) => {
          const points = edgePoints(edge, nodeMap)
          if (!points) return null
          const a = nodeMap.get(edge.from)!
          const actor = a.actor ?? "system"
          const [lx, ly] = edge.label ? midpoint(points) : [0, 0]
          const labelWidth = edge.label ? edge.label.length * 6.1 + 12 : 0
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <path
                d={toPath(points)}
                fill="none"
                stroke={ACTOR_STYLE[actor].solid}
                strokeWidth={1.8}
                strokeDasharray={edge.dashed ? "6 5" : undefined}
                markerEnd={`url(#${uid}-arrow-${actor})`}
              />
              {edge.label && (
                <g>
                  <rect
                    x={lx - labelWidth / 2}
                    y={ly - 10}
                    width={labelWidth}
                    height={20}
                    rx={5}
                    fill="#ffffff"
                    stroke="#e5eaf2"
                  />
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10.5} fill="#475569">
                    {edge.label}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {nodes.map((node) => (
          <NodeShape key={node.id} node={node} uid={uid} />
        ))}
      </svg>
    </div>
  )
}

/** Shared legend: BPMN shapes and actor colors. */
export function BpmnLegend() {
  const actors: Actor[] = ["requester", "dispatch", "supervisor", "system"]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-600">
      <span className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <circle cx="13" cy="13" r="10" fill="#ffffff" stroke="#16a34a" strokeWidth="3" />
        </svg>
        Start
      </span>
      <span className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <rect x="2" y="5" width="22" height="16" rx="4" fill="#eef2f7" stroke="#183b56" strokeWidth="1.6" />
        </svg>
        Activity
      </span>
      <span className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <polygon points="13,3 24,13 13,23 2,13" fill="#fffbeb" stroke="#d97706" strokeWidth="1.6" />
        </svg>
        Decision
      </span>
      <span className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <circle cx="13" cy="13" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="4" />
        </svg>
        End
      </span>
      <span className="flex items-center gap-2">
        <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
          <line x1="1" y1="6" x2="25" y2="6" stroke="#64748b" strokeWidth="1.8" strokeDasharray="6 5" />
        </svg>
        Exception transition
      </span>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      {actors.map((actor) => (
        <span key={actor} className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-sm"
            style={{ backgroundColor: ACTOR_STYLE[actor].solid }}
          />
          {ACTOR_LABELS[actor]}
        </span>
      ))}
    </div>
  )
}

/** Rasterizes an inline-rendered <svg> into a PNG file that the browser downloads. */
export async function exportSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const viewBox = svg.viewBox.baseVal
  const width = Math.max(1, viewBox.width)
  const height = Math.max(1, viewBox.height)

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(Math.round(width * scale)))
  clone.setAttribute("height", String(Math.round(height * scale)))
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`)

  const xml = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("The diagram could not be rasterized"))
    image.src = url
  })

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext("2d")
  if (!context) {
    URL.revokeObjectURL(url)
    throw new Error("Canvas is not available in this browser")
  }
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)

  const link = document.createElement("a")
  link.href = canvas.toDataURL("image/png")
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`
  link.click()
}
