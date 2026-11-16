import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { City, DataIndex, VictimCase } from '../src/types'

const data = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as DataIndex
const city = (label: string) => data.cities.find(c => c.label === label)!
const single = city('Aberdeen, ID')
const small = city('Carnation, WA')
const fifteen = city('Corpus Christi, TX')
const large = city('Houston, TX')
const dots = '.victim-dot-grid .victim-dot'
function recordsFor(selected: City) {
  return (JSON.parse(readFileSync(`public/data/cities/${selected.id}.json`, 'utf8')).cases as VictimCase[])
    .sort((a, b) => a.name.localeCompare(b.name, 'en-US') || a.id.localeCompare(b.id, 'en-US'))
}

async function choose(page: Page, selected: City) {
  await page.getByLabel('Choose a city').selectOption(selected.id)
  if (selected.caseCount === 1) await expect(page.getByTestId('victim-profile')).toBeVisible()
  else {
    await expect(page.locator('#city-title')).toHaveText(selected.label)
    await expect(page.locator(dots)).toHaveCount(selected.caseCount)
  }
}

async function previewAboveGrid(page: Page) {
  const preview = (await page.getByRole('tooltip').boundingBox())!
  const grid = (await page.locator('.victim-dot-grid').boundingBox())!
  expect(preview.y + preview.height).toBeLessThanOrEqual(grid.y)
  expect(preview.x).toBeGreaterThanOrEqual(grid.x - 1)
  expect(preview.x + preview.width).toBeLessThanOrEqual(grid.x + grid.width + 1)
}

// Exercise every real button's React click handler and rendered profile in the
// browser. Mutation observers avoid imposing hundreds of artificial mouse delays.
async function openEveryDot(page: Page) {
  return page.evaluate(async () => {
    const root = document.getElementById('root')!
    const waitFor = (check: () => boolean) => new Promise<void>((resolve, reject) => {
      if (check()) { resolve(); return }
      const observer = new MutationObserver(() => {
        if (check()) { observer.disconnect(); clearTimeout(timer); resolve() }
      })
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Profile transition did not complete')) }, 5000)
      observer.observe(root, { childList: true, subtree: true, attributes: true })
    })
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.victim-dot-grid .victim-dot'))
    const results: { expectedId: string; actualId: string; name: string }[] = []
    for (const button of buttons) {
      button.click()
      await waitFor(() => !!document.querySelector('[data-testid="victim-profile"]'))
      const profile = document.querySelector<HTMLElement>('[data-testid="victim-profile"]')!
      results.push({ expectedId: button.dataset.caseId!, actualId: profile.dataset.caseId!,
        name: document.getElementById('profile-name')!.textContent! })
      profile.querySelector<HTMLButtonElement>('[aria-label="Close victim profile"]')!.click()
      await waitFor(() => !document.querySelector('[data-testid="victim-profile"]'))
    }
    return results
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Choose a city')).toBeVisible()
})

test('one-case city opens its profile directly, closes reliably, and reopens from its city marker', async ({ page }) => {
  const expected = recordsFor(single)[0]
  await choose(page, single)
  const profile = page.getByTestId('victim-profile')
  await expect(profile).toHaveAttribute('data-case-id', expected.id)
  await expect(page.locator('#profile-name')).toHaveText(expected.name)
  await expect(page.locator(dots)).toHaveCount(0)
  const mapBefore = await page.locator('.leaflet-map-pane').getAttribute('style')
  await page.getByRole('button', { name: 'Close victim profile' }).click()
  await expect(page.getByLabel('Choose a city')).toBeVisible()
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(mapBefore)
  await page.locator(`.single-city-marker:has([data-city-id="${single.id}"])`).click()
  await expect(profile).toHaveAttribute('data-case-id', expected.id)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(profile).toHaveCount(0)
})

for (const selected of [small, fifteen, large]) {
  test(`${selected.caseCount}-case city uses the panel grid and every dot opens its correct victim`, async ({ page }) => {
    test.setTimeout(120_000)
    await choose(page, selected)
    const expected = recordsFor(selected)
    const ids = await page.locator(dots).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.caseId))
    expect(ids).toEqual(expected.map(record => record.id))
    expect(new Set(ids).size).toBe(selected.caseCount)
    // Individual victims never appear in the geographic map.
    await expect(page.locator('.city-map [data-case-id]')).toHaveCount(0)
    await expect(page.locator('.city-map .leaflet-overlay-pane path')).toHaveCount(0)
    const grid = page.locator('.victim-dot-grid')
    const beforeHover = await grid.boundingBox()
    await page.locator(dots).first().hover()
    await expect(page.getByRole('tooltip')).toContainText(expected[0].name)
    await previewAboveGrid(page)
    expect(await grid.boundingBox()).toEqual(beforeHover)
    const results = await openEveryDot(page)
    expect(results).toEqual(expected.map(record => ({ expectedId: record.id, actualId: record.id, name: record.name })))
    expect(await page.locator(dots).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.caseId))).toEqual(ids)
    await page.getByRole('button', { name: 'Close city cases' }).click()
    await expect(page.locator(dots)).toHaveCount(0)
    await expect(page.getByLabel('Choose a city')).toBeVisible()
  })
}

test('large grid keeps previews and city heading clear while scrolling; close restores selection, focus, and position', async ({ page }) => {
  await choose(page, large)
  const record = recordsFor(large).at(-2)!
  const dot = page.locator(`${dots}[data-case-id="${record.id}"]`)
  const grid = page.locator('.victim-dot-grid')
  await dot.scrollIntoViewIfNeeded()
  await dot.hover()
  await expect(page.getByRole('tooltip')).toContainText(record.name)
  await previewAboveGrid(page)
  await expect(page.locator('#city-title')).toBeInViewport()
  const scrollBefore = await grid.evaluate(el => el.scrollTop)
  expect(scrollBefore).toBeGreaterThan(0)
  const mapBefore = await page.locator('.leaflet-map-pane').getAttribute('style')
  await dot.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('victim-profile')).toHaveAttribute('data-case-id', record.id)
  await page.keyboard.press('Escape')
  await expect(dot).toBeFocused()
  await expect(dot).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`${dots}[aria-pressed="true"]`)).toHaveCount(1)
  expect(await grid.evaluate(el => el.scrollTop)).toBe(scrollBefore)
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(mapBefore)
  await previewAboveGrid(page)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator(dots)).toHaveCount(0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('changing city markers clears the previous profile and selected dot without individual map layers', async ({ page }) => {
  await choose(page, small)
  await page.locator(dots).first().click()
  await expect(page.getByTestId('victim-profile')).toBeVisible()
  const next = city('Fall City, WA')
  await page.locator(`.single-city-marker:has([data-city-id="${next.id}"])`).click()
  await expect(page.getByTestId('victim-profile')).toHaveCount(0)
  await expect(page.locator('#city-title')).toHaveText(next.label)
  await expect(page.locator(dots)).toHaveCount(next.caseCount)
  await expect(page.locator(`${dots}[aria-pressed="true"]`)).toHaveCount(0)
  for (const record of recordsFor(small)) await expect(page.locator(`${dots}[data-case-id="${record.id}"]`)).toHaveCount(0)
  await expect(page.locator('.city-map [data-case-id]')).toHaveCount(0)
})

test('keyboard previews and profile return work for small-city grids', async ({ page }) => {
  await choose(page, fifteen)
  const record = recordsFor(fifteen)[7]
  const dot = page.locator(`${dots}[data-case-id="${record.id}"]`)
  await dot.focus()
  await expect(page.getByRole('tooltip')).toContainText(record.name)
  await previewAboveGrid(page)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('victim-profile')).toHaveAttribute('data-case-id', record.id)
  await page.getByRole('button', { name: 'Back to city cases' }).click()
  await expect(dot).toBeFocused()
  await expect(dot).toHaveAttribute('aria-pressed', 'true')
})

test('late single-case responses cannot replace a newer selected city', async ({ page }) => {
  await page.route(`**/cities/${single.id}.json`, async route => {
    await new Promise(resolve => setTimeout(resolve, 600))
    await route.continue().catch(() => {})
  })
  await page.getByLabel('Choose a city').selectOption(single.id)
  await page.getByRole('button', { name: 'Close city cases' }).click()
  await choose(page, small)
  await expect(page.getByTestId('victim-profile')).toHaveCount(0)
  await expect(page.locator(dots)).toHaveCount(2)
})

test('dot targets are larger, separated, and stable when the grid reflows', async ({ page }) => {
  await choose(page, fifteen)
  const before = await page.locator(dots).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.caseId))
  const sizes = await page.locator(dots).evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, visual: parseFloat(getComputedStyle(node, '::before').width) }
  }))
  expect(sizes.every(a => a.w >= 32 && a.h >= 32 && a.visual >= 16)).toBe(true)
  expect(sizes.every((a, i) => sizes.slice(i + 1).every(b =>
    a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y))).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator(dots).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.caseId))).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('mobile grids of 2, 15, and 243 cases scroll with previews above the dots and retain selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const selected of [small, fifteen, large]) {
    await choose(page, selected)
    const record = recordsFor(selected).at(-1)!
    const dot = page.locator(`${dots}[data-case-id="${record.id}"]`)
    await dot.scrollIntoViewIfNeeded()
    await dot.hover()
    await expect(page.getByRole('tooltip')).toContainText(record.name)
    await previewAboveGrid(page)
    const scrollBefore = await page.locator('.victim-dot-grid').evaluate(el => el.scrollTop)
    await dot.click()
    await expect(page.getByTestId('victim-profile')).toHaveAttribute('data-case-id', record.id)
    await page.getByRole('button', { name: 'Back to city cases' }).click()
    await expect(dot).toHaveAttribute('aria-pressed', 'true')
    expect(await page.locator('.victim-dot-grid').evaluate(el => el.scrollTop)).toBe(scrollBefore)
    await page.getByRole('button', { name: 'Close city cases' }).click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
