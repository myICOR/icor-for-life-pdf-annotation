# Architecture

ICOR for Life - PDF Annotation. What the modules are, which of
them reach into Obsidian's unpublished PDF viewer, canvas and drag
manager, how a highlight is persisted, and what to re-check when
Obsidian updates.

## Verified against

The private surface below was read in the Obsidian bundle that runs on
the development Mac on 2026-09-07:

- `~/Library/Application Support/obsidian/obsidian-1.13.7.asar`, extracted
  with `npx @electron/asar extract`; `app.js` is 3,876,459 bytes,
  `lib/pdfjs/version.json` says pdf.js 5.3.34 (an Obsidian build:
  `createObsidianPDFViewer`, `textLayerNode` spans with `data-idx`,
  `includeChars` per-character rectangles).
- Public typings: `obsidian@1.13.1` (`node_modules/obsidian/obsidian.d.ts`),
  which contains no PDF viewer, canvas or drag manager declarations.
  `test/manifest.test.mjs` checks every named import against its `@since`
  tag and the manifest's `minAppVersion` of 1.13.0.
- Flint's feasibility read of the same bundle:
  `03 WiP/2026-09-07-icor-for-life-pdf-annotation/flint-pdf-viewer-api-feasibility.md`
  in the vault, with byte offsets into `app.js` and the viewer bundle.

## Modules

| Module | Job | Private API |
| --- | --- | --- |
| `src/main.ts` | Loads settings, builds the store, the writer, the canvas sync, the drops and the PDF registry; registers the view, the settings tab, the card post-processor, the commands and the vault and cache events; the shared actions (open a highlight, open its note, copy link, embed, note link). | none |
| `src/internals.ts` | The one door to the private API: the types, three member tables, `dragManager`, `ownDraggable`, `asCanvasView`, `requireCanvas`, `asPdfView`, `whenViewerReady`, `requireChild`, `requireViewer`, `eventBusOf`, `isPageView`, `closestTextNode`, `setLayerDimensions`, the cross-window element helpers, the `around` patcher (kept, unused). | all of it, by design |
| `src/pdf/registry.ts` | Finds PDF views, binds every feature to each once the viewer has loaded, tracks the active one, the selection check, the toolbar actions, create, recolour, delete, reveal. | via `requireChild`, `requireViewer` |
| `src/pdf/layer.ts` | The painted highlights: one layer per page, re-inserted on `pagerendered`, rectangles in percent through the viewport transform; click, hover, drag; scroll-to and flash. | `getPage`, `pdfViewer.pagesCount`, `pageView.div`, `pageView.viewport.transform`, `div.dataset.loaded`, `pagerendered` |
| `src/pdf/selection.ts` | The browser selection to the four numbers, the quote and the rectangles; the text in a box. | `getTextSelectionRangeStr`, `span.textLayerNode[data-idx]`, `textLayer.textLayer.textContentItems[].chars[].r/.u`, `.page[data-page-number]` |
| `src/pdf/toolbar.ts` | The floating toolbar inside the scrolling container. | `dom.viewerContainerEl` (an element, handed in) |
| `src/pdf/hover.ts` | The hover card. | none (an element, handed in) |
| `src/pdf/area.ts` | The area tool: Mod-drag or armed drag draws a box; the crop rendered from the page proxy. | `pageView.pdfPage.getViewport/render` (pdf.js), `viewport.convertToViewportRectangle` |
| `src/pdf/confirm.ts` | The delete confirmation, a Modal. | none |
| `src/canvas/drop.ts` | The capture-phase drop on a canvas view that makes a card of one block. | `view.canvas`, `canvas.readonly`, `posFromEvt`, `createFileNode`, `dragManager.draggable` |
| `src/drag.ts` | Every drag source: the file draggable plus the block subpath. | `dragManager.handleDrag`, `dragFile` |
| `src/canvas/parse.ts` | Pure: one canvas file to the files each file card is connected to. | none (file format only) |
| `src/canvas/format.ts` | Pure: the file format types. | none |
| `src/canvas/CanvasSync.ts` | `canvases` and `linked_notes` kept fresh, debounced, written only on change. | none (`resolvedLinks`, `cachedRead`, `processFrontMatter` are public) |
| `src/store/HighlightStore.ts` | Every highlight note from the metadata cache, per PDF, per page, per note, with `subscribe`. | none |
| `src/store/HighlightWriter.ts` | Create, recolour, the canvas fields, delete; the document wrapper lookup. | none |
| `src/model/highlight.ts` | Pure: the model, the frontmatter reader, the note text builder, the body helpers. | none |
| `src/model/naming.ts` | Pure: folders and names. | none |
| `src/model/links.ts` | Pure: the deep link, the note link, the embed, the subpath parser. | none |
| `src/model/rects.ts` | Pure: the viewport transform both ways, merging per line, union. | none |
| `src/render/highlightCard.ts` | The Markdown post-processor that styles the quote block and adds the source line. | none |
| `src/views/HighlightsView.ts` | The sidebar view. | none |
| `src/settings/*` | The settings model, the table, the declared settings tab. | none |
| `src/open.ts`, `src/log.ts`, `src/constants.ts` | Opening, copying, the two log channels, the names. | none |

## The private surface, member by member

Every name here was found in `app.js` (or the pdf.js bundles under
`lib/pdfjs/`) of 1.13.7. The grep in the last column finds the same spot
when the minified names change; run each one against the next bundle
before shipping on it.

| Member | Kind | What it is | Re-check grep |
| --- | --- | --- | --- |
| `view.getViewType() === 'pdf'` | view | The built-in PDF view (`D1`), a FileView with `file`. | `getViewType=function(){return"pdf"}` |
| `view.viewer` | Component (`T1`) | Holds the real viewer as `child` (null until loaded) and `then(cb)`, which runs now or after load. | `t.prototype.then=function(e){this.next?this.next.push(e):this.child&&e(this.child)}` |
| `view.setEphemeralState({subpath, focus})` | public method, private effect | Calls `child.applySubpath`; how `leaf.openFile(pdf, {eState})` lands on a page. Not wrapped. | `e.applySubpath(t.subpath),t.focus` |
| `child.containerEl`, `child.file`, `child.pdfViewer` | element, TFile, object | The viewer's root, its file, the Obsidian viewer object. | `this.pdfViewer=pdfjsViewer.createObsidianPDFViewer(` |
| `child.getPage(n)` | function | `pdfViewer.pdfViewer.getPageView(n - 1)`, the pdf.js page view, 1-based. | `prototype.getPage=function(e){return this.pdfViewer.pdfViewer.getPageView(e-1)}` |
| `child.applySubpath(subpath)` | function | Parses `page`, `offset`, `annotation`, `selection`, `height` with `URLSearchParams` and ignores the rest. Typed, not called. | `prototype.applySubpath=function(e){if(e){var t=this.pdfViewer,n=t.pdfLoadingTask` |
| `rect=` and `color=` are not read | negative check | Both greps must find nothing in the subpath parser; the day one hits, the viewer handles them itself. | `n.has("rect")` and `n.has("color")` |
| `child.getTextSelectionRangeStr(pageEl)` | function | `"a,b,c,d"` for the window selection inside the page: the `data-idx` of the start and end `textLayerNode` and the character offset inside each. Used first; the plugin's own walk is the fallback. | `prototype.getTextSelectionRangeStr=function(e){var t=e.win.getSelection()` |
| `child.highlightText(page, range)`, `clearTextHighlight()` | functions | The viewer's own flash of a `selection=` link, run on `textlayerrendered`. Typed, not called. | `prototype.highlightText=function(e,t){if(this.clearTextHighlight()` |
| `child.pdfViewer.eventBus` | pdf.js EventBus | `on(name, cb)` and `off`. | `i._on("textlayerrendered",(function(e){var t,n=e.source` and, in the viewer bundle, `class EventBus{` |
| `child.pdfViewer.pdfViewer` | pdf.js PDFViewer | `pagesCount`, `getPageView(i)`, `currentPageNumber`, `scrollPageIntoView`. | viewer bundle: `get pagesCount(){return this._pages.length}getPageView(e){return this._pages[e]}` |
| `child.pdfViewer.dom.viewerContainerEl` | div.pdf-viewer-container | The scrolling container (`position: absolute`); the toolbar, the hover card and the area tool's listeners live on it. | `viewerContainerEl:u,viewerEl:h}` and `createDiv("pdf-viewer-container",(function(e){e.style.position="absolute"` |
| `pagerendered {source: pageView, pageNumber}` | eventBus event | Fired after every page render, including a zoom re-render, which resets the page element and strips the plugin's layer. | viewer bundle: `this.eventBus.dispatch("pagerendered",{source:this,pageNumber:this.id` |
| `pageView.id`, `pageView.div`, `pageView.viewport`, `pageView.pdfPage`, `div.dataset.loaded` | pdf.js PDFPageView | The page number, the `.page` element, the PageViewport, the page proxy, the rendered flag. | `n.div.dataset.loaded` and viewer bundle: `getPagePoint(e,t){return this.viewport.convertToPdfPoint(e,t)}` |
| `viewport.transform`, `viewport.width/height`, `convertToViewportRectangle`, `convertToPdfPoint` | pdf.js PageViewport | The six-number matrix the plugin's own rect maths applies. | `pdf.min.mjs`: `convertToViewportRectangle(t){const e=[t[0],t[1]];util_Util.applyTransform(e,this.transform)` |
| `pdfPage.getViewport({scale, rotation})`, `pdfPage.render({canvasContext, viewport})` | pdf.js PDFPageProxy | The crop of a drawn box. | `pdf.min.mjs`: `render(t){let{canvasContext:e,viewport:i,intent:a="display"` |
| `span.textLayerNode[data-idx]` | DOM | The text layer's spans; `data-idx` indexes the layer's `textDivs`, which is what the four numbers count. | `function M1(e,t){if(!e.contains(t))return null;if(t.instanceOf(HTMLElement)&&t.hasClass("textLayerNode"))return t` and viewer bundle: `textDivs[n.dataset.idx]` |
| `pageView.textLayer.textLayer.textContentItems[].chars[].r`, `.u` | Obsidian's pdf.js addition | Per-character rectangles in PDF user space and the character; how the plugin gets rectangles for a selection and the text inside a box, the way the viewer's own `getTextByRect` does. | `prototype.getTextByRect=function(e,t){` and viewer bundle: `includeChars:!0` |
| `.page[data-page-number]` | DOM | The page element and its number; `position: relative`, a transparent border around the content box that equals the viewport. | `n=t.closest(".page"))&&n.instanceOf(HTMLElement)?(i=parseInt(n.dataset.pageNumber)` and, in app.css, `.pdfViewer .page{` |
| `.textLayer` at `z-index: 0`, `.textLayer .mod-focused` | CSS | The text layer's stacking and the viewer's own selection flash (hard-coded yellow); the plugin's layer sits at `z-index: 2`. | app.css: `.textLayer .mod-focused {` |
| `app.dragManager.handleDrag(el, factory)` | function | Sets `el.draggable` and starts the drag with what the factory returns, the file explorer's path. | `prototype.handleDrag=function(e,t){var n=this;e.draggable=!0` |
| `app.dragManager.dragFile(evt, file, source)` | function | Writes the obsidian:// URL into the data transfer and returns `{source, type: "file", icon, title, file}`. | `prototype.dragFile=function(e,t,n){return NP(e.dataTransfer,this.app.getObsidianUrl(t)),{source:n,type:"file"` |
| `app.dragManager.draggable` | object | The draggable in flight; the drop handler checks its `source`. | `this.dragManager=new RO(this)` and `prototype.onDragStart=function(e,t){var n=e.dataTransfer;if(!this.draggable){this.draggable=t` |
| `view.canvas` on the canvas view | object | The canvas object of a canvas view; core's own drop of a file draggable makes a card without the subpath (Flint, `handleDrop` at 3232270), so the plugin's capture-phase drop calls `createFileNode` itself. | `getViewData=function(){return $d(this.canvas.data)}` |
| `canvas.createFileNode({pos, size, file, subpath, save, focus})` | function | The card, with the block subpath. | `createFileNode=function(e){var t=e.pos,n=e.size` |
| `canvas.posFromEvt(evt)`, `canvas.readonly` | function, boolean | Client coordinates to canvas units; the lock. | `posFromEvt=function(e){return this.posFromDom(this.domPosFromEvt(e))}` and `this.readonly=!1,this.history=` |
| `child.toolbar.toolbarRightEl` | element | The right side of the viewer's own toolbar; the plugin's "Highlights" button goes there, removed with the binding. | `toolbarRightEl` (app.js, the toolbar class near offset 2611747) |
| `.pdf-container.mod-themed` | CSS | Set when the viewer themes the page background; the plugin's rectangles blend with `screen` only then, `multiply` on a white page. | `o.addClass("mod-themed")` and, in app.css, `.pdf-container.mod-themed` |
| `window.pdfjsLib.setLayerDimensions` | pdf.js global | Typed in the adapter, not used: the layer is sized by CSS to the page's content box instead. | `pdf.min.mjs`: `function setLayerDimensions(t,e)` |

Not used, and known: `child.subpathHighlight`, `child.getMarkdownLink`,
`child.getPageLinkAlias`, `child.getTextByRect` (the plugin walks the
same `chars`), `pdfViewer.pdfLoadingTask`, `pdfViewer.pdfDocument`,
`textlayerrendered` (the layer repaints on `pagerendered`, which follows
it), the `A1` PDF embed component (`.pdf-embed`; not painted in 0.1.0),
`view.setEphemeralState` as a wrap target (a `rect=` link clicked in a
note lands on the page; the plugin's own open path scrolls to the box).

## Persistence

A highlight is one markdown note. The plugin writes the whole note once
(`vault.create` with the text `buildNoteText` makes: the frontmatter in
a fixed order, the quote line with the block id `quote`, the image line
with `image`, the `## Note` heading) and afterwards changes only the
frontmatter, through `fileManager.processFrontMatter`, so Obsidian's own
YAML handling keeps the user's fields and the body as they are. The index
is the metadata cache: a note is a highlight when `type: pdf-highlight`
and it has an id, a `source_file`, a page and a rectangle. `source_file`,
`document`, `image`, `canvases` and `linked_notes` are wikilinks, so a
rename anywhere is Obsidian's job.

The image of a drawn box is a PNG at the path
`fileManager.getAvailablePathForAttachment` returns for the note, named
`<pdf slug>-p<page>-<id>.png`.

The canvas fields: on every relevant change (a canvas file modified,
created, renamed or deleted; a highlight note changed) the sync walks the
vault's canvas files, skips the ones the metadata cache says link no
highlight note, parses the rest (cached by modification time), computes
`canvases` and `linked_notes` for every highlight and writes a note only
when its values differ. The write comes back through the cache into the
store, which schedules the sync again, which computes the same values
and writes nothing.

## Wiring lifecycle

- `PdfRegistry.sweep()` runs at layout-ready and on `layout-change` and
  `active-leaf-change`; it finds PDF views it has not seen and binds each
  once `view.viewer.then` reports the loaded child. A binding registers
  its teardown with `view.register`, and the plugin's `onunload` tears
  down every binding that is left.
- The layer subscribes to `pagerendered` on the viewer's event bus and to
  the store; both are unsubscribed on teardown, and the layer elements
  are removed. Nothing is wrapped, so there is nothing to unwrap.
- Listeners on the container and its document (selection, pointer,
  Escape) are added with an `AbortController` signal per binding and
  aborted on teardown. Cross-window: elements are checked with
  Obsidian's `instanceOf`, and `el.win` / `el.doc` are used, never the
  globals.
- The canvas drop listener is registered with `registerDomEvent` on the
  canvas view's `contentEl` in the capture phase and lives with the
  plugin; it acts only on this plugin's own draggable.
- The toolbar and the hover card are one element each per PDF view,
  children of the scrolling container, removed with the binding.
- Renders of a drawn box run one at a time through a promise chain, and
  the scale is capped by pixel count and, on a phone, at the device
  pixel ratio.

## What breaks on an Obsidian update, and how to re-check

1. Open the new bundle: `npx @electron/asar extract "~/Library/Application Support/obsidian/obsidian-<version>.asar" <dir>`.
2. Run every grep in the table above against `app.js` and the two pdf.js
   bundles. A grep that finds nothing means the member moved or was
   renamed; the two negative greps finding something means the viewer
   now reads `rect=` or `color=` itself.
3. Read `applySubpath` and `getTextSelectionRangeStr` again; the
   `selection` numbers must still count `data-idx` spans and characters.
4. Read the text layer builder's `streamTextContent` call: `includeChars`
   must still be on, and `chars[].r` must still be in PDF user space.
5. Install the build in a test vault. Every missing member reports as
   one Notice and one console warning; the feature that asked for it
   stays off and everything else runs. That is the designed failure.
6. Make one text highlight and one area highlight, zoom, reload the file,
   open the note, drop it on a canvas, connect an edge, read the
   frontmatter back.
7. Update this document's "Verified against" and the release notes.

## Not verified outside the test suite

Everything that needs the running app was reasoned from the bundle and
not driven live before the first sideload:

- The toolbar's position over a selection at several zoom levels, and on
  a rotated page.
- `selectionchange` timing and the OS callout on iOS; Cmd-drag on a
  trackpad; Apple Pencil.
- The percent-positioned rectangles on a rotated page (the transform
  carries the rotation; the layer covers the content box).
- Whether the properties block inside a canvas card carries the note's
  `cssclasses` (the hiding rule depends on it).
- A PDF view in a pop-out window.
- Obsidian builds other than 1.13.7.
