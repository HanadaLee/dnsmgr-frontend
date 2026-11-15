import { expect, test } from '@playwright/test'
import type { CertificateSettings, ProviderField, WebSession } from '../../src/api/types'

test('actual Huawei deployment dialog supports creation, editing and cancel/reopen with cached data', async ({ page }) => {
  const writes: Array<{ config: Record<string, unknown> }> = []
  const fields: ProviderField[] = [
    { key: 'product', label: '产品', control: 'select', required: true, disabled: false, sensitive: false, defaultValue: 'cdn', options: [{ value: 'cdn', label: 'CDN' }] },
    { key: 'domain', label: '绑定的域名', control: 'tags', required: true, disabled: false, sensitive: false,
      visibleWhen: { any: [{ all: [{ field: 'product', operator: 'equals', value: 'cdn' }] }] } },
  ]
  const session: WebSession = { authenticated: true, user: { name: 'test', displayName: 'Test', type: 'user' },
    capabilities: { dashboard: true, domains: true, domainAccounts: true, domainCategories: true, monitoring: true, schedules: true,
      certificates: true, optimizeIp: true, axisNow: true, systemSettings: true, users: true, logs: true },
    sso: { profileVerified: false, loginPath: '/login', logoutPath: '/logout' }, upstream: { configuredVersion: '1051', adapter: 'v1051' } }
  const settings: CertificateSettings = { renewBeforeDays: 14, deploymentWindow: { startHour: 0, endHour: 23 },
    notifications: { email: 'off', wechat: 'off', telegram: 'off', qqbot: 'off', robotWebhook: 'off', customWebhook: 'off' },
    localDeployment: { defaultTemplateId: '', templates: [] }, dcvDelegation: { defaultTemplateId: '', templates: [] } }
  await page.route('**/api/web/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let data: unknown
    if (path.endsWith('/session')) data = session
    else if (path.endsWith('/certificate-settings')) data = settings
    else if (path.endsWith('/certificate-deployments/form')) data = {
      accounts: [{ id: 4, type: 'huawei', label: '华为云' }], orders: [{ id: 9, label: 'example.com', domain: 'example.com' }],
      accountTypes: [{ type: 'huawei', kind: 'deployment', label: '华为云', fields: [], taskFields: fields }],
    }
    else if (['POST', 'PUT'].includes(route.request().method())) {
      writes.push(route.request().postDataJSON())
      return route.fulfill({ json: { code: 'OK', message: '保存成功' } })
    }
    else if (path.endsWith('/certificate-deployments/11')) data = {
      id: 11, accountId: 4, accountType: 'huawei', orderId: 9, config: { product: 'cdn', domain: 'www.example.com,cdn.example.com' },
    }
    else if (path.endsWith('/certificate-deployments')) return route.fulfill({ json: { code: 'OK',
      data: [{ id: 11, account: { id: 4, type: 'huawei', label: '华为云', name: '华为云账户' }, order: { id: 9, sourceLabel: 'ACME', domains: ['example.com'] }, active: true, status: 'succeeded' }],
      meta: { page: 1, pageSize: 20, total: 1 } } })
    else throw new Error(`Unmocked API ${path}`)
    await route.fulfill({ json: { code: 'OK', data } })
  })
  await page.goto('/certificate-deployments')
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: /^(添加|编辑)证书部署任务$/ })
  await expect(dialog.getByLabel('绑定的域名')).toBeVisible()
  await dialog.getByLabel('绑定的域名').fill('new.example.com')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(dialog).toHaveCount(0)
  expect(writes[0]?.config).toEqual({ product: 'cdn', domain: 'new.example.com' })

  const menu = page.getByRole('menu', { name: '管理部署任务 11', exact: true })
  async function edit() {
    if (!await menu.isVisible()) await page.getByRole('button', { name: '管理部署任务 11', exact: true }).click()
    await menu.getByText('编辑', { exact: true }).click()
  }
  await edit()
  dialog = page.getByRole('dialog', { name: /^(添加|编辑)证书部署任务$/ })
  await expect(dialog.getByRole('button', { name: '移除 www.example.com', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '清空', exact: true }).click()
  await dialog.getByLabel('绑定的域名').fill('discard.example.com')
  await dialog.getByLabel('绑定的域名').press('Enter')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await edit()
  dialog = page.getByRole('dialog', { name: /^(添加|编辑)证书部署任务$/ })
  await expect(dialog.getByRole('button', { name: '移除 www.example.com', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '移除 discard.example.com', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes[1]?.config).toEqual({ product: 'cdn', domain: 'www.example.com,cdn.example.com' })
})
