# Women Count geographic explorer — Phase 3

A local React + TypeScript + Vite application with a Leaflet map and Supercluster geographic clustering. Uses the existing Women Count USA CSV. Click national clusters to explore regional groups and cities, then select an individual victim in the side-panel dot grid. Every city with two or more cases uses the same grid; single-case cities open their profile directly. The city dropdown remains available. Closing a profile preserves the map, selection, and panel position. Reset Map clears the selection, stops any active cluster flight, and restores the contiguous-U.S. overview. Alaska and Hawaii are available by panning or choosing a city.

## Run locally

Requires Node.js 20.19+ or 22.12+ (Node 24 recommended) and npm. The prepared data is included; Python and a geocoding download are **not required to start the website**.

Stop an already-running Vite server with Ctrl+C before `npm ci`, particularly on Windows where its esbuild process can lock dependency files.

```powershell
cd E:\Documents\codex_projects\data511_women_count\web
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally **http://127.0.0.1:5173**. Internet access is required for OpenStreetMap background tiles. Markers, city selection, and profiles use local files; tile failures display a notice. No API key is required.

```powershell
npm run build
npm run preview
```

`dist/` is the deployable static site. Vite uses a relative base URL so it can be hosted in a subdirectory. No server, database, credential, or geocoding API is needed in production. See the repository README for Cloudflare Pages build settings. Only serve `dist/` online, never the parent dataset directory. For local development Vite binds to loopback.

## Phase 3 individual victims

The map provides geographic exploration through clusters and city markers. The panel provides non-geographic exploration of individual victims. Spiderfying and the former small-city name-list branch have been removed.

| Cases in a city | Interaction |
| --- | --- |
| 1 | Open the existing victim profile directly. Closing it returns to the city chooser with the map position retained. |
| 2+ | Show the same responsive dot grid in the existing side panel, with one button per victim. |

City selection reuses the cached city-case JSON and existing victim profile. No victim fields, geographic coordinates, source CSV, or geocoding results are changed. Every dot uses the original record ID; duplicate names remain distinct cases. Cases are consistently ordered by name and then record ID using an explicit `en-US` comparison.

Dot targets are 32 pixels, with 16-pixel visible dots and 8-pixel horizontal / 10-pixel vertical gaps. All dots use the same neutral color, with clear hover, keyboard-focus, and selected-outline states. No identification-status colors or grouping are used.

Hover or focus a dot to see the name, age, and source date meaning in a reserved text area above the grid. This area does not float over neighboring dots or move the grid as previews change. The city heading, count, and preview stay visible while only the grid scrolls. The selected case's preview remains available when not hovering another dot. Click, Enter, or Space opens the existing profile. Touch users can tap directly to open it.

Closing a profile restores its city grid, selected dot, keyboard focus, and grid scroll position. Changing cities or resetting clears the previous city, selected case, and preview. Only the active city's cases are loaded and rendered; the largest current city has 243 cases, so virtualization is not required.

Examples for local testing:

1. Choose **Aberdeen, ID** (1 case): its profile should open immediately; close it without resetting the map.
2. Choose **Carnation, WA** (2 cases) and **Corpus Christi, TX** (15): both should show a panel grid and no individual dots or connecting lines on the map.
3. Choose **Houston, TX** (243): scroll the grid, hover/focus dots, open profiles, and check that returning restores selection and position.
4. Change cities, close the city panel, and use Reset Map to check cleanup. Repeat at mobile width.

Limits: nearby geographic city markers can still overlap; the dropdown reaches them. The grid renders the selected city's cases without virtualization and is tested with up to 243 real records. The existing 5,537 unmapped records remain excluded. No identification categories, demographic filters, dashboards, or new victim fields are included.

## Wheel and trackpad zoom

The map uses Leaflet 1.9.4's built-in wheel handler. `zoomSnap: 0` allows continuous fractional zoom instead of rounding tiny gestures up to a whole level. `wheelPxPerZoomLevel: 60` uses Leaflet's normal wheel response; the earlier 120 and 240 settings required too much scrolling. Keeping snapping disabled avoids the original whole-level jumps. The default 40 ms wheel debounce, cursor-centered zoom, one-level zoom-button increments, geographic limits, and clustering logic are retained. No custom scroll handler or additional dependency is used. Run `npm run build` after changing this setting if you use `npm run preview`, which serves the built files rather than the development source.

Automated Chrome checks simulate fine pixel deltas in both directions and conventional wheel inputs in pixel and line modes. They verify small fractional changes, cursor anchoring, zoom buttons, and reset. Real trackpad hardware is not available in the test environment. To check your laptop, run `npm run dev`, place the cursor over an identifiable map location, and make short, slow two-finger scrolls in both directions. The scale should change gradually, with the location staying under the cursor. Try a longer gesture, a few mouse-wheel notches if available, and then cluster clicks, +/−, panning, and Reset Map.

## Phase 2 clustering

- The [Supercluster](https://github.com/mapbox/supercluster) spatial index receives **one point per resolved city**, carrying the city's case count as a weight. It does not receive individual victim coordinates. Existing data preparation, city coordinates, and profile content are reused.
- Each cluster's label is the exact sum of its cities' `caseCount` values, formatted with thousands separators. Supercluster's `point_count` counts cities and is used only in hover/accessibility descriptions, never as the main case-count label.
- The cluster radius is 56 screen pixels (`extent: 256` matches Leaflet tiles). Clustering is based on geographic proximity and zoom, independent of administrative boundaries. A cluster's position is a navigation point for its cities, not a new incident location.
- Cluster diameters follow a bounded logarithmic scale, `clamp(28 + 7 × log10(caseCount), 34, 62)` pixels. Individual cities use unnumbered circles with a continuous square-root diameter scale computed from the minimum and maximum case counts across **all** cities, not just the viewport. The current domain is 1–243 cases. Colored diameters run from 8 to 28 pixels, with a thin white halo; circle area increases linearly between the readable minimum area and the capped maximum area. There are no count bins or categories. Hover and selection do not change the encoded size. City tooltips show only the city/state and case count. Colors have no identification-status meaning.
- A click uses the cluster's constituent-city bounds when fitting them advances to its split zoom. Otherwise it moves toward the cluster's representative point at the next expansion zoom. Flights last about 450 ms and respect reduced-motion preferences. Markers can be activated with Enter or Space.
- The maximum map zoom remains **10**. Clustering ends above zoom 9, so every city is an individual city marker at zoom 10. Multiple cases within a city stay together at its original representative coordinate. The dropdown automatically reveals a chosen city at a zoom where it is no longer clustered.
- The index is built once per dataset. Queries use the current zoom and viewport with a 15% buffer, refreshing after zoom, pan, or resize. Unchanged markers are retained to avoid unnecessary DOM churn. Profiles are still fetched only when a city is selected; clicking clusters does not fetch case records.

All 10,183 mapped cases remain represented by the same 3,483 city points at every zoom. The 5,537 previously unmapped source records are still excluded and reported. A visible cluster's count includes **all** of its member cities even if some lie beyond the viewport; it is not a count of only the cities currently on screen. Summing only visible clusters is therefore not a national total. The coverage bar continues to show the dataset-wide mapped count.

Very close or coincident geographic city points may overlap at maximum zoom; use the city dropdown to access them. Individual victim dots appear only in the side panel and do not change city clustering or its weighted counts.

## Data and coordinates

The source remains at `../airtable_export/data/womencount_1950s-2026_combined.csv` and is never edited. The preparation report records its SHA-256 hash. There are 15,720 source records. This prototype initially resolves 10,183 cases across 3,483 distinct geographic places and excludes 5,537 records from the map. See `public/data/index.json` for current coverage totals.

City and state are the only geographic inputs. `ADDRESS FOR MAPPING` is deliberately unused. No victim names or case information are sent to a geocoding provider.

The preparation script matches city–state pairs against the [GeoNames U.S. gazetteer](https://download.geonames.org/export/dump/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its [format documentation](https://download.geonames.org/export/dump/readme.txt) defines the fields. Place coordinates are representative points, not incident coordinates or guaranteed municipal centroids. The map repeats this distinction and caps zoom at **10**. This is a documented-case map, not a measure of prevalence, risk, or rates.

Matching rules:

- Require an explicit city and one of the 50 U.S. states or D.C. Puerto Rico and foreign locations are outside this prototype's scope.
- Normalize whitespace, case, accents, and punctuation; expand common `Ft.`, `St.`, and `Mt.` abbreviations.
- Match populated-place primary or ASCII names within the state. Consult alternate names only when no primary-name match exists. Exclude historical, abandoned, and destroyed places.
- If same-name candidates are more than 5 km apart, mark the result ambiguous. Do not choose the largest distant candidate. If all candidates are within 5 km, use the largest population as a representative point, with GeoNames ID as a deterministic tie-breaker.
- Do not fuzzy-match misspellings, split multi-location cells, infer a state, or replace an unresolved location with a state center.
- Merge source name variants that resolve to the same GeoNames ID into one marker and one city case list. Profiles retain their original recorded location.

These are conservative automated matches, not manual verification of each case. Incorrect or incomplete source city/state values can still produce a wrong match. Ambiguous and unmatched records should be reviewed before expanding coverage. No source record is silently assigned an invented coordinate.

Exclusion counts from the first preparation:

| Reason | Records |
| --- | ---: |
| City missing | 4,013 |
| State missing, with city present | 33 |
| Ambiguous city | 779 |
| No reliable match | 701 |
| Outside geographic scope, with city present | 11 |

Reasons are mutually exclusive, evaluated in the order missing city, missing state, scope, matching. The local report lists excluded record IDs and recorded places. Missing-city records can also have missing states.

### Rebuild data

Python 3.10+ is needed only for preparation and data tests. No Python packages are required.

```powershell
npm run prepare:data
npm run test:data
```

`data/geocoding-cache.json` stores successful, ambiguous, and unmatched city results with GeoNames IDs, feature codes, and provenance. Re-running preparation with unchanged locations uses the cache without network requests. New locations require the GeoNames ZIP, downloaded once to the ignored `data/gazetteer/US.zip`. That bulk download avoids thousands of geocoding requests and does not expose case information. It needs network access and disk space for the approximately 71 MB ZIP. No live geocoding runs in the browser.

```powershell
python scripts/prepare_data.py --source "path\to\compatible.csv"
python scripts/prepare_data.py --refresh-geocoding
```

The refresh flag re-matches using the local gazetteer. To update the gazetteer itself, remove only `data/gazetteer/US.zip` before refreshing. The local cache records the gazetteer hash and acquisition time. Keep the cache under version control for reproducibility. The source schema and unique record IDs are validated before export. Keep the source CSV available to reproduce preparation.

### Public fields and source treatment

Only deliberately selected fields are exported: record ID, name, age, date, date meaning, city/state, biographical description, relationship, cause of death, case status, narrative, source disclaimer, and public source links. The frontend does not receive the raw CSV, internal notes, mapping addresses, suspect fields, photos, documents, or signed Airtable attachment URLs. The `SOURCES` field is parsed into public HTTP(S) citations with credential and signed-link checks. Selected descriptive text is rendered as text, never HTML. Source narratives are under a collapsed disclosure because they can contain descriptions of violence. No private credentials are used.

Dates retain their documented meaning. `YEAR` dates display only the year; `MONTH` dates display the month and year; other dates display in UTC to prevent timezone shifts. A source date without `DATE DETAIL` is labeled as an unspecified recorded date. Missing values display “Not documented” or an equivalent plain description. Duplicate names remain separate cases because record IDs, not names, identify profiles.

This is a local research prototype. Confirm publication rights and review the selected text fields before a public deployment; the export itself is not a permission system. The original boilerplate about information requests is source content, not executable instructions to the application.

## Structure

| Path | Purpose |
| --- | --- |
| `scripts/prepare_data.py` | CSV validation, offline city geocoding, allowlisted export |
| `data/geocoding-cache.json` | Persistent geocoding results and source provenance |
| `data/preparation-report.json` | Local coverage and excluded-record audit |
| `public/data/index.json` | Small map index, city counts, and coverage |
| `public/data/cities/*.json` | Profiles loaded on demand for each city |
| `src/components/CityMap.tsx` | Existing map, shared cluster index, viewport and zoom controls |
| `src/components/ClusteredCityMarkers.tsx` | Viewport marker rendering, accessible labels, cluster click navigation |
| `src/lib/clustering.ts` | City-point index, weighted case totals, size scale, city reveal zoom |
| `src/lib/cityMarkerScale.ts` | Continuous city-circle area scale based on the full dataset count domain |
| `src/components/CityCaseHeader.tsx` | Shared city heading, count and close control |
| `src/components/VictimDotGrid.tsx` | Unified multi-case city grid, unobstructed previews and selected states |
| `src/lib/victimDots.ts` | Shared case preview text |
| `src/components/VictimProfile.tsx` | Profile, sources, close and Escape interactions |
| `src/lib/data.ts` | Data fetching, in-memory city cache, date formatting |
| `src/App.tsx` | Selection state, errors, reset and user journey |
| `src/styles.css` | Simple responsive layout |
| `tests/explorer.spec.ts` | Browser interaction tests |
| `tests/cluster-interactions.spec.ts` | Weighted labels, progressive cluster clicks, keyboard, zoom limit and reset |
| `tests/clustering.spec.ts` | Per-zoom count conservation, city identity, coincident coordinates and viewport queries |
| `tests/city-marker-scale.spec.ts` | Global count domain, continuous area scaling, size bounds, city tooltips, hover and selection |
| `tests/victim-dots.spec.ts` | 1/2/15/243-case flows, every dot/profile mapping, preview placement, focus, scrolling and mobile checks |
| `tests/wheel-zoom.spec.ts` | Fine trackpad and coarse wheel simulations, cursor anchoring and controls |
| `scripts/test_prepare_data.py` | Matching, privacy allowlist, and data integrity tests |

Clustering and rendering are isolated from data preparation and the victim-profile experience. Changing profile or case selection never remounts the map. Only markers in or near the viewport are rendered as Leaflet DOM markers, which makes clusters and city points keyboard accessible without rendering all records as individual dots.

## Verification

Verification covers single-case opening, grids for 2, 15, and 243 cases, every grid dot's original record ID and rendered profile name, unobstructed hover previews, enlarged hit targets, selection and scroll restoration, keyboard access, city changes, reset, and mobile layouts. The existing geographic clustering, trackpad/wheel input, and data-integrity checks remain in place.

Validation passed: production build and all 32 map/interaction/scale tests, including the continuous global city-size scale and exact city tooltip text. The existing 5 data checks also passed. The built static preview was checked for the 1/2/15/243-case desktop/mobile flows without browser errors or horizontal overflow.

The minimal UI remains: a compact title and data count, a geographic map, and the existing city/profile panel. Profiles retain their documented details and sources; on mobile they use normal page scrolling. The grid adds no outlined cards, decorative labels, status colors, or dashboards.

Current screenshots: [two-case grid](docs/two-case-grid.png), [15-case grid](docs/fifteen-case-grid.png), [large-city grid](docs/dot-grid.png), [grid preview](docs/dot-grid-preview.png), and [mobile grid](docs/mobile-dot-grid.png).

```powershell
npm run test:data
npm run build
npm run test:e2e
```

Browser tests use locally installed Google Chrome and start a temporary Vite server on port 5173. Install Chrome if needed, or change the `channel` in `playwright.config.ts` to a browser available on your machine. The real-tile check needs internet access to OpenStreetMap. Tests cover cluster labels and sizes, progressive clicks from a national cluster to Houston's city marker and a correct profile, keyboard activation, reduced motion, maximum-zoom ungrouping, reset during a flight, map navigation, close/back/Escape, unchanged map and list position, rapid city changes, Alaska/Hawaii selection, retry after failed requests, and mobile overflow. Traces and failure screenshots go to ignored `test-results/`.

The clustering tests independently enumerate every cluster's leaves at every integer zoom from 2 through 10. They verify each case sum against its underlying city weights, that the global sum stays 10,183, and that every city ID appears exactly once. Additional tests cover 15,000 cases attached to one city, distinct cities at identical coordinates, repeated viewport queries, cluster expansion zooms, and the zoom-10 boundary.

For manual verification:

1. Run `npm run dev` and open the printed Local URL. The national view should show numbered clusters. Hover one to see its documented-case total and number of cities.
2. Click a cluster, then a smaller group to reveal city dots. A cluster click should move forward without opening a case list. Try Tab and Enter as well.
3. Hover a city to check its name and case count. Click it, then a panel victim dot, and check the profile's age, date meaning, recorded location, and sources. A one-case city should open its profile directly.
4. Close the profile with ×, Back, or Escape and confirm the map and list position are preserved.
5. Zoom to the limit with +. No geographic clusters should remain; cities should still aggregate their own cases.
6. Click Reset Map, including while a cluster flight is running. It should restore the national clusters and clear the selected city/profile.
7. Repeat at mobile width, pan to another region, and choose Houston, Anchorage, or Honolulu from the city dropdown to verify direct access still works.

The grid tests exercise every real button's click handler and compare the resulting profile IDs and names with the original city case files for the 2-, 15-, and 243-case examples. They also check that victim IDs never appear in map layers, previews remain above the grid, ordering is stable after resizing and profile return, and late responses cannot replace the current city.

The background tile URL and attribution can be changed in a local `.env` using `.env.example`. `VITE_` values are public build inputs: never put secrets in them. Keep the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and visible attribution when using its public tile service. Reassess the tile provider before a high-traffic deployment.
