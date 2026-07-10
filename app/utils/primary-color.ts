import type { PrimaryColor } from '~/types/app-data'

const PRIMARY_SHADE_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

type PrimaryShadeKey = (typeof PRIMARY_SHADE_KEYS)[number]

type PrimaryPalette = {
  shades: Record<PrimaryShadeKey, string>
  solidTextLight: string
  solidTextDark: string
  gradientLightStart: string
  gradientLightEnd: string
  gradientDarkStart: string
  gradientDarkEnd: string
}

export const PRIMARY_COLOR_LABELS: Record<PrimaryColor, string> = {
  sky: 'Sky',
  emerald: 'Emerald',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
}

const PRIMARY_PALETTES: Record<PrimaryColor, PrimaryPalette> = {
  sky: {
    shades: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49',
    },
    solidTextLight: '#ffffff',
    solidTextDark: '#0f172a',
    gradientLightStart: '#bfdbfe',
    gradientLightEnd: '#dbeafe',
    gradientDarkStart: '#0c4a6e',
    gradientDarkEnd: '#1e3a8a',
  },
  emerald: {
    shades: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22',
    },
    solidTextLight: '#ffffff',
    solidTextDark: '#052e16',
    gradientLightStart: '#bbf7d0',
    gradientLightEnd: '#a7f3d0',
    gradientDarkStart: '#064e3b',
    gradientDarkEnd: '#052e16',
  },
  violet: {
    shades: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
    solidTextLight: '#ffffff',
    solidTextDark: '#1e1b4b',
    gradientLightStart: '#ddd6fe',
    gradientLightEnd: '#c4b5fd',
    gradientDarkStart: '#312e81',
    gradientDarkEnd: '#2e1065',
  },
  rose: {
    shades: {
      50: '#fff1f2',
      100: '#ffe4e6',
      200: '#fecdd3',
      300: '#fda4af',
      400: '#fb7185',
      500: '#f43f5e',
      600: '#e11d48',
      700: '#be123c',
      800: '#9f1239',
      900: '#881337',
      950: '#4c0519',
    },
    solidTextLight: '#ffffff',
    solidTextDark: '#4c0519',
    gradientLightStart: '#fecdd3',
    gradientLightEnd: '#fda4af',
    gradientDarkStart: '#881337',
    gradientDarkEnd: '#4c0519',
  },
  amber: {
    shades: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
    solidTextLight: '#ffffff',
    solidTextDark: '#422006',
    gradientLightStart: '#fde68a',
    gradientLightEnd: '#fcd34d',
    gradientDarkStart: '#78350f',
    gradientDarkEnd: '#451a03',
  },
}

export function getPrimaryColorSwatch(primaryColor: PrimaryColor): string {
  return PRIMARY_PALETTES[primaryColor].shades['500']
}

export function applyPrimaryColorPalette(primaryColor: PrimaryColor): void {
  if (!import.meta.client) {
    return
  }

  const root = document.documentElement
  const palette = PRIMARY_PALETTES[primaryColor]

  for (const shade of PRIMARY_SHADE_KEYS) {
    root.style.setProperty(`--ui-color-primary-${shade}`, palette.shades[shade])
  }

  root.style.setProperty('--app-primary-solid-text-light', palette.solidTextLight)
  root.style.setProperty('--app-primary-solid-text-dark', palette.solidTextDark)
  root.style.setProperty('--app-bg-light-start', palette.gradientLightStart)
  root.style.setProperty('--app-bg-light-end', palette.gradientLightEnd)
  root.style.setProperty('--app-bg-dark-start', palette.gradientDarkStart)
  root.style.setProperty('--app-bg-dark-end', palette.gradientDarkEnd)
}
