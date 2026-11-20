import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from prepare_shr_geography import ROOT, BASE, PUBLIC, METRICS, PRIMARY, prepare

def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

class GeographyIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path('E:/Downloads/femicide_county_named.csv')
        cls.rows = read_csv(cls.source)
        cls.out = BASE / 'processed'
        cls.report = json.loads((cls.out / 'validation_report.json').read_text(encoding='utf-8'))
        cls.index = json.loads((PUBLIC / 'index.json').read_text(encoding='utf-8'))

    def test_source_and_metrics_preserved_by_county_year(self):
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.report['source_sha256'])
        output = read_csv(self.out / 'county_year.csv')
        self.assertEqual(len(output), len(self.rows))
        original = {(r['county_fips'], r['year']): r for r in self.rows}
        for r in output:
            before = original[(r['county_fips'], r['year'])]
            for key in [*METRICS, 'agencies_reporting', 'state_fips', 'state_abb']:
                self.assertEqual(r[key], before[key])
            self.assertEqual(len(r['county_fips']), 5)
            self.assertEqual(len(r['state_fips']), 2)
            self.assertTrue(r['county_name'] and not r['county_name'].isdigit())

    def test_county_state_national_totals_and_missing_values(self):
        county = read_csv(self.out / 'county_totals.csv')
        states = read_csv(self.out / 'state_totals.csv')
        for key in METRICS:
            expected = sum(int(r[key]) for r in self.rows)
            self.assertEqual(sum(int(r[key]) for r in county), expected)
            self.assertEqual(sum(int(r[key]) for r in states), expected)
        self.assertEqual(self.index['metadata']['count'], 131668)
        self.assertTrue(any(f['properties']['count'] is None for f in self.index['states']['features']))
        for state in states:
            features = json.loads((PUBLIC / f'counties/{state["state_fips"]}.geojson').read_text(encoding='utf-8'))['features']
            self.assertEqual(sum(f['properties']['count'] or 0 for f in features), int(state[PRIMARY]))
            self.assertEqual(len({f['id'] for f in features}), len(features))
            self.assertTrue(all(isinstance(f['id'], str) and len(f['id']) == 5 for f in features))

    def test_historical_fips_retained_and_all_matches_valid(self):
        self.assertEqual(self.report['unmatched_fips'], [])
        self.assertEqual(len(self.report['unmatched_2024_fips']), 11)
        for fips in self.report['unmatched_2024_fips']:
            features = json.loads((PUBLIC / f'counties/{fips[:2]}.geojson').read_text(encoding='utf-8'))['features']
            self.assertEqual(sum(f['id'] == fips for f in features), 1)
        self.assertIn('01001', {r['county_fips'] for r in self.rows})

    def test_assigned_and_unassigned_cities_reconcile(self):
        cities = json.loads((ROOT / 'web/public/data/index.json').read_text(encoding='utf-8'))['cities']
        unassigned = read_csv(self.out / 'city_county_unassigned.csv')
        assigned = self.index['cityCounty']
        self.assertEqual(set(assigned) | {r['city_id'] for r in unassigned}, {c['id'] for c in cities})
        self.assertFalse(set(assigned) & {r['city_id'] for r in unassigned})
        for label in ['Houston, TX', 'Carnation, WA', 'Aberdeen, ID', 'Corpus Christi, TX']:
            city = next(c for c in cities if c['label'] == label)
            self.assertIn(city['id'], assigned)

    def test_duplicate_and_malformed_fips_rejected_before_export(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'bad.csv'
            for records, message in [([self.rows[0], self.rows[0]], 'Duplicate county-year'),
                                     ([dict(self.rows[0], county_fips='1001')], 'Invalid FIPS format')]:
                with path.open('w', encoding='utf-8', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=list(self.rows[0]))
                    writer.writeheader(); writer.writerows(records)
                with self.assertRaisesRegex(ValueError, message):
                    prepare(path)

if __name__ == '__main__':
    unittest.main()
