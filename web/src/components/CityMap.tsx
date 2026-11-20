import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { City } from '../types'
import { ClusteredCityMarkers } from './ClusteredCityMarkers'
import { cityRevealZoom, createCityClusterIndex, MAX_MAP_ZOOM, type CityClusterIndex } from '../lib/clustering'
import type { AreaFeature, Areas } from '../lib/geography'
import { ChoroplethLayer, ChoroplethLegend } from './ChoroplethLayer'

const HOME: L.LatLngBoundsExpression = [[24, -126], [50, -66]]
const tileUrl = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tileAttribution = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function MapControls({ selectedCity, resetVersion, index, state, county }: {
  selectedCity?: City; resetVersion: number; index: CityClusterIndex; state?: AreaFeature; county?: AreaFeature
}) {
  const map = useMap()
  useEffect(() => {
    map.getContainer().setAttribute('role', 'region')
    map.getContainer().setAttribute('aria-label', 'Interactive United States homicide statistics and documented case map')
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useEffect(() => { map.fitBounds(HOME, { padding: [20, 20], animate: false }) }, [map, resetVersion])
  useEffect(() => {
    if (!state) return
    const layer = L.geoJSON(state)
    let bounds = layer.getBounds()
    if (state.properties.fips === '02') bounds = L.latLngBounds([[51, -179], [72, -130]])
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8, animate: false })
  }, [map, state])
  useEffect(() => {
    if (county) map.fitBounds(L.geoJSON(county).getBounds(), { padding: [36, 36], maxZoom: 8, animate: false })
  }, [map, county])
  useEffect(() => {
    if (selectedCity) map.setView([selectedCity.latitude, selectedCity.longitude], cityRevealZoom(index, selectedCity, map.getZoom()), { animate: false })
  }, [map, selectedCity, index])
  return null
}
export function CityMap({ cities, visibleCities, onSelect, selectedCity, resetVersion, areas, state, county, onSelectArea, years }: {
  cities: City[]; visibleCities: City[]; onSelect: (city: City) => void; selectedCity?: City; resetVersion: number
  areas: Areas; state?: AreaFeature; county?: AreaFeature; onSelectArea: (area: AreaFeature) => void; years: string
}) {
  const index = useMemo(() => createCityClusterIndex(visibleCities), [visibleCities])
  const [tileError, setTileError] = useState(false)
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true), tileload: () => setTileError(false) }), [])
  return <div className="map-frame">
    <MapContainer center={[38, -98]} zoom={4} minZoom={2} maxZoom={MAX_MAP_ZOOM}
      maxBounds={[[0, -190], [78, 190]]} maxBoundsViscosity={0.8}
      scrollWheelZoom keyboard zoomAnimation={false} markerZoomAnimation={false} fadeAnimation={false}
      zoomSnap={0} wheelPxPerZoomLevel={60} className="city-map">
      <TileLayer url={tileUrl} attribution={tileAttribution} maxZoom={MAX_MAP_ZOOM} noWrap eventHandlers={tileEvents} />
      <ChoroplethLayer areas={areas} level={state ? 'county' : 'state'} selectedCounty={county?.properties.fips} onSelect={onSelectArea} />
      {(county || selectedCity) && <ClusteredCityMarkers index={index} cities={visibleCities} scaleCities={cities} onSelect={onSelect} selectedId={selectedCity?.id} />}
      <MapControls selectedCity={selectedCity} resetVersion={resetVersion} index={index} state={state} county={county} />
    </MapContainer>
    <ChoroplethLegend areas={areas} level={state ? 'county' : 'state'} years={years} profiles={!!county || !!selectedCity} />
    {tileError && <p className="tile-warning" role="status">Some background tiles could not load. Geographic data remains available.</p>}
  </div>
}
