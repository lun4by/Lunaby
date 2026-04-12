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
    },
  },
}
