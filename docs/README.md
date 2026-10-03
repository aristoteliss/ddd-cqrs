# docs — the documentation site

The site of the `@cqrs-ddd` packages, built with [Starlight](https://starlight.astro.build/).
It is private and never published to npm.

## Where the content comes from

| Section | Source |
| --- | --- |
| Home, Overview, Getting started, Concepts, Guides, Packages | the committed pages in `src/content/docs/` — edit them here |
| Code in the guides | focused snippets written in the pages; the same code runs as tests in `integration/` and the packages' specs |
| API reference | the packages' JSDoc, through TypeDoc and `starlight-typedoc`; generated at build time and gitignored |

The package READMEs are short and point to these pages; npm shows them.

## Commands

From the repository root:

```bash
pnpm docs:build   # packages, then the site in docs/dist
pnpm docs:dev     # local server; run pnpm docs:build once first
```

The site's own build script is `build:site`, so `pnpm -r build` does not build it.

## Deployment

`.github/workflows/docs.yml` runs `pnpm docs:build` on every push to `master` and publishes
`docs/dist` to GitHub Pages. In the repository settings, Pages > Source must be GitHub Actions.

## Checks

The build fails on a broken internal link or anchor (`starlight-links-validator`) and on a
TypeDoc error. TypeDoc 0.28 supports TypeScript up to 6.0, so this workspace pins TypeScript
6.0 while the packages build with TypeScript 7.

A package with a second entry point (`/http`) lists both in its `typedoc.json`, and its
`src/index.ts` carries `@module main` so the main module does not collide with the package
page.
