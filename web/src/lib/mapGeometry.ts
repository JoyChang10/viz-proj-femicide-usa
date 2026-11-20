import type { AreaFeature, Areas } from './geography'

/** Keep Alaska's Aleutian islands together across the antimeridian in Leaflet. */
export function geographicDisplayArea(area: AreaFeature): AreaFeature {
  if (area.properties.state_abb !== 'AK') return area
  const coordinates = (value: unknown): unknown => {
    const list = value as unknown[]
    if (typeof list[0] === 'number') {
      const point = list as number[]
      return [point[0] > 0 ? point[0] - 360 : point[0], ...point.slice(1)]
    }
    return list.map(coordinates)
  }
  return { ...area, geometry: { ...area.geometry, coordinates: coordinates(area.geometry.coordinates) } as AreaFeature['geometry'] }
}
export function geographicDisplayAreas(areas: Areas): Areas {
  return { ...areas, features: areas.features.map(geographicDisplayArea) }
}
