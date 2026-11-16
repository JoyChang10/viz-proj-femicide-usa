import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { City } from '../types'
import { ClusteredCityMarkers } from './ClusteredCityMarkers'
import { cityRevealZoom, createCityClusterIndex, MAX_MAP_ZOOM, type CityClusterIndex } from '../lib/clustering'

const HOME: L.LatLngBoundsExpression = [[24, -126], [50, -66]]
const tileUrl = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tileAttribution = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function MapControls({ selectedCity, resetVersion, index }: { selectedCity?: City; resetVersion: number; index: CityClusterIndex }) {
  const map = useMap()
  useEffect(() => {
    map.getContainer().setAttribute('role', 'region')
    map.getContainer().setAttribute('aria-label', 'Interactive United States map of documented cases')
  }, [map])
  useEffect(() => {
    // fitBounds/setView cancel active flights themselves. Calling stop() first
    // can schedule a competing animated zoom when a flight is between levels.
    map.fitBounds(HOME, { padding: [20, 20], animate: false })
  }, [map, resetVersion])
  useEffect(() => {
    if (selectedCity) {
      map.setView([selectedCity.latitude, selectedCity.longitude], cityRevealZoom(index, selectedCity, map.getZoom()), { animate: false })
    }
  }, [map, selectedCity, index])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

export function CityMap({ cities, onSelect, selectedCity, resetVersion }: {
  cities: City[]; onSelect: (city: City) => void; selectedCity?: City; resetVersion: number
}) {
  const index = useMemo(() => createCityClusterIndex(cities), [cities])
  const [tileError, setTileError] = useState(false)
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true), tileload: () => setTileError(false) }), [])
  // Fractional wheel zoom avoids turning tiny trackpad deltas into full levels.
  // Keep CSS zoom animations off so gestures and Reset Map never compete.
  return <div className="map-frame">
    <MapContainer center={[38, -98]} zoom={4} minZoom={2} maxZoom={MAX_MAP_ZOOM}
      maxBounds={[[0, -190], [78, -45]]} maxBoundsViscosity={0.8}
      scrollWheelZoom keyboard zoomAnimation={false} markerZoomAnimation={false} fadeAnimation={false}
      zoomSnap={0} wheelPxPerZoomLevel={60}
      aria-label="Interactive United States map of documented cases" className="city-map">
      <TileLayer url={tileUrl} attribution={tileAttribution} maxZoom={MAX_MAP_ZOOM} noWrap eventHandlers={tileEvents} />
      <ClusteredCityMarkers index={index} cities={cities} onSelect={onSelect} selectedId={selectedCity?.id} />
      <MapControls selectedCity={selectedCity} resetVersion={resetVersion} index={index} />
    </MapContainer>
    <div className="map-legend"><span className="legend-cluster" aria-hidden="true">123</span> Cases in nearby cities <span className="legend-dot" aria-hidden="true" /> City</div>
    {tileError && <p className="tile-warning" role="status">Some background map tiles could not load. City markers and the city list remain available. Check your internet connection.</p>}
  </div>
}
