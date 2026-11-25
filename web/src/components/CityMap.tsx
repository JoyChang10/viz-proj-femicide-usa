import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { City } from '../types'
import { ClusteredCityMarkers } from './ClusteredCityMarkers'
import { cityRevealZoom, createCityClusterIndex, MAX_MAP_ZOOM, type CityClusterIndex } from '../lib/clustering'
import type { AreaFeature, Areas } from '../lib/geography'
import { geographicDisplayArea, geographicDisplayAreas } from '../lib/mapGeometry'
import { ChoroplethLayer, ChoroplethLegend } from './ChoroplethLayer'
import { NationalOverview } from './NationalOverview'

const tileUrl = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tileAttribution = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function MapControls({ selectedCity, index, focusArea, county, stateOverview, onNational }: {
  selectedCity?: City; index: CityClusterIndex; focusArea?: AreaFeature; county?: AreaFeature
  stateOverview: boolean; onNational: () => void
}) {
  const map = useMap()
  const overviewZoom = useRef<number | undefined>(undefined)
  const previousFocus = useRef<AreaFeature | undefined>(undefined)
  const configuring = useRef(false)
  const returnHome = useRef(onNational)
  returnHome.current = onNational
  useEffect(() => {
    map.getContainer().setAttribute('role', 'region')
    map.getContainer().setAttribute('aria-label', 'Interactive state and county map')
    const zoomEnd = () => {
      if (!configuring.current && overviewZoom.current !== undefined && map.getZoom() <= overviewZoom.current + 0.001) returnHome.current()
    }
    map.on('zoomend', zoomEnd)
    return () => { map.off('zoomend', zoomEnd) }
  }, [map])
  useLayoutEffect(() => {
    const container = map.getContainer()
    const bounds = focusArea && L.geoJSON(geographicDisplayArea(focusArea)).getBounds()
    const fitArea = () => {
      if (!bounds) return
      configuring.current = true
      map.setMinZoom(1)
      map.setMaxBounds(bounds.pad(0.35))
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8, animate: false })
      // One further zoom-out step returns to the complete projected overview.
      overviewZoom.current = Math.max(1, map.getZoom() - 1)
      map.setMinZoom(overviewZoom.current)
      configuring.current = false
    }

    // Read the new layout before fitting. The state legend sits outside this container.
    map.invalidateSize({ animate: false })
    if (stateOverview || previousFocus.current !== focusArea) fitArea()
    previousFocus.current = focusArea

    let width = container.clientWidth
    let height = container.clientHeight
    const observer = new ResizeObserver(() => {
      if (width === container.clientWidth && height === container.clientHeight) return
      width = container.clientWidth
      height = container.clientHeight
      if (!width || !height) return
      map.invalidateSize({ animate: false })
      if (stateOverview) fitArea()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [map, focusArea, stateOverview])
  useEffect(() => {
    if (county) map.fitBounds(L.geoJSON(geographicDisplayArea(county)).getBounds(), { padding: [36, 36], maxZoom: 8, animate: false })
  }, [map, county])
  useEffect(() => {
    if (selectedCity) {
      const longitude = focusArea?.properties.state_abb === 'AK' && selectedCity.longitude > 0 ? selectedCity.longitude - 360 : selectedCity.longitude
      map.setView([selectedCity.latitude, longitude], cityRevealZoom(index, { ...selectedCity, longitude }, map.getZoom()), { animate: false })
    }
  }, [map, selectedCity, index, focusArea])
  return null
}
export function CityMap({ cities, visibleCities, onSelect, selectedCity, resetVersion, areas, nationalStates, state, county, onSelectArea, onNational, years }: {
  cities: City[]; visibleCities: City[]; onSelect: (city: City) => void; selectedCity?: City; resetVersion: number
  areas: Areas; nationalStates: Areas; state?: AreaFeature; county?: AreaFeature
  onSelectArea: (area: AreaFeature) => void; onNational: () => void; years: string
}) {
  const overview = !state && !selectedCity
  const stateOverview = !!state && !county && !selectedCity
  const detailed = !!county || !!selectedCity
  const focusArea = state ?? nationalStates.features.find(f => f.properties.state_abb === selectedCity?.label.slice(-2))
  const displayCities = useMemo(() => focusArea?.properties.state_abb === 'AK'
    ? visibleCities.map(c => c.longitude > 0 ? { ...c, longitude: c.longitude - 360 } : c)
    : visibleCities, [visibleCities, focusArea?.properties.state_abb])
  const index = useMemo(() => createCityClusterIndex(displayCities), [displayCities])
  const displayAreas = useMemo(() => geographicDisplayAreas(areas), [areas])
  const outline = useMemo(() => state && geographicDisplayArea(state), [state])
  const [tileError, setTileError] = useState(false)
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true), tileload: () => setTileError(false) }), [])
  return <div className={`map-frame${overview ? ' national-frame' : stateOverview ? ' state-frame' : ''}`}>
    {overview ? <NationalOverview areas={nationalStates} onSelect={onSelectArea} /> : <MapContainer
      key={resetVersion} center={[38, -98]} zoom={4} minZoom={1} maxZoom={MAX_MAP_ZOOM}
      maxBoundsViscosity={1} scrollWheelZoom keyboard zoomAnimation={false} markerZoomAnimation={false} fadeAnimation={false}
      zoomSnap={0} wheelPxPerZoomLevel={60} className="city-map">
      {detailed && <TileLayer url={tileUrl} attribution={tileAttribution} maxZoom={MAX_MAP_ZOOM} noWrap eventHandlers={tileEvents} />}
      <ChoroplethLayer areas={displayAreas} level={state ? 'county' : 'state'} selectedCounty={county?.properties.fips} onSelect={onSelectArea} />
      {stateOverview && outline && <GeoJSON key={outline.properties.fips} data={outline} interactive={false}
        style={{ className: 'state-outline', color: '#586867', weight: 1.4, fill: false }} />}
      {detailed && <ClusteredCityMarkers index={index} cities={displayCities} scaleCities={cities} onSelect={onSelect} selectedId={selectedCity?.id} />}
      <MapControls selectedCity={selectedCity} index={index} focusArea={focusArea} county={county} stateOverview={stateOverview} onNational={onNational} />
    </MapContainer>}
    <ChoroplethLegend areas={areas} level={state ? 'county' : 'state'} years={years} profiles={detailed} />
    {detailed && tileError && <p className="tile-warning" role="status">Some background tiles could not load. Geographic data remains available.</p>}
  </div>
}
