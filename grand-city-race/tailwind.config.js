/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: '#fdfaf5',
        gold: '#FFD700',
        crimson: '#B22222',
        sky: '#87CEEB',
        charcoal: '#1E1E1E',
        indigo: '#4B0082',
        olive: '#6B8E23',
      },
    fontFamily: {
        almendra: ['"Almendra"', 'serif'],

      },
    },
  },
  plugins: [],
}
