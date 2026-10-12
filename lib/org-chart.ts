export type OrgNodeKind = "company" | "department" | "unit"

export interface OrgUnitInput {
  path: string
  name: string
  children?: OrgUnitInput[]
}

export interface OrgDepartmentInput {
  id: string
  code: string
  name: string
  /** Nœuds de premier niveau portés par ce département, s'il y en a */
  rootUnits?: { path: string; name: string }[]
}

export interface OrgNode {
  id: string
  kind: OrgNodeKind
  title: string
  subtitle: string
  /** Couleur d'accentuation,herited par les unités du département */
  accent: string
  children: OrgNode[]
}

export interface PositionedNode extends OrgNode {
  x: number
  y: number
  width: number
  depth: number
  centerX: number
  centerY: number
}

export interface OrgLayout {
  nodes: PositionedNode[]
  edges: string[]
  width: number
  height: number
  /** Bandeau de titre, en haut du document exporté */
  headerHeight: number
  /** Espace réservé à la légende, en bas */
  legendHeight: number
  /** Profondeur maximale atteinte sous la société */
  depthCount: number
  /** Position verticale du premier nœud */
  chartTop: number
}

export const NODE_WIDTH = 208
export const NODE_HEIGHT = 62
export const H_GAP = 28
export const V_GAP = 86
export const MARGIN = 40
export const HEADER_HEIGHT = 104
/** Respiration entre le bas du bandeau et la première boîte de l'organigramme. */
export const CHART_TOP_PADDING = 44
export const LEGEND_HEIGHT = 64
export const LOGO_SIZE = 54

/** Palette d'accents appliquée aux départements pour distinguer les branches. */
export const DEPARTMENT_ACCENTS = [
  "#1aa6a6",
  "#3b7dd8",
  "#7a5cd6",
  "#d9822b",
  "#c2456b",
  "#2f9e4f",
  "#b8860b",
  "#0f8b9e",
] as const

/**
 * Assemble l'organigramme : société en tête, départements ensuite, puis
 * l'arborescence des unités rattachée à chaque département. Un département
 * portant plusieurs nœuds de premier niveau les expose tous comme enfants.
 * Un département sans unité racine reste une feuille : aucun nœud vide n'est
 * dessiné.
 */
export function buildOrgTree(options: {
  companyName: string
  companyDomain: string
  departments: OrgDepartmentInput[]
  unitTree: OrgUnitInput[]
}): OrgNode {
  const unitByPath = new Map<string, OrgUnitInput>()
  const collect = (nodes: OrgUnitInput[]) => {
    for (const node of nodes) {
      unitByPath.set(node.path, node)
      collect(node.children ?? [])
    }
  }
  collect(options.unitTree)

  const toUnitNode = (node: OrgUnitInput, accent: string): OrgNode => ({
    id: `unit:${node.path}`,
    kind: "unit",
    title: node.name,
    subtitle: node.path,
    accent,
    children: (node.children ?? []).map((child) => toUnitNode(child, accent)),
  })

  const departmentNodes: OrgNode[] = [...options.departments]
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map((department, index) => {
      const accent = DEPARTMENT_ACCENTS[index % DEPARTMENT_ACCENTS.length]
      // Toutes les racines sont rattachées : un département peut être découpé
      // en plusieurs nœuds de premier niveau, l'export doit tous les montrer.
      const roots = (department.rootUnits ?? [])
        .map((root) => unitByPath.get(root.path))
        .filter((unit): unit is OrgUnitInput => Boolean(unit))
      return {
        id: `department:${department.id}`,
        kind: "department",
        title: department.name,
        subtitle: department.code,
        accent,
        children: roots.map((root) => toUnitNode(root, accent)),
      }
    })

  return {
    id: "company",
    kind: "company",
    title: options.companyName || "Unnamed company",
    subtitle: options.companyDomain,
    accent: "#183b56",
    children: departmentNodes,
  }
}

function measure(node: OrgNode, widths: Map<string, number>): number {
  if (node.children.length === 0) {
    widths.set(node.id, NODE_WIDTH)
    return NODE_WIDTH
  }
  const childrenWidth =
    node.children.reduce((sum, child) => sum + measure(child, widths), 0) +
    H_GAP * (node.children.length - 1)
  const width = Math.max(NODE_WIDTH, childrenWidth)
  widths.set(node.id, width)
  return width
}

function place(
  node: OrgNode,
  widths: Map<string, number>,
  depth: number,
  x: number,
  top: number,
  output: PositionedNode[],
): number {
  const width = widths.get(node.id) ?? NODE_WIDTH
  const y = top + depth * (NODE_HEIGHT + V_GAP)
  output.push({ ...node, x, y, width, depth, centerX: x + width / 2, centerY: y + NODE_HEIGHT / 2 })

  if (node.children.length > 0) {
    const childrenWidth =
      node.children.reduce((sum, child) => sum + (widths.get(child.id) ?? NODE_WIDTH), 0) +
      H_GAP * (node.children.length - 1)
    let cursor = x + (width - childrenWidth) / 2
    for (const child of node.children) {
      cursor = place(child, widths, depth + 1, cursor, top, output) + H_GAP
    }
  }

  return x + width
}

function maxDepth(node: OrgNode, depth = 0): number {
  if (node.children.length === 0) return depth
  return node.children.reduce((max, child) => Math.max(max, maxDepth(child, depth + 1)), depth)
}

/** Connecteurs en équerre : descente verticale, bus horizontal, descente vers chaque enfant. */
function connect(
  node: PositionedNode,
  byId: Map<string, PositionedNode>,
  edges: string[],
) {
  if (node.children.length === 0) return

  const bottoms = node.children.map((child) => byId.get(child.id)!)
  const fromX = node.centerX
  const bottomY = node.y + NODE_HEIGHT

  if (bottoms.length === 1) {
    const child = bottoms[0]
    edges.push(`M ${fromX} ${bottomY} L ${child.centerX} ${child.y}`)
  } else {
    const busY = bottomY + V_GAP / 2
    const firstX = bottoms[0].centerX
    const lastX = bottoms[bottoms.length - 1].centerX
    edges.push(`M ${fromX} ${bottomY} L ${fromX} ${busY}`)
    edges.push(`M ${firstX} ${busY} L ${lastX} ${busY}`)
    for (const child of bottoms) {
      edges.push(`M ${child.centerX} ${busY} L ${child.centerX} ${child.y}`)
    }
  }

  for (const child of node.children) {
    connect(byId.get(child.id)!, byId, edges)
  }
}

export function layoutOrgTree(root: OrgNode): OrgLayout {
  const widths = new Map<string, number>()
  const rootWidth = measure(root, widths)

  const width = rootWidth + MARGIN * 2
  const depthCount = maxDepth(root)
  const chartTop = HEADER_HEIGHT + CHART_TOP_PADDING
  const chartHeight = depthCount * (NODE_HEIGHT + V_GAP) + NODE_HEIGHT
  const height = chartTop + chartHeight + LEGEND_HEIGHT

  // Le nœud racine est centré horizontalement sur l'ensemble du document.
  const nodes: PositionedNode[] = []
  place(root, widths, 0, MARGIN, chartTop, nodes)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges: string[] = []
  connect(byId.get(root.id)!, byId, edges)

  return {
    nodes,
    edges,
    width,
    height,
    headerHeight: HEADER_HEIGHT,
    legendHeight: LEGEND_HEIGHT,
    depthCount,
    chartTop,
  }
}

/** Tronque un libellé pour qu'il tienne dans la largeur du nœud. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}
