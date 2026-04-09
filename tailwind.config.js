/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#030712',
          800: '#080f1f',
          700: '#0d1528',
          600: '#111f38',
          500: '#1e3a5f',
          400: '#2a4a70',
        },
        accent: {
          blue: '#00b4d8',
          'blue-bright': '#00e5ff',
          green: '#00ff88',
          'green-dim': '#00cc6a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
