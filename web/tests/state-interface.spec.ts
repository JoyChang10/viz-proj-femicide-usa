import { expect, test, type Page } from '@playwright/test'

async function expectStateFits(page: Page) {
  const map = page.locator('.state-frame .city-map')
  const outline = map.locator('.state-outline')
  const legend = page.getByLabel('county count legend')
  await expect(outline).toBeVisible()
  await expect.poll(async () => {
    const m = (await map.boundingBox())!
    const o = (await outline.boundingBox())!
    const l = (await legend.boundingBox())!
    return o.x >= m.x + 12 && o.y >= m.y + 12 && o.x + o.width <= m.x + m.width - 12
      && o.y + o.height <= m.y + m.height - 12 && l.y >= m.y + m.height
  }).toBe(true)
}

test('state and national counts have a compact label and accessible definition', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.getByRole('complementary', { name: 'Geographic statistics and individual profiles' })
  const info = sidebar.getByRole('button', { name: 'About reported victims' })
  const definition = sidebar.getByRole('tooltip')
  await expect(sidebar.getByText('Reported victims', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('1976–2024', { exact: true })).toBeVisible()
  await expect(definition).toBeHidden()
  await info.hover()
  await expect(definition).toContainText('female homicide victims with a recorded male offender')
  await expect(definition).toContainText('This measure does not establish gender motivation.')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  await info.focus()
  await expect(definition).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(definition).toBeHidden()
})

test('both analysis links show tooltips and return to the selected state', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose a state or territory').selectOption('48')
  const title = page.locator('#area-title')
  const guide = page.locator('.state-profile-guide')
  const county = page.getByLabel('Choose a county', { exact: true })
  const topics = page.getByRole('group', { name: 'State analysis pages' })
  const guideBox = (await guide.boundingBox())!
  const countyBox = (await county.boundingBox())!
  const topicsBox = (await topics.boundingBox())!
  expect(guideBox.y + guideBox.height).toBeLessThan(countyBox.y)
  expect(countyBox.y + countyBox.height).toBeLessThan(topicsBox.y)

  for (const [name, description] of [
    ['Socioeconomic Trends', 'Explore homicide rates alongside changes in socioeconomic conditions.'],
    ['Victim Demographics', "Explore patterns in victims' age, race, and other demographic characteristics."],
  ]) {
    const link = topics.getByRole('link', { name })
    await link.hover()
    await expect(topics.getByRole('tooltip')).toHaveText(description)
    await page.mouse.move(0, 0)
    await link.focus()
    await expect(topics.getByRole('tooltip')).toHaveText(description)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.locator('.map-frame')).toHaveCount(0)
    await page.getByRole('link', { name: 'Return to the map' }).click()
    await expect(title).toHaveText('Texas')
    await expect(county).toBeVisible()
  }
})

test('state fits after resizing and restores detailed tiles for county and city exploration', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 })
  await page.goto('/')
  const stateSelect = page.getByLabel('Choose a state or territory')
  const countySelect = page.getByLabel('Choose a county', { exact: true })
  await stateSelect.selectOption('48')
  await expect(countySelect).toBeVisible()
  await expectStateFits(page)
  await expect(page.locator('.leaflet-tile')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'State analysis pages' })).toBeInViewport({ ratio: 1 })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectStateFits(page)
  await stateSelect.selectOption('02')
  await expect(countySelect).toBeVisible()
  await expectStateFits(page)
  await stateSelect.selectOption('15')
  await expect(countySelect).toBeVisible()
  await expectStateFits(page)
  await countySelect.selectOption('15003')
  await expect(page.locator('.leaflet-tile').first()).toBeAttached()
  await expect(page.locator('.single-city-marker,.case-cluster-marker').first()).toBeVisible()
  await page.getByRole('button', { name: 'Hawaii counties', exact: true }).click()
  await expect(page.locator('.leaflet-tile')).toHaveCount(0)
  await expectStateFits(page)
})
