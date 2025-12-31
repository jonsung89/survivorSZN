/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nfl-blue': '#013369',
        'nfl-red': '#D50A0A',
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
