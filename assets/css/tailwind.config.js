module.exports = {
  // Run from the repo root:
  //   npx tailwindcss@3.4.17 -c assets/css/tailwind.config.js -i assets/css/tailwind.input.css -o assets/css/tailwind.css --minify
  content: ['./index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'Geist', 'system-ui', 'sans-serif'],
        display: ['Geist', 'Pretendard', 'sans-serif'],
        serif: ['Instrument Serif', 'serif'],
      },
      colors: {
        ink: {
          950: '#0a0a0b', 900: '#131315', 800: '#1c1c1f', 700: '#28282d',
          600: '#3a3a40', 500: '#6b6b74', 400: '#9a9aa3', 300: '#c8c8cf',
          200: '#e5e5ea', 100: '#f4f4f6',
        },
        accent: { DEFAULT: '#5e7c14', soft: '#8aa830' }
      },
    },
  },
}
