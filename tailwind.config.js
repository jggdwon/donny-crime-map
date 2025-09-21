/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{App,index}.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'background': 'var(--background)',
        'foreground': 'var(--foreground)',
        'primary': 'var(--primary)',
        'primary-focus': 'var(--primary-focus)',
        'secondary': 'var(--secondary)',
        'muted': 'var(--muted)',
        'error': 'var(--error)',
      },
      keyframes: {
        'pulse-predictive': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 7px var(--predictive-hotspot)' },
          '50%': { transform: 'scale(1.1)', boxShadow: '0 0 15px var(--predictive-hotspot)' },
        },
      },
      animation: {
        'pulse-predictive': 'pulse-predictive 1.5s infinite alternate',
      },
    },
  },
  plugins: [],
}