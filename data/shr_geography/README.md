# SHR geography preparation

Input: `E:/Downloads/femicide_county_named.csv` (73,590 county-year rows,
1976–2024, 3,078 county codes). This is the supplied named file; the request
called it `femicide_by_county_named.csv`. Its keys and all victim-count and
agency metrics agree with the earlier `femicide_county_year.csv`. Both inputs
remain unchanged. No raw SHR incidents are processed or classifications
recalculated.

## Outputs

- `processed/county_year.csv`: all input rows and metrics, readable county
  labels, original name field, Census name, boundary vintage, and match status.
- `processed/state_year.csv`: state-year sums of the six victim metrics.
- `processed/county_totals.csv` and `processed/state_totals.csv`: all-year sums.
- `processed/validation_report.json`: schema, input/boundary hashes, metric
  reconciliation, historical FIPS exceptions, and association limitations.
- `processed/unmatched_fips.csv`: unmatched county codes (header only when none).
- `processed/city_county_unassigned.csv`: unresolved representative-city links.
- `../../web/public/data/shr/index.json`: national metadata, state GeoJSON,
  primary-metric state totals, and validated city-to-county associations.
- `../../web/public/data/shr/counties/<state_fips>.geojson`: county display
  boundaries and primary-metric totals, loaded one state at a time.

All FIPS identifiers are strings, including GeoJSON feature IDs. Import CSV
FIPS columns explicitly as text; a spreadsheet application's automatic number
conversion can remove leading zeros. No `=TEXT(...)` formulas or numeric FIPS
substitutions are embedded in these machine-readable files.

## Geography and matching

The dataset's county codes match **2010 Census county geography**, including
Connecticut's eight former counties, Shannon County (`46113`), Bedford city
(`51515`), and Valdez-Cordova (`02261`). Use one consistent 2010 county layer
rather than overlaying retired polygons on their current successors. Guam
(`66010`) is supplemented from the 2024 official file because it is absent
from the national 2010 county cartographic file. State boundaries use 2024.

All 3,078 codes match. Eleven do not match the 2024 county file; they are
explicitly listed in the validation report and retained with their original
counts. Historical codes used in later source years are flagged, not changed.
There is no geographic allocation, current-county crosswalk, or assumption that
2010 boundaries were exact for every source year.

Readable labels use the named source's `county_name`. The 25 blank names are
filled from the exact-FIPS Census lookup. Numeric names are never interpreted.
Zero-padded FIPS, state abbreviation/FIPS agreement, duplicate county-year keys,
nonnegative integer counts, and polygon validity are checked before export.
Source hashes verify that inputs are unchanged. NAD83 coordinates are
transformed to WGS84 for GeoJSON with explicit longitude/latitude axis order.

Official cached boundary sources (5m display, 500k association validation):

- [2010 county display boundaries](https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_us_050_00_5m.zip)
- [2010 county detailed boundaries](https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_us_050_00_500k.zip)
- [2024 county validation and Guam](https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip)
- [2024 state boundaries](https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_5m.zip)
- [Census county changes documentation](https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.html)

Downloads are cached locally and excluded from Git. Cached 2020 boundaries
were inspected when selecting the vintage but are not used in final outputs.
The 1:5,000,000 display polygons are generalized cartographic boundaries, not
survey-grade boundaries.

## Metrics and coverage

Primary metric: `female_victims_male_offender`, labeled **reported female
homicide victims with a recorded male offender**. The national all-year sum
is **131,668**. This is not a count of confirmed gender-motivated femicides.
Unique county-year keys prevent double-counting. All six existing victim
metrics reconcile between input, county totals, state totals, and national
totals. No classifications are recomputed.

`agencies_reporting` is preserved at county-year level but not summed into
unique state or all-year agency counts. Missing county-years are not created
or imputed as zeros. A missing geographic total is `null`; an observed zero is
numeric `0`. These are counts of reported data, not population-adjusted risk,
complete national prevalence, or a comparable reporting panel across years.

## Women Count USA association

For each existing city GeoNames ID, take its administrative county code from
the locally cached GeoNames U.S. dump. Convert the state abbreviation to its
official Census state FIPS. Assign the city only if that five-digit county code
exists in the chosen geography **and** the original representative coordinate
falls within its 1:500,000 Census polygon. There is no nearest-county fallback,
name guessing, or reassignment when the checks disagree.

3,408 cities pass; 75 cities (210 available profiles) remain unassigned and are
not shown in the county exploration layer. They remain accessible through the
existing city exploration flow under Sources, geography, and limitations,
without assigning them to a county. This includes places whose modern
county-equivalent code does not match the historical layer and points near
generalized boundaries. Detailed source JSON remains intact. Representative
city association is **not a verified victim incident county**. Cities can span
county borders, and these datasets have not been linked record by record.
Do not treat profile totals as an SHR subset or compute coverage percentages.

## Reproduce

From the repository root, with Python 3.10+ (3.13 used here):

```powershell
python -m pip install --target .tools/geo -r scripts/requirements-geography.txt
python scripts/prepare_shr_geography.py --source E:/Downloads/femicide_county_named.csv
python -m unittest discover -s scripts -p test_*.py
```

The source CSV and existing `web/data/gazetteer/US.zip` remain local. This
preparation is not run in Cloudflare builds. The website uses only the prepared
static files. No BigQuery access or credentials are required.
