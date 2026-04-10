import posthog from 'posthog-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  if (!config.public.posthogKey) {
    return
  }

  posthog.init(config.public.posthogKey, {
    api_host: config.public.posthogHost,
    capture_pageview: false,
    persistence: 'localStorage+cookie',
    autocapture: true,
  })

  const router = useRouter()
  router.afterEach((to) => {
    posthog.capture('$pageview', {
      route: to.fullPath,
      url: window.location.href,
    })
  })

  return {
    provide: {
      posthog,
    },
  }
})
