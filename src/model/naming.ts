/* Where a highlight note lives and what it is called. Pure. The folder root
 * comes from the settings; under it one folder per PDF, named after the
 * PDF's basename; the file is `<YYYY-MM-DD-HHMMSS>-p<page>-<4 chars of the
 * id>.md`, and a name that exists already gets ` 2`, ` 3` and so on. The
 * cropped image of a rect highlight is named `<pdf slug>-p<page>-<id>.png`
 * and placed by Obsidian's own attachment rule. */

export function basename(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

/* Characters a vault file name cannot carry, or that would break a
   wikilink to it, become spaces; runs of space collapse; leading and
   trailing dots go. */
export function sanitizeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]|\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
}

/* A lowercase, hyphenated form of a name for an image file. */
export function slugOf(name: string): string {
  const slug = sanitizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug.slice(0, 60).replace(/-+$/g, '') : 'pdf';
}

/* The folder under `root` for the notes of one PDF. */
export function folderFor(root: string, pdfPath: string): string {
  return joinPath(root, sanitizeName(basename(pdfPath)) || 'PDF');
}

/* `2026-09-07-101500-p3-a1b2`. */
export function noteBaseName(stamp: string, page: number, id: string): string {
  return `${stamp}-p${page}-${id.slice(0, 4)}`;
}

/* `<pdf slug>-p<page>-<id>.png`. */
export function imageFileName(pdfPath: string, page: number, id: string): string {
  return `${slugOf(basename(pdfPath))}-p${page}-${id}.png`;
}

/* `<folder>/<base><ext>`, or with ` 2`, ` 3` ... appended to the base until
   `exists` says no. */
export function uniquePath(folder: string, base: string, ext: string, exists: (path: string) => boolean): string {
  const first = joinPath(folder, `${base}${ext}`);
  if (!exists(first)) return first;
  for (let n = 2; n < 10000; n++) {
    const candidate = joinPath(folder, `${base} ${n}${ext}`);
    if (!exists(candidate)) return candidate;
  }
  return joinPath(folder, `${base} ${Date.now()}${ext}`);
}

/* The folders to create, shortest first, for a path to exist. */
export function ancestors(path: string): string[] {
  const parts = path.split('/').filter((p) => p.length > 0);
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}
