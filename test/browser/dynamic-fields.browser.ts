import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/test/browser/form.html') })

test('requires domains, commits Enter without submitting, and saves an uncommitted draft on click', async ({ page }) => {
  const input = page.getByLabel('绑定的域名')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('#saved')).toHaveText('尚未保存')
  await input.fill('https://WWW.Example.com/')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '移除 www.example.com', exact: true })).toBeVisible()
  await expect(page.locator('#saved')).toHaveText('尚未保存')
  await input.fill('cdn.example.com')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('#saved')).toHaveText('{"product":"cdn","domain":"www.example.com,cdn.example.com"}')
})

test('supports batch paste, deduplication, removing tags and clearing', async ({ page }) => {
  const input = page.getByLabel('绑定的域名')
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text', 'WWW.example.com\ncdn.example.com；www.example.com，img.example.com')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(page.getByRole('button', { name: '移除 www.example.com', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '移除 cdn.example.com', exact: true }).click()
  await input.press('Backspace')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('#saved')).toHaveText('{"product":"cdn","domain":"www.example.com"}')
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.getByRole('button', { name: /^移除 / })).toHaveCount(0)
})

test('restores existing comma-separated domains and saves without entering another value', async ({ page }) => {
  await page.getByRole('button', { name: '载入已有配置', exact: true }).click()
  await expect(page.getByRole('button', { name: /^移除 / })).toHaveCount(2)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('#saved')).toHaveText('{"product":"cdn","domain":"www.example.com,cdn.example.com"}')
})

test('switches conditional fields and does not validate hidden domains', async ({ page }) => {
  await page.getByRole('combobox', { name: '产品' }).click()
  await page.getByRole('option', { name: 'OBS', exact: true }).click()
  await expect(page.getByLabel('绑定的域名')).toBeVisible()
  await page.getByRole('combobox', { name: '产品' }).click()
  await page.getByRole('option', { name: '上传证书', exact: true }).click()
  await expect(page.getByLabel('绑定的域名')).toHaveCount(0)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('#saved')).toHaveText('{"product":"upload","domain":""}')
})

test('disables editing and removal when upstream disables a field', async ({ page }) => {
  await page.getByRole('button', { name: '载入已有配置', exact: true }).click()
  await page.getByRole('button', { name: '切换禁用', exact: true }).click()
  await expect(page.getByLabel('绑定的域名')).toBeDisabled()
  await expect(page.getByRole('button', { name: '移除 www.example.com', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '清空', exact: true })).toBeDisabled()
})
