import hashlib
import json
from pathlib import Path
import unittest

from prepare_data import DEFAULT_SOURCE, ROOT, choose_match, clean, location_key, profile, source_links


class MatchingTests(unittest.TestCase):
    def test_normalization_is_conservative(self):
        self.assertEqual(location_key(' Ft. Worth ', 'tx'), 'fort worth|TX')
        self.assertEqual(location_key('St. Louis', 'MO'), 'saint louis|MO')
        self.assertEqual(location_key('San José', 'CA'), 'san jose|CA')
        self.assertNotEqual(location_key('Calera; Charlotte', 'NC'), 'charlotte|NC')
        self.assertNotEqual(location_key('Napa; Placer County', 'CA'), 'napa|CA')

    def test_ambiguity_never_chooses_the_largest_distant_city(self):
        a = {'geonameId': 1, 'lat': 40, 'lon': -80, 'population': 1000000}
        b = {'geonameId': 2, 'lat': 42, 'lon': -80, 'population': 10}
        self.assertEqual(choose_match([a, b], [])['status'], 'ambiguous')
        self.assertEqual(choose_match([a], [b])['geonameId'], 1)
        self.assertEqual(choose_match([], [])['status'], 'not_found')

    def test_signed_attachments_and_credentials_are_excluded(self):
        links = source_links('https://news.example/story https://v5.airtableusercontent.com/signed '
                             'https://user:password@example.com/a https://example.com/a?token=secret '
                             'https://news.example/story')
        self.assertEqual(links, ['https://news.example/story'])
        self.assertIsNone(clean('N/A'))
        self.assertEqual(clean('Unknown / unreleased'), 'Unknown / unreleased')


class ExportIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((ROOT / 'public/data/index.json').read_text(encoding='utf-8'))

    def test_source_unchanged_and_counts_reconcile(self):
        meta = self.index['metadata']
        self.assertEqual(hashlib.sha256(DEFAULT_SOURCE.read_bytes()).hexdigest(), meta['sourceSha256'])
        self.assertEqual(meta['mappedCases'] + meta['unmappedCases'], meta['totalCases'])
        self.assertEqual(sum(meta['unmappedReasons'].values()), meta['unmappedCases'])
        self.assertEqual(sum(c['caseCount'] for c in self.index['cities']), meta['mappedCases'])
        self.assertFalse(meta['synthetic'])

    def test_all_profiles_have_matching_city_and_allowlisted_fields(self):
        expected = {'id', 'name', 'age', 'date', 'dateDetail', 'city', 'state', 'about',
                    'relationship', 'causeOfDeath', 'caseStatus', 'narrative', 'disclaimer', 'sources'}
        record_ids = set()
        self.assertEqual(len({c['geonameId'] for c in self.index['cities']}), len(self.index['cities']))
        cache = json.loads((ROOT / 'data/geocoding-cache.json').read_text(encoding='utf-8'))['entries']
        for city in self.index['cities']:
            shard = json.loads((ROOT / f"public/data/cities/{city['id']}.json").read_text(encoding='utf-8'))
            self.assertEqual(shard['cityId'], city['id'])
            self.assertEqual(len(shard['cases']), city['caseCount'])
            self.assertTrue(-90 <= city['latitude'] <= 90)
            self.assertTrue(-180 <= city['longitude'] <= 180)
            for record in shard['cases']:
                self.assertEqual(set(record), expected)
                match = cache[location_key(record['city'], record['state'])]
                self.assertEqual(match['status'], 'matched')
                self.assertEqual(match['geonameId'], city['geonameId'])
                self.assertEqual((match['lat'], match['lon']), (city['latitude'], city['longitude']))
                self.assertNotIn(record['id'], record_ids)
                record_ids.add(record['id'])
        self.assertEqual(len(record_ids), self.index['metadata']['mappedCases'])


if __name__ == '__main__':
    unittest.main()
