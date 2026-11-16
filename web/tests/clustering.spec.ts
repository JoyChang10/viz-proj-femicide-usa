import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  clusterDiameter, createCityClusterIndex, isCluster, cityRevealZoom, MAX_MAP_ZOOM,
  type MapFeature,
} from '../src/lib/clustering'
import type { City, DataIndex } from '../src/types'

const data = JSON.parse(readFileSync('public/data/index.json', 'utf-8')) as DataIndex
const world: [number, number, number, number] = [-180, -85, 180, 85]
const cityIds = data.cities.map(c => c.id).sort()
const index = createCityClusterIndex(data.cities)

test('every zoom preserves all city identities and case weights exactly once', () => {
  let previousMarkers = 0
  for (let zoom = 2; zoom <= MAX_MAP_ZOOM; zoom++) {
    const features = index.getClusters(world, zoom)
    const ids: string[] = []
    let totalCases = 0
    for (const feature of features) {
      const leaves = isCluster(feature) ? index.getLeaves(feature.properties.cluster_id, Infinity) : [feature]
      const expectedCount = leaves.reduce((sum, leaf) => sum + leaf.properties.caseCount, 0)
      expect(feature.properties.caseCount).toBe(expectedCount)
      if (isCluster(feature)) expect(feature.properties.point_count).toBe(leaves.length)
      totalCases += feature.properties.caseCount
      ids.push(...leaves.map(leaf => leaf.properties.cityId))
    }
    expect(totalCases).toBe(data.metadata.mappedCases)
    expect(ids.sort()).toEqual(cityIds)
    expect(new Set(ids).size).toBe(data.cities.length)
    expect(features.length).toBeGreaterThanOrEqual(previousMarkers)
    previousMarkers = features.length
    if (zoom === MAX_MAP_ZOOM) expect(features.every(feature => !isCluster(feature))).toBe(true)
  }
})

test('overlapping city coordinates keep their case weights; one city never becomes individual victim points', () => {
  const city = (id: string, longitude: number, caseCount: number): City => ({
    id, longitude, latitude: 40, caseCount, label: id, geonameId: 1, sourceName: id,
  })
  const cities = [city('a', -100, 15000), city('b', -100, 7), city('c', -99.999, 3)]
  const tinyIndex = createCityClusterIndex(cities)
  const features = tinyIndex.getClusters(world, 2)
  expect(features).toHaveLength(1)
  expect(features[0].properties.caseCount).toBe(15010)
  expect(isCluster(features[0]) && features[0].properties.point_count).toBe(3)
  const detailed = tinyIndex.getClusters(world, MAX_MAP_ZOOM)
  expect(detailed).toHaveLength(3)
  expect(detailed.map(f => f.properties.caseCount).sort((a, b) => a - b)).toEqual([3, 7, 15000])
  expect(tinyIndex.getClusters(world, 2)[0].properties.caseCount).toBe(15010)
})

test('viewport queries reuse whole geographic clusters and do not change their counts', () => {
  for (const zoom of [4, 7, 9, 10]) {
    const all = index.getClusters(world, zoom)
    const key = (feature: MapFeature) => isCluster(feature) ? `cluster:${feature.properties.cluster_id}` : `city:${feature.properties.cityId}`
    const expected = new Map(all.map(feature => [key(feature), feature.properties.caseCount]))
    for (const bbox of [[-126, 24, -100, 50], [-101, 25, -70, 49], [-160, 18, -120, 65]] as [number, number, number, number][]) {
      for (const feature of index.getClusters(bbox, zoom)) expect(feature.properties.caseCount).toBe(expected.get(key(feature)))
    }
  }
})

test('cluster click expansion advances toward children and city reveal respects the zoom limit', () => {
  for (const zoom of [2, 4, 7, 9]) {
    const features = index.getClusters(world, zoom)
    for (const feature of features) {
      if (isCluster(feature)) {
        const nextZoom = index.getClusterExpansionZoom(feature.properties.cluster_id)
        expect(nextZoom).toBeGreaterThan(zoom)
        expect(nextZoom).toBeLessThanOrEqual(MAX_MAP_ZOOM)
        expect(index.getChildren(feature.properties.cluster_id).length).toBeGreaterThan(0)
      }
    }
  }
  for (const name of ['Houston, TX', 'Honolulu, HI', 'Anchorage, AK']) {
    const city = data.cities.find(c => c.label === name)!
    const zoom = cityRevealZoom(index, city, 4)
    expect(zoom).toBeLessThanOrEqual(MAX_MAP_ZOOM)
    expect(index.getClusters(world, zoom).some(f => !isCluster(f) && f.properties.cityId === city.id)).toBe(true)
  }
  expect([1, 10, 100, 1000, 10000, 1000000].map(clusterDiameter)).toEqual([34, 35, 42, 49, 56, 62])
})
