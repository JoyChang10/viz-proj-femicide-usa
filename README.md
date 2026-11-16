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

## Cloudflare Pages

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
Cloudflare Pages project rebuilds automatically.

See [the application README](web/README.md) for data methodology, geographic
limitations, interactions, and tests. Rebuilding the prepared data requires the
original CSV and local geocoding cache; neither is required for deployment.
