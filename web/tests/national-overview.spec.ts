import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { geographicDisplayArea } from '../src/lib/mapGeometry'
import { createCountScale, type GeographyData } from '../src/lib/geography'
import type { DataIndex } from '../src/types'

test.describe.configure({ timeout: 90_000 })

const geo = JSON.parse(readFileSync('public/data/shr/index.json', 'utf8')) as GeographyData
const data = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as DataIndex

test('national overview fits the 50 states and DC, stays fixed, and has interactive Alaska/Hawaii insets', async ({ page }) => {
  await page.goto('/')
  const overview = page.locator('.national-overview')
  await expect(overview).toBeVisible()
  await expect(overview.locator('path[data-level=state]')).toHaveCount(51)
  await expect(page.locator('.leaflet-tile')).toHaveCount(0)
  const paths = await overview.locator('path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')))
  const box = (await overview.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  expect(await overview.locator('path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')))).toEqual(paths)
  // A drag that begins and ends on the same state must not become a click.
  const texas = (await overview.locator('[data-area-fips="48"]').boundingBox())!
  await page.mouse.move(texas.x + texas.width * 0.5, texas.y + texas.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(texas.x + texas.width * 0.5 + 15, texas.y + texas.height * 0.55 + 15, { steps: 5 })
  await page.mouse.up()
  await expect(overview).toBeVisible()
  for (const [fips, name] of [['02', 'Alaska'], ['15', 'Hawaii']]) {
    const area = overview.locator(`[data-area-fips="${fips}"]`)
    await expect(area).toBeVisible()
    await area.focus()
    await expect(page.getByRole('tooltip')).toContainText(name)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Choose a county', { exact: true })).toBeVisible()
    await expect(page.locator('#area-title')).toHaveText(name)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    await expect(overview).toBeVisible()
  }
  await page.screenshot({ path: 'test-results/us-overview-desktop.png' })
})

test('Alaska and Hawaii retain real county/city locations and correct profiles', async ({ page }) => {
  for (const [state, county, label] of [['02', '02020', 'Anchorage, AK'], ['15', '15003', 'Honolulu, HI']]) {
    await page.goto('/')
    await page.getByLabel('Choose a state or territory').selectOption(state)
    await page.getByLabel('Choose a county', { exact: true }).selectOption(county)
    const city = data.cities.find(c => c.label === label)!
    await page.getByLabel('Choose a city', { exact: true }).selectOption(city.id)
    await expect(page.locator('.victim-dot')).toHaveCount(city.caseCount)
    const marker = page.locator(`.single-city-marker:has([data-city-id="${city.id}"])`)
    await expect(marker).toBeVisible()
    await page.locator('.victim-dot').first().click()
    const id = await page.getByTestId('victim-profile').getAttribute('data-case-id')
    const record = JSON.parse(readFileSync(`public/data/cities/${city.id}.json`, 'utf8')).cases.find((r: {id:string}) => r.id === id)
    await expect(page.locator('#profile-name')).toHaveText(record.name)
    await page.getByRole('button', { name: 'Back to city cases' }).click()
    await expect(page.locator('.victim-dot')).toHaveCount(city.caseCount)
    await page.getByRole('button', { name: 'Reset Map' }).click()
    await expect(page.locator('.national-overview')).toBeVisible()
  }
})

test('state navigation is bounded and zoom controls return to the overview', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await expect(page.getByLabel('Choose a county', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const map = page.locator('.city-map'), pane = page.locator('.leaflet-map-pane')
  const before = await pane.getAttribute('style'), box = (await map.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => pane.getAttribute('style')).not.toBe(before)
  for (let i = 0; i < 10 && await page.locator('.leaflet-control-zoom-out').count(); i++) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  }
  await expect(page.locator('.national-overview')).toBeVisible()
})

test('insets remain visible on small screens and cyan scale stays continuous', async ({ page }) => {
  const scale = createCountScale(geo.states.features)
  expect(scale.color(scale.min)).toMatch(/^hsl\(187,/)
  expect(scale.color(scale.max)).not.toBe(scale.color(scale.min))
  const alaska = geo.states.features.find(f => f.properties.fips === '02')!
  const original = JSON.stringify(alaska)
  const shifted = geographicDisplayArea(alaska)
  expect(JSON.stringify(alaska)).toBe(original)
  const numbers = JSON.stringify(shifted.geometry.coordinates)
  expect(numbers).toContain('-17')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overview = page.locator('.national-overview'), bounds = (await overview.boundingBox())!
  for (const fips of ['02', '15']) {
    const inset = overview.locator(`[data-area-fips="${fips}"]`)
    await expect(inset).toBeVisible()
    const box = (await inset.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(bounds.x)
    expect(box.y).toBeGreaterThanOrEqual(bounds.y)
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/us-overview-mobile.png', fullPage: true })
})
