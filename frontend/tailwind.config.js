/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        current: '#16a34a',
        unavailable: '#dc2626',
      },
    },
  },
  plugins: [],
};
