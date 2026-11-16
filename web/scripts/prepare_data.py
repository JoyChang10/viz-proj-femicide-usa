"""Build an allowlisted, city-level map dataset. Never modifies the source CSV.

Uses a local GeoNames country dump, not address geocoding or victim-name queries.
Python standard library only. See README.md for matching rules and limitations.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT.parent / 'airtable_export/data/womencount_1950s-2026_combined.csv'
GAZETTEER_URL = 'https://download.geonames.org/export/dump/US.zip'
STATES = set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
CACHE_VERSION = 1
NULLS = {'', 'n/a', 'null', 'none', 'nan'}


def clean(value: str | None) -> str | None:
    value = (value or '').strip()
    return None if value.casefold() in NULLS else value


def normalize(value: str) -> str:
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).casefold()
    value = re.sub(r"[.\-'’]", '', value)
    value = re.sub(r'\bft\b', 'fort', value)
    value = re.sub(r'\bst\b', 'saint', value)
    value = re.sub(r'\bmt\b', 'mount', value)
    return ' '.join(value.split())


def location_key(city: str, state: str) -> str:
    return f'{normalize(city)}|{state.strip().upper()}'


def distance_km(a: dict, b: dict) -> float:
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat = lat2 - lat1
    dlon = math.radians(b['lon'] - a['lon'])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def choose_match(primary: list[dict], alternate: list[dict]) -> dict:
    candidates = {p['geonameId']: p for p in (primary or alternate)}
    candidates = list(candidates.values())
    if not candidates:
        return {'status': 'not_found'}
    # Never choose a largest city when a same-state name is geographically ambiguous.
    if any(distance_km(a, b) > 5 for i, a in enumerate(candidates) for b in candidates[i + 1:]):
        return {'status': 'ambiguous', 'candidates': candidates}
    chosen = sorted(candidates, key=lambda c: (-c['population'], c['geonameId']))[0]
    return {'status': 'matched', 'method': 'primary_name' if primary else 'alternate_name', **chosen}


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)


def download_gazetteer(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.download')
    print('Downloading public GeoNames US.zip once; no case information is sent.', flush=True)
    request = Request(GAZETTEER_URL, headers={'User-Agent': 'UW-DATA511-WomenCount-Prototype/0.1'})
    try:
        with urlopen(request, timeout=120) as response, tmp.open('wb') as dest:
            while chunk := response.read(1024 * 1024):
                dest.write(chunk)
        with zipfile.ZipFile(tmp) as archive:
            if 'US.txt' not in archive.namelist():
                raise ValueError('GeoNames archive does not contain US.txt')
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def geocode(keys: set[str], archive_path: Path) -> tuple[dict, str]:
    if not archive_path.exists():
        download_gazetteer(archive_path)
    primary, alternate = defaultdict(list), defaultdict(list)
    with zipfile.ZipFile(archive_path) as archive:
        with io.TextIOWrapper(archive.open('US.txt'), encoding='utf-8') as stream:
            for row in csv.reader(stream, delimiter='\t'):
                if len(row) < 19 or row[6] != 'P' or row[7] in {'PPLH', 'PPLQ', 'PPLW'} or row[8] != 'US':
                    continue
                state = row[10]
                if state not in STATES:
                    continue
                point = {'geonameId': int(row[0]), 'name': row[1], 'state': state,
                         'lat': float(row[4]), 'lon': float(row[5]), 'featureCode': row[7],
                         'population': int(row[14] or 0)}
                if not (-90 <= point['lat'] <= 90 and -180 <= point['lon'] <= 180):
                    continue
                for name in {row[1], row[2]}:
                    key = location_key(name, state)
                    if key in keys:
                        primary[key].append(point)
                for name in set(row[3].split(',')):
                    key = location_key(name, state)
                    if key in keys:
                        alternate[key].append(point)
    return ({key: choose_match(primary[key], alternate[key]) for key in sorted(keys)},
            hashlib.file_digest(archive_path.open('rb'), 'sha256').hexdigest())


def source_links(value: str) -> list[str]:
    """Only public HTTP(S) citations; never signed Airtable attachments or credentials."""
    result = []
    for raw in re.findall(r'https?://[^\s<>"\[\]]+', value or ''):
        raw = raw.rstrip('.,;)')
        try:
            url = urlsplit(raw)
            host = (url.hostname or '').lower()
            if (url.username or url.password or not host or host == 'localhost'
                    or '.' not in host or host.endswith(('.local', '.internal'))
                    or any(x in host for x in ('airtable', 'amazonaws', 'blob.core.windows'))
                    or re.search(r'(token|signature|api.?key|credential|password|secret)=', url.query, re.I)):
                continue
            if raw not in result:
                result.append(raw)
        except ValueError:
            continue
    return result


def profile(row: dict) -> dict:
    # Deliberate allowlist. No raw notes, mapping addresses, photos or attachments.
    return {
        'id': row['_record_id'], 'name': clean(row['HER NAME']) or 'Name not documented',
        'age': clean(row['HER AGE']), 'date': clean(row['DATE']),
        'dateDetail': clean(row['DATE DETAIL']), 'city': clean(row['CITY']),
        'state': clean(row['STATE']), 'about': clean(row['ABOUT HER']),
        'relationship': clean(row['RELATIONSHIP']),
        'causeOfDeath': clean(row.get('CAUSE OF DEATH')) or clean(row.get('CAUSE / FEATURES OF DEATH')),
        'caseStatus': clean(row['CASE STATUS / DETAILS']),
        'narrative': clean(row['NARRATIVE DETAILS']),
        'disclaimer': clean(row['DISCLAIMER']), 'sources': source_links(row['SOURCES']),
    }


def prepare(source: Path, refresh: bool = False) -> dict:
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with source.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        required = {'_record_id', 'HER NAME', 'CITY', 'STATE', 'HER AGE', 'DATE', 'DATE DETAIL',
                    'ABOUT HER', 'RELATIONSHIP', 'CASE STATUS / DETAILS', 'NARRATIVE DETAILS', 'DISCLAIMER', 'SOURCES'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f'Missing required CSV fields: {sorted(required - set(reader.fieldnames or []))}')
        rows = list(reader)
    ids = [row['_record_id'] for row in rows]
    if len(set(ids)) != len(ids) or any(not i for i in ids):
        raise ValueError('Source record IDs must be nonempty and unique; records were not exported.')
    grouped, unresolved = defaultdict(list), []
    for row in rows:
        city, state = clean(row['CITY']), (clean(row['STATE']) or '').upper()
        reason = 'missing_city' if not city else 'missing_state' if not state else 'outside_us_scope' if state not in STATES else None
        if reason:
            unresolved.append({'recordId': row['_record_id'], 'city': city, 'state': state, 'reason': reason})
        else:
            grouped[location_key(city, state)].append(row)
    cache_path = ROOT / 'data/geocoding-cache.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() and not refresh else {}
    if cache.get('version') != CACHE_VERSION:
        cache = {'version': CACHE_VERSION, 'source': GAZETTEER_URL, 'license': 'CC BY 4.0', 'entries': {}}
    missing = set(grouped) - set(cache['entries'])
    if missing:
        entries, archive_hash = geocode(missing, ROOT / 'data/gazetteer/US.zip')
        cache['entries'].update(entries)
        cache['gazetteerSha256'] = archive_hash
        cache['updatedAt'] = datetime.now(timezone.utc).isoformat()
        write_json(cache_path, cache)
    output = ROOT / 'public/data'
    cities, mapped = [], 0
    resolved_groups = {}
    for key, group in sorted(grouped.items()):
        match = cache['entries'][key]
        if match['status'] != 'matched':
            unresolved.extend({'recordId': r['_record_id'], 'city': r['CITY'], 'state': r['STATE'],
                               'reason': match['status']} for r in group)
            continue
        # Aliases of the same GeoNames place share one marker and one case list.
        place = resolved_groups.setdefault(match['geonameId'], {'match': match, 'rows': []})
        place['rows'].extend(group)
    for place_id, place in sorted(resolved_groups.items(), key=lambda item: (item[1]['match']['name'], item[1]['match']['state'])):
        match, group = place['match'], place['rows']
        city_id = hashlib.sha256(f'geonames:{place_id}'.encode()).hexdigest()[:16]
        label = f"{match['name']}, {match['state']}"
        cities.append({'id': city_id, 'label': label, 'latitude': match['lat'], 'longitude': match['lon'],
                       'caseCount': len(group), 'geonameId': match['geonameId'], 'sourceName': match['name']})
        write_json(output / f'cities/{city_id}.json', {'cityId': city_id, 'cases': [profile(r) for r in group]})
        mapped += len(group)
    valid_files = {f"{c['id']}.json" for c in cities}
    # Only remove stale generated shards in this exact output directory.
    for path in (output / 'cities').glob('*.json'):
        if re.fullmatch(r'[0-9a-f]{16}\.json', path.name) and path.name not in valid_files:
            path.unlink()
    reasons = dict(sorted(Counter(r['reason'] for r in unresolved).items()))
    metadata = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
                'sourceFile': source.name, 'sourceSha256': source_hash, 'totalCases': len(rows),
                'mappedCases': mapped, 'unmappedCases': len(unresolved), 'cityCount': len(cities),
                'unmappedReasons': reasons, 'coordinatePrecision': 'representative_city_point',
                'geocoder': 'GeoNames US gazetteer', 'geocoderUrl': GAZETTEER_URL,
                'geocoderLicense': 'CC BY 4.0', 'synthetic': False}
    assert mapped + len(unresolved) == len(rows)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash, 'Source changed during export'
    write_json(output / 'index.json', {'metadata': metadata, 'cities': cities})
    write_json(ROOT / 'data/preparation-report.json', {'metadata': metadata, 'unmappedRecords': unresolved})
    print(json.dumps(metadata, indent=2))
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--refresh-geocoding', action='store_true', help='Re-match all cities using the local gazetteer; remove US.zip separately to download a new snapshot.')
    args = parser.parse_args()
    try:
        prepare(args.source.resolve(), args.refresh_geocoding)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        parser.exit(1, f'Data preparation failed: {exc}\nExisting generated data and original CSV have not been replaced by sample data.\n')
