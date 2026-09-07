# ICOR for Life - PDF Annotation

Highlights on Obsidian's built-in PDF viewer that are notes in the vault.
Select text in a PDF and a small toolbar appears: pick a colour, copy a
link, add a note. Hold Cmd (Ctrl on Windows and Linux) and drag to
highlight an area, which is saved as a PNG. Every highlight is one
markdown note: the position, the colour and the quote in the frontmatter,
your own thoughts in the body. Every highlight is painted back over the
PDF, opens from a deep link, drags onto a canvas as a card that shows just
the quote or the image, and is listed in a sidebar for the open PDF.

Part of the ICOR for Life suite. Source-available; see LICENSE. Read
alongside ICOR for Life - Canvases, which owns the canvas side; the two
plugins share a file format and never write each other's keys.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/icor-for-life-pdf-annotation/`, then enable the
plugin under Settings, Community plugins. Needs Obsidian 1.13.0 or newer.
Desktop and mobile; on a phone the toolbar is the only path, since the
viewer has no context menu there.

## Highlighting text

Open a PDF in Obsidian and select some text. A toolbar appears above the
selection:

| Control | What it does |
| --- | --- |
| Six colour dots | Save the selection as a highlight in that colour. The last colour you pick is the colour of the next highlight. |
| Copy highlight link | Save the highlight (in the last colour) and copy a wikilink to the PDF that opens at the highlight. |
| Copy embed | Save the highlight and copy `![[note#^quote]]`, an embed of the quote for any note. |
| Add note | Save the highlight and open its note in the right sidebar. |

The same actions are commands: **Highlight the selection**, **Copy
highlight link**, **Copy highlight embed**, **Add a note to the
selection**. They act on the selection in the most recently focused PDF
tab. The toolbar can be switched off under Settings, Viewer; the commands
keep working.

## Highlighting an area

Hold Cmd (Ctrl) and drag on a page to draw a box. The command **Draw area
highlight** arms the next plain drag instead, which is the path on a phone
or from the keyboard; Escape cancels. The box becomes a highlight with the
text inside it as its quote and a PNG of the region, rendered from the
page at twice the device pixel ratio (once on a phone), saved where
Obsidian puts attachments for the note (Settings, Files and links,
"Default location for new attachments").

## The painted highlights

Every highlight of the open PDF is painted over its page in its colour and
follows the page through zoom, rotation and reload. Click one for the
toolbar: the dots change its colour; Copy highlight link; Copy embed;
Open note (in the right sidebar); Delete (asks first, then trashes the
note and, when nothing else links to it, the image). Rest the pointer on
one to see the first lines of its note (off under Settings, Viewer). Drag
one onto a canvas for a card, or into an editor for a link.

To select text under a highlight, start the selection outside it: the
painted rectangle takes the pointer so that it can be clicked and dragged.

## The highlight note

One note per highlight, in the folder set under Settings, Highlights
(default `04 Inner World/Documents/Highlights`), one subfolder per PDF,
named `<YYYY-MM-DD-HHMMSS>-p<page>-<4 characters of the id>.md`. The note
may be renamed or moved: the plugin finds highlights by their frontmatter,
not their name or folder, and links to the PDF are wikilinks that
Obsidian keeps up to date on a rename.

```yaml
---
type: pdf-highlight
highlight_id: k3f9x2mq7a1b               # twelve characters, made once, never changed
source_file: "[[04 Inner World/Documents/_files/paper.pdf]]"
document: "[[04 Inner World/Documents/paper]]"   # the type: document note for this PDF, when there is one
page: 3                                  # 1-based
anchor: selection                        # selection (text) or rect (a drawn box)
selection: [16, 0, 18, 42]               # text only: begin span, begin offset, end span, end offset
rects: [[72, 640.2, 402.5, 654.9]]       # PDF user space [x0, y0, x1, y1]; one per line for text, one box for rect
color: yellow                            # yellow, red, orange, green, blue, purple
quote: "the exact selected text"         # rect: the text inside the box, or empty
image: "[[05 Assets/Images/paper-p3-k3f9x2mq7a1b.png]]"   # rect only
created: 2026-09-07T10:15:00
canvases: ["[[Maps/Reading.canvas]]"]    # written by the plugin: the canvases the note is on
linked_notes: ["[[Notes/A]]"]            # written by the plugin: files connected to its cards by an edge, either direction
cssclasses: [icor-pdf-highlight]
---
> the exact selected text ^quote
![[05 Assets/Images/paper-p3-k3f9x2mq7a1b.png]] ^image

## Note

```

The body starts with the quote as a blockquote carrying the block id
`quote` (and, for a rect highlight, the image with the id `image`); those
two ids are what a canvas card or an embed points at. Your note goes
under `## Note`. The plugin owns the frontmatter and the first lines; the
rest of the body is yours.

`selection` is Obsidian's own contract: the same four numbers the
viewer's "Copy link to selection" writes, so a highlight opens in the
built-in viewer without this plugin. `canvases` and `linked_notes` are
written as wikilinks so the graph, backlinks and Bases treat them as
real links.

In reading view, in an embed and on a canvas card the quote block is
styled as a card in the highlight's colour with a source line under it,
"paper, page 3", that opens the PDF at the highlight; the properties
block is hidden inside cards and embeds and shown in the full note. The
editor shows the plain blockquote.

## Deep links

**Copy highlight link** puts a wikilink on the clipboard:

```
[[04 Inner World/Documents/_files/paper.pdf#page=3&selection=16,0,18,42&color=yellow|the exact selected text]]
[[04 Inner World/Documents/_files/paper.pdf#page=5&rect=72,640.2,402.5,654.9&color=blue|p5 area]]
```

The `selection` form is the viewer's own: clicking it opens the PDF,
scrolls to the page and flashes the selection, with or without this
plugin. `rect` and `color` are the parameter names PDF++ uses, so the
links read the same there; the built-in viewer ignores them and lands on
the page, where the painted layer shows the box. Opening a highlight
from inside the plugin (the sidebar, the card's source line) also
scrolls to the painted rectangle and pulses it for two seconds.

**Copy link to highlight note** copies `[[<note>]]`; **Copy highlight
embed** copies `![[<note>#^quote]]` or `![[<note>#^image]]`.

## Canvas

Drag a painted highlight, a sidebar row, or the card in the note onto a
canvas: the plugin makes a file card that shows only the quote block (or
the image of a rect highlight). Dropping the note from the file explorer
gives the whole note, as it does for any file. Once the note sits on a
canvas, the plugin writes `canvases` into its frontmatter, and
`linked_notes` with every file whose card is connected to one of the
highlight's cards by an edge, in either direction; both are kept fresh
as the canvas changes and written only when they change. The canvas
files are read, never written.

## The sidebar

**Open highlights sidebar** opens the "PDF highlights" view on the right:
the highlights of the most recently focused PDF, grouped by page, each
with its colour, the quote or the image, and the first line of its note.
Click a row to show the highlight in the PDF (Cmd-click opens the note);
the button on the row opens the note; the row drags onto a canvas.

## Commands

Open highlights sidebar, Copy highlight link, Copy link to highlight note,
Copy highlight embed, Highlight the selection, Add a note to the selection,
Draw area highlight, Delete highlight, Cycle highlight colour. None has a
default hotkey. The link, embed, delete and colour commands act on the
highlight last clicked in the PDF, or on the active note when it is a
highlight note.

## Settings

Highlights folder; Default colour (the next highlight's colour, after which
the toolbar remembers the last one picked); Toolbar on selection; Hover
cards; Debug logging.

## Not in this version

- PDF embeds in notes and on canvas cards are not painted and have no
  toolbar; only the PDF tab is. The notes and links work either way.
- The editor (Live Preview) shows the plain blockquote, not the card.
- A `rect=` link clicked in a note lands on the page; the box is painted
  there but not scrolled to. Opening from the plugin's own surfaces
  scrolls to it.
- Highlights are not written into the PDF file. The PDF is never changed.

## The private surface

The built-in PDF viewer has no published API. Everything the plugin
touches that Obsidian does not publish goes through one module,
`src/internals.ts`, with a runtime check per member: a member that is
missing after an Obsidian update switches its feature off with a notice
and a console line, and the notes, links and sidebar keep working.
`docs/architecture.md` lists every member with the grep that finds it
in the bundle.

## Support

This plugin is free. If you want to support us, become a myICOR member at
https://myicor.com and enjoy everything membership includes.

## License

What you can do: install it, run it, read the code, modify your own copy,
and use it in your own business. What you cannot do: sell it, redistribute
it, or offer it (original or modified) as your own product or service to
others. Contributions: send a pull request. See `CONTRIBUTING.md`;
submitting one grants Paperless Movement the rights described in Section 7
of the LICENSE. This is not open source. It is source-available: the code
is visible, personal and business use are free, resale and republishing
are not. Bundled third-party components keep their own licenses; see
`THIRD-PARTY-NOTICES.md`.

Full text in LICENSE. Machine-readable identifier: LicenseRef-ICOR-Source-Available-1.0.
