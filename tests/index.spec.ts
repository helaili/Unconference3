import { expect, test } from '@nuxt/test-utils/playwright'

test('page title', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' })
  await expect(page).toHaveTitle(/Unconference/)
})
