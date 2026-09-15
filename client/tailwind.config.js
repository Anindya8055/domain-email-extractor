/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf7f8',
          100: '#cde9ec',
          200: '#9dd3d8',
          300: '#6dbcc3',
          400: '#3da6ae',
          500: '#01696f',
          600: '#0c4e54',
          700: '#0f3638',
          800: '#0a2628',
          900: '#051518',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'fade-up': 'fadeUp 0.4s ease forwards',
        'pulse-dot': 'pulseDot 1.2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.4, transform: 'scale(0.75)' },
        },
      },
    },
  },
  plugins: [],
};