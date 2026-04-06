export default defineNuxtConfig({
  compatibilityDate: '2026-04-07',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],
  css: ['~/assets/css/tailwind.css'],
  app: {
    head: {
      title: 'Lunaby Dashboard',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Dashboard Nuxt cho Lunaby, đọc và cập nhật config trực tiếp từ MariaDB.',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap',
        },
      ],
    },
  },
  runtimeConfig: {
    mariadbHost: process.env.MARIADB_HOST || 'localhost',
    mariadbPort: Number(process.env.MARIADB_PORT || 3306),
    mariadbUser: process.env.MARIADB_USER || 'root',
    mariadbPassword: process.env.MARIADB_PASSWORD || '',
    mariadbDatabase: process.env.MARIADB_DATABASE || 'lunaby',
    public: {
      appName: 'Lunaby Dashboard',
      defaultGuildId: process.env.NUXT_PUBLIC_DEFAULT_GUILD_ID || '',
      defaultUserId: process.env.NUXT_PUBLIC_DEFAULT_USER_ID || '',
      posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY || '',
      posthogHost: process.env.NUXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
