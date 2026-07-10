// https://nuxt.com/docs/api/configuration/nuxt-config

// Base URL the app is served from. Production is '/'; PR previews are deployed
// under '/pr-<n>/' on preview.habits.fmeyer.dev and set NUXT_APP_BASE_URL at
// generate time so assets, the router, and the PWA manifest resolve correctly.
const appBaseURL = process.env.NUXT_APP_BASE_URL || '/'
// Preview builds set NUXT_PUBLIC_NOINDEX=true so search engines skip them.
const noindex = process.env.NUXT_PUBLIC_NOINDEX === 'true'
// Gate dev-only tooling so it never ships in a production build (issue #1, SEC-10).
// `nuxt build`/`generate` set NODE_ENV=production; `nuxt dev` leaves it unset/dev.
const isDev = process.env.NODE_ENV !== 'production'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: isDev },
  ssr: false,
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vite-pwa/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  eslint: {
    // Enable ESLint Stylistic so formatting is enforced by ESLint itself
    // (subsumes Prettier); the optional dev-server checker stays off. See ADR-0013.
    config: {
      stylistic: true
    }
  },
  app: {
    baseURL: appBaseURL,
    head: {
      title: 'Atomic Habit Tracker',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover'
        },
        {
          name: 'description',
          content:
            'A local-first habit tracker inspired by Atomic Habits with planning, reflection, and coaching.'
        },
        { name: 'theme-color', content: '#0f172a' },
        ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : [])
      ]
    }
  },
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: ''
  },
  pwa: {
    // SEC-14: download new service workers but wait for explicit user consent
    // (a reload banner in app/layouts/app.vue) before activating them, instead
    // of applying updates silently. See ADR-0008.
    registerType: 'prompt',
    // Scope the service worker and manifest to the deploy base so PR previews
    // served from '/pr-<n>/' get their own, correctly-scoped install.
    scope: appBaseURL,
    base: appBaseURL,
    manifest: {
      name: 'Atomic Habit Tracker',
      short_name: 'Habits',
      description: 'Plan habits, track streaks, and get Atomic Habits coaching.',
      theme_color: '#0f172a',
      background_color: '#f8fafc',
      display: 'standalone',
      scope: appBaseURL,
      start_url: appBaseURL,
      icons: [
        {
          src: `${appBaseURL}icon-192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: `${appBaseURL}icon-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: `${appBaseURL}icon-maskable-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,txt}']
    },
    devOptions: {
      enabled: isDev,
      suppressWarnings: true,
      type: 'module'
    }
  },

  hooks: {
    // Resolve placeholders in public/.htaccess.tpl using the runtime base URL
    // and write the result to .output/public/.htaccess at generate time, so
    // production ('/') and preview ('/pr-<n>/') builds each get the right
    // RewriteBase / SPA-fallback path (and noindex header for previews).
    'nitro:init'(nitro) {
      if (nitro.options.dev) return
      nitro.hooks.hook('close', async () => {
        const { promises: fs } = await import('node:fs')
        const { resolve } = await import('node:path')
        const baseURL = nitro.options.runtimeConfig.app.baseURL || '/'
        const robotsHeader =
          process.env.NUXT_PUBLIC_NOINDEX === 'true'
            ? 'Header always set X-Robots-Tag "noindex, nofollow"'
            : ''
        const templatePath = resolve(nitro.options.rootDir, 'public/.htaccess.tpl')
        const outputDir = nitro.options.output.publicDir
        const outputPath = resolve(outputDir, '.htaccess')
        const leakedTemplate = resolve(outputDir, '.htaccess.tpl')
        try {
          const tpl = await fs.readFile(templatePath, 'utf8')
          await fs.writeFile(
            outputPath,
            tpl.replaceAll('__BASE__', baseURL).replaceAll('__ROBOTS_HEADER__', robotsHeader)
          )
          await fs.rm(leakedTemplate, { force: true })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        }
      })
    }
  }
})
