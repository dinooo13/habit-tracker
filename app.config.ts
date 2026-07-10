export default defineAppConfig({
  ui: {
    colors: {
      primary: 'sky',
      neutral: 'slate',
    },
    icons: {
      system: 'i-lucide-monitor',
      light: 'i-lucide-sun',
      dark: 'i-lucide-moon',
    },
    main: {
      base: 'min-h-[calc(100vh-var(--ui-header-height))]',
    },
    card: {
      defaultVariants: {
        variant: 'soft',
      },
    },
  },
})
