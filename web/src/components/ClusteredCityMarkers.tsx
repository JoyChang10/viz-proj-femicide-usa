import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { City } from '../types'
import { number } from '../lib/data'
import { createCityDiameterScale } from '../lib/cityMarkerScale'
import {
  clusterDiameter, isCluster, MAX_MAP_ZOOM,
  type CaseCluster, type CityClusterIndex, type MapFeature,
} from '../lib/clustering'

interface Props {
  index: CityClusterIndex
  cities: City[]
  onSelect: (city: City) => void
  selectedId?: string
}

function featureKey(feature: MapFeature) {
  return isCluster(feature) ? `cluster:${feature.properties.cluster_id}` : `city:${feature.properties.cityId}`
}

function markerIcon(feature: MapFeature, cityDiameter: (count: number) => number) {
  const clustered = isCluster(feature)
  const diameter = clustered ? clusterDiameter(feature.properties.caseCount) : cityDiameter(feature.properties.caseCount)
  // City circles have a white 2px halo and retain a useful minimum hit target.
  const size = clustered ? diameter : Math.max(22, diameter + 4)
  const content = document.createElement('span')
  content.className = 'marker-count'
  content.textContent = clustered ? number(feature.properties.caseCount) : ''
  // These attributes also make counts and identities inspectable without a map global.
  content.dataset.caseCount = String(feature.properties.caseCount)
  if (clustered) {
    content.dataset.clusterId = String(feature.properties.cluster_id)
    content.dataset.cityCount = String(feature.properties.point_count)
  } else {
    content.dataset.cityId = feature.properties.cityId
    content.style.width = `${diameter}px`
    content.style.height = `${diameter}px`
  }
  return L.divIcon({
    className: clustered ? 'case-cluster-marker' : 'single-city-marker',
    html: content, iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}

function zoomToCluster(map: L.Map, index: CityClusterIndex, feature: CaseCluster) {
  const id = feature.properties.cluster_id
  const expansionZoom = Math.min(MAX_MAP_ZOOM, index.getClusterExpansionZoom(id))
  const leaves = index.getLeaves(id, Infinity)
  const bounds = L.latLngBounds(leaves.map(leaf => {
    const [lng, lat] = leaf.geometry.coordinates
    return L.latLng(lat, lng)
  }))
  const padding = L.point(40, 40)
  const boundsZoom = map.getBoundsZoom(bounds, false, padding.multiplyBy(2))
  // Fit every constituent city when it also makes forward progress. A broad
  // cluster can need a closer view to split; in that case use its expansion zoom.
  const zoom = Math.min(MAX_MAP_ZOOM, Math.max(Math.floor(map.getZoom()) + 1, expansionZoom, boundsZoom))
  const options = { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 0.45 }
  if (boundsZoom >= expansionZoom && boundsZoom > map.getZoom()) {
    map.flyToBounds(bounds, { ...options, padding, maxZoom: MAX_MAP_ZOOM })
  } else {
    const [lng, lat] = feature.geometry.coordinates
    map.flyTo([lat, lng], zoom, options)
  }
}

export function ClusteredCityMarkers({ index, cities, onSelect, selectedId }: Props) {
  const map = useMap()
  const markers = useRef(new Map<string, L.Marker>())
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selectedId)
  onSelectRef.current = onSelect
  selectedRef.current = selectedId

  useEffect(() => {
    const layer = L.layerGroup().addTo(map)
    const current = markers.current
    const cityById = new Map(cities.map(city => [city.id, city]))
    const cityDiameter = createCityDiameterScale(cities)
    let frame: number | undefined
    const update = () => {
      const bounds = map.getBounds().pad(0.15)
      const features = index.getClusters([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], Math.floor(map.getZoom()))
      const nextKeys = new Set(features.map(featureKey))
      for (const [key, marker] of current) {
        if (!nextKeys.has(key)) { layer.removeLayer(marker); current.delete(key) }
      }
      for (const feature of features) {
        const key = featureKey(feature)
        if (current.has(key)) continue
        const [lng, lat] = feature.geometry.coordinates
        const cluster = isCluster(feature)
        const count = number(feature.properties.caseCount)
        const label = cluster
          ? `${count} documented cases across ${number(feature.properties.point_count)} cities. Click to zoom in.`
          : `${feature.properties.label} · ${count} ${feature.properties.caseCount === 1 ? 'case' : 'cases'}`
        const tip = document.createElement('span')
        tip.textContent = label
        const marker = L.marker([lat, lng], {
          icon: markerIcon(feature, cityDiameter), title: label, alt: label,
          keyboard: true, riseOnHover: true, autoPanOnFocus: false,
          zIndexOffset: key === `city:${selectedRef.current}` ? 1000 : 0,
        }).bindTooltip(tip).on('click', () => {
          if (isCluster(feature)) zoomToCluster(map, index, feature)
          else {
            const city = cityById.get(feature.properties.cityId)
            if (city) onSelectRef.current(city)
          }
        }).addTo(layer)
        const element = marker.getElement()
        element?.setAttribute('aria-label', label)
        if (element) {
          // Leaflet 1.9 gives div markers a button role and tab stop, but does
          // not translate Enter/Space into clicks for a marker without a popup.
          const activate = (event: KeyboardEvent) => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
              event.preventDefault()
              event.stopPropagation()
              if (cluster) map.getContainer().focus({ preventScroll: true })
              marker.fire('click')
            }
          }
          element.addEventListener('keydown', activate)
          marker.on('remove', () => element.removeEventListener('keydown', activate))
        }
        if (!cluster && feature.properties.cityId === selectedRef.current) element?.classList.add('is-selected')
        current.set(key, marker)
      }
    }
    // Retain unchanged markers (and their focus) instead of rebuilding the layer
    // on every pan. A single frame coalesces zoomend and moveend notifications.
    const scheduleUpdate = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { frame = undefined; update() })
    }
    update()
    map.on('zoomend moveend resize', scheduleUpdate)
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      map.off('zoomend moveend resize', scheduleUpdate)
      current.clear()
      layer.remove()
    }
  }, [map, index, cities])

  useEffect(() => {
    markers.current.forEach((marker, key) => {
      const selected = key === `city:${selectedId}`
      marker.getElement()?.classList.toggle('is-selected', selected)
      marker.setZIndexOffset(selected ? 1000 : 0)
    })
  }, [selectedId])
  return null
}
