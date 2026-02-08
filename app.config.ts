export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'slate'
    },
    main: {
      base: 'min-h-[calc(100vh-var(--ui-header-height))]'
    },
    card: {
      defaultVariants: {
        variant: 'subtle'
      }
    }
  }
})
