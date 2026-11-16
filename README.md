# Women Count geographic explorer

An interactive U.S. map of documented Women Count USA cases. The application
uses React, TypeScript, Vite, Leaflet, and Supercluster.

## Local development

With Node.js 24 installed:

```sh
cd web
npm ci
npm run dev
```

Prepared public city and case files are included, so running the website does
not require the original CSV, Python, BigQuery, or credentials.

## Cloudflare Workers deployment

The current site is hosted as static assets on Cloudflare Workers:

https://viz-proj-women-count.jiaruichang10.workers.dev

The repository-root `wrangler.jsonc` publishes only `web/dist`, never the source
directory. From the repository root, install dependencies and deploy with:

```sh
npm --prefix web ci
npx wrangler deploy
```

Wrangler builds the website before uploading it. For Git-connected Workers
Builds, use these explicit dashboard settings:

- Root directory: repository root (`/`)
- Build command: `npm --prefix web ci && npm --prefix web run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Build variable: `NODE_VERSION=24`

Workers Builds has separate build settings; keep the build command above even
though the local Wrangler configuration also declares a build command.

## Alternative: Cloudflare Pages

Connect this repository and use:

- Production branch: `main`
- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `24` (also set in `web/.node-version`)

Deploy only the built website. The original Airtable export, local preparation
reports, geocoding caches, environment files, and dependencies are excluded from
Git. The existing allowlisted files in `web/public/data/` are public website
assets. No BigQuery integration is used.

For subsequent changes, test locally, commit, and push to `main`. A connected
Cloudflare project rebuilds automatically when its Git build integration is configured.

See [the application README](web/README.md) for data methodology, geographic
limitations, interactions, and tests. Rebuilding the prepared data requires the
original CSV and local geocoding cache; neither is required for deployment.
