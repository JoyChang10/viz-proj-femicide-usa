import { expect, test, type Page } from '@playwright/test'

// Recover the view from real rendered tiles, without exposing a map instance
// or adding production event handlers just for tests. This includes fractional zoom.
async function viewAt(page: Page, x: number, y: number) {
  // Leaflet temporarily replaces aborted tiles with a transparent data GIF.
  // Choose an active tile inside the same browser task used for measurement.
  const result = await page.waitForFunction(cursor => {
    const tiles = Array.from(document.querySelectorAll<HTMLImageElement>('.leaflet-tile'))
    const pattern = /\/(\d+)\/(\d+)\/(\d+)\.png/
    const tile = tiles.find(node => pattern.test(node.src))
    if (!tile) return false
    const match = tile.src.match(pattern)!
    const [, zoom, tileX, tileY] = match.map(Number)
    const rect = tile.getBoundingClientRect()
    return {
      zoom: zoom + Math.log2(rect.width / 256),
      worldX: (tileX + (cursor.x - rect.x) / rect.width) / 2 ** zoom,
      worldY: (tileY + (cursor.y - rect.y) / rect.height) / 2 ** zoom,
    }
  }, { x, y })
  const view = await result.jsonValue()
  await result.dispose()
  if (!view) throw new Error('Could not measure the map viewport')
  return view
}

test('small trackpad-style deltas change zoom gradually and keep the cursor location anchored', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await page.getByLabel('Choose a county', { exact: true }).selectOption('48201')
  const box = (await page.locator('.city-map').boundingBox())!
  const x = box.x + box.width * 0.35
  const y = box.y + box.height * 0.42
  await page.mouse.move(x, y)
  const start = await viewAt(page, x, y)
  let previous = start
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -6)
    await expect.poll(async () => (await viewAt(page, x, y)).zoom).toBeGreaterThan(previous.zoom + 0.001)
    const next = await viewAt(page, x, y)
    expect(next.zoom - previous.zoom).toBeLessThan(0.1)
    previous = next
  }
  expect(previous.zoom - start.zoom).toBeGreaterThan(0.08)
  expect(previous.zoom - start.zoom).toBeLessThan(0.4)
  const scale = 256 * 2 ** previous.zoom
  expect(Math.abs(previous.worldX - start.worldX) * scale).toBeLessThan(3)
  expect(Math.abs(previous.worldY - start.worldY) * scale).toBeLessThan(3)
  // Reverse direction without snapping back to an integer or a fixed step.
  await page.mouse.wheel(0, 6)
  await expect.poll(async () => (await viewAt(page, x, y)).zoom).toBeLessThan(previous.zoom - 0.001)
})

test('coarse mouse-wheel pixel and line inputs remain usable; buttons and reset still work', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await page.getByLabel('Choose a county', { exact: true }).selectOption('48201')
  const map = page.locator('.city-map')
  const box = (await map.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  const start = await viewAt(page, x, y)
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await viewAt(page, x, y)).zoom).toBeGreaterThan(start.zoom + 0.1)
  const afterWheel = await viewAt(page, x, y)
  expect(afterWheel.zoom - start.zoom).toBeLessThan(1.5)
  // Some conventional wheels report lines instead of pixel deltas.
  await map.dispatchEvent('wheel', { deltaY: 3, deltaMode: 1, clientX: x, clientY: y, bubbles: true, cancelable: true })
  await expect.poll(async () => (await viewAt(page, x, y)).zoom).toBeLessThan(afterWheel.zoom - 0.1)
  const beforeButton = await viewAt(page, x, y)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  expect((await viewAt(page, x, y)).zoom - beforeButton.zoom).toBeCloseTo(1, 2)
  await page.getByRole('button', { name: 'Reset Map' }).click()
  await expect(page.locator('.national-overview')).toBeVisible()
})
