import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createCityDiameterScale, MIN_CITY_DIAMETER, MAX_CITY_DIAMETER } from '../src/lib/cityMarkerScale'
import type { DataIndex } from '../src/types'

const data = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as DataIndex
const counts = [...new Set(data.cities.map(city => city.caseCount))].sort((a, b) => a - b)

test('city sizes use the actual full count domain and increase continuously in area', () => {
  const diameter = createCityDiameterScale(data.cities)
  const minimum = counts[0], maximum = counts.at(-1)!
  expect(diameter(minimum)).toBe(MIN_CITY_DIAMETER)
  expect(diameter(maximum)).toBe(MAX_CITY_DIAMETER)
  let previous = 0
  for (const count of counts) {
    const size = diameter(count)
    expect(size).toBeGreaterThan(previous)
    const normalizedArea = (size ** 2 - diameter(minimum) ** 2) / (diameter(maximum) ** 2 - diameter(minimum) ** 2)
    expect(normalizedArea).toBeCloseTo((count - minimum) / (maximum - minimum), 10)
    previous = size
  }
})

test('changing dataset extremes changes the scale without predefined count categories', () => {
  const first = createCityDiameterScale([{ caseCount: 10 }, { caseCount: 500 }])
  const second = createCityDiameterScale([{ caseCount: 10 }, { caseCount: 5000 }])
  expect(first(10)).toBe(MIN_CITY_DIAMETER)
  expect(first(500)).toBe(MAX_CITY_DIAMETER)
  expect(second(5000)).toBe(MAX_CITY_DIAMETER)
  expect(second(500)).toBeLessThan(first(500))
  expect(first(49.9)).toBeLessThan(first(50))
  expect(first(50)).toBeLessThan(first(50.1))
})

test('empty and constant-count datasets have finite bounded marker sizes', () => {
  expect(createCityDiameterScale([])(1)).toBe(MIN_CITY_DIAMETER)
  const constant = createCityDiameterScale([{ caseCount: 243 }, { caseCount: 243 }])
  expect(constant(243)).toBe(MIN_CITY_DIAMETER)
  const scale = createCityDiameterScale(data.cities)
  expect(scale(0)).toBe(MIN_CITY_DIAMETER)
  expect(scale(counts.at(-1)! * 2)).toBe(MAX_CITY_DIAMETER)
})

test('real city circles stay scaled through hover, selection, profile opening, and city changes', async ({ page }) => {
  await page.goto('/')
  const largest = data.cities.find(city => city.caseCount === counts.at(-1))!
  const smallest = data.cities.find(city => city.caseCount === counts[0])!
  await page.getByLabel('Choose a city').selectOption(largest.id)
  await expect(page.locator('.victim-dot')).toHaveCount(largest.caseCount)
  const marker = page.locator(`.single-city-marker:has([data-city-id="${largest.id}"])`)
  const circle = marker.locator('.marker-count')
  await expect(circle).toHaveCSS('width', `${MAX_CITY_DIAMETER}px`)
  await marker.hover()
  await expect(page.locator('.leaflet-tooltip')).toHaveText(`${largest.label} · ${largest.caseCount.toLocaleString('en-US')} cases`)
  await expect(circle).toHaveCSS('width', `${MAX_CITY_DIAMETER}px`)
  await page.locator('.victim-dot').first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  await expect(circle).toHaveCSS('width', `${MAX_CITY_DIAMETER}px`)
  await page.getByRole('button', { name: 'Back to city cases' }).click()
  await page.getByRole('button', { name: 'Close city cases' }).click()
  await expect(marker).not.toHaveClass(/is-selected/)
  await expect(circle).toHaveCSS('width', `${MAX_CITY_DIAMETER}px`)
  await page.getByLabel('Choose a city').selectOption(smallest.id)
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  const smallMarker = page.locator(`.single-city-marker:has([data-city-id="${smallest.id}"])`)
  await smallMarker.hover()
  await expect(smallMarker.locator('.marker-count')).toHaveCSS('width', `${MIN_CITY_DIAMETER}px`)
  await expect(page.locator('.leaflet-tooltip')).toHaveText(`${smallest.label} · ${smallest.caseCount} case`)
})

test('visible city sizes use the global scale even when the viewport shows only one region', async ({ page }) => {
  await page.goto('/')
  const target = data.cities.find(city => city.label === 'Houston, TX')!
  await page.getByLabel('Choose a city').selectOption(target.id)
  await expect(page.locator('.victim-dot')).toHaveCount(target.caseCount)
  const circles = await page.locator('.single-city-marker .marker-count').evaluateAll(nodes => nodes.map(node => ({
    count: Number((node as HTMLElement).dataset.caseCount), size: node.getBoundingClientRect().width,
  })))
  const diameter = createCityDiameterScale(data.cities)
  expect(circles.length).toBeGreaterThan(1)
  for (const circle of circles) expect(circle.size).toBeCloseTo(diameter(circle.count), 1)
  expect(new Set(circles.map(circle => circle.size)).size).toBeGreaterThan(1)
})
