/* One .canvas file read into the links between its file cards: for every
 * file on the canvas, the files whose cards are connected to one of its
 * cards by an edge, in either direction. Pure: the file text in, a map out.
 * The same approach as icor-for-life-canvases/src/index/parse.ts, cut to
 * what the highlight note's `linked_notes` needs. */
import type { CanvasEdgeData, CanvasFileData, CanvasNodeData } from './format';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNode(v: unknown): v is CanvasNodeData {
  return isRecord(v) && typeof v.id === 'string' && typeof v.type === 'string';
}

function isEdge(v: unknown): v is CanvasEdgeData {
  return isRecord(v) && typeof v.id === 'string' && typeof v.fromNode === 'string' && typeof v.toNode === 'string';
}

export function parseCanvasJson(text: string): CanvasFileData | null {
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

/* File path (as written on the canvas) to the sorted, distinct file paths
   its cards are connected to. A card connected to another card of the same
   file, or to itself, adds nothing. Cards that are not files (text, link,
   group) are not connections. */
export function fileLinks(data: CanvasFileData): Map<string, string[]> {
  const nodes = Array.isArray(data.nodes) ? data.nodes.filter(isNode) : [];
  const edges = Array.isArray(data.edges) ? data.edges.filter(isEdge) : [];
  const fileOf = new Map<string, string>();
  for (const n of nodes) if (n.type === 'file' && typeof n.file === 'string' && n.file.length > 0) fileOf.set(n.id, n.file);
  const sets = new Map<string, Set<string>>();
  for (const file of fileOf.values()) if (!sets.has(file)) sets.set(file, new Set());
  for (const edge of edges) {
    const a = fileOf.get(edge.fromNode);
    const b = fileOf.get(edge.toNode);
    if (!a || !b || a === b) continue;
    sets.get(a)?.add(b);
    sets.get(b)?.add(a);
  }
  const out = new Map<string, string[]>();
  for (const [file, set] of sets) out.set(file, [...set].sort((x, y) => x.localeCompare(y)));
  return out;
}

/* The files placed on the canvas, distinct. */
export function filesOn(data: CanvasFileData): string[] {
  const nodes = Array.isArray(data.nodes) ? data.nodes.filter(isNode) : [];
  const out = new Set<string>();
  for (const n of nodes) if (n.type === 'file' && typeof n.file === 'string' && n.file.length > 0) out.add(n.file);
  return [...out].sort((x, y) => x.localeCompare(y));
}

export function parseCanvasLinks(text: string): Map<string, string[]> | null {
  const data = parseCanvasJson(text);
  return data ? fileLinks(data) : null;
}
