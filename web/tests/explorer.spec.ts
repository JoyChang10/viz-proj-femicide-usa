import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { City, DataIndex, VictimCase } from '../src/types'

const index = JSON.parse(readFileSync('public/data/index.json', 'utf-8')) as DataIndex
const houston = index.cities.find(c => c.label === 'Houston, TX')!
const houstonCases = (JSON.parse(readFileSync(`public/data/cities/${houston.id}.json`, 'utf-8')) as { cases: VictimCase[] }).cases
const sortedCases = [...houstonCases].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  await expect(page.locator('.case-cluster-marker').first()).toBeVisible()
}

async function selectCity(page: Page, city: City) {
  await page.getByLabel('Choose a city').selectOption(city.id)
  await expect(page.locator('#city-title')).toHaveText(city.label)
  await expect(page.locator('.victim-dot-grid .victim-dot')).toHaveCount(city.caseCount)
}

test('map renders real tiles, zooms, pans, enforces city-scale zoom, and resets', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await ready(page)
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 30_000 })
  expect(await page.locator('.leaflet-tile-loaded').first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const pane = page.locator('.leaflet-map-pane')
  const initial = await pane.getAttribute('style')
  const tiles = await page.locator('.leaflet-tile').first().getAttribute('src')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(() => page.locator('.leaflet-tile').first().getAttribute('src')).not.toBe(tiles)
  const box = (await page.locator('.city-map').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => pane.getAttribute('style')).not.toBe(initial)
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true })
  for (let i = 0; i < 10 && await zoomIn.getAttribute('aria-disabled') !== 'true'; i++) {
    await zoomIn.click()
    await expect(page.locator('.city-map')).not.toHaveClass(/leaflet-zoom-anim/)
  }
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /\/10\//)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'false')
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  // A reset rebuilds Leaflet's pixel origin, so compare geographic tile URLs,
  // rather than the map pane's internal CSS translation.
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', tiles!)
  expect(errors).toEqual([])
})

test('clicking an actual city marker opens its cases and correct profile; close preserves map and list position', async ({ page }) => {
  await ready(page)
  await selectCity(page, houston)
  await page.getByRole('button', { name: 'Close city cases' }).click()
  // The dropdown reveals the city outside its cluster. Click its actual marker.
  await page.locator(`.single-city-marker:has([data-city-id="${houston.id}"])`).click()
  await expect(page.locator('#city-title')).toHaveText('Houston, TX')
  await expect(page.locator('.victim-dot-grid .victim-dot')).toHaveCount(houston.caseCount)
  const caseToOpen = page.locator(`[data-case-id="${sortedCases[sortedCases.length - 2].id}"]`)
  await caseToOpen.scrollIntoViewIfNeeded()
  const scrollBefore = await page.locator('.victim-dot-grid').evaluate(el => el.scrollTop)
  const mapBefore = await page.locator('.leaflet-map-pane').getAttribute('style')
  await caseToOpen.click()
  const profile = page.getByTestId('victim-profile')
  await expect(profile).toHaveAttribute('data-case-id', sortedCases[sortedCases.length - 2].id)
  await expect(page.locator('#profile-name')).toHaveText(sortedCases[sortedCases.length - 2].name)
  await expect(profile).toContainText(sortedCases[sortedCases.length - 2].age ?? 'Not documented')
  await expect(profile).toContainText('Houston, TX')
  await expect(profile).toContainText('city-level location')
  await page.getByRole('button', { name: 'Close victim profile' }).click()
  await expect(profile).toHaveCount(0)
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(mapBefore)
  expect(await page.locator('.victim-dot-grid').evaluate(el => el.scrollTop)).toBe(scrollBefore)
  await caseToOpen.click()
  await page.keyboard.press('Escape')
  await expect(profile).toHaveCount(0)
  await caseToOpen.click()
  await page.getByRole('button', { name: 'Back to city cases' }).click()
  await expect(profile).toHaveCount(0)
  await caseToOpen.click()
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(profile).toHaveCount(0)
  await expect(page.locator('#city-title')).toHaveCount(0)
  await expect(page.getByLabel('Choose a city')).toBeVisible()
})

test('rapid city changes cannot display stale cases; Alaska and Hawaii are reachable', async ({ page }) => {
  await ready(page)
  await page.route(`**/cities/${houston.id}.json`, async route => {
    await new Promise(resolve => setTimeout(resolve, 600))
    await route.continue().catch(() => {})
  })
  await page.getByLabel('Choose a city').selectOption(houston.id)
  await page.getByRole('button', { name: 'Close city cases' }).click()
  const anchorage = index.cities.find(c => c.label === 'Anchorage, AK')!
  await selectCity(page, anchorage)
  await expect(page.locator('#city-title')).toHaveText('Anchorage, AK')
  await expect(page.locator('.victim-dot-grid .victim-dot')).toHaveCount(anchorage.caseCount)
  await page.getByRole('button', { name: 'Close city cases' }).click()
  const honolulu = index.cities.find(c => c.label === 'Honolulu, HI')!
  await selectCity(page, honolulu)
  await expect(page.locator('#city-title')).toHaveText('Honolulu, HI')
})

test('data loading failures have a working retry', async ({ page }) => {
  let fail = true
  await page.route('**/data/index.json', route => fail ? route.fulfill({ status: 503 }) : route.continue())
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Data could not be loaded')
  fail = false
  await page.getByRole('button', { name: 'Retry loading' }).click()
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  await page.route(`**/cities/${houston.id}.json`, route => fail ? route.continue() : route.fulfill({ status: 503 }))
  await page.getByLabel('Choose a city').selectOption(houston.id)
  await expect(page.getByRole('alert')).toContainText('503')
  fail = true
  await page.getByRole('button', { name: 'Retry cases' }).click()
  await expect(page.locator('.victim-dot-grid .victim-dot')).toHaveCount(houston.caseCount)
})

test('mobile layout keeps map, profile, and attribution accessible without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await selectCity(page, houston)
  await page.locator('.victim-dot-grid .victim-dot').first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.locator('.leaflet-control-attribution')).toBeVisible()
})

test('missing age is explicit and a year-only date does not imply an exact day', async ({ page }) => {
  await ready(page)
  await selectCity(page, houston)
  const record = houstonCases.find(r => r.age === null && r.dateDetail === 'YEAR OF DEATH')!
  expect(record).toBeDefined()
  await page.locator(`[data-case-id="${record.id}"]`).click()
  const profile = page.getByTestId('victim-profile')
  await expect(profile.locator('dt', { hasText: /^Age$/ }).locator('..').locator('dd')).toHaveText('Not documented')
  await expect(profile.locator('dt', { hasText: /^year of death$/ }).locator('..').locator('dd')).toHaveText(record.date!.slice(0, 4))
})
