import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './app/**/*.{vue,js,ts}',
    './components/**/*.{vue,js,ts}',
    './composables/**/*.{js,ts}',
    './stores/**/*.{js,ts}',
    './server/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        paper: '#fffaf5',
        blush: '#ffd6de',
        peach: '#ffc59e',
        rose: '#ff5f7d',
        mint: '#c4f3dd',
        sky: '#d5f0ff',
        line: '#e8ded8',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Manrope', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 24px 70px rgba(17, 17, 17, 0.08)',
      },
      backgroundImage: {
        'mesh-soft':
          'radial-gradient(circle at top left, rgba(255,95,125,0.22), transparent 34%), radial-gradient(circle at 80% 18%, rgba(213,240,255,0.9), transparent 28%), radial-gradient(circle at bottom right, rgba(196,243,221,0.5), transparent 32%)',
      },
    },
  },
}
