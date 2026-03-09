/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Theme-aware semantic colors — driven by CSS custom properties.
           Use opacity modifiers freely: bg-surface/50, bg-canvas/80, etc.
           NOTE: "canvas" not "base" — avoids collision with Tailwind's text-base (font-size) */
        'canvas': 'rgb(var(--color-base) / <alpha-value>)',
        'surface': 'rgb(var(--color-surface) / <alpha-value>)',
        'elevated': 'rgb(var(--color-elevated) / <alpha-value>)',
        'inset': 'rgb(var(--color-inset) / <alpha-value>)',
        'fg': 'rgb(var(--color-fg) / <alpha-value>)',

        /* Theme-aware rank indicator colors */
        'rank-good': 'rgb(var(--color-rank-good) / <alpha-value>)',
        'rank-mid': 'rgb(var(--color-rank-mid) / <alpha-value>)',

        /* Brand / sport colors */
        'nfl-blue': '#013369',
        'nfl-red': '#D50A0A',
        'nba-blue': '#1D428A',
        'mlb-blue': '#002D72',
        'ncaab-orange': '#FF6600',
        'field-green': '#1B4D3E',
        'field-light': '#228B22',
        'turf': '#2D5A27',
        'gold': '#FFB612',
        'stripe': '#FFFFFF',
      },
      fontFamily: {
        'display': ['Oswald', 'Impact', 'sans-serif'],
        'body': ['Source Sans 3', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'field-pattern': 'repeating-linear-gradient(90deg, transparent 0px, transparent 48px, rgba(255,255,255,0.1) 48px, rgba(255,255,255,0.1) 52px)',
        'turf-texture': 'linear-gradient(180deg, #2D5A27 0%, #1B4D3E 100%)',
      },
      animation: {
        'pulse-soft': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 0.5s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        }
      }
    },
  },
  plugins: [],
}
