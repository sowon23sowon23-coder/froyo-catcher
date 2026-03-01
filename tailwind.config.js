/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        yl: {
          primary:    "#960853",
          primaryDk:  "#6e0339",
          primaryLt:  "#c4206e",
          green:      "#8dc63f",
          greenDk:    "#6fa02e",
          greenLt:    "#b8e07a",
          blush:      "#fdf0f6",
          blushBorder:"#f3c6de",
        },
      },
    },
  },
  plugins: [],
};
