# Third-party notices

The built `main.js` bundles no third-party code. Everything it needs at
runtime is provided by the host application and is declared external at
build time (`esbuild.config.mjs`): `obsidian`. pdf.js is the copy inside
Obsidian, reached through the viewer's own objects; `pdfjs-dist` is not
a dependency and `test/hygiene.test.mjs` checks that the bundle requires
exactly `obsidian` and carries no `node_modules` path.

## Link compatibility

The `rect=` and `color=` parameters in the links this plugin copies are
the names the PDF++ plugin (Ryota Ushio, MIT) uses, so that a link reads
the same in both. No code was taken from PDF++; the plugin is written
clean room from the viewer's bundle and its own documentation.

## Icons

Lucide icon names are resolved through Obsidian's own icon API at runtime.
No icon assets are bundled.

## Development dependencies

TypeScript, esbuild, ESLint, `eslint-plugin-obsidianmd`, `@eslint/css`,
`typescript-eslint`, `@types/node` and the `obsidian` type package are used
to build, lint and test the plugin. None of them ships in a release.

Everything in this plugin is written for it.
