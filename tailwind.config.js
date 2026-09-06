/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./modules/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./context/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Primary
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          navy: '#0b132b',
          'navy-surface': '#1c2541',
          'navy-card': '#162238',
          'navy-border': 'rgba(255, 255, 255, 0.08)',
          'sky-accent': '#38bdf8',
        },
      },
      boxShadow: {
        'brand-glow': '0 0 25px -5px rgba(37, 99, 235, 0.3)',
        'brand-card': '0 10px 25px -5px rgba(11, 19, 43, 0.08), 0 8px 10px -6px rgba(11, 19, 43, 0.04)',
      },
    },
  },
  plugins: [],
}