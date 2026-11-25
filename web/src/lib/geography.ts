import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export const FBI_COUNT_SOURCE = 'FBI Supplementary Homicide Reports'

export interface AreaProperties {
  fips: string; name: string; state_fips: string; state_abb: string
  count: number | null; observed_years: number; boundary_vintage?: number
}
export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProperties>
export type Areas = FeatureCollection<Polygon | MultiPolygon, AreaProperties>
export interface GeographyData {
  metadata: {
    source: string; sourceFile: string; metric: string; metricLabel: string
    yearMin: number; yearMax: number; count: number; countyBoundaryVintage: string
    unmatchedFips: string[]; unassignedCities: number
  }
  states: Areas
  cityCounty: Record<string, string>
}
export const MISSING_COLOR = '#dedfdb'
export const ZERO_COLOR = '#ffffff'
export function createCountScale(features: AreaFeature[]) {
  const positive = features.flatMap(f => f.properties.count !== null && f.properties.count > 0 ? [f.properties.count] : [])
  const min = positive.length ? Math.min(...positive) : 0
  const max = positive.length ? Math.max(...positive) : 0
  const color = (count: number | null) => {
    if (count === null) return MISSING_COLOR
    if (count === 0) return ZERO_COLOR
    const t = max === min ? 0.5 : Math.max(0, Math.min(1, (Math.sqrt(count) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min))))
    return `hsl(187, 72%, ${94 - 69 * t}%)`
  }
  return { min, max, color }
}
export async function loadGeography(signal?: AbortSignal): Promise<GeographyData> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/shr/index.json`, { signal })
  if (!response.ok) throw new Error(`Could not load geographic counts (${response.status}).`)
  return response.json()
}
const cache = new Map<string, Areas>()
export async function loadCounties(state: string, signal?: AbortSignal): Promise<Areas> {
  const saved = cache.get(state)
  if (saved) return saved
  const response = await fetch(`${import.meta.env.BASE_URL}data/shr/counties/${state}.geojson`, { signal })
  if (!response.ok) throw new Error(`Could not load county boundaries (${response.status}).`)
  const data = await response.json() as Areas
  if (data.features.some(f => f.properties.state_fips !== state)) throw new Error('County geography does not match the selected state.')
  cache.set(state, data)
  return data
}
