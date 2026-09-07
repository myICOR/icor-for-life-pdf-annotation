/* One bundle feeds the gate: the pure surface (the highlight model, the
 * names, the links, the rect maths, the canvas parser, the settings), which
 * imports neither `obsidian` nor the DOM. */
import { buildPure } from './lib/build-pure.mjs';

await buildPure();
