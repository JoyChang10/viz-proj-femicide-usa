"""Join already-aggregated SHR metrics to official geography; never classify incidents.

Run from any directory. See data/shr_geography/README.md for the geographic vintage.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/geo'))
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform
from shapely.validation import explain_validity

BASE = ROOT / 'data/shr_geography'
PUBLIC = ROOT / 'web/public/data/shr'
PRIMARY = 'female_victims_male_offender'
METRICS = ['total_victims', 'female_victims', PRIMARY, 'female_victims_ipv',
           'female_victims_18plus', 'female_victims_offender_sex_unknown']
SOURCES = {
    'county2010': 'https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_us_050_00_5m.zip',
    'county2010_detail': 'https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_us_050_00_500k.zip',
    'county2020': 'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_county_5m.zip',
    'county2024': 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip',
    'state2024': 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_5m.zip',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')

def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)

def load_boundary(key, geometry=True):
    url = SOURCES[key]
    path = BASE / 'cache' / url.rsplit('/', 1)[1]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    with zipfile.ZipFile(path) as z:
        stem = next(n[:-4] for n in z.namelist() if n.endswith('.shp'))
        reader = shapefile.Reader(shp=io.BytesIO(z.read(stem + '.shp')),
                                 dbf=io.BytesIO(z.read(stem + '.dbf')),
                                 encoding='latin1' if '2010' in key else 'utf-8')
        crs = CRS.from_wkt(z.read(stem + '.prj').decode())
        project = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True).transform
        result = {}
        for sr in reader.iterShapeRecords():
            p = sr.record.as_dict()
            fips = p.get('GEOID') or p['STATE'] + p['COUNTY']
            geom = transform(project, shape(sr.shape.__geo_interface__)) if geometry else None
            if geom is not None and (geom.is_empty or not geom.is_valid):
                raise ValueError(f'Invalid Census geometry {key}/{fips}: {explain_validity(geom)}')
            result[fips] = {'name': p.get('NAMELSAD') or p['NAME'],
                            'state_fips': p.get('STATEFP') or p.get('STATE') or fips,
                            'abb': p.get('STUSPS'), 'geometry': geom}
    return result, {'url': url, 'sha256': sha(path), 'source_crs': crs.to_string(), 'output_crs': 'EPSG:4326'}

def prepare(source):
    before = sha(source)
    with source.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    required = {'county_fips', 'state_fips', 'state_abb', 'county_name', 'year', 'agencies_reporting', *METRICS}
    if not required.issubset(fields or []):
        raise ValueError(f'Missing columns: {sorted(required - set(fields or []))}')
    seen = set()
    for r in rows:
        if not re.fullmatch(r'[0-9]{5}', r['county_fips']) or not re.fullmatch(r'[0-9]{2}', r['state_fips']):
            raise ValueError(f'Invalid FIPS format: {r["county_fips"]!r}/{r["state_fips"]!r}')
        if r['county_fips'][:2] != r['state_fips']:
            raise ValueError(f'State/county mismatch: {r["county_fips"]}')
        key = (r['county_fips'], r['year'])
        if key in seen:
            raise ValueError(f'Duplicate county-year; refusing to double-count: {key}')
        seen.add(key)
        for k in ['year', 'agencies_reporting', *METRICS]:
            if not re.fullmatch(r'[0-9]+', r[k]):
                raise ValueError(f'Missing/non-integer {k} in {key}')
    original_validation = None
    original = source.with_name('femicide_county_year.csv')
    if original.exists() and original != source:
        original_hash = sha(original)
        with original.open(encoding='utf-8-sig', newline='') as f:
            original_rows = list(csv.DictReader(f))
        original_keys = {(r['county_fips'], r['year']): r for r in original_rows}
        if len(original_keys) != len(original_rows) or set(original_keys) != seen:
            raise ValueError('Named source differs from original cleaned county-year keys')
        for r in rows:
            old = original_keys[(r['county_fips'], r['year'])]
            if any(r[k] != old[k] for k in [*METRICS, 'agencies_reporting', 'state_fips', 'state_abb']):
                raise ValueError('Named source changed original cleaned metrics')
        assert sha(original) == original_hash
        original_validation = {'source_file': original.name, 'sha256': original_hash, 'metrics_and_keys_identical': True}
    county, provenance = load_boundary('county2010')
    modern, modern_provenance = load_boundary('county2024')
    states, state_provenance = load_boundary('state2024')
    # Guam is not present in this 2010 national cartographic file. It is one
    # non-overlapping county-equivalent, verified by the same five-digit code.
    if '66010' not in county:
        county['66010'] = modern['66010']
    detail, detail_provenance = load_boundary('county2010_detail')
    detail['66010'] = modern['66010']
    names = defaultdict(set)
    for r in rows:
        if r['state_fips'] not in states or states[r['state_fips']]['abb'] != r['state_abb']:
            raise ValueError(f'Invalid state identifier: {r["state_fips"]}/{r["state_abb"]}')
        if r['county_name'].strip() and not r['county_name'].strip().isdigit():
            names[r['county_fips']].add(r['county_name'].strip())
    if any(len(n) > 1 for n in names.values()):
        raise ValueError('Conflicting display names for the same county FIPS')
    grouped = defaultdict(list)
    for r in rows:
        grouped[r['county_fips']].append(r)
    unmatched = sorted(set(grouped) - set(county))
    historic = sorted(set(grouped) - set(modern))
    totals = {}
    for fips, group in sorted(grouped.items()):
        c = county.get(fips)
        totals[fips] = {'county_fips': fips, 'state_fips': fips[:2], 'state_abb': group[0]['state_abb'],
                        'county_name': next(iter(names[fips])) if names[fips] else c['name'] if c else None,
                        'census_name': c['name'] if c else None,
                        'boundary_vintage': 2024 if fips == '66010' else 2010 if c else None,
                        'geographic_match': 'matched' if c else 'unmatched',
                        'observed_years': len(group), 'year_min': min(int(r['year']) for r in group),
                        'year_max': max(int(r['year']) for r in group),
                        **{k: sum(int(r[k]) for r in group) for k in METRICS}}
    processed = []
    for r in rows:
        t = totals[r['county_fips']]
        processed.append({**r, 'county_name_original': r['county_name'], 'county_name': t['county_name'],
                          'census_name': t['census_name'], 'boundary_vintage': t['boundary_vintage'],
                          'geographic_match': t['geographic_match']})
    out = BASE / 'processed'
    write_csv(out / 'county_year.csv', processed, [*fields, 'county_name_original', 'census_name', 'boundary_vintage', 'geographic_match'])
    write_csv(out / 'county_totals.csv', totals.values(), list(next(iter(totals.values()))))
    sy = defaultdict(list)
    for r in rows:
        sy[(r['state_fips'], r['year'])].append(r)
    state_year = [{'state_fips': s, 'state_abb': states[s]['abb'], 'state_name': states[s]['name'], 'year': y,
                   'counties_reporting': len(group), **{k: sum(int(r[k]) for r in group) for k in METRICS}}
                  for (s, y), group in sorted(sy.items())]
    write_csv(out / 'state_year.csv', state_year, list(state_year[0]))
    state_totals = {}
    for s in sorted({r['state_fips'] for r in rows}):
        group = [r for r in state_year if r['state_fips'] == s]
        state_totals[s] = {'state_fips': s, 'state_abb': states[s]['abb'], 'state_name': states[s]['name'],
                           'observed_years': len(group), **{k: sum(r[k] for r in group) for k in METRICS}}
    write_csv(out / 'state_totals.csv', state_totals.values(), list(next(iter(state_totals.values()))))
    national = {k: sum(int(r[k]) for r in rows) for k in METRICS}
    for k in METRICS:
        assert national[k] == sum(t[k] for t in totals.values()) == sum(t[k] for t in state_totals.values())

    # GeoNames administrative county code AND containment must agree. This
    # associates a representative city point, never an individual incident.
    city_index = json.loads((ROOT / 'web/public/data/index.json').read_text(encoding='utf-8'))
    cities_by_geo = {str(c['geonameId']): c for c in city_index['cities']}
    associations, unassigned = {}, []
    gazetteer = ROOT / 'web/data/gazetteer/US.zip'
    found = set()
    with zipfile.ZipFile(gazetteer) as z, io.TextIOWrapper(z.open('US.txt'), encoding='utf-8') as f:
        for line in f:
            record = line.rstrip('\n').split('\t')
            city = cities_by_geo.get(record[0])
            if not city:
                continue
            found.add(city['id'])
            state_abb, admin2 = record[10], record[11]
            state = next((s for s, entry in states.items() if entry['abb'] == state_abb), '')
            fips = state + admin2
            if not re.fullmatch(r'[0-9]{5}', fips) or fips not in detail:
                reason = 'GeoNames county code absent from chosen Census geography'
            elif not detail[fips]['geometry'].covers(Point(city['longitude'], city['latitude'])):
                reason = 'Representative point does not fall in its GeoNames county polygon'
            else:
                associations[city['id']] = fips
                continue
            unassigned.append({'city_id': city['id'], 'city': city['label'], 'geoname_id': city['geonameId'], 'candidate_fips': fips, 'reason': reason, 'profiles': city['caseCount']})
    for c in city_index['cities']:
        if c['id'] not in found:
            unassigned.append({'city_id': c['id'], 'city': c['label'], 'reason': 'GeoNames ID not found', 'profiles': c['caseCount']})
    write_csv(out / 'city_county_unassigned.csv', unassigned, ['city_id', 'city', 'geoname_id', 'candidate_fips', 'reason', 'profiles'])
    state_features = []
    for s, state in sorted(states.items()):
        t = state_totals.get(s)
        state_features.append({'type': 'Feature', 'id': s, 'properties': {
            'fips': s, 'name': state['name'], 'state_fips': s, 'state_abb': state['abb'],
            'count': t[PRIMARY] if t else None, 'observed_years': t['observed_years'] if t else 0,
        }, 'geometry': mapping(state['geometry'])})
    for s in states:
        features = []
        for fips, c in sorted(county.items()):
            if fips[:2] != s:
                continue
            t = totals.get(fips)
            features.append({'type': 'Feature', 'id': fips, 'properties': {
                'fips': fips, 'state_fips': s, 'state_abb': states[s]['abb'],
                'name': t['county_name'] if t else c['name'], 'count': t[PRIMARY] if t else None,
                'observed_years': t['observed_years'] if t else 0,
                'boundary_vintage': 2024 if fips == '66010' else 2010,
            }, 'geometry': mapping(c['geometry'])})
        write_json(PUBLIC / f'counties/{s}.geojson', {'type': 'FeatureCollection', 'features': features})
    report = {
        'source_file': source.name, 'source_sha256': before, 'source_rows': len(rows),
        'schema': fields, 'original_cleaned_comparison': original_validation, 'years': sorted({int(r['year']) for r in rows}),
        'unique_counties': len(totals), 'states_with_data': len(state_totals),
        'invalid_fips': [], 'duplicate_county_years': 0, 'unmatched_fips': unmatched,
        'unmatched_2024_fips': historic,
        'historical_matches': [dict(totals[f], source_rows=len(grouped[f])) for f in historic],
        'names_filled_from_census_rows': sum(not r['county_name'].strip() or r['county_name'].strip().isdigit() for r in rows),
        'national_totals': national, 'metrics_preserved': True, 'state_county_totals_reconciled': True,
        'county_boundary_vintage': '2010, with 2024 Guam supplement; not year-specific boundaries',
        'boundary_sources': {'county': provenance, 'county_detail': detail_provenance, 'modern_validation': modern_provenance, 'state': state_provenance},
        'city_association': {'method': 'GeoNames admin2 FIPS and Census 500k polygon containment; representative point only',
                             'gazetteer_sha256': sha(gazetteer), 'assigned_cities': len(associations),
                             'unassigned_cities': len(unassigned), 'unassigned_profiles': sum(c['profiles'] for c in unassigned)},
        'warnings': ['Missing county-years are not filled with zeros.',
                     'Counts reflect the supplied reporting data, not population-adjusted risk or confirmed gender motivation.',
                     'Historical county codes are retained, including codes used after their retirement. No counts are reallocated.',
                     'City associations do not verify victim incident counties; multi-county cities remain a limitation.',
                     'SHR and Women Count USA are not record-linked and have different coverage and definitions.',
                     'agencies_reporting is preserved per county-year but not summed into unique agency totals.'],
    }
    assert sha(source) == before, 'Source file was modified'
    write_json(out / 'validation_report.json', report)
    write_csv(out / 'unmatched_fips.csv', [{'county_fips': f, 'rows': len(grouped[f])} for f in unmatched], ['county_fips', 'rows'])
    write_json(PUBLIC / 'index.json', {'metadata': {
        'source': 'SHR cleaned county-year dataset', 'sourceFile': source.name, 'sourceSha256': before,
        'metric': PRIMARY, 'metricLabel': 'Reported female homicide victims with a recorded male offender',
        'yearMin': min(report['years']), 'yearMax': max(report['years']), 'count': national[PRIMARY],
        'countyBoundaryVintage': report['county_boundary_vintage'], 'unmatchedFips': unmatched,
        'unassignedCities': len(unassigned),
    }, 'states': {'type': 'FeatureCollection', 'features': state_features}, 'cityCounty': associations})
    print(json.dumps({k: report[k] for k in ['source_rows', 'unique_counties', 'unmatched_fips', 'unmatched_2024_fips', 'national_totals', 'city_association']}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('E:/Downloads/femicide_county_named.csv'))
    prepare(parser.parse_args().source.resolve())
