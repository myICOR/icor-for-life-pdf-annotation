# Changelog

All notable changes to ICOR for Life - PDF Annotation.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

The first build, for Tom's test. Built on Flint's feasibility read of the
1.13.7 bundle and Pax's Heptabase and PDF++ research.

### Added
- **The highlight note.** One markdown note per highlight: `type:
  pdf-highlight`, a stable `highlight_id`, `source_file`, the optional
  `document` wrapper note, `page`, `anchor`, `selection` (the viewer's
  own four numbers), `rects` in PDF user space, `color`, `quote`,
  `image`, `created`, `canvases` and `linked_notes` as wikilinks. The
  body opens with the quote as `> ... ^quote` (and `![[image]] ^image`
  for a drawn box), then `## Note`.
- **The toolbar on a text selection**: six colours, copy link, copy
  embed, add note. The same on a painted highlight, with open note and
  delete.
- **The area tool**: Cmd (Ctrl) plus drag, or the "Draw area highlight"
  command; the text inside the box becomes the quote and the region is
  rendered to a PNG at twice the device pixel ratio (once on a phone).
- **Painting**: every highlight of the open PDF on its page, in percent
  of the page box, re-inserted on every page render; click, hover card,
  drag.
- **Deep links** in the viewer's `selection=` form plus PDF++'s `rect=`
  and `color=` parameters; the note link; the block embed.
- **Canvas**: drag onto a canvas for a card of the quote or the image
  (a capture-phase drop that adds the block subpath core's drop lacks);
  `canvases` and `linked_notes` written into the note and kept fresh
  from the canvas files.
- **The card**: the quote block styled in the highlight's colour with a
  source line back to the PDF page, in reading view, embeds and canvas
  cards; the properties block hidden inside cards and embeds.
- **The sidebar** "PDF highlights": the open PDF's highlights by page.
- **Settings**: highlights folder, default colour, toolbar on selection,
  hover cards, debug logging.
- Nine commands, no default hotkeys.

### Engineering
- No runtime dependency; pdf.js is reached through the host. No
  prototype patch and no instance wrap: the viewer's event bus, DOM and
  the text layer's own data carry everything. Every private member sits
  behind a runtime guard in `src/internals.ts`.
- Pure modules with tests: the highlight model and the note text, the
  names, the links, the rect maths, the canvas parser, the settings.
  `main.js` loads in a bare Node VM against a stub of `obsidian` and
  wires every command, the view and the post-processor.
