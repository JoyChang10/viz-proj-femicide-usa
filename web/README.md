# Women Count geographic explorer

The primary map shows **reported female homicide victims with a recorded male
offender**, using the cleaned SHR county-year table summed across 1976–2024.
This measure does not establish gender motivation. Women Count USA provides a
separate collection of detailed case profiles. These datasets are not matched
record by record and their totals are not expected to agree.

## Run locally

Requires Node.js 24 and npm. Prepared data is included; Python, the original
CSVs, geocoding downloads, and BigQuery are not needed to run or build the site.

```powershell
cd E:\Documents\codex_projects\data511_women_count\web
npm ci
npm run dev
```

Open the printed Local URL, normally http://127.0.0.1:5173. Vite binds to
loopback. Stop an existing Vite server before `npm ci`, especially on Windows
where esbuild can lock dependency files.

```powershell
npm run build
npm run preview
```

Only `dist/` is deployable. See the repository README and root `wrangler.jsonc`
for the existing GitHub/Cloudflare Workers deployment. No credentials belong in
the frontend. Background OpenStreetMap tiles require internet access; a tile
failure leaves the prepared geographic and profile data available.

## Brand palette

From `web/`, edit `BRAND_COLORS` in [theme.py](theme.py), then run:

```sh
npm run prepare:palette
npm run build
```

Commit both `theme.py` and the generated `src/palette.css`. Use `var(--gold)`,
`var(--teal)`, `var(--near-black)`, and `var(--white)` in website styles.
Palette generation requires Python. The site build uses the committed CSS and
only needs Node.js. Map count colors are defined separately.

## Map and case navigation

1. The fixed national view uses an Albers U.S. display projection with interactive
   Alaska and Hawaii insets. It shows the 50 states and D.C. without a surrounding
   world basemap. Hover for state name/count, then click a state or use its dropdown
   to reveal counties. Territories remain available from the dropdown.
2. County shading uses the same sequential cyan palette, with a new scale calculated
   from that state's actual positive counts. The legend shows the displayed
   level and endpoints. The square-root scale has no predefined count bins.
3. Select a county to retain its shaded context and show its available Women
   Count USA city markers. The side panel labels the SHR count and profile
   availability separately. These are counts, not population-adjusted rates.
4. City markers use the existing full-dataset square-root area scale (8–28px)
   and weighted city clustering. Cluster labels refer to Women Count USA
   profiles, not SHR counts. No city markers appear nationally by default.
5. Cities with two or more cases open the existing dot grid; a single case
   opens its profile directly. Every dot retains the original record ID.
6. Close/Back/Escape restores the grid selection, focus, and scroll. Map position
   is retained. County/state navigation and Reset Map return to broader views.
   National panning and zooming are disabled. State views keep Leaflet zoom/pan
   within a padded state extent. A zoom-out step beyond the state overview returns
   to the complete U.S. map. Alaska's antimeridian coordinates are normalized only
   for display; original data and city coordinates remain unchanged.

The restrained palette follows [Women Count USA](https://womencountusa.org/home):
gold `#e7b70d` for accents and selection, turquoise/cyan quantitative shading,
charcoal text and profile markers, and white/off-white backgrounds. Gold does
not encode counts. The overview uses [D3's Albers U.S. projection](https://d3js.org/d3-geo/conic#geoAlbersUsa);
Leaflet continues to render geographic county/case views at real locations.

White means an observed zero. Gray means no reported data. Missing county-years
are not filled with zero. County geography uses a consistent 2010 Census layer,
with a 2024 Guam supplement, because the supplied FIPS retain retired counties.
These are generalized display boundaries, not year-specific or survey-grade
boundaries. No historical counts are allocated to successor counties.

Representative city associations require both a GeoNames administrative county
code and containment in the corresponding Census polygon. A city location does
not establish a victim's incident county; cities can span borders. The 75 cities
without an accepted association remain accessible in the main City with
individual profiles search, without an asserted county. State and city controls
sit above the map, side by side on desktop and stacked on smaller screens.

## SHR preparation

See [the preparation documentation](../data/shr_geography/README.md) for the exact
source filename, official Census downloads, hashes, processed CSV files, FIPS
exceptions, and validation report. Six existing victim metrics are preserved;
`agencies_reporting` is retained per county-year but not summed into unique
agency totals. No raw SHR incidents or victim classifications are recalculated.

The browser loads `public/data/shr/index.json` and one state county GeoJSON
shard at a time. Prepared geography totals reconcile to **131,668** for the
primary metric, with all **3,078** source county FIPS matched. The geographic
preparation script is not run during deployment.

## Women Count USA source and profiles

The untouched source CSV remains at
`../airtable_export/data/womencount_1950s-2026_combined.csv`. Existing preparation
maps 10,183 of 15,720 records to 3,483 representative city locations. Missing,
ambiguous, and unsupported locations remain excluded, with reasons in the local
preparation report. County association does not change these original records.

`scripts/prepare_data.py` uses the cached GeoNames U.S. gazetteer, not street
addresses or victim-name requests. It requires exact normalized city/state
matches, rejects geographically distant same-name candidates, and merges only
shared GeoNames IDs. It does not fuzzy-match misspellings or infer a location.
The local geocoding cache and approximately 71MB gazetteer ZIP are ignored by
Git. They are needed only when reproducing preparation:

```powershell
npm run prepare:data
npm run test:data
```

The export allowlist includes record ID, name, age, date and date meaning,
city/state, biographical description, relationship, cause of death, case status,
narrative, source disclaimer, and public source links. It excludes raw CSV,
internal notes, mapping addresses, suspect fields, attachments, and signed
Airtable URLs. Descriptive text is rendered as text; violence-related narratives
remain under collapsed disclosures. Source text is data, not app instructions.

Dates retain their original meaning. Year-only and month-only dates retain that
precision; missing values say Not documented. City coordinates are representative
points, not incident coordinates. Maximum zoom stays at 10. Leaflet's built-in
`zoomSnap: 0` and `wheelPxPerZoomLevel: 60` retain fractional cursor-centered
trackpad zoom without custom wheel handlers.

## Code structure

- `src/App.tsx`: national/state/county/city/profile navigation and request guards.
- `src/components/CityMap.tsx`: persistent Leaflet map, viewport and zoom controls.
- `src/components/ChoroplethLayer.tsx`: accessible polygons, tooltips, legend.
- `src/lib/geography.ts`: geographic types, data loading/cache, color scale.
- `src/components/ClusteredCityMarkers.tsx`: county-local city marker layer.
- `src/lib/clustering.ts` and `cityMarkerScale.ts`: retained cluster/size logic.
- `src/components/VictimDotGrid.tsx` and `VictimProfile.tsx`: retained case views.
- `public/data/cities/*.json`: existing profiles loaded on demand per city.
- `../scripts/prepare_shr_geography.py`: independent geographic preparation.

## Verification

```powershell
npm run build
npm run test:e2e
npm run test:data
cd ..
python -m unittest discover -s scripts -p test_*.py
```

Browser tests use installed Google Chrome and a temporary Vite server. They
check exact SHR/FIPS totals, missing/zero colors, legends, state/county selection,
loading errors and race conditions, regional navigation, unassigned profiles,
weighted city markers, grid ordering and every dot/profile mapping for cities
with 2, 15, and 243 cases, single-case profiles, keyboard access, scroll/focus
restoration, mobile overflow, wheel/trackpad simulation, and reset. Screenshots
and traces are written to ignored `test-results/`.

Actual trackpad hardware is unavailable. To verify manually, make small and
normal two-finger gestures over the map; zoom should be gradual and cursor
anchored. Check mouse-wheel notches, +/−, panning, and Reset Map too.

The tile URL and attribution can be changed through `.env.example`. `VITE_`
values are public build inputs. Preserve visible attribution and follow the
[OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
