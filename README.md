# Elmn (elmnjs)

Small client-side router and template runtime: **HTML pages** under `pages/`, a generated **route manifest**, and optional **co-located `index.js`** modules.

## Mental model

1. **Filesystem routes** — Each routable page is a folder under `pages/` that contains `index.html`. Dynamic URL segments use bracket folders, e.g. `pages/todos/[id]/index.html` matches `/todos/anything`.
2. **Manifest** — `npm run elmn:routes` (also runs as `prestart`) scans `pages/`, skips non-route trees, and writes `routes.manifest.json`. The browser loads it once and maps the current URL to a template path.
3. **Base URL** — For GitHub Pages or subpaths, set `window.ElmnRoot` in `index.html` (e.g. `"/repo-name"`). Routes and static assets resolve under that prefix.
4. **Partials** — `pages/_components/` (and `pages/components/`) are **not** routes. Reference partials with `<elmn-component src="/components/name.html">`, which resolves to `pages/_components/name.html`.

## Dev workflow

```bash
npm install
npm run dev
```

This regenerates `routes.manifest.json` and starts the static server (`server.js`). For production or CI, run `npm run elmn:routes` before deploy so the manifest matches the tree.

## CDN / one-tag mode (easy start)

You can bootstrap Elmn with one script:

```html
<script
  src="https://your-cdn.example/elmn.cdn.js"
  data-root=""
  data-navigation="pathless"
></script>
```

- `data-root`: base path (use `"/repo-name"` for GitHub Pages project sites)
- `data-navigation`:
  - `"pathless"` keeps URL at root and restores last view from localStorage
  - `"url"` uses normal browser path routing

`elmn.cdn.js` loads `elmn.js` automatically. For static hosting, include `routes.manifest.json` in your deployed files.

## `<elmn-fragment>` rule

Do not nest `{variables.foo}` inside JavaScript template literals that themselves use `${...}` in a way that breaks parsing. Prefer **precomputed strings** on `variables` (e.g. `recentHtml`) and concatenate inside fragments when building HTML.

## Security and CSP

- Escape any **user-controlled** text before it becomes HTML (the demo uses a small `esc()` helper in pages).
- The runtime still uses `new Function` for fragments and inline `<elmn-script>` compilation. **Strict CSP** (blocking `unsafe-eval`) is incompatible with that path until you migrate logic to real ES modules (`index.js` + `export`) and tighten the pipeline.

## Co-located modules (optional)

Next to `index.html`, an `index.js` may `export` `variables`, `functions`, and `elmnEffect`. If present, it is loaded with **native `import()`** (no blob wrapper). Inline `<elmn-script>` remains supported for small pages.
