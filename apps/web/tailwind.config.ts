import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nuit: { DEFAULT: '#0D2747', 50: '#eef3f9', 100: '#d6e1ef', 700: '#12345e', 800: '#0D2747', 900: '#081a31' },
        turquoise: { DEFAULT: '#14A9CB', 50: '#e8f8fc', 100: '#c5eef7', 600: '#1093b1', 700: '#0d7891' },
      },
      fontFamily: { sans: ['"Open Sans"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
