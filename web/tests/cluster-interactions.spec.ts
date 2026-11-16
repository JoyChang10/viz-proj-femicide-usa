import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createCityClusterIndex, MAX_MAP_ZOOM } from '../src/lib/clustering'
import type { DataIndex } from '../src/types'

const data = JSON.parse(readFileSync('public/data/index.json', 'utf-8')) as DataIndex
const index = createCityClusterIndex(data.cities)
const houston = data.cities.find(city => city.label === 'Houston, TX')!

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('.case-cluster-marker').first()).toBeVisible()
}

async function ancestorCluster(page: Page, cityId: string) {
  const ids = await page.locator('[data-cluster-id]').evaluateAll(nodes => nodes.map(node => Number((node as HTMLElement).dataset.clusterId)))
  return ids.find(id => index.getLeaves(id, Infinity).some(leaf => leaf.properties.cityId === cityId))
}

test('national clusters show exact case sums, bounded sizes, and geographic hover feedback', async ({ page }) => {
  await ready(page)
  const clusters = await page.locator('.case-cluster-marker').evaluateAll(nodes => nodes.map(node => {
    const count = node.querySelector<HTMLElement>('[data-cluster-id]')!
    return { id: Number(count.dataset.clusterId), cases: Number(count.dataset.caseCount),
      cities: Number(count.dataset.cityCount), text: count.textContent, width: node.getBoundingClientRect().width }
  }))
  expect(clusters.length).toBeGreaterThan(0)
  expect(clusters.length).toBeLessThan(data.cities.length / 5)
  let weighted = false
  for (const cluster of clusters) {
    const leaves = index.getLeaves(cluster.id, Infinity)
    expect(cluster.cases).toBe(leaves.reduce((sum, leaf) => sum + leaf.properties.caseCount, 0))
    expect(cluster.cities).toBe(leaves.length)
    expect(cluster.text).toBe(cluster.cases.toLocaleString('en-US'))
    expect(cluster.width).toBeGreaterThanOrEqual(34)
    expect(cluster.width).toBeLessThanOrEqual(62)
    weighted ||= cluster.cases > cluster.cities
  }
  expect(weighted).toBe(true)
  const id = await ancestorCluster(page, houston.id)
  await page.locator(`.case-cluster-marker:has([data-cluster-id="${id}"])`).hover()
  await expect(page.locator('.leaflet-tooltip')).toContainText('documented cases across')
  await expect(page.locator('.method-note')).toContainText('not exact incident locations')
})

test('clicks guide national clusters through smaller groups to a city and the existing victim profile', async ({ page }) => {
  const errors: string[] = []
  const profileRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/data/cities/')) profileRequests.push(request.url()) })
  await ready(page)
  let clicks = 0
  const cityMarker = page.locator(`.single-city-marker:has([data-city-id="${houston.id}"])`)
  while (await cityMarker.count() === 0 && clicks < MAX_MAP_ZOOM) {
    const id = await ancestorCluster(page, houston.id)
    expect(id).toBeDefined()
    const marker = page.locator(`.case-cluster-marker:has([data-cluster-id="${id}"])`)
    const oldTile = await page.locator('.leaflet-tile').first().getAttribute('src')
    await marker.click()
    await expect(marker).toHaveCount(0)
    await expect(page.locator('.city-map')).not.toHaveClass(/leaflet-zoom-anim/)
    await expect.poll(() => page.locator('.leaflet-tile').first().getAttribute('src')).not.toBe(oldTile)
    clicks++
  }
  expect(clicks).toBeGreaterThan(0)
  expect(profileRequests).toHaveLength(0)
  await expect(cityMarker).toBeInViewport()
  await cityMarker.hover()
  await expect(page.locator('.leaflet-tooltip')).toContainText(`${houston.label} · ${houston.caseCount}`)
  await cityMarker.click()
  await expect(page.locator('#city-title')).toHaveText(houston.label)
  await expect(page.locator('.victim-dot-grid .victim-dot')).toHaveCount(houston.caseCount)
  const firstCase = page.locator('.victim-dot-grid .victim-dot').first()
  const id = await firstCase.getAttribute('data-case-id')
  const name = (JSON.parse(readFileSync(`public/data/cities/${houston.id}.json`, 'utf-8')).cases as { id: string; name: string }[]).find(record => record.id === id)!.name
  await firstCase.click()
  await expect(page.getByTestId('victim-profile')).toHaveAttribute('data-case-id', id!)
  await expect(page.locator('#profile-name')).toHaveText(name)
  await page.getByRole('button', { name: 'Close victim profile' }).click()
  await expect(page.getByTestId('victim-profile')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator('.case-cluster-marker').first()).toBeVisible()
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  expect(errors).toEqual([])
})

test('clusters can be opened with the keyboard and reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  const id = await ancestorCluster(page, houston.id)
  expect(id).toBeDefined()
  const cluster = page.locator(`.case-cluster-marker:has([data-cluster-id="${id}"])`)
  await cluster.focus()
  await page.keyboard.press('Enter')
  await expect(cluster).toHaveCount(0)
  await expect(page.locator('.city-map')).not.toHaveClass(/leaflet-zoom-anim/)
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(cluster).toHaveCount(1)
  await cluster.focus()
  await page.keyboard.press('Space')
  await expect(cluster).toHaveCount(0)
})

test('zoom limit removes geographic clusters; reset interrupts a cluster flight and restores national markers', async ({ page }) => {
  await ready(page)
  const initialCount = await page.locator('.case-cluster-marker').count()
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true })
  for (let i = 0; i < MAX_MAP_ZOOM && await zoomIn.getAttribute('aria-disabled') !== 'true'; i++) {
    await zoomIn.click()
    await expect(page.locator('.city-map')).not.toHaveClass(/leaflet-zoom-anim/)
  }
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.case-cluster-marker')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator('.case-cluster-marker')).toHaveCount(initialCount)
  const id = await ancestorCluster(page, houston.id)
  await page.locator(`.case-cluster-marker:has([data-cluster-id="${id}"])`).click()
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator('.case-cluster-marker')).toHaveCount(initialCount)
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /\/4\//)
  // A reset must also win immediately after a zoom-control click.
  await zoomIn.click()
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator('.case-cluster-marker')).toHaveCount(initialCount)
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /\/4\//)
})

test('panning updates viewport clusters without changing their case totals and reset restores the overview', async ({ page }) => {
  await ready(page)
  const clusterIds = () => page.locator('[data-cluster-id]').evaluateAll(nodes => nodes.map(node => Number((node as HTMLElement).dataset.clusterId)).sort((a, b) => a - b))
  const initial = await clusterIds()
  const bounds = (await page.locator('.city-map').boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.85)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.85, { steps: 20 })
  await page.mouse.up()
  await expect.poll(clusterIds).not.toEqual(initial)
  const visible = await page.locator('[data-cluster-id]').evaluateAll(nodes => nodes.map(node => ({
    id: Number((node as HTMLElement).dataset.clusterId), count: Number((node as HTMLElement).dataset.caseCount),
  })))
  expect(visible.length).toBeGreaterThan(0)
  for (const cluster of visible) {
    expect(cluster.count).toBe(index.getLeaves(cluster.id, Infinity).reduce((sum, leaf) => sum + leaf.properties.caseCount, 0))
  }
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect.poll(clusterIds).toEqual(initial)
})
