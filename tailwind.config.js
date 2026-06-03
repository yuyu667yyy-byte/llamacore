/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Mapped to CSS variables so theme can be flipped at runtime
        dark: {
          900: 'var(--c-900)',
          800: 'var(--c-800)',
          700: 'var(--c-700)',
          600: 'var(--c-600)',
          500: 'var(--c-500)',
          400: 'var(--c-400)',
          300: 'var(--c-300)',
          200: 'var(--c-200)',
          100: 'var(--c-100)',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          light: '#a78bfa',
        },
      },
    },
  },
  plugins: [],
}
