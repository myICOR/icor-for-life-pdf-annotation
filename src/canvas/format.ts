/* The .canvas file format as this plugin reads it: JSON Canvas (nodes,
 * edges). The plugin never writes a .canvas file. The Canvases plugin's own
 * keys (`icorShape`, `icorStyle` on a node, `metadata.icorCanvases` at the
 * top) are read through the spread and never written. Pure. */

export interface CanvasNodeData {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  file?: string;
  subpath?: string;
  text?: string;
  url?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasFileData {
  nodes?: CanvasNodeData[];
  edges?: CanvasEdgeData[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
