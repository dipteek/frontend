/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./resources/views/**/*.blade.php", // for Laravel
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
