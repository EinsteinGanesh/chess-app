/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          900: '#121212',
          800: '#1E1E1E',
          700: '#2C2C2C',
          600: '#3D3D3D',
        },
        primary: {
          DEFAULT: '#00ADB5', // Teal
          hover: '#00C4CC',
        },
        accent: {
          DEFAULT: '#FF5722', // Orange
        }
      },
    },
  },
  plugins: [],
}
