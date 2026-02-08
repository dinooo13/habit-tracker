// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Atomic Habit Tracker',
      meta: [
        {
          name: 'description',
          content:
            'A local-first habit tracker inspired by Atomic Habits with planning, reflection, and coaching.'
        },
        { name: 'theme-color', content: '#0f172a' }
      ]
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Atomic Habit Tracker',
      short_name: 'Habits',
      description: 'Plan habits, track streaks, and get Atomic Habits coaching.',
      theme_color: '#0f172a',
      background_color: '#f8fafc',
      display: 'standalone',
      start_url: '/',
      icons: [
        {
          src: '/favicon.ico',
          sizes: '64x64',
          type: 'image/x-icon'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,txt}']
    },
    devOptions: {
      enabled: true,
      suppressWarnings: true,
      type: 'module'
    }
  }
})
