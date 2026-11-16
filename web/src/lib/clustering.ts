import Supercluster, { type ClusterFeature, type PointFeature } from 'supercluster'
import type { City } from '../types'

export const MAX_MAP_ZOOM = 10
export const CLUSTER_RADIUS = 56

export interface CityPointProperties {
  cityId: string
  label: string
  caseCount: number
}
export interface CaseTotals { caseCount: number }
export type CityPoint = PointFeature<CityPointProperties>
export type CaseCluster = ClusterFeature<CaseTotals>
export type MapFeature = CityPoint | CaseCluster
export type CityClusterIndex = Supercluster<CityPointProperties, CaseTotals>

export function isCluster(feature: MapFeature): feature is CaseCluster {
  return 'cluster' in feature.properties && feature.properties.cluster === true
}

export function createCityClusterIndex(cities: City[]): CityClusterIndex {
  const index = new Supercluster<CityPointProperties, CaseTotals>({
    radius: CLUSTER_RADIUS,
    // Match Leaflet's 256-pixel world tiles: radius is in screen pixels.
    extent: 256,
    maxZoom: MAX_MAP_ZOOM - 1,
    minPoints: 2,
    map: props => ({ caseCount: props.caseCount }),
    reduce: (total, next) => { total.caseCount += next.caseCount },
  })
  return index.load(cities.map(city => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [city.longitude, city.latitude] },
    // One input point per city; cases are weights, never artificial coordinates.
    properties: { cityId: city.id, label: city.label, caseCount: city.caseCount },
  })))
}

/** Bounded diameter in CSS pixels; full, unrounded case counts remain visible. */
export function clusterDiameter(caseCount: number): number {
  return Math.round(Math.min(62, Math.max(34, 28 + 7 * Math.log10(Math.max(1, caseCount)))))
}

/** Ensure a city chosen from the dropdown is visible outside a cluster. */
export function cityRevealZoom(index: CityClusterIndex, city: City, currentZoom: number): number {
  const [lng, lat] = [city.longitude, city.latitude]
  for (let zoom = Math.max(7, Math.ceil(currentZoom)); zoom < MAX_MAP_ZOOM; zoom++) {
    const features = index.getClusters([lng - 0.00001, lat - 0.00001, lng + 0.00001, lat + 0.00001], zoom)
    if (features.some(f => !isCluster(f) && f.properties.cityId === city.id)) return zoom
  }
  return MAX_MAP_ZOOM
}
