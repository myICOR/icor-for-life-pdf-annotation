# Security Policy

ICOR for Life - PDF Annotation reads the open PDF's text layer, paints
over its pages, writes one markdown note per highlight (and one PNG per
drawn box) into the vault, reads .canvas files to fill two frontmatter
fields, and puts a link on the clipboard when you ask for one. It never
changes a PDF, opens no connection, spawns no process and reads no file
outside the vault. That is the whole capability, and this document says
so with the file to read behind each claim.

If you find a way to make this plugin do something its user did not ask
for, we want to hear about it before anyone else does.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

Two channels, in order of preference:

1. **GitHub private security advisory** (preferred). Open a draft advisory
   on the Security tab of this repository. It stays private between you
   and the maintainer until a fix ships.
2. **Email** `support@myicor.com` with `SECURITY` and
   `icor-for-life-pdf-annotation` in the subject line. This is a
   monitored mailbox.

A useful report contains the plugin version (`manifest.json`), your
Obsidian version and operating system, what an attacker can do and what
they need in order to do it, and steps to reproduce against a throwaway
vault.

## What to expect

| Stage | Target |
| --- | --- |
| We acknowledge your report | within 5 business days |
| We tell you whether we agree it is a vulnerability, and how severe | within 10 business days |
| We ship a fix for a confirmed critical or high issue | we aim for 30 days |
| We ask you to hold public disclosure until | a fix ships, or 90 days from your report, whichever comes first |

Only the most recent release is supported. One branch, no backports.

## Scope: exactly what this plugin does

| Claim | Where to read it |
| --- | --- |
| Creates a highlight note with `vault.create` from text the pure builder makes; later changes go through `fileManager.processFrontMatter`; a deletion goes through `fileManager.trashFile`. | `src/store/HighlightWriter.ts`, `src/model/highlight.ts` |
| Writes a PNG with `vault.createBinary` at the path Obsidian's attachment rule gives, for a drawn box only. | `src/store/HighlightWriter.ts`, `src/pdf/area.ts` |
| Reads every markdown file's frontmatter from the metadata cache to find highlight notes; reads .canvas files through `vault.cachedRead` and parses them as JSON; reads a highlight note's text for its preview. Reads nothing else. | `src/store/HighlightStore.ts`, `src/canvas/CanvasSync.ts`, `src/main.ts` |
| Writes to the clipboard with `navigator.clipboard.writeText`, on a click or a command only. | `src/open.ts` |
| Touches Obsidian's unpublished PDF viewer, canvas and drag manager through one module with a runtime check per member. No prototype is patched and no method is wrapped. | `src/internals.ts` |
| Takes a canvas drop before core only when the drag in flight is its own, and then calls the canvas's own `createFileNode`. | `src/canvas/drop.ts` |
| Renders every string (quotes, note previews, file names) through `createEl` and `setText`; no `innerHTML`. | `test/hygiene.test.mjs` |
| No network call, no Node module, no `eval`, no timer, no global document, no native dialog. | `test/hygiene.test.mjs` |
| One debug channel, off by default, that never echoes note or PDF text; one degrade channel that names a missing member. | `src/log.ts` |

The built `main.js` bundles no third-party code; see
THIRD-PARTY-NOTICES.md.

## Threats considered

- **A crafted highlight note.** The reader accepts only the shapes it
  expects (`src/model/highlight.ts`) and defaults or refuses the rest;
  rectangles are numbers, the page is an integer, link targets are
  strings. Nothing in a note is executed.
- **A crafted .canvas file.** The parser accepts only the node and edge
  shapes it expects and drops the rest (`src/canvas/parse.ts`); a
  malformed file yields nothing.
- **A PDF with hostile text.** The quote is rendered as text and written
  into YAML through one escaping function; it never becomes markup.
- **A note or PDF name with markup.** Rendered as text, never as HTML.
- **An Obsidian update that changes the private surface.** Every private
  member is checked at runtime; a missing one switches its feature off
  with a notice and a console line rather than throwing.
