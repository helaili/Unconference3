import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'
import DashboardPage from '~/pages/dashboard.vue'

function getExpectedLandingPrompt(authMode: string | undefined) {
  return authMode === 'local'
    ? 'Sign in to access your events.'
    : 'Log in with your GitHub account or use an invitation link from the event organizer.'
}

describe('Landing page (pages/index.vue)', () => {
  it('renders the "Welcome to Unconference" heading', async () => {
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.text()).toContain('Welcome to Unconference')
  })

  it('displays the login prompt for unauthenticated users', async () => {
    const { public: { authMode } } = useRuntimeConfig()
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.text()).toContain(getExpectedLandingPrompt(authMode))
  })

  it('shows error alert when route has ?error=no-invitation', async () => {
    const wrapper = await mountSuspended(IndexPage, {
      route: '/?' + 'error=no-invitation',
    })
    expect(wrapper.text()).toContain('You need an invitation to access this app')
  })
})

describe('Dashboard page (pages/dashboard.vue)', () => {
  it('can be mounted', async () => {
    const wrapper = await mountSuspended(DashboardPage)
    expect(wrapper.exists()).toBe(true)
  })
})
